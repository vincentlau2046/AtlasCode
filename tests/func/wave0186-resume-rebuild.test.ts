/**
 * 0.1.86 H（R-085-1）— compact→quit→resume 组合缝：compact 重建 PDF 引用
 * 挂载为边界后 attachment 记录（修法 A）。
 *
 * R-085-1 定因（Main 锁面实证 2026-11-03）：
 *  - P-L2=true 机制订正：gate-085 same-session 投影捕获窗 = /compact 轮内
 *    summarizer 请求（summarizer 输入含 L1 attachment 消息 → C85-A params
 *    支投影）；gate 报告 detail 注解「collectPDFReferenceAttachmentsForCompact
 *    重建挂载」系机制误归因（收集器在 ENGINE manual /compact 路径从未运行）。
 *  - P-L5=false 定因：compact 重建为请求构建时投影（live append-only 数组
 *    中存活的 L1 attachment 是唯一投影来源），未持久化为边界后 attachment
 *    记录；resume 加载（loadTranscriptFile）按 compact_boundary in-stream
 *    截断（sessionStoragePortable scanChunkLines：out.len=0），边界前记录
 *    全丢 → params attachment 支无可投影对象。
 *  - 修法 A（本波）：ENGINE compactConversation compact 时以 shared 收集器
 *    （五字段白名单投影，同 C85-D 纪律，白名单面零放宽）重建 PDF 引用为
 *    边界后 attachment 记录 → buildPostCompactMessages attachments 槽位
 *    （boundary → summary → keep → attachments → hooks，ordering 单一事实
 *    源不动）→ JSONL 边界后落盘 → resume 截断幸存 → params 支投影
 *    （P-L5 GREEN）。覆盖面：富体（manual /compact + auto-compact rich）+
 *    裁剪（headless autoCompact / agentLoop / swarm）。
 *  - 登记（工单 §H 批注）：(a) TUI reactiveCompact 收集器消费本就有（本波
 *    收集器迁 shared 单一事实源，TUI 留 re-export）；(b) keepRecent 窗内
 *    同文件引用至多 +1 条重复（kept 原文 + 重建）= TUI reactive 同语义
 *    （verbatim 一致，登记不修，本测试锁定该已裁定语义）；(c) record.ts /
 *    sessionStorage.ts 白名单已正确不动（工单 §5.2 预案落点偏离登记）。
 *
 * 判别锚（gate ⑥ 口径：行为红修前直证）：
 *  - RED：富体/裁剪双面 result.attachments 零 PDF 重建；resume 链 P-L5
 *    canonical 投影缺席。
 *  - 恒真锚：P-L2 same-session（pre-compact 活数组 → summarizer 面投影）
 *    修前即真；resume 截断面（边界前记录丢失）修前即真；ordering 面边界
 *    恒居首。
 *
 * 纯消息面 + 真盘 JSONL（无 PDF 二进制、无 poppler 门控）；fixture 全部
 * mkdtemp 自清理（wave0185 惯例）。
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
  afterEach,
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
  buildPostCompactMessages,
  clearSessionMessagesCache,
  compactConversation,
  flushSessionStorage,
  getTranscriptPath,
  isCompactBoundaryMessage,
  recordTranscript,
  resetProjectForTesting,
  setCompactPorts,
  setSessionEnv,
  type CompactContext,
  type CompactPorts,
} from '../../src/engine'
import type { Message } from '../../src/shared'
import { loadTranscriptFile as loadTranscriptFileTui } from '../../src/tui/utils/sessionStorage'

// ── 环境与夹具（wave0185 惯例）──────────────────────────────────────────

let tmp: string
const prevConfigDir = process.env.ATLAS_CONFIG_DIR
const prevPersist = process.env.TEST_ENABLE_SESSION_PERSISTENCE

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
    timestamp: '2026-11-03T00:00:00Z',
    message: { content: `user-${uuid}` },
  }
}

function assistantMsg(id: string, text: string): Message {
  return {
    uuid: `a-${id}`,
    type: 'assistant',
    role: 'assistant',
    timestamp: '2026-11-03T00:00:01Z',
    message: {
      id,
      content: [{ type: 'text', text }],
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  } as Message
}

function pdfAttachmentMsg(_uuidSuffix: string): any {
  return createAttachmentMessage(refAttachment()) as any
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'wave0186-r0851-'))
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

afterEach(() => setCompactPorts(null))

// ── 富体 harness（engine-auto-compact-recovery-0168 同款惯例）────────────

const makeContext = (extra: Partial<CompactContext> = {}): CompactContext =>
  ({
    abortController: new AbortController(),
    readFileState: new Map<string, { content: string; timestamp: number }>(),
    getAppState: () => ({}),
    options: { mainLoopModel: 'test-model' },
    ...extra,
  }) as unknown as CompactContext

const cacheSafeParams = (msgs: Message[] = []) => ({
  systemPrompt: '',
  userContext: {},
  systemContext: {},
  forkContextMessages: msgs,
})

const basePorts: CompactPorts = {
  summarize: async () =>
    assistantMsg('s1', 'REAL-SUMMARY') as unknown as Message,
  executePreCompactHooks: async () => ({}),
  executePostCompactHooks: async () => ({}),
  processSessionStartHooks: async () => [],
  buildPostCompactAttachments: async () => [],
}

const pdfCount = (msgs: readonly unknown[]): number =>
  msgs.filter(
    m => (m as { attachment?: { type?: string } }).attachment?.type ===
      'pdf_reference',
  ).length

// ── A 面：compact 重建（富体 + 裁剪，RED 直证）───────────────────────────

describe('R-085-1 修法 A · compact 重建 PDF 引用（双模式）', () => {
  test('RED→GREEN 富体面：manual /compact 重建 PDF 引用为 attachment 记录', async () => {
    setCompactPorts(basePorts)
    const messages = [
      userMsg('u-r1'),
      pdfAttachmentMsg('att-r1'),
      assistantMsg('as-r1', 'answer with pdf'),
      userMsg('u-r2'),
    ] as Message[]
    const result = await compactConversation(
      messages,
      makeContext(),
      cacheSafeParams(messages),
      false,
    )
    // 修前：attachments 仅 port 产物（∅）→ PDF 重建缺席 = P-L5 根因
    expect(result.attachments.length).toBe(1)
    const att = (result.attachments[0] as any).attachment
    expect(att.type).toBe('pdf_reference')
    expect(att.filename).toBe('/abs/dir/报告 B.pdf')
    // 五字段白名单（同 C85-D 落盘纪律，白名单面零放宽）
    expect(Object.keys(att).sort()).toEqual([
      'displayPath',
      'fileSize',
      'filename',
      'pageCount',
      'type',
    ])
    // ordering：边界居首，重建 attachment 落边界后（attachments 槽位）
    const post = buildPostCompactMessages(result)
    expect(isCompactBoundaryMessage(post[0])).toBe(true)
    expect(pdfCount(post)).toBe(1)
    const attIdx = post.findIndex(
      m => (m as any).attachment?.type === 'pdf_reference',
    )
    expect(attIdx).toBeGreaterThan(0)
  })

  test('RED→GREEN 裁剪面：headless autoCompact 同重建（agentLoop/swarm 车道）', async () => {
    const result = await compactConversation(
      [
        userMsg('u-t1'),
        pdfAttachmentMsg('att-t1'),
        userMsg('u-t2'),
      ] as Message[],
      { summarize: async () => 'TRIMMED-SUMMARY' },
    )
    expect(result.attachments.length).toBe(1)
    expect((result.attachments[0] as any).attachment.type).toBe(
      'pdf_reference',
    )
    const post = buildPostCompactMessages(result)
    expect(isCompactBoundaryMessage(post[0])).toBe(true)
    expect(pdfCount(post)).toBe(1)
  })

  test('恒等锚：无 PDF 输入 = attachments 恒空（防误注，零回归面）', async () => {
    setCompactPorts(basePorts)
    const messages = [
      userMsg('u-n1'),
      assistantMsg('as-n1', 'plain answer'),
      userMsg('u-n2'),
    ] as Message[]
    const rich = await compactConversation(
      messages,
      makeContext(),
      cacheSafeParams(messages),
      false,
    )
    expect(rich.attachments).toHaveLength(0)
    const trimmed = await compactConversation(messages, {
      summarize: async () => 'TRIMMED-SUMMARY',
    })
    expect(trimmed.attachments).toHaveLength(0)
  })

  test('登记 b 锁定：keepRecent 窗内同文件引用 kept 原文 + 重建并存（+1 有界，TUI reactive 同语义）', async () => {
    setCompactPorts(basePorts)
    const messages = [
      userMsg('u-k1'),
      pdfAttachmentMsg('att-k1'),
      userMsg('u-k2'),
    ] as Message[]
    const result = await compactConversation(
      messages,
      makeContext(),
      cacheSafeParams(messages),
      false,
      undefined, // customInstructions
      false, // isAutoCompact
      undefined, // recompactionInfo
      2, // keepRecent=2 → kept=[attMsg, u-k2] 含原文引用
    )
    // kept 原文 1 条 + 重建 1 条 = 2（登记 b：至多 +1 有界重复，不 dedup）
    expect(result.messagesToKeep).toBeDefined()
    expect(pdfCount(result.messagesToKeep ?? [])).toBe(1)
    expect(pdfCount(result.attachments)).toBe(1)
    expect(pdfCount(buildPostCompactMessages(result))).toBe(2)
  })
})

// ── B 面：resume 链（真 record/flush/load，P-L5 face）────────────────────

describe('R-085-1 · compact→persist→resume 链（P-L5 face）', () => {
  test('RED→GREEN：resume 边界截断后 canonical 投影在场（修前缺席）', async () => {
    resetProjectForTesting()
    clearSessionMessagesCache()
    setCompactPorts(basePorts)
    const sid = 'wave0186-r0851-resume'
    const originalAtt = pdfAttachmentMsg('att-l1')
    const preCompact = [
      userMsg('u-l1'),
      originalAtt,
      assistantMsg('as-l1', 'answer with pdf'),
      userMsg('u-l2'),
    ] as Message[]

    // 恒真锚（P-L2 机制订正版）：pre-compact 活数组 → summarizer 面投影
    // 修前即真（C85-A params 支）；这不是重建，是唯一来源的直证。
    const summarizerFace = toOpenAIMessages(preCompact) as Array<{
      role: string
      content: string
    }>
    expect(
      summarizerFace.some(c => c.content.startsWith('PDF file: ')),
    ).toBe(true)

    // compact（修法 A 落点）→ buildPostCompactMessages → 持久化
    const result = await compactConversation(
      preCompact,
      makeContext(),
      cacheSafeParams(preCompact),
      false,
    )
    const post = buildPostCompactMessages(result)

    // 真盘：u-l1/原文 attachment/摘要前史（边界前）+ compact 后序列。
    // 6MB 填充（SKIP_PRECOMPACT_THRESHOLD=5MB 门）：chunked 边界截断仅在
    // 文件 >5MB 时启用（生产 R-085-1 场景即大 transcript）；小文件走整读
    // 路径不截断。填充消息居边界前 = 截断面天然验真（修前路径丢不掉它）。
    const paddingMsg = {
      uuid: 'u-pad',
      type: 'user',
      timestamp: '2026-11-03T00:00:02Z',
      message: { content: 'pad:' + 'x'.repeat(6 * 1024 * 1024) },
    }
    await recordAndFlush([
      userMsg('u-l0'),
      originalAtt,
      paddingMsg,
      ...post,
    ] as Message[])

    const jsonlPath = getTranscriptPath(sid)
    expect(existsSync(jsonlPath)).toBe(true)
    const { statSync } = await import('fs')
    expect(statSync(jsonlPath).size).toBeGreaterThan(5 * 1024 * 1024)
    const raw = readFileSync(jsonlPath, 'utf8')
    expect(raw).toContain('compact_boundary')

    // resume：loadTranscriptFile 按 compact_boundary in-stream 截断
    const { messages: resumedMap } = await loadTranscriptFileTui(jsonlPath)
    const resumed = [...resumedMap.values()] as any[]

    // 截断面恒真锚：边界前记录全丢（u-l0 / 原文 attachment 记录）
    expect(resumed.some(m => m.uuid === 'u-l0')).toBe(false)
    expect(resumed.some(m => m.uuid === (originalAtt as any).uuid)).toBe(
      false,
    )
    // 截断后唯一 PDF 引用来源 = 边界后重建 attachment 记录（修法 A）
    const resumedAtt = resumed.find(
      m => m.type === 'attachment' && m.attachment?.type === 'pdf_reference',
    )
    expect(resumedAtt).toBeDefined()
    expect(resumedAtt.attachment.filename).toBe('/abs/dir/报告 B.pdf')

    // P-L5 GREEN：resume 链 canonical 投影（四要素，同 wave0185 A③ 口径）
    const out = toOpenAIMessages([resumedAtt]) as Array<{
      role: string
      content: string
    }>
    expect(out).toHaveLength(1)
    expect(out[0].role).toBe('user')
    expect(out[0].content.startsWith('PDF file: ')).toBe(true)
    expect(out[0].content).toContain('/abs/dir/报告 B.pdf')
    expect(out[0].content).toContain('MUST use the Read tool')
    expect(out[0].content).toContain('pages')
    expect(out[0].content).toContain('not attached')
  })

  test('恒真锚：resume 链零回归——边界/摘要消息完整幸存', async () => {
    const jsonlPath = getTranscriptPath('wave0186-r0851-resume')
    const { messages: resumedMap } = await loadTranscriptFileTui(jsonlPath)
    const resumed = [...resumedMap.values()] as any[]
    // 边界居首（C6 元数据重钉判别式，0.1.68 恒等锚）
    expect(isCompactBoundaryMessage(resumed[0])).toBe(true)
    // 摘要 user 消息在场（C1 续会话提示面）
    const summary = resumed.find(
      m => m.type === 'user' &&
        typeof m.message?.content === 'string' &&
        m.message.content.includes('REAL-SUMMARY'),
    )
    expect(summary).toBeDefined()
  })
})

// ── helper：真 record/flush（wave0185 惯例）─────────────────────────────

async function recordAndFlush(msgs: Message[]): Promise<void> {
  await recordTranscript(msgs)
  await flushSessionStorage()
}
