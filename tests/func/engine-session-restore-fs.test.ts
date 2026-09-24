/**
 * session 域 restore func 真盘测试（E-7 S-7d d2，§8.49）：resume 链重建
 * 端到端（真 JSONL → loadTranscriptFile → buildConversationChain →
 * processResumedConversation 非 fork 路：env 翻转 + adopt 指针 +
 * onWorktreeRestore 值透传）+ fork seed 真盘断言（content-replacement
 * entry 落新会话文件 + fresh ID 戳）。
 *
 * 分层纪律：func 层真 fs（mkdtemp + setSessionEnv getProjectsDir→tmpdir
 * 注入 + TEST_ENABLE_SESSION_PERSISTENCE=1 破 unit 层 shouldSkipPersistence
 * 测试守卫），同 d1 func 口径；每测试独立 sessionId + resetProjectForTesting
 * 模拟新进程（项目单例归零，忠实 fresh-startup 语义）。
 *
 * 探针锚点（§8.49 d2，突变须恰好 1 red）：
 *   P-S5 restore fork 支 `await recordContentReplacement(...)` 调用删 →
 *    'P-S5 fork seed：content-replacement entry 落新会话文件'
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
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  recordTranscript,
  recordContentReplacement,
  flushSessionStorage,
  loadTranscriptFile,
  buildConversationChain,
  getTranscriptPath,
  setSessionEnv,
  getSessionEnv,
  resetProjectForTesting,
  clearSessionMessagesCache,
  processResumedConversation,
  type Message,
  type ContentReplacementRecord,
  type PersistedWorktreeSession,
} from '../../src/engine'

let tmp: string

// 契约（与 d1 func 同源）：Message 对象不携带 parentUuid（父链由
// insertMessageChain 链推进统一计算；调用方传 parentUuid 会被 `...message`
// spread 覆写——H6 登记，见 engine-session-fs.test.ts 头注）。
function userMsg(uuid: string, content: unknown): Message {
  return {
    uuid,
    type: 'user',
    timestamp: '2026-01-01T00:00:00Z',
    message: { content },
  }
}
function asstMsg(uuid: string, content: unknown, id?: string): Message {
  return {
    uuid,
    type: 'assistant',
    timestamp: '2026-01-01T00:00:01Z',
    message: { content, id },
  }
}

function switchTo(tag: string): string {
  const sid = `func-restore-${tag}`
  getSessionEnv().switchSession(sid)
  return sid
}

function worktreeSession(sid: string): PersistedWorktreeSession {
  return {
    originalCwd: '/tmp',
    worktreePath: join(tmp, 'wt'),
    worktreeName: 'wt',
    sessionId: sid,
  }
}

// onWorktreeRestore 接缝捕获（值透传断言用）
const seen: unknown[] = []

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'atlas-restore-func-'))
  // 必须先于首次 getProjectDir 调用注 env（cwd→projectDir memoize 面）
  setSessionEnv({ getProjectsDir: () => tmp })
  process.env.TEST_ENABLE_SESSION_PERSISTENCE = '1'
})
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
  delete process.env.TEST_ENABLE_SESSION_PERSISTENCE
})
beforeEach(() => {
  seen.length = 0
  resetProjectForTesting()
  clearSessionMessagesCache()
})
afterEach(() => {
  delete process.env.ATLAS_DISABLE_PRECOMPACT_SKIP
  seen.length = 0
  resetProjectForTesting()
  clearSessionMessagesCache()
})

// ── resume 链重建端到端（非 fork 路）────────────────────────────────────────

describe('resume 链重建端到端（非 fork）', () => {
  test('真 JSONL → load → buildConversationChain → processResumedConversation', async () => {
    // 阶段 1：原会话写盘（u1 → a1 → u2 链）
    switchTo('chain')
    await recordTranscript([
      userMsg('u1', 'hello'),
      asstMsg('a1', 'hi', 'm1'),
      userMsg('u2', 'again'),
    ])
    await flushSessionStorage()
    const origFile = getTranscriptPath()
    expect(existsSync(origFile)).toBe(true)

    // 阶段 2：模拟新进程 fresh startup（项目单例归零 + 新会话 ID）
    resetProjectForTesting()
    clearSessionMessagesCache()
    switchTo('fresh')

    // 读回 + 链重建（load 面；buildConversationChain 取 leaf 消息对象非 uuid）
    const loaded = await loadTranscriptFile(origFile)
    const leaf = loaded.messages.get('u2')!
    const chain = buildConversationChain(loaded.messages, leaf)
    expect(chain.map(m => m.uuid)).toEqual(['u1', 'a1', 'u2'])

    // 阶段 3：非 fork 恢复（env 翻转 + 指针 adopt + worktree 接缝透传）
    const wt = worktreeSession('func-restore-chain')
    const out = await processResumedConversation(
      {
        messages: [],
        sessionId: 'func-restore-chain',
        worktreeSession: wt,
      },
      {
        forkSession: false,
        onWorktreeRestore: w => {
          seen.push(w)
        },
      },
    )
    expect(getSessionEnv().getSessionId()).toBe('func-restore-chain')
    expect(out.messages).toEqual([])
    // adopt：sessionFile 指针 → 原会话文件（getTranscriptPath 随 env 翻转）
    expect(getTranscriptPath()).toBe(origFile)
    // onWorktreeRestore 接缝：非 fork 恰调一次，值 = result.worktreeSession
    expect(seen).toEqual([wt])
  })
})

// ── P-S5 fork seed（突变探针锚点）───────────────────────────────────────────

describe('P-S5 fork seed：content-replacement entry 落新会话文件', () => {
  const recs: ContentReplacementRecord[] = [
    { kind: 'tool-result', toolUseId: 't1', replacement: 'stub' },
  ]

  test('fork 支 seed 写入 fresh 会话文件（fresh ID 戳，FROZEN 防注释面）', async () => {
    // 阶段 1：源会话写消息 + content replacement（真实存在可 seed 的记录）
    switchTo('source')
    await recordTranscript([userMsg('u1', 'hello')])
    await recordContentReplacement(recs)
    await flushSessionStorage()

    // 阶段 2：模拟 fresh startup（新进程 + 新会话 ID，不翻转）
    resetProjectForTesting()
    clearSessionMessagesCache()
    switchTo('fork-target')
    // 生产序（FROZEN 注释面）：useLogMessages 先经 recordTranscript 落
    // 新文件（materialize），seed 后 flush 才可见
    await recordTranscript([userMsg('su1', 'seed')])

    const out = await processResumedConversation(
      {
        messages: [],
        contentReplacements: recs,
        sessionId: 'func-restore-source',
      },
      { forkSession: true },
    )
    await flushSessionStorage()

    // env 不翻转（fork 保留 fresh startup 会话 ID）
    expect(getSessionEnv().getSessionId()).toBe('func-restore-fork-target')
    expect(out.contentReplacements).toBe(recs)

    // P-S5：新会话文件含 content-replacement entry，戳 = fresh ID（非源 ID）
    const targetLines = readFileSync(getTranscriptPath(), 'utf-8')
      .trim()
      .split('\n')
    const crLine = targetLines.find(l => l.includes('"content-replacement"'))
    expect(crLine).toBeDefined()
    expect(JSON.parse(crLine!)).toMatchObject({
      type: 'content-replacement',
      sessionId: 'func-restore-fork-target',
    })
  })
})
