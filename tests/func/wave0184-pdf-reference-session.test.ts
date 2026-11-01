/**
 * 0.1.84 V3-5 K5-7/K5-8 — @PDF 引用化活桥判别（func 层真盘真二进制）。
 *
 * 工单 §F 判别面（RED = 修前产品红）：
 *  - K5-7 主判别：真实 at-mention 生成路径（generateFileAttachment
 *    mode='at-mention'，与 getAttachments L1815 调用点同参）对小 PDF
 *    （2 页 < 旧阈值 10）也返回 pdf_reference 引用而非内联 base64 ——
 *    旧码小 PDF 走 FileReadTool.call 全文内联，spy 证明先读后丢 bytes。
 *  - 页数未知面：pdfinfo 不可用（PATH-strip）仍返回有效引用 +
 *    pageCount=null（未知语义），不以 ~100KB/页 size 估算冒充页数，
 *    也不退回内联（旧码估算 ≤10 → 内联）。
 *  - deny 先判：Read deny 规则命中 → null（无引用无读取；deny 检查在
 *    tryGetPDFReference 之前 = 既有序，不因 stat/pdfinfo 泄漏被拒文件
 *    信息）。既有满足判别（GREEN 双侧），非本波 RED。
 *  - 非 PDF 不回归：.txt at-mention 照旧 FileReadTool.call 内联。
 *
 * 活桥硬判据（provider 请求构造面）：normalizeAttachmentForAPI 是
 * messages.ts 规范化 switch `case 'attachment'` 的唯一消费（L2298，
 * API 请求构造路径），其输出 = provider 实收文本 —— 断言 path + 必读
 * 指令在场即证明真实 TUI @file 提交 → engine 请求可见。
 *
 * JSONL 面（record 真写真读，session-double-write 惯例）：@自动附件
 * 消息（含历史内联 PDF base64 形）经 cleanMessagesForLogging → 不落
 * JSONL（isLoggableMessage 既有过滤 = 磁盘既有满足判别，不硬造基线红）；
 * user 消息 @path 文本持久化 → resume 重读线索不丢。不放宽附件白名单。
 *
 * 既有边界如实登记（工单要求）：
 *  - headless print.ts 无 @ 自动展开（grep 零命中 getAttachmentMessages/
 *    processUserInput）——两入口并非都有自动附件；显式 Read 的 headless
 *    活路径 = readTool PDF 支（files-pdf-notebook-real / readTool 既有族）。
 *  - 历史内联 PDF attachment 的 normalizer/renderer（case 'file' →
 *    case 'pdf'）保留 —— 旧 session 仍能加载（分面断言在场）。
 *  - compact 调用者（compact.ts）mode='compact' → compact_file_reference
 *    不变（PDF 不走 at-mention 引用支）。
 *
 * 真实二进制门控：pdfinfo 缺失整文件 skip（poppler 惯例）；fixture 全部
 * mkdtemp 自清理。spy 面用 bun:test spyOn 于 FileReadTool 真体（同模块
 * 实例），mock 实现仅为让旧码路径可完成（RED 证明旧码确实调用了它）。
 */
import { spawnSync } from 'child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test'
import {
  createAttachmentMessage,
  generateFileAttachment,
} from '../../src/tui/utils/attachments'
import { normalizeAttachmentForAPI } from '../../src/tui/utils/messages'
import { FileReadTool } from '../../src/tui/tools/FileReadTool/FileReadTool'
import { runWithCwdOverride } from '../../src/tui/utils/cwd'
import {
  recordTranscript,
  flushSessionStorage,
  getTranscriptPath,
  clearSessionMessagesCache,
  setSessionEnv,
  resetProjectForTesting,
} from '../../src/engine'
import type { ToolPermissionContext } from '../../src/shared'

// ── 二进制探测（模块层，早于 describe 收集期）───────────────────────────

const pdfinfoProbe = spawnSync('pdfinfo', ['-v'], { stdio: 'pipe' })
const hasPdfinfo =
  pdfinfoProbe.status === 0 || (pdfinfoProbe.stderr?.length ?? 0) > 0
const t = hasPdfinfo ? test : test.skip

// ── 夹具 ─────────────────────────────────────────────────────────────────

let tmp: string
const prevPath = process.env.PATH
const prevConfigDir = process.env.ATLAS_CONFIG_DIR
const prevPersist = process.env.TEST_ENABLE_SESSION_PERSISTENCE

