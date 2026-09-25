/**
 * S-E3（§8.52 A11/A12）loop transcript 写面 func 真盘测试：
 * F-1 queryAgentLoop + autoCompact 全链真盘（record entry/compact 支 → JSONL
 * 消息行 + compact boundary 标记字节 = scanner #15 同点断言，A11-Δ1 效果面）/
 * F-2 A12 活态 cwd 戳（JSONL cwd 字段 = 活源逐调用值；project dir 键控不漂移）。
 *
 * 分层纪律：func 层真 fs（mkdtemp + setSessionEnv getProjectsDir→tmpdir 注入，
 * 口径同 engine-session-fs；TEST_ENABLE_SESSION_PERSISTENCE=1 破 unit 层
 * shouldSkipPersistence 测试守卫）+ 每测试独立 sessionId。
 *
 * 探针锚点（§8.52 S-E3 详案，突变须恰好 1 red）：
 *   P-E5 loop compact 支 record 调用点删除 → F-1 恰 1 红（F-2 + unit 全绿）
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  compactConversation,
  clearSessionMessagesCache,
  flushSessionStorage,
  getTranscriptPath,
  loadTranscriptFile,
  queryAgentLoop,
  recordContentReplacement,
  recordTranscript,
  resetProjectForTesting,
  setSessionEnv,
  getSessionEnv,
  type AgentLoopDeps,
  type AutoCompactDeps,
  type Message,
  type Tool,
} from '../../src/engine'
import type { ModelProvider } from '../../src/modelprovider'

let tmp: string
let liveCwd: string

function fakeProvider(content: unknown[], stopReason = 'end_turn'): ModelProvider {
  const notExercised = async () => {
    throw new Error('fake ModelProvider: 方法未被本测消费')
  }
  return {
    chat: async () => ({
      type: 'assistant',
      uuid: 'fake-uuid',
      timestamp: '2026-09-23T00:00:00Z',
      message: {
        id: 'fake-msg',
        model: 'fake-model',
        role: 'assistant',
        content,
        stop_reason: stopReason,
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }),
    chatStream: notExercised as unknown as ModelProvider['chatStream'],
    healthCheck: notExercised as unknown as ModelProvider['healthCheck'],
    countTokens: notExercised as unknown as ModelProvider['countTokens'],
    listModels: async () => [],
    transcribeAudio: notExercised as unknown as ModelProvider['transcribeAudio'],
    synthesizeSpeech: notExercised as unknown as ModelProvider['synthesizeSpeech'],
    verifyKey: async () => true,
  }
}

function userMsg(uuid: string, content: unknown): Message {
  return {
    uuid,
    type: 'user',
    role: 'user',
    timestamp: '2026-01-01T00:00:00Z',
    message: { content },
  }
}

/** 脚本化 LLM（按轮次 uuid 递增，口径同 engine-multi-round scriptedProvider）。 */
function scriptedProvider(steps: Array<{ content: unknown[]; uuid: string }>) {
  let call = 0
  return {
    chat: async () => {
      const step = steps[call++]
      return {
        type: 'assistant' as const,
        uuid: step.uuid,
        timestamp: '2026-09-23T00:00:00Z',
        message: {
          id: `m-${step.uuid}`,
          model: 'fake-model',
          role: 'assistant' as const,
          content: step.content,
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      }
    },
  } as unknown as ModelProvider
}

function makeEchoTool(): Tool {
  return {
    name: 'echo',
    call: async (args: unknown) => ({ data: `echo:${(args as { msg?: string })?.msg}` }),
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
  } as unknown as Tool
}

/** 必触发的 autoCompact（口径同 engine-multi-round：阈值 167_000，摘要含 F-1 断言标记）。 */
function firingAutoCompact(): AutoCompactDeps {
  return {
    contextWindow: 200_000,
    countTokens: () => 170_000,
    compact: (msgs) =>
      compactConversation(msgs, {
        summarize: async () => '<analysis>x</analysis><summary>FS-SUMMARY</summary>',
        countTokens: () => 100,
      }),
  }
}

function switchTo(tag: string): string {
  const sid = `s3-session-${tag}`
  getSessionEnv().switchSession(sid)
  return sid
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'atlas-s3-func-'))
  liveCwd = process.cwd()
  // 必须先于首次 getProjectDir 调用注 env（cwd→projectDir memoize 面）；
  // getCwd 活源 = 可改局部量（F-2 活态戳消费面）。
  setSessionEnv({
    getProjectsDir: () => tmp,
    getCwd: () => liveCwd,
  })
  process.env.TEST_ENABLE_SESSION_PERSISTENCE = '1'
})
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
  delete process.env.TEST_ENABLE_SESSION_PERSISTENCE
})
beforeEach(() => {
  resetProjectForTesting()
  clearSessionMessagesCache()
})
afterEach(() => {
  resetProjectForTesting()
  clearSessionMessagesCache()
})

// ── F-1 loop + autoCompact 全链真盘 ─────────────────────────────────────────

