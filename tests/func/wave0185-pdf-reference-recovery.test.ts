/**
 * 0.1.85-D（C85-D）— @PDF 引用「恢复/压缩仍保引用」落盘与重建（func 层真盘）。
 *
 * 工单 §1-D 硬判据覆盖：
 *  - 落盘白名单面：pdf_reference attachment 经 record 车道 cleanMessages
 *    ForLogging → 五字段白名单（type/filename/pageCount/fileSize/display
 *    Path）且仅此五字段（Object.keys 精确断言 = 不 spread 原对象铁证）；
 *    恶意额外字段（base64/Buffer/content 正文形）一律剥除不落盘；内联
 *    bytes 形（type 'file'）仍必不落盘。
 *  - 两车道一致：engine session/record.ts 与 tui utils/sessionStorage.ts
 *    同款过滤 + 同一投影叶子（shared projectPDFReferenceForRecord 单一
 *    事实源），输出深等。
 *  - resume 重建消费面：flush 后 loadTranscriptFile 读回 → attachment
 *    entry 在恢复消息链 → toOpenAIMessages（params Task A 支）投影为
 *    user 文本：绝对 filename + MUST use Read + pages 指引在场 + 「not
 *    attached」不虚报已读。恢复后文件被替换 → 重读拿新内容；删除/权限
 *    deny → Read 显式失败（引用车道零内容持久化 = 无旧页图假答面，由
 *    metadata-only 落盘结构性保证，此处断言其不可达前提）。
 *  - compact 重建面：collectPDFReferenceAttachmentsForCompact 从压缩输入
 *    收集引用（按 filename 去重防膨胀、后值覆盖）；unknown 页数/小 PDF/
 *    空格与 Unicode 路径全过；非法形（缺 filename/字段类型不符）排除；
 *    重建产物经 createAttachmentMessage 同形（buildPostCompactMessages
 *    attachments 槽位既有顺序面不变）。
 *
 * 084 行为变更登记：wave0184-pdf-reference-session「全部 pdf_reference 必
 * 不落盘」断言本波明确变更（引用 metadata 在场、内联 bytes 仍必不落盘）。
 *
 * 纯消息面 + 真盘 JSONL（无 PDF 二进制、无 poppler 门控）；fixture 全部
 * mkdtemp 自清理（wave0184 惯例）。
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test'
import {
  createAttachmentMessage,
} from '../../src/tui/utils/attachments'
import { toOpenAIMessages } from '../../src/modelprovider/params'
import {
  recordTranscript,
  flushSessionStorage,
  getTranscriptPath,
  clearSessionMessagesCache,
  setSessionEnv,
  resetProjectForTesting,
  loadTranscriptFile,
} from '../../src/engine'
import {
  cleanMessagesForLogging as engineCleanMessagesForLogging,
  isLoggableMessage as engineIsLoggableMessage,
} from '../../src/engine/session/record'
import { cleanMessagesForLogging as tuiCleanMessagesForLogging } from '../../src/tui/utils/sessionStorage'
import { collectPDFReferenceAttachmentsForCompact } from '../../src/tui/contextBodies/compact'
import type { Message } from '../../src/tui/types/message'

// ── 环境与夹具 ───────────────────────────────────────────────────────────

let tmp: string
const prevConfigDir = process.env.ATLAS_CONFIG_DIR
const prevPersist = process.env.TEST_ENABLE_SESSION_PERSISTENCE

/** 恶意/意外额外字段探针：正文形字段混入引用附件。 */
const MARKER = 'V0FWRTAxODUtUERGLUJBU0U2NC1NQVJLRVI='

function refAttachment(extra?: Record<string, unknown>): any {
  return {
    type: 'pdf_reference',
    filename: '/abs/dir/报告 B.pdf',
    pageCount: 12,
    fileSize: 345_678,
    displayPath: 'docs/报告 B.pdf',
    ...(extra ?? {}),
  }
}

function userMsg(uuid: string): any {
  return {
    uuid,
    type: 'user',
    timestamp: '2026-11-02T00:00:00Z',
    message: { content: 'please analyze @/abs/dir/报告 B.pdf' },
  }
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'wave0185-pdfref-'))
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
  resetProjectForTesting()
  clearSessionMessagesCache()
  rmSync(tmp, { recursive: true, force: true })
})

// ── A 面：落盘白名单 + resume 重建（真 record/flush/load）────────────────

