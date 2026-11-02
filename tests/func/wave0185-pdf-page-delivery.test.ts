/**
 * 0.1.85-C（C85-C）PDF pages 媒体双入口端到端（func 层真盘）。
 *
 * 工单 §1-C 硬判据覆盖：
 *  - e2e 面（poppler 门控）：真 PDF fixture → pdftoppm → Read pages →
 *    交付链 → params 投影。断言：image 块数量 = 请求页数；base64 解码为
 *    有效非空 JPEG（魔数 FF D8）；逐块字节等值渲染页文件（与实际渲染页
 *    关联）；顺序含页号跨 9/10（数值排序非字典序）；executeToolUse 交付
 *    （user + isMeta 合法化形）；toOpenAIMessages image_url 解码复验。
 *  - TUI 面：FileReadTool 同 fixture 同断言——原始 JPEG 无 resize（字节
 *    等值 pdftoppm 产物即证）；双入口同一交付路径；full-PDF 支显式
 *    pages 指引错误对齐 engine。
 *  - 有界面（零 poppler 依赖，注入小 caps 直测 shared helper）：逐图
 *    超限 / 累计超限 / 零页图 / 空文件明确错误不交付部分成功；页号数值
 *    排序跨 9/10；非 .jpg 产物不计入。
 *
 * fixture 全部 mkdtemp 自清理（wave0184 惯例）。poppler 缺失时 e2e 面
 * skip（模块层探测，同 wave0184-pdf-unprivileged 惯例）；有界面恒跑。
 */
import { spawnSync } from 'child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { ReadTool } from '../../src/engine/tools'
import { executeToolUse } from '../../src/engine'
import { FileReadTool } from '../../src/tui/tools/FileReadTool/FileReadTool'
import { readPDFPageImages, type AssistantMessage } from '../../src/shared'
import { toOpenAIMessages } from '../../src/modelprovider/params'

// ── poppler 探测（模块层，早于 beforeAll；判定与 isPdftoppmAvailable
//    一致：exit 0 或 stderr 非空）─────────────────────────────────────
const pdftoppmProbe = spawnSync('pdftoppm', ['-v'], { stdio: 'pipe' })
const hasPdftoppm =
  pdftoppmProbe.status === 0 || (pdftoppmProbe.stderr?.length ?? 0) > 0

// ── 程序化 N 页确定性 PDF（wave0184 buildPdf 同源；逐页变绘制内容）────
function buildPdf(pageCount: number): Buffer {
  const objects: string[] = ['', '']
  const kids: string[] = []
  for (let i = 0; i < pageCount; i++) kids.push(`${3 + i * 2} 0 R`)
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageCount} >>`
  objects[2] = `<< /Type /Catalog /Pages 1 0 R >>`
  for (let i = 0; i < pageCount; i++) {
    const pageNum = 3 + i * 2
    // 逐页不同矩形宽度（渲染内容按页可区分）
    const w = 20 + i * 10
    const stream = `q 1 0 0 RG 20 20 ${w} 160 re S Q`
    objects[pageNum] =
      `<< /Type /Page /Parent 1 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents ${pageNum + 1} 0 R >>`
    objects[pageNum + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  }
  let body = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = body.length
    body += `${n} 0 obj\n${objects[n]}\nendobj\n`
  }
  const xrefOffset = body.length
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let n = 1; n < objects.length; n++) {
    xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
  }
  const trailer = `trailer\n<< /Size ${objects.length} /Root 2 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(body + xref + trailer, 'latin1')
}

// ── 窄 ctx（engine / TUI 双形）────────────────────────────────────────
function makeEngineCtx(): never {
  return {
    getAppState: () => ({
      toolPermissionContext: {
        mode: 'default',
        additionalWorkingDirectories: new Map(),
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        alwaysAskRules: {},
        isBypassPermissionsModeAvailable: false,
      },
    }),
    abortController: new AbortController(),
  } as never
}

