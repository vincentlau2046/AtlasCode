/**
 * §8.55 S-C5 — ReadTool.call() 真盘行为（func 层：真 tmpdir + 真
 * poppler-utils；unit 层零磁盘纪律）。
 *
 * 旧仓对照（a8af45b）：FileReadTool call 4 支真盘面 —— text（readFile-
 * InRange 行导向 + 行号 + readFileState 写回 + **P-C2 dedup 探针**：同
 * range 重读 → file_unchanged / env ATLAS_DISABLE_READ_DEDUP 设真 → 全
 * 量内容，恰 1 红集）/ notebook（readNotebook + cells 面）/ image（D-3
 * 最小形：原始 base64 + ext→MIME，delta ⑫ newMessages 恒不产生）/ PDF
 * （readPDF document 块 newMessages + pages 参 extractPDFPages parts 面，
 * poppler 门控）。限额面：maxSizeBytes 256KB 字节帽（FileTooLargeError）
 * + maxTokens 25000 estimate 帽（MaxFileReadTokenExceededError，delta ⑪
 * estimate-only）+ ENOENT 友好消息面（FILE_NOT_FOUND_CWD_NOTE + cwd）。
 *
 * 环境门控：system poppler（pdftoppm/pdfinfo）缺失时 PDF 两支 skip
 *（同 S-C2 rg 门控先例）。
 */
import { execFileSync } from 'child_process'
import {
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import type { ToolPermissionContext } from '../../src/shared'
import {
  ReadTool,
  MaxFileReadTokenExceededError,
  type FileState,
  type ReadOutput,
} from '../../src/engine/tools'

/** poppler 可用性探测（缺失 → PDF 两支 skip，S-C2 rg 先例同构） */
let popplerAvailable = false
try {
  execFileSync('pdfinfo', ['-v'], { stdio: 'pipe' })
  execFileSync('pdftoppm', ['-v'], { stdio: 'pipe' })
  popplerAvailable = true
} catch {
  popplerAvailable = false
}

const t: typeof test = test
const tPdf: typeof test = popplerAvailable ? test : test.skip

// 1×1 PNG（68 字节，最小合法）
const PNG_1X1_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
// 2 页最小 PDF（606 字节，pdfinfo 可解析）
const PDF_MINI_B64 =
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUiA1IDAgUl0gL0NvdW50IDIgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMjAwXSA+PgplbmRvYmoKNCAwIG9iagpzdHJlYW0KQlQgL0YxIDEyIFRmIDIwIDEwMCBUZCAoUGFnZSAxKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMjAwXSA+PgplbmRvYmoKNiAwIG9iagpzdHJlYW0KQlQgL0YxIDEyIFRmIDIwIDEwMCBUZCAoUGFnZSAyKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA3CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMjEgMDAwMDAgbiAKMDAwMDAwMDE5MiAwMDAwMCBuIAowMDAwMDAwMjYyIDAwMDAwIG4gCjAwMDAwMDAzMzMgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA3IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0MDMKJSVFT0YK'

let dir: string
let textPath: string
let nbPath: string
let imgPath: string
let bigPath: string
let hugePath: string
let pdfPath: string

function makePermsCtx(): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  } as unknown as ToolPermissionContext
}

/** readFileState duck（delta ⑭：Map 即满足 get/set duck）。 */
type ReadCtx = {
  readFileState?: Map<string, FileState>
}

function makeCtx(opts: ReadCtx = {}): {
  getAppState(): { toolPermissionContext: ToolPermissionContext }
  abortController: AbortController
  readFileState?: Map<string, FileState>
} {
  return {
    getAppState: () => ({ toolPermissionContext: makePermsCtx() }),
    abortController: new AbortController(),
    ...(opts.readFileState ? { readFileState: opts.readFileState } : {}),
  }
}