describe('C85-D 落盘白名单 + resume 重建（真 record/flush/load）', () => {
  test('A① 真 record/flush：五字段白名单落盘；恶意 base64/content/Buffer 字段与内联 bytes 均不落盘', async () => {
    resetProjectForTesting()
    clearSessionMessagesCache()
    const sid = 'wave0185-pdfref-recovery'
    const malicious = refAttachment({
      base64: MARKER,
      content: { type: 'pdf', file: { base64: MARKER } },
      buffer: Buffer.from('raw-bytes-probe'),
      source: { type: 'base64', data: MARKER },
    })
    const inline = createAttachmentMessage({
      type: 'file',
      filename: '/abs/dir/other.pdf',
      displayPath: 'other.pdf',
      content: {
        type: 'pdf',
        file: { filePath: '/abs/dir/other.pdf', base64: MARKER, originalSize: 9 },
      },
    } as any)
    await recordTranscript([
      userMsg('u-a1'),
      createAttachmentMessage(malicious),
      inline,
    ] as any)
    await flushSessionStorage()
    const jsonlPath = getTranscriptPath(sid)
    expect(existsSync(jsonlPath)).toBe(true)
    const raw = readFileSync(jsonlPath, 'utf8')
    // 内联 bytes（base64 形）恒不落盘
    expect(raw).not.toContain(MARKER)
    // 恶意正文形字段名与探针值均不落盘
    expect(raw).not.toContain('buffer')
    expect(raw).not.toContain('raw-bytes-probe')
    // 引用 metadata 落盘（0.1.85-D 显式行为变更；084 断言面同波更新）
    expect(raw).toContain('pdf_reference')
    const entries = raw
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l) as Record<string, any>)
    const attEntry = entries.find(e => e.type === 'attachment')
    expect(attEntry).toBeDefined()
    // 五字段白名单且仅五字段（不 spread 原对象铁证）
    expect(Object.keys(attEntry!.attachment).sort()).toEqual([
      'displayPath',
      'fileSize',
      'filename',
      'pageCount',
      'type',
    ])
    expect(attEntry!.attachment.filename).toBe('/abs/dir/报告 B.pdf')
    expect(attEntry!.attachment.pageCount).toBe(12)
    expect(attEntry!.attachment.fileSize).toBe(345_678)
    expect(attEntry!.attachment.displayPath).toBe('docs/报告 B.pdf')
    // user 消息 @path 文本持久化
    expect(raw).toContain('@/abs/dir/报告 B.pdf')
  })

  test('A② loadTranscriptFile 读回：attachment entry 在恢复消息链（isTranscriptMessage 门）', async () => {
    const jsonlPath = getTranscriptPath('wave0185-pdfref-recovery')
    const { messages } = await loadTranscriptFile(jsonlPath)
    const atts = [...messages.values()].filter(
      m => (m as any).type === 'attachment',
    )
    expect(atts).toHaveLength(1)
    const att = (atts[0] as any).attachment
    expect(att.type).toBe('pdf_reference')
    expect(att.filename).toBe('/abs/dir/报告 B.pdf')
    expect(att.pageCount).toBe(12)
    expect(att.fileSize).toBe(345_678)
    expect(Object.keys(att).sort()).toEqual([
      'displayPath',
      'fileSize',
      'filename',
      'pageCount',
      'type',
    ])
  })

  test('A③ resume 重建消费面：toOpenAIMessages（params Task A 支）投影四要素必读文本，不虚报已读', async () => {
    const jsonlPath = getTranscriptPath('wave0185-pdfref-recovery')
    const { messages } = await loadTranscriptFile(jsonlPath)
    const attMsg = [...messages.values()].find(
      m => (m as any).type === 'attachment',
    )
    expect(attMsg).toBeDefined()
    const out = toOpenAIMessages([attMsg!] as any) as Array<{
      role: string
      content: string
    }>
    expect(out).toHaveLength(1)
    expect(out[0].role).toBe('user')
    const text = out[0].content
    // 四要素：绝对 filename / 必读指令 / pages 指引 / 不声称已读
    expect(text).toContain('/abs/dir/报告 B.pdf')
    expect(text).toContain('MUST use the Read tool')
    expect(text).toContain('pages')
    expect(text).toContain('not attached')
  })

  test('A④ engine 车道：pdf_reference 放行 + 投影五字段；file 型仍全滤；skill_listing 原样放行不投影', () => {
    const refMsg = createAttachmentMessage(refAttachment({
      base64: MARKER,
    })) as any as Message
    const fileMsg = createAttachmentMessage({
      type: 'file',
      filename: '/x.pdf',
      displayPath: 'x.pdf',
      content: { type: 'pdf', file: { filePath: '/x.pdf', base64: MARKER, originalSize: 1 } },
    } as any) as any as Message
    const skillMsg = createAttachmentMessage({
      type: 'skill_listing',
      skills: [{ name: 'demo', description: 'd', source: 'bundled' }],
    } as any) as any as Message
    // 放行面
    expect(engineIsLoggableMessage(refMsg)).toBe(true)
    expect(engineIsLoggableMessage(skillMsg)).toBe(true)
    expect(engineIsLoggableMessage(fileMsg)).toBe(false)
    // 投影面
    const out = engineCleanMessagesForLogging([refMsg, fileMsg, skillMsg])
    expect(out).toHaveLength(2)
    const projected = (out[0] as any).attachment
    expect(projected.type).toBe('pdf_reference')
    expect(Object.keys(projected).sort()).toEqual([
      'displayPath',
      'fileSize',
      'filename',
      'pageCount',
      'type',
    ])
    expect(projected.base64).toBeUndefined()
    // skill_listing 原样（不投影不剥字段）
    expect((out[1] as any).attachment.type).toBe('skill_listing')
    expect((out[1] as any).attachment.skills).toHaveLength(1)
  })

  test('A⑤ 两车道一致：engine 与 tui cleanMessagesForLogging 输出深等（同一投影叶子）', () => {
    const refMsg = createAttachmentMessage(refAttachment({
      content: { probe: MARKER },
    })) as any as Message
    const engineOut = engineCleanMessagesForLogging([refMsg]) as any[]
    const tuiOut = tuiCleanMessagesForLogging([refMsg]) as any[]
    expect(tuiOut).toHaveLength(1)
    expect(tuiOut[0].attachment).toEqual(engineOut[0].attachment)
    expect(Object.keys(tuiOut[0].attachment).sort()).toEqual([
      'displayPath',
      'fileSize',
      'filename',
      'pageCount',
      'type',
    ])
  })
})