function makeTuiCtx(): any {
  return {
    getAppState: () => ({
      toolPermissionContext: {
        mode: 'default',
        additionalWorkingDirectories: new Map(),
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        alwaysAskRules: {},
        isBypassPermissionsModeAvailable: false,
      },
    }),
    readFileState: new Map(),
    abortController: new AbortController(),
  }
}

const ASSISTANT = {
  type: 'assistant',
  uuid: 'u-c85c',
  timestamp: '2026-11-02T00:00:00Z',
  message: {
    role: 'assistant',
    content: [{ type: 'tool_use', id: 'tu-c85c-1', name: 'Read', input: {} }],
  },
} as unknown as AssistantMessage

/** 渲染页文件按页号数值序列出（helper 同排序键）。 */
function renderedPagesSorted(outputDir: string): { name: string; bytes: Buffer }[] {
  return readdirSync(outputDir)
    .filter(f => f.endsWith('.jpg'))
    .sort((a, b) => {
      const na = Number(/(\d+)\.jpg$/.exec(a)![1])
      const nb = Number(/(\d+)\.jpg$/.exec(b)![1])
      return na - nb
    })
    .map(name => ({ name, bytes: readFileSync(join(outputDir, name)) }))
}

let dir: string
let pdf12: string
let pdf2: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'wave0185-pdf-pages-'))
  pdf12 = join(dir, 'doc12.pdf')
  writeFileSync(pdf12, buildPdf(12))
  pdf2 = join(dir, 'doc2.pdf')
  writeFileSync(pdf2, buildPdf(2))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