function findState(
  state: Map<string, FileState>,
  suffix: string,
): FileState | undefined {
  for (const [k, v] of state) {
    if (k.endsWith(suffix)) return v
  }
  return undefined
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-sc5-read-'))
  textPath = join(dir, 'text.txt')
  // 无尾换行：readFileInRange 快路径对尾换行文件恒推空末片段（旧仓
  // utils/readFileInRange.ts L174-180 逐字忠实，tryPush 无空行守卫）→
  // 行计数 5 会扰断言；fixture 取无尾换行保持 4 行语义稳定
  writeFileSync(textPath, 'line1\nline2\nline3\nline4')
  nbPath = join(dir, 'nb.ipynb')
  writeFileSync(
    nbPath,
    JSON.stringify({
      cells: [
        { id: 'c1', cell_type: 'code', source: ['x = 1'], outputs: [] },
        { id: 'c2', cell_type: 'markdown', source: ['# T'], outputs: [] },
      ],
      // notebook.ts L197 非可选访问 notebook.metadata.language_info（旧仓
      // NotebookEditTool.ts:379 逐字忠实）→ fixture 须带 metadata
      metadata: { language_info: { name: 'python' } },
    }),
  )
  imgPath = join(dir, 'px.png')
  writeFileSync(imgPath, Buffer.from(PNG_1X1_B64, 'base64'))
  // 120KB 文本：estimate 30k > 25k maxTokens → 令牌帽（limit 设定免字节帽）
  bigPath = join(dir, 'big.txt')
  writeFileSync(bigPath, 'a'.repeat(119_000) + '\n')
  // 300KB > 256KB 字节帽 → FileTooLargeError（无 limit 全读）
  hugePath = join(dir, 'huge.txt')
  writeFileSync(hugePath, 'x'.repeat(300_000))
  pdfPath = join(dir, 'mini.pdf')
  writeFileSync(pdfPath, Buffer.from(PDF_MINI_B64, 'base64'))
})

afterEach(() => {
  delete process.env.ATLAS_DISABLE_READ_DEDUP
  rmSync(dir, { recursive: true, force: true })
  dir = mkdtempSync(join(tmpdir(), 'atlas-sc5-read-'))
  textPath = join(dir, 'text.txt')
  // 无尾换行：readFileInRange 快路径对尾换行文件恒推空末片段（旧仓
  // utils/readFileInRange.ts L174-180 逐字忠实，tryPush 无空行守卫）→
  // 行计数 5 会扰断言；fixture 取无尾换行保持 4 行语义稳定
  writeFileSync(textPath, 'line1\nline2\nline3\nline4')
  nbPath = join(dir, 'nb.ipynb')
  writeFileSync(
    nbPath,
    JSON.stringify({
      cells: [
        { id: 'c1', cell_type: 'code', source: ['x = 1'], outputs: [] },
        { id: 'c2', cell_type: 'markdown', source: ['# T'], outputs: [] },
      ],
      // notebook.ts L197 非可选访问 notebook.metadata.language_info（旧仓
      // NotebookEditTool.ts:379 逐字忠实）→ fixture 须带 metadata
      metadata: { language_info: { name: 'python' } },
    }),
  )
  imgPath = join(dir, 'px.png')
  writeFileSync(imgPath, Buffer.from(PNG_1X1_B64, 'base64'))
  bigPath = join(dir, 'big.txt')
  writeFileSync(bigPath, 'a'.repeat(119_000) + '\n')
  hugePath = join(dir, 'huge.txt')
  writeFileSync(hugePath, 'x'.repeat(300_000))
  pdfPath = join(dir, 'mini.pdf')
  writeFileSync(pdfPath, Buffer.from(PDF_MINI_B64, 'base64'))
})

function textOf(res: { data: ReadOutput }): string {
  if (res.data.type !== 'text') throw new Error(`expected text, got ${res.data.type}`)
  return res.data.file.content
}

