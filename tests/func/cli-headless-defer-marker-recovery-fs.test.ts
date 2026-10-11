/**
 * AD-45 缺口#2（0.1.54，prod lane r3 GATE-OPEN 打回）— deferred_tool_use 挂起 marker
 * 装载面回捞 端到端 func 真盘测试（真实写 session 文件 → load 路径 → 回捞 → 挂起面复原）。
 *
 * gate 判据对齐 e2e r3 红面（定因三角·活装载面）：真实 session 文件经产品真实 loader
 * （loadTranscriptFile → buildConversationChain）回放后，挂起 marker 因「叶计算排除
 * system 叶 + 单向 parent 走链」结构性排除出链 → findDeferredToolUseState（仅扫链）恒
 * undefined → --resume 重评支生产不可达。修 = print.ts recoverDeferredToolUseMarkers
 * 装载面回捞（未解决 marker 插回 parent 之后）。本测 = 真实写盘 + 真实 loader 回放
 * （非人工构造会话直调，gate 漏因核销）。
 *
 * 分层纪律：func 层真 fs（mkdtemp + setSessionEnv getProjectsDir→tmpdir 注入 +
 * TEST_ENABLE_SESSION_PERSISTENCE=1 破 unit 层 shouldSkipPersistence 守卫），同
 * engine-session-restore-fs.test.ts 口径；每测试独立 sessionId + resetProjectForTesting
 * 模拟新进程（项目单例归零，忠实 fresh-startup 语义）。
 *
 * 探针锚点（突变须恰好 1 red）：loadResumedMessages 删 recoverDeferredToolUseMarkers
 * 调用（回捞面裁）→ '真盘挂起会话回放：marker 回捞后在场 + findDeferredToolUseState 复原'
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
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  recordTranscript,
  flushSessionStorage,
  loadTranscriptFile,
  buildConversationChain,
  getTranscriptPath,
  setSessionEnv,
  getSessionEnv,
  resetProjectForTesting,
  clearSessionMessagesCache,
  makeDeferredToolUseMarker,
  type Message,
} from '../../src/engine'
import {
  recoverDeferredToolUseMarkers,
  findDeferredToolUseState,
} from '../../src/cli/print'

let tmp: string

// 契约（与 engine-session-restore-fs 同源）：Message 对象不携带 parentUuid（父链由
// insertMessageChain 链推进统一计算；调用方传 parentUuid 会被 `...message` spread 覆写）。
function userMsg(uuid: string, content: unknown): Message {
  return {
    uuid,
    type: 'user',
    timestamp: '2026-01-01T00:00:00Z',
    message: { content },
  }
}
function asstTuMsg(uuid: string, toolUseId: string, toolName: string): Message {
  return {
    uuid,
    type: 'assistant',
    timestamp: '2026-01-01T00:00:01Z',
    message: {
      content: [{ type: 'tool_use', id: toolUseId, name: toolName, input: {} }],
    },
  }
}

function switchTo(tag: string): string {
  const sid = `func-defer-mrk-${tag}`
  getSessionEnv().switchSession(sid)
  return sid
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'atlas-defer-mrk-func-'))
  // 必须先于首次 getProjectDir 调用注 env（cwd→projectDir memoize 面）
  setSessionEnv({ getProjectsDir: () => tmp })
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

describe('AD-45 缺口#2 真盘挂起会话回放（load 路径 → marker 回捞）', () => {
  test('真盘挂起会话回放：marker 回捞后在场 + findDeferredToolUseState 复原（gate 判据对齐 e2e r3）', async () => {
    // 阶段 1：写挂起会话（u1 → a1(tool_use toolu_1) → deferred_tool_use marker 链）
    switchTo('suspend')
    const marker = makeDeferredToolUseMarker({
      toolUseId: 'toolu_1',
      toolName: 'Bash',
      deferReason: 'later',
    })
    await recordTranscript([
      userMsg('u1', 'start task'),
      asstTuMsg('a1', 'toolu_1', 'Bash'),
      marker,
    ])
    await flushSessionStorage()
    const file = getTranscriptPath()
    expect(existsSync(file)).toBe(true)

    // 阶段 2：模拟新进程 fresh startup（项目单例归零 + 新会话 ID）
    resetProjectForTesting()
    clearSessionMessagesCache()
    switchTo('resume')

    // 读回 + 链重建（load 面，与 loadResumedMessages 同形：leaf 取自 leafUuids）
    const loaded = await loadTranscriptFile(file)
    // 定因证据（e2e loadprobe 同形）：marker 在 map（持久化）但排除出链（结构性排除）
    expect(loaded.messages.has(marker.uuid)).toBe(true)
    const leafUuid = [...loaded.leafUuids].pop()
    expect(leafUuid).toBe('a1') // 叶计算排除 system 叶（marker）→ 叶 = 叶 assistant a1
    const chain = buildConversationChain(loaded.messages, loaded.messages.get(leafUuid)!)
    // 修前红（结构性排除的直接后果）：marker 不在 raw 链 → findDeferredToolUseState 恒 undefined
    expect(chain.some((m) => m.uuid === marker.uuid)).toBe(false)
    expect(findDeferredToolUseState(chain as unknown as Message[])).toBeUndefined()

    // 修：装载面回捞 → marker 插回 parent(a1) 之后 + 挂起面复原
    const recovered = recoverDeferredToolUseMarkers(loaded.messages, chain)
    expect(recovered.map((m) => m.uuid)).toEqual(['u1', 'a1', marker.uuid])
    const s = findDeferredToolUseState(recovered as unknown as Message[])
    expect(s?.toolUseId).toBe('toolu_1')
    expect(s?.toolName).toBe('Bash')
    expect(s?.deferReason).toBe('later')
  })

  test('真盘正常会话回放（无 marker）→ 回捞零追加 + findDeferredToolUseState undefined（零回归约束 3）', async () => {
    switchTo('plain')
    await recordTranscript([
      userMsg('u1', 'hello'),
      asstTuMsg('a1', 'toolu_x', 'Read'),
    ])
    await flushSessionStorage()
    const file = getTranscriptPath()
    resetProjectForTesting()
    clearSessionMessagesCache()
    switchTo('plain-resume')

    const loaded = await loadTranscriptFile(file)
    const leafUuid = [...loaded.leafUuids].pop()
    expect(leafUuid).toBe('a1')
    const chain = buildConversationChain(loaded.messages, loaded.messages.get(leafUuid)!)
    const recovered = recoverDeferredToolUseMarkers(loaded.messages, chain)
    // 无 marker = 原数组引用零追加
    expect(recovered).toBe(chain)
    expect(findDeferredToolUseState(recovered as unknown as Message[])).toBeUndefined()
  })
})