// ── e2e 面（poppler 门控；poppler 缺失整 describe skip）──────────────
describe('C85-C engine Read pages → 原始 JPEG 交付（e2e）', () => {
  test.skipIf(!hasPdftoppm)(
    'E① pages "8-12"：5 块 JPEG、字节等值渲染页、跨 9/10 数值序、合法化形',
    async () => {
      const res = await ReadTool.call(
        { file_path: pdf12, pages: '8-12' } as never,
        makeEngineCtx(),
      )
      const msgs = (res as { newMessages?: any[] }).newMessages ?? []
      expect(msgs).toHaveLength(1)
      const m0 = msgs[0] as Record<string, unknown>
      expect(m0.type).toBe('user')
      expect(m0.isMeta).toBe(true)
      const blocks = (m0 as any).message.content as Array<{
        type: string
        source: { type: string; media_type: string; data: string }
      }>
      expect(blocks).toHaveLength(5)

      const outputDir = (res as any).data.file.outputDir as string
      const rendered = renderedPagesSorted(outputDir)
      expect(rendered).toHaveLength(5)
      // 逐块字节等值渲染页文件（顺序含 9/10 数值跨越；与实际渲染页关联
      // = 字节等值）；JPEG 魔数 FF D8（有效非空 JPEG）
      for (let i = 0; i < 5; i++) {
        const decoded = Buffer.from(blocks[i].source.data, 'base64')
        expect(decoded.length).toBeGreaterThan(0)
        expect(decoded[0]).toBe(0xff)
        expect(decoded[1]).toBe(0xd8)
        expect(decoded.equals(rendered[i].bytes)).toBe(true)
        expect(blocks[i].source.media_type).toBe('image/jpeg')
        expect(blocks[i].source.type).toBe('base64')
        expect(blocks[i].type).toBe('image')
      }
    },
  )

  test.skipIf(!hasPdftoppm)(
    'E② 交付链：newMessages 过真 executeToolUse（user+isMeta 门放行）',
    async () => {
      const res = await ReadTool.call(
        { file_path: pdf12, pages: '1-2' } as never,
        makeEngineCtx(),
      )
      const r = await executeToolUse(
        { type: 'tool_use', id: 'tu-e2', name: 'Read', input: {} } as never,
        ASSISTANT,
        {
          tools: [
            {
              name: 'Read',
              isConcurrencySafe: () => true,
              call: async () => res,
              mapToolResultToToolResultBlockParam: (c: unknown, id: string) => ({
                type: 'tool_result',
                tool_use_id: id,
                content: String(c),
              }),
            } as never,
          ],
        } as never,
      )
      expect(r.isError).toBe(false)
      expect(r.newMessages).toHaveLength(1)
      const out0 = r.newMessages![0] as Record<string, unknown>
      expect(out0.type).toBe('user')
      expect(out0.isMeta).toBe(true)
      expect(out0.sourceToolUseId).toBe('tu-e2')
    },
  )

  test.skipIf(!hasPdftoppm)(
    'E③ params 投影：user image 块 → image_url data URL 解码复验',
    async () => {
      const res = await ReadTool.call(
        { file_path: pdf12, pages: '3-3' } as never,
        makeEngineCtx(),
      )
      const meta = (res as { newMessages?: any[] }).newMessages![0]
      const out = toOpenAIMessages([meta] as never) as Array<{
        role: string
        content?: unknown
      }>
      const userMsg = out.find(m => m.role === 'user') as {
        content: Array<{ type: string; image_url: { url: string } }>
      }
      expect(userMsg).toBeDefined()
      const parts = Array.isArray(userMsg.content) ? userMsg.content : []
      expect(parts).toHaveLength(1)
      expect(parts[0].type).toBe('image_url')
      const url = parts[0].image_url.url
      expect(url.startsWith('data:image/jpeg;base64,')).toBe(true)
      const decoded = Buffer.from(
        url.slice('data:image/jpeg;base64,'.length),
        'base64',
      )
      expect(decoded[0]).toBe(0xff)
      expect(decoded[1]).toBe(0xd8)
    },
  )

  test.skipIf(!hasPdftoppm)(
    'E④ TUI FileReadTool 同 fixture：原始 JPEG 无 resize（字节等值）',
    async () => {
      const res = await FileReadTool.call(
        { file_path: pdf12, pages: '8-12' } as never,
        makeTuiCtx(),
      )
      const msgs = (res as { newMessages?: any[] }).newMessages ?? []
      expect(msgs).toHaveLength(1)
      expect((msgs[0] as Record<string, unknown>).isMeta).toBe(true)
      const blocks = (msgs[0] as any).message.content as Array<{
        source: { media_type: string; data: string }
      }>
      expect(blocks).toHaveLength(5)
      const outputDir = (res as any).data.file.outputDir as string
      const rendered = renderedPagesSorted(outputDir)
      expect(rendered).toHaveLength(5)
      for (let i = 0; i < 5; i++) {
        const decoded = Buffer.from(blocks[i].source.data, 'base64')
        // 字节等值渲染产物 = 无 resize 铁证（旧码 sharp resize 后不等值）
        expect(decoded.equals(rendered[i].bytes)).toBe(true)
        expect(blocks[i].source.media_type).toBe('image/jpeg')
      }
    },
  )

  test.skipIf(!hasPdftoppm)(
    'E⑤ full-PDF（无 pages）TUI 对齐 engine 显式 pages 指引错误',
    async () => {
      // 2 页 PDF（≤ 阈值 10）保证到达统一显式错误支（页数阈值 throw 不截）
      let tuiErr: unknown
      try {
        await FileReadTool.call({ file_path: pdf2 } as never, makeTuiCtx())
      } catch (e) {
        tuiErr = e
      }
      expect(tuiErr).toBeInstanceOf(Error)
      const tuiMsg = (tuiErr as Error).message
      expect(tuiMsg).toContain('pages parameter')
      expect(tuiMsg).toContain('current provider')

      let engErr: unknown
      try {
        await ReadTool.call({ file_path: pdf2 } as never, makeEngineCtx())
      } catch (e) {
        engErr = e
      }
      expect((engErr as Error).message).toContain('pages parameter')
      expect((engErr as Error).message).toContain('current provider')
    },
  )
})