describe('ReadTool text 支真盘', () => {
  t('全量读：行内容 + numLines/startLine/totalLines 面 + readFileState 写回', async () => {
    const state = new Map<string, FileState>()
    const res = await ReadTool.call({ file_path: textPath }, makeCtx({ readFileState: state }))
    expect(res.data.type).toBe('text')
    expect(textOf(res)).toBe('line1\nline2\nline3\nline4')
    if (res.data.type === 'text') {
      expect(res.data.file.numLines).toBe(4)
      expect(res.data.file.startLine).toBe(1)
      expect(res.data.file.totalLines).toBe(4)
    }
    // delta ⑭ 写回面：offset 默认 1 / limit undefined / mtime 戳
    const st = findState(state, '/text.txt')
    expect(st).toBeDefined()
    expect(st!.offset).toBe(1)
    expect(st!.limit).toBeUndefined()
    expect(st!.content).toBe('line1\nline2\nline3\nline4')
    expect(st!.timestamp).toBeGreaterThan(0)
    // mapToolResult 行号前缀（紧凑 N\t 面）
    const block = ReadTool.mapToolResultToToolResultBlockParam(res.data, 'tu1')
    expect(block.content).toContain('1\tline1\n2\tline2')
  })

  t('offset/limit 窗口读：行窗 + startLine 偏移面', async () => {
    const res = await ReadTool.call(
      { file_path: textPath, offset: 2, limit: 2 },
      makeCtx(),
    )
    expect(res.data.type).toBe('text')
    expect(textOf(res)).toBe('line2\nline3')
    if (res.data.type === 'text') {
      expect(res.data.file.startLine).toBe(2)
      expect(res.data.file.numLines).toBe(2)
      expect(res.data.file.totalLines).toBe(4)
    }
  })

  t('P-C2 dedup 探针：同 range 重读 → file_unchanged；env killswitch → 全量内容（恰 1 红集）', async () => {
    const state = new Map<string, FileState>()
    const ctx = makeCtx({ readFileState: state })
    const first = await ReadTool.call({ file_path: textPath }, ctx)
    expect(first.data.type).toBe('text')
    // 同 range（缺省 offset 1 / limit undefined）+ mtime 未变 → dedup 命中
    const second = await ReadTool.call({ file_path: textPath }, ctx)
    expect(second.data).toEqual({
      type: 'file_unchanged',
      file: { filePath: textPath },
    })
    // P-C2 判别支：env ATLAS_DISABLE_READ_DEDUP 设真 = dedup 关闭 → 全量
    process.env.ATLAS_DISABLE_READ_DEDUP = '1'
    const third = await ReadTool.call({ file_path: textPath }, ctx)
    expect(third.data.type).toBe('text')
    expect(textOf(third)).toBe('line1\nline2\nline3\nline4')
  })

  t('dedup range 失配（不同 offset/limit）→ 全量读', async () => {
    const state = new Map<string, FileState>()
    const ctx = makeCtx({ readFileState: state })
    expect((await ReadTool.call({ file_path: textPath }, ctx)).data.type).toBe('text')
    // 首读 offset 1 / limit undefined → offset 2 失配 → 全量
    const ranged = await ReadTool.call(
      { file_path: textPath, offset: 2 },
      ctx,
    )
    expect(ranged.data.type).toBe('text')
    expect(textOf(ranged)).toBe('line2\nline3\nline4')
  })

  t('mtime 变更 → dedup 失配（全量读，非 file_unchanged）', async () => {
    const state = new Map<string, FileState>()
    const ctx = makeCtx({ readFileState: state })
    expect((await ReadTool.call({ file_path: textPath }, ctx)).data.type).toBe('text')
    const past = new Date(Date.now() - 10_000)
    utimesSync(textPath, past, past)
    const second = await ReadTool.call({ file_path: textPath }, ctx)
    expect(second.data.type).toBe('text')
  })

  t('readFileState 缺省 → dedup 跳过（dedup 引入前基线，delta ⑭）', async () => {
    const ctx = makeCtx()
    expect((await ReadTool.call({ file_path: textPath }, ctx)).data.type).toBe('text')
    expect((await ReadTool.call({ file_path: textPath }, ctx)).data.type).toBe('text')
  })
})