/** 程序化构造 N 页确定性 PDF（xref 偏移精确计算，无字体依赖）。 */
function buildPdf(pageCount: number): Buffer {
  const objects: string[] = ['', '']
  const kids: string[] = []
  for (let i = 0; i < pageCount; i++) {
    kids.push(`${3 + i * 2} 0 R`)
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageCount} >>`
  objects[2] = `<< /Type /Catalog /Pages 1 0 R >>`
  for (let i = 0; i < pageCount; i++) {
    const pageNum = 3 + i * 2
    const stream = `q 1 0 0 RG 20 20 160 160 re S Q`
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

/** 最小 ToolUseContext（PDF 引用路径只触 getAppState/readFileState）。 */
function makeCtx(tpc?: ToolPermissionContext): any {
  return {
    getAppState: () => ({
      toolPermissionContext:
        tpc ??
        ({
          mode: 'default',
          additionalWorkingDirectories: new Map(),
          alwaysAllowRules: {},
          alwaysDenyRules: {},
          alwaysAskRules: {},
          isBypassPermissionsModeAvailable: false,
        } as ToolPermissionContext),
    }),
    readFileState: new Map(),
  }
}

/** normalizeAttachmentForAPI 输出文本抽取（string / blocks 双形）。 */
function extractText(msgs: ReturnType<typeof normalizeAttachmentForAPI>): string {
  return msgs
    .map(m => {
      const content = (m as any).message.content
      if (typeof content === 'string') return content
      if (Array.isArray(content)) {
        return content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text ?? '')
          .join('')
      }
      return ''
    })
    .join('\n')
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'wave0184-pdfref-'))
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
  if (prevPath === undefined) {
    delete process.env.PATH
  } else {
    process.env.PATH = prevPath
  }
})

// ── K5-7：at-mention 生成路径引用化 ─────────────────────────────────────

describe('K5-7 @PDF 引用化（真实 at-mention 生成路径）', () => {
  t('小 PDF（2 页 < 旧阈值 10）→ 引用化非内联；FileReadTool 全文读取不触发', async () => {
    const p = join(tmp, 'small.pdf')
    writeFileSync(p, buildPdf(2))
    const validateSpy = spyOn(FileReadTool, 'validateInput').mockImplementation(
      () => Promise.resolve({ result: true } as any),
    )
    const callSpy = spyOn(FileReadTool, 'call').mockImplementation(() =>
      Promise.resolve({
        data: {
          type: 'pdf',
          file: { filePath: p, base64: 'ZmFrZS1iYXNlNjQ=', originalSize: 100 },
        },
      } as any),
    )
    try {
      const att = await generateFileAttachment(
        p,
        makeCtx(),
        'wave0184-test-success',
        'wave0184-test-error',
        'at-mention',
      )
      // 修前产品红：旧码返回 { type: 'file' }（内联 base64）
      expect(att?.type).toBe('pdf_reference')
      // spy 证明：不先执行全文 readPDF/Read.call 后再丢 bytes
      expect(callSpy).not.toHaveBeenCalled()
      expect(validateSpy).not.toHaveBeenCalled()
      if (att?.type === 'pdf_reference') {
        expect(att.pageCount).toBe(2)
        expect(att.fileSize).toBeGreaterThan(0)
        expect(att.filename).toBe(p)
        // metadata 无 base64/Buffer/raw bytes
        expect(JSON.stringify(att)).not.toMatch(/base64|ZmFrZS/)
      }
    } finally {
      validateSpy.mockRestore()
      callSpy.mockRestore()
    }
  })

  t('大 PDF（12 页 > 阈值）→ 引用化 + pageCount=12（既有面回归保持）', async () => {
    const p = join(tmp, 'large.pdf')
    writeFileSync(p, buildPdf(12))
    const att = await generateFileAttachment(
      p,
      makeCtx(),
      'wave0184-test-success',
      'wave0184-test-error',
      'at-mention',
    )
    expect(att?.type).toBe('pdf_reference')
    if (att?.type === 'pdf_reference') {
      expect(att.pageCount).toBe(12)
    }
  })

  t('pdfinfo 不可用（PATH-strip）→ 仍返回有效引用 + pageCount=null（未知语义非估算冒充）', async () => {
    const p = join(tmp, 'noinfo.pdf')
    writeFileSync(p, buildPdf(3))
    process.env.PATH = '/nonexistent-wave0184-pdfref'
    try {
      const att = await generateFileAttachment(
        p,
        makeCtx(),
        'wave0184-test-success',
        'wave0184-test-error',
        'at-mention',
      )
      // 修前产品红：旧码估算 3 页小文件 ≤10 → null → 内联路径
      expect(att?.type).toBe('pdf_reference')
      if (att?.type === 'pdf_reference') {
        // 不把 ~100KB/页 size 估算装作可靠页数
        expect(att.pageCount).toBeNull()
        expect(att.fileSize).toBeGreaterThan(0)
      }
    } finally {
      if (prevPath === undefined) {
        delete process.env.PATH
      } else {
        process.env.PATH = prevPath
      }
    }
  })

  t('deny 规则先判 → null，无引用无读取（既有序：deny 在 stat/pdfinfo 前）', async () => {
    // 裸相对 pattern（root=null → 相对 getCwd() 匹配）——getCwd() 读
    // bootstrap state 非 process.cwd（chdir 不可见），用 ALS 覆盖层
    // runWithCwdOverride 钉 cwd 到沙箱；绝对 pattern 经 patternWithRoot
    // 解析到 settings-dir root，/tmp 下文件被判 outside root 跳过
    // （matchingRuleForInput .. 前缀守卫）
    const p = join(tmp, 'denied.pdf')
    writeFileSync(p, buildPdf(2))
    const tpc = {
      mode: 'default',
      additionalWorkingDirectories: new Map(),
      alwaysAllowRules: {},
      alwaysDenyRules: { session: ['Read(denied.pdf)'] },
      alwaysAskRules: {},
      isBypassPermissionsModeAvailable: false,
    } as unknown as ToolPermissionContext
    const callSpy = spyOn(FileReadTool, 'call').mockImplementation(() =>
      Promise.resolve({ data: { type: 'text', file: {} } } as any),
    )
    try {
      const att = await runWithCwdOverride(tmp, () =>
        generateFileAttachment(
          p,
          makeCtx(tpc),
          'wave0184-test-success',
          'wave0184-test-error',
          'at-mention',
        ),
      )
      // deny → 无任何附件（无引用 metadata 泄漏 fileSize/页数）
      expect(att).toBeNull()
      expect(callSpy).not.toHaveBeenCalled()
    } finally {
      callSpy.mockRestore()
    }
  })

  t('非 PDF 不回归：.txt at-mention 照旧 FileReadTool.call 内联', async () => {
    const p = join(tmp, 'note.txt')
    writeFileSync(p, 'plain text line\n')
    const validateSpy = spyOn(FileReadTool, 'validateInput').mockImplementation(
      () => Promise.resolve({ result: true } as any),
    )
    const callSpy = spyOn(FileReadTool, 'call').mockImplementation(() =>
      Promise.resolve({
        data: {
          type: 'text',
          file: {
            filePath: p,
            content: 'plain text line\n',
            numLines: 1,
            startLine: 1,
            totalLines: 1,
          },
        },
      } as any),
    )
    try {
      const att = await generateFileAttachment(
        p,
        makeCtx(),
        'wave0184-test-success',
        'wave0184-test-error',
        'at-mention',
      )
      expect(att?.type).toBe('file')
      expect(callSpy).toHaveBeenCalledTimes(1)
    } finally {
      validateSpy.mockRestore()
      callSpy.mockRestore()
    }
  })

  t('compact 模式不变：小 PDF 照旧真读内联 file，不返回 pdf_reference（mode 门）', async () => {
    const p = join(tmp, 'compact.pdf')
    writeFileSync(p, buildPdf(2))
    const att = await generateFileAttachment(
      p,
      makeCtx(),
      'wave0184-test-success',
      'wave0184-test-error',
      'compact',
    )
    // 既有行为：compact 模式小 PDF 走真 FileReadTool.call 内联（真读）；
    // compact_file_reference 仅截断路径。K5-7 不变量 = compact 模式
    // 永不经 at-mention 引用支（tryGetPDFReference mode 门）
    expect(att?.type).toBe('file')
    expect(att?.type).not.toBe('pdf_reference')
  })
})

// ── K5-8：活桥（provider 请求构造面）+ 旧形保留 ─────────────────────────

describe('K5-8 活桥：normalizeAttachmentForAPI（provider 实收文本）', () => {
  t('引用 → meta user 消息含 path + 未附上 + 必读指令 + pages ≤20 + 逐页指引', () => {
    const out = normalizeAttachmentForAPI({
      type: 'pdf_reference',
      filename: '/abs/path/report.pdf',
      pageCount: 30,
      fileSize: 1_234_567,
      displayPath: 'report.pdf',
    })
    expect(out.length).toBeGreaterThanOrEqual(1)
    const text = extractText(out)
    // 活桥：provider 实收文本可见 path + 指令
    expect(text).toContain('/abs/path/report.pdf')
    expect(text).toMatch(/not attached/i)
    expect(text).toMatch(/MUST use the Read tool/i)
    expect(text).toMatch(/up to 20 pages per request/i)
    expect(text).toMatch(/page by page/i)
  })

  t('小 PDF 文案不虚报：无 too large / 无无-pages-必失败 / 不声称已读', () => {
    const out = normalizeAttachmentForAPI({
      type: 'pdf_reference',
      filename: '/abs/path/small.pdf',
      pageCount: 2,
      fileSize: 2048,
      displayPath: 'small.pdf',
    })
    const text = extractText(out)
    // 修前产品红：旧模板含 "too large to read all at once" +
    // "without the pages parameter or it will fail"
    expect(text).not.toMatch(/too large/i)
    expect(text).not.toMatch(/will fail/i)
    expect(text).not.toMatch(/already (been )?read/i)
  })

  t('pageCount null → unknown 页数文案（不打印 "null pages"）', () => {
    const out = normalizeAttachmentForAPI({
      type: 'pdf_reference',
      filename: '/abs/path/unknown.pdf',
      pageCount: null,
      fileSize: 4096,
      displayPath: 'unknown.pdf',
    })
    const text = extractText(out)
    // 修前产品红：旧类型 pageCount: number，null 语义不存在
    expect(text).not.toMatch(/null pages/)
    expect(text).toMatch(/unknown/i)
  })

  t('历史内联 PDF attachment normalizer 保留：case file→pdf 旧 session 仍能加载', () => {
    const out = normalizeAttachmentForAPI({
      type: 'file',
      filename: '/abs/path/legacy.pdf',
      displayPath: 'legacy.pdf',
      content: {
        type: 'pdf',
        file: {
          filePath: '/abs/path/legacy.pdf',
          base64: 'bGVnYWN5LWJhc2U2NA==',
          originalSize: 100,
        },
      },
    })
    // 旧形 → tool-result 体（不删媒体面）
    const text = extractText(out)
    expect(out.length).toBeGreaterThan(0)
    expect(text).toContain('legacy.pdf')
  })
})

// ── JSONL 面：record 真写真读（session-double-write 惯例）───────────────

describe('JSONL 面：@自动附件 bytes 不落盘 + user @path 持久化', () => {
  beforeAll(() => {
    process.env.ATLAS_CONFIG_DIR = join(tmp, 'config')
    process.env.TEST_ENABLE_SESSION_PERSISTENCE = '1'
    setSessionEnv({ getProjectsDir: () => join(tmp, 'config', 'projects') })
  })
  afterAll(() => {
    if (prevConfigDir === undefined) {
      delete process.env.ATLAS_CONFIG_DIR
    } else {
      process.env.ATLAS_CONFIG_DIR = prevConfigDir
    }
    if (prevPersist === undefined) {
      delete process.env.TEST_ENABLE_SESSION_PERSISTENCE
    } else {
      process.env.TEST_ENABLE_SESSION_PERSISTENCE = prevPersist
    }
  })

  t('真 record/flush：内联 PDF base64 与 pdf_reference 均不进 JSONL；user @path 文本在', async () => {
    resetProjectForTesting()
    clearSessionMessagesCache()
    const sid = 'wave0184-pdfref-session'
    const marker = 'V0FWRTAxODQtUERGLUJBU0U2NC1NQVJLRVI='
    const userMsg = {
      uuid: 'u-1',
      type: 'user',
      timestamp: '2026-11-01T00:00:00Z',
      message: {
        content: 'summarize @/abs/path/report.pdf for me',
      },
    } as any
    const inlinePdfAttachment = createAttachmentMessage({
      type: 'file',
      filename: '/abs/path/report.pdf',
      displayPath: 'report.pdf',
      content: {
        type: 'pdf',
        file: {
          filePath: '/abs/path/report.pdf',
          base64: marker,
          originalSize: 100,
        },
      },
    } as any)
    const referenceAttachment = createAttachmentMessage({
      type: 'pdf_reference',
      filename: '/abs/path/report.pdf',
      pageCount: 30,
      fileSize: 1_234_567,
      displayPath: 'report.pdf',
    } as any)
    await recordTranscript([userMsg, inlinePdfAttachment, referenceAttachment] as any)
    await flushSessionStorage()
    const jsonlPath = getTranscriptPath(sid)
    expect(existsSync(jsonlPath)).toBe(true)
    const raw = readFileSync(jsonlPath, 'utf8')
    // 磁盘既有满足判别（isLoggableMessage 既有过滤，非本波基线红）：
    // raw PDF bytes（base64 形）与引用 metadata 均不落盘
    expect(raw).not.toContain(marker)
    expect(raw).not.toContain('pdf_reference')
    // user 消息 @path 文本持久化 → resume 后重读线索不丢
    expect(raw).toContain('@/abs/path/report.pdf')
    resetProjectForTesting()
    clearSessionMessagesCache()
  })
})