// ── 有界面（零 poppler 依赖；注入小 caps 直测 shared helper）────────
describe('C85-C readPDFPageImages 有界面（注入 caps）', () => {
  let capDir: string

  function mkOut(name: string): string {
    const p = join(capDir, name)
    mkdirSync(p)
    return p
  }

  beforeAll(() => {
    capDir = mkdtempSync(join(tmpdir(), 'wave0185-pdf-caps-'))
  })

  afterAll(() => {
    rmSync(capDir, { recursive: true, force: true })
  })

  test('B① 逐图超限：明确 per-image 错误，不交付部分成功', async () => {
    const out = mkOut('per')
    writeFileSync(join(out, 'page-1.jpg'), Buffer.alloc(10, 1))
    writeFileSync(join(out, 'page-2.jpg'), Buffer.alloc(100, 2))
    let err: unknown
    try {
      await readPDFPageImages(out, {
        maxBytesPerImage: 50,
        maxTotalBytes: 1000,
      })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('per-image byte limit')
  })

  test('B② 累计超限：明确 cumulative 错误（两图各在帽内、和超帽）', async () => {
    const out = mkOut('cum')
    writeFileSync(join(out, 'page-1.jpg'), Buffer.alloc(60, 1))
    writeFileSync(join(out, 'page-2.jpg'), Buffer.alloc(60, 2))
    let err: unknown
    try {
      await readPDFPageImages(out, {
        maxBytesPerImage: 100,
        maxTotalBytes: 100,
      })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('cumulative byte limit')
  })

  test('B③ 零页图输出：明确失败（非静默空交付）', async () => {
    const out = mkOut('empty-out')
    writeFileSync(join(out, 'page-1.ppm'), Buffer.alloc(4, 1)) // 非 jpg 产物
    let err: unknown
    try {
      await readPDFPageImages(out)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('no page images')
  })

  test('B④ 空文件：明确失败（非静默空块）', async () => {
    const out = mkOut('zero')
    writeFileSync(join(out, 'page-1.jpg'), Buffer.alloc(0))
    let err: unknown
    try {
      await readPDFPageImages(out)
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('empty')
  })

  test('B⑤ 页号数值排序跨 9/10：内容可区分（1,9,10 非 1,10,9）', async () => {
    const out = mkOut('sort')
    writeFileSync(join(out, 'page-1.jpg'), Buffer.from('ONE'))
    writeFileSync(join(out, 'page-9.jpg'), Buffer.from('NINE'))
    writeFileSync(join(out, 'page-10.jpg'), Buffer.from('TEN'))
    const { blocks, totalBytes } = await readPDFPageImages(out)
    expect(blocks).toHaveLength(3)
    // 'ONE'(3) + 'NINE'(4) + 'TEN'(3) = 10（原始字节口径，base64 开销不计）
    expect(totalBytes).toBe(10)
    const contents = blocks.map(b =>
      Buffer.from(b.source.data, 'base64').toString('latin1'),
    )
    expect(contents).toEqual(['ONE', 'NINE', 'TEN'])
  })

  test('B⑥ 非 .jpg 产物不计入（readdir 过滤面）', async () => {
    const out = mkOut('scope')
    writeFileSync(join(out, 'page-1.jpg'), Buffer.from('A'))
    writeFileSync(join(out, 'notes.txt'), Buffer.from('ignore me'))
    writeFileSync(join(out, 'page-2.ppm'), Buffer.from('ignore too'))
    const { blocks, totalBytes } = await readPDFPageImages(out)
    expect(blocks).toHaveLength(1)
    expect(totalBytes).toBe(1)
  })

  test('B⑦ abort signal：预先 aborted 的 signal 立即中止（零交付）', async () => {
    const out = mkOut('abort')
    writeFileSync(join(out, 'page-1.jpg'), Buffer.from('A'))
    const ac = new AbortController()
    ac.abort()
    let err: unknown
    try {
      await readPDFPageImages(out, { signal: ac.signal })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(Error)
  })
})