describe('ReadTool 限额面真盘', () => {
  t('令牌帽：estimate 30k > 25k maxTokens → MaxFileReadTokenExceededError（delta ⑪ estimate-only）', async () => {
    await expect(
      ReadTool.call({ file_path: bigPath, limit: 100_000 }, makeCtx()),
    ).rejects.toThrow(MaxFileReadTokenExceededError)
  })

  t('字节帽：300KB 文件无 limit 全读 > 256KB maxSizeBytes → FileTooLargeError', async () => {
    await expect(
      ReadTool.call({ file_path: hugePath }, makeCtx()),
    ).rejects.toThrow(/exceeds maximum allowed size/)
  })

  t('ENOENT 友好消息：File does not exist + CWD note + cwd 面', async () => {
    await expect(
      ReadTool.call({ file_path: join(dir, 'nope.txt') }, makeCtx()),
    ).rejects.toThrow(/File does not exist\./)
  })
})

describe('ReadTool notebook / image 支真盘', () => {
  t('notebook：cells 面 + mapToolResult 块面', async () => {
    const res = await ReadTool.call({ file_path: nbPath }, makeCtx())
    expect(res.data.type).toBe('notebook')
    if (res.data.type === 'notebook') {
      expect(res.data.file.cells).toHaveLength(2)
    }
    const block = ReadTool.mapToolResultToToolResultBlockParam(res.data, 'tu-nb')
    expect(block.content).toBeDefined()
  })

  t('image D-3 最小形：原始 base64 + ext→MIME + newMessages 恒不产生（delta ⑫）', async () => {
    const raw = Buffer.from(PNG_1X1_B64, 'base64')
    const res = await ReadTool.call({ file_path: imgPath }, makeCtx())
    expect(res.data.type).toBe('image')
    if (res.data.type === 'image') {
      expect(res.data.file.type).toBe('image/png')
      expect(res.data.file.originalSize).toBe(raw.length)
      expect(Buffer.from(res.data.file.base64, 'base64')).toEqual(raw)
    }
    // delta ⑫：dimensions/createImageMetadataText 面裁 → newMessages 恒不产生
    expect(res.newMessages).toBeUndefined()
  })
})

describe('ReadTool PDF 支真盘（poppler 门控）', () => {
  tPdf('全量 PDF：data pdf 面 + document 块 newMessages（isMeta 面）', async () => {
    const raw = Buffer.from(PDF_MINI_B64, 'base64')
    const res = await ReadTool.call({ file_path: pdfPath }, makeCtx())
    expect(res.data.type).toBe('pdf')
    if (res.data.type === 'pdf') {
      expect(res.data.file.originalSize).toBe(raw.length)
      expect(Buffer.from(res.data.file.base64, 'base64')).toEqual(raw)
    }
    expect(res.newMessages).toHaveLength(1)
    const msg = res.newMessages![0] as {
      isMeta?: boolean
      message: { content: Array<{ type: string; source?: { media_type?: string } }> }
    }
    expect(msg.isMeta).toBe(true)
    expect(msg.message.content[0].type).toBe('document')
    expect(msg.message.content[0].source?.media_type).toBe('application/pdf')
    const block = ReadTool.mapToolResultToToolResultBlockParam(res.data, 'tu-pdf')
    expect(block.content).toContain('PDF file read:')
  })

  tPdf('pages 参：parts 面 + 页面 image 块 newMessages（pdftoppm 真执行）', async () => {
    const res = await ReadTool.call(
      { file_path: pdfPath, pages: '1-2' },
      makeCtx(),
    )
    expect(res.data.type).toBe('parts')
    if (res.data.type === 'parts') {
      expect(res.data.file.count).toBe(2)
    }
    expect(res.newMessages).toHaveLength(1)
    const msg = res.newMessages![0] as {
      isMeta?: boolean
      message: {
        content: Array<{ type: string; source?: { media_type?: string; data?: string } }>
      }
    }
    expect(msg.isMeta).toBe(true)
    const blocks = msg.message.content
    expect(blocks).toHaveLength(2)
    for (const b of blocks) {
      expect(b.type).toBe('image')
      expect(b.source?.media_type).toBe('image/jpeg')
      expect(typeof b.source?.data).toBe('string')
    }
    const block = ReadTool.mapToolResultToToolResultBlockParam(res.data, 'tu-parts')
    expect(block.content).toContain('PDF pages extracted: 2 page(s)')
  })
})