describe('S-E3 A11 loop transcript 写面（func 真盘）', () => {
  test('F-1 queryAgentLoop + autoCompact：JSONL 消息行 + compact boundary 标记字节（#15 同点，A11-Δ1 效果面）', async () => {
    switchTo('loop-compact')
    let recCount = 0
    const deps: AgentLoopDeps = {
      modelProvider: fakeProvider([{ type: 'text', text: 'FS-DONE' }]),
      role: 'small',
      transcript: {
        record: async msgs => {
          recCount++
          return recordTranscript(msgs as Message[])
        },
        recordContentReplacement: recs => recordContentReplacement(recs),
      },
    }
    const r = await queryAgentLoop(deps, {
      messages: [userMsg('u1', 'hello-fs')],
      context: { autoCompact: firingAutoCompact() },
    })
    expect(r.tracking.compacted).toBe(true)
    // entry（旧 L450）+ compact 支（旧 L607）+ 轮末追加面（旧 L722/724，
    // fire-and-forget 亦经真 recordTranscript 落盘）
    expect(recCount).toBe(3)
    await flushSessionStorage()

    const raw = readFileSync(getTranscriptPath(), 'utf-8')
    // #15 scanner 标记字节面（读面读的就是本写面产出的字节串）
    expect(raw).toContain('"compact_boundary"')
    const lines = raw.trim().split('\n').map(l => JSON.parse(l) as Record<string, unknown>)
    const boundaries = lines.filter(l => l.subtype === 'compact_boundary')
    expect(boundaries).toHaveLength(1)
    expect(boundaries[0].type).toBe('system')
    expect(boundaries[0].compactMetadata).toBeDefined()
    // 摘要消息落盘（post-compact 序列第二段；正文在 message.content 嵌套面）
    expect(raw).toContain('FS-SUMMARY')
    // 入参 user 消息落盘（entry record）
    expect(raw).toContain('hello-fs')
  })
})

// ── F-3 审视 M-1/M-2 链戳探针（双只读 A 路修复回归）───────────────────────

describe('S-E3 审视修复 链戳面（M-1 uuid 戳 + M-2 全量序列接链）', () => {
  test('F-3 双轮工具会话：tool_result 行恒带 uuid（M-1）+ 跨轮 parentUuid 接链（M-2，切片形态下 as2 根断此测红）', async () => {
    switchTo('chain-stamp')
    // 轮末 record = fire-and-forget（旧 L722 void 语义）：flush 前须待所有
    // sink 调用完成入写队列（n-5 登记 drain 风险面——测试面以 promise 跟踪
    // 消竞，非产品面改 await）。
    const recPromises: Array<Promise<unknown>> = []
    const deps: AgentLoopDeps = {
      modelProvider: scriptedProvider([
        { content: [{ type: 'tool_use', id: 'tu-1', name: 'echo', input: { msg: 'x' } }], uuid: 'as1' },
        { content: [{ type: 'text', text: 'done' }], uuid: 'as2' },
      ]),
      role: 'small',
      transcript: {
        record: msgs => {
          const p = Promise.resolve(recordTranscript(msgs as Message[]))
          recPromises.push(p)
          return p
        },
        recordContentReplacement: recs => recordContentReplacement(recs),
      },
    }
    const r = await queryAgentLoop(deps, {
      messages: [userMsg('u1', 'go')],
      tools: [makeEchoTool()],
    })
    expect(r.terminated).toBe(true)
    expect(r.turns).toBe(2)
    await Promise.all(recPromises)
    await flushSessionStorage()

    const loaded = await loadTranscriptFile(getTranscriptPath())
    // M-1：tool_result 行入盘且恒带 uuid（旧仓 record 面消息恒 uuid 不变量）
    const trEntry = [...loaded.messages.values()].find(
      m => Array.isArray(m.message.content) && (m.message.content as Array<{ type?: string }>)[0]?.type === 'tool_result',
    )
    expect(trEntry).toBeDefined()
    expect(loaded.messages.get('as1')!.parentUuid).toBe('u1')
    // M-2：跨轮接链——as2 的父 = tool_result（全量序列 record 前缀追踪恢复
    // startingParentUuid；切片形态下 as2.parentUuid = null 此测红）
    expect(loaded.messages.get('as2')!.parentUuid).toBe(trEntry!.uuid)
  })
})

// ── F-2 A12 活态 cwd 戳 ─────────────────────────────────────────────────────

describe('S-E3 A12 活态 cwd 戳（func 真盘）', () => {
  test('F-2 JSONL cwd 字段 = 活源逐调用值；project dir 键控不漂移', async () => {
    switchTo('live-cwd')
    liveCwd = '/work/proj-alpha'
    const p1 = getTranscriptPath()
    await recordTranscript([userMsg('u1', 'a')])
    liveCwd = '/work/proj-beta'
    const p2 = getTranscriptPath()
    await recordTranscript([userMsg('u2', 'b')])
    await flushSessionStorage()

    // 键控点 = getOriginalCwd（模块加载冻结）：活态 cwd 变 → 会话文件路径不变
    expect(p2).toBe(p1)
    const lines = readFileSync(p1, 'utf-8')
      .trim()
      .split('\n')
      .map(l => JSON.parse(l) as Record<string, unknown>)
    expect(lines.find(l => l.uuid === 'u1')?.cwd).toBe('/work/proj-alpha')
    expect(lines.find(l => l.uuid === 'u2')?.cwd).toBe('/work/proj-beta')
  })
})