// ── B 面：compact 重建（收集/去重/白名单/非法形排除）─────────────────────

describe('C85-D compact 重建面（collectPDFReferenceAttachmentsForCompact）', () => {
  test('B① 按 filename 去重：同文件重复引用不膨胀（后值覆盖），不同文件各自保留', () => {
    const msgs = [
      userMsg('u-b1'),
      createAttachmentMessage(refAttachment()) as any as Message,
      createAttachmentMessage({
        ...refAttachment(),
        pageCount: 15,
      }) as any as Message,
      createAttachmentMessage({
        ...refAttachment(),
        filename: '/abs/dir/second.pdf',
        displayPath: 'second.pdf',
      }) as any as Message,
    ]
    const collected = collectPDFReferenceAttachmentsForCompact(msgs)
    expect(collected).toHaveLength(2)
    const first = collected.find(a => a.filename === '/abs/dir/报告 B.pdf')
    expect(first).toBeDefined()
    expect(first!.pageCount).toBe(15)
    expect(collected.find(a => a.filename === '/abs/dir/second.pdf')).toBeDefined()
  })

  test('B② 恶意额外字段剥除：收集产物恒五字段白名单形', () => {
    const msgs = [
      createAttachmentMessage(refAttachment({
        base64: MARKER,
        content: { type: 'pdf', file: { base64: MARKER } },
        buffer: Buffer.from('x'),
      })) as any as Message,
    ]
    const collected = collectPDFReferenceAttachmentsForCompact(msgs)
    expect(collected).toHaveLength(1)
    expect(Object.keys(collected[0]).sort()).toEqual([
      'displayPath',
      'fileSize',
      'filename',
      'pageCount',
      'type',
    ])
    expect(JSON.stringify(collected)).not.toContain(MARKER)
  })

  test('B③ unknown 页数 / 小 PDF / 空格 Unicode 路径全过（重建不丢引用）', () => {
    const msgs = [
      createAttachmentMessage({
        ...refAttachment(),
        pageCount: null,
        fileSize: 1,
      }) as any as Message,
      createAttachmentMessage({
        type: 'pdf_reference',
        filename: '/tmp/空 格 目录/图 纸.pdf',
        pageCount: 2,
        fileSize: 404,
        displayPath: '图 纸.pdf',
      }) as any as Message,
    ]
    const collected = collectPDFReferenceAttachmentsForCompact(msgs)
    expect(collected).toHaveLength(2)
    expect(collected.find(a => a.pageCount === null)).toBeDefined()
    expect(collected.find(a => a.filename.includes('图 纸.pdf'))).toBeDefined()
  })

  test('B④ 非法形排除：缺 filename / pageCount 缺失 / fileSize 类型不符不收集', () => {
    const msgs = [
      createAttachmentMessage({
        type: 'pdf_reference',
        pageCount: 3,
        fileSize: 10,
        displayPath: 'no-filename.pdf',
      }) as any as Message,
      createAttachmentMessage({
        type: 'pdf_reference',
        filename: '/x.pdf',
        fileSize: 10,
        displayPath: 'x.pdf',
      }) as any as Message,
      createAttachmentMessage({
        type: 'pdf_reference',
        filename: '/y.pdf',
        pageCount: 3,
        fileSize: '10',
        displayPath: 'y.pdf',
      }) as any as Message,
      createAttachmentMessage({
        type: 'file',
        filename: '/z.pdf',
        displayPath: 'z.pdf',
        content: { type: 'pdf', file: { filePath: '/z.pdf', base64: MARKER, originalSize: 1 } },
      }) as any as Message,
    ]
    expect(collectPDFReferenceAttachmentsForCompact(msgs)).toEqual([])
  })

  test('B⑤ 重建产物经 createAttachmentMessage 同形（buildPostCompactMessages attachments 槽位输入）', () => {
    const [att] = collectPDFReferenceAttachmentsForCompact([
      createAttachmentMessage(refAttachment()) as any as Message,
    ])
    const rebuilt = createAttachmentMessage(att) as any
    expect(rebuilt.type).toBe('attachment')
    expect(rebuilt.attachment.type).toBe('pdf_reference')
    expect(rebuilt.attachment.filename).toBe('/abs/dir/报告 B.pdf')
    expect(Object.keys(rebuilt.attachment).sort()).toEqual([
      'displayPath',
      'fileSize',
      'filename',
      'pageCount',
      'type',
    ])
  })
})
