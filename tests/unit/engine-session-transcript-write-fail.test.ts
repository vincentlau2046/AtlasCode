/**
 * FX-31（0.1.50，CC 2.1.101）transcript 写失败记日志判别单测：
 * recordTranscript 写链（insertMessageChain → appendEntry → 写队列 drain →
 * appendToFile）二次写失败（ENOSPC/EIO，磁盘满主诉）不得静默吞没——记
 * error 日志（路径 + 原因）；写语义不变（失败不阻断主流程，drain 吸收，
 * entry resolver 照常触发）。零回归 = 写成功路径零变更（重试支恰一次）。
 *
 * 分层纪律：unit 层——fs/promises mock.module（repo 惯例：先真实 import 全
 * 导出面再 spread 覆写 appendFile/mkdir，内存 sink 替代真盘）+ shared 门面
 * mock.module（全面 + logForDebugging spy = 日志通道观测缝：C-4 logging
 * port 未落定前 shared 面为 no-op 占位，缝上调用即「已记录」可观测面）。
 * 零真盘 / 零网络。
 *
 * 判别口径（修前红 → 修后绿）：
 *   修前：appendToFile catch 重试后二次失败被静默吞没（零日志 + drain
 *    rejection 未观测，flush reject）→「log 有记录」断言红
 *   修后：catch 记 logForDebugging(error + 路径 + 原因)，drain 吸收
 *    （flush resolve）→ 绿
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
// type-only 静态 import（编译期擦除，不触运行时模块加载 → 不破坏 mock 序）
import type { Entry, Message } from '../../src/engine'

// ── mock.module（repo 惯例：先真实 import 全导出面，再 spread 覆写；
// 消费方模块须在 mock 注册后首 import，静态 import 会绕过 mock）───────
// 键隔离：真面经 node: 键取（独立 registry 键），bare 'fs/promises' 键保持
// 未加载 → mock.module 注册后消费方（project.ts import 'fs/promises'）首
// 加载命中 mock（probe 实证：node: 键预载不污染 bare 键 mock）。
const realFsPromises = await import('node:fs/promises')
const realShared = await import('../../src/shared')

/** fs 写面可控态：failWith 置码 = appendFile 抛该 errno（模拟磁盘满/IO 错）。 */
const fsMode: { failWith?: string } = {}
const appendFileCalls: string[] = []
const mkdirCalls: string[] = []
/** 内存 transcript sink（path → 累计字节；替代真盘）。 */
const sink = new Map<string, string>()
/** logForDebugging spy（shared 门面 mock；=「log 有记录」观测缝）。 */
const debugLogCalls: Array<{ message: string; level?: string }> = []

mock.module('fs/promises', () => ({
  ...realFsPromises,
  appendFile: async (path: string, data: unknown, _opts?: unknown) => {
    const text = String(data)
    appendFileCalls.push(String(path))
    if (fsMode.failWith) {
      const err = new Error(
        `${fsMode.failWith}: no space left on device, append '${path}'`,
      )
      ;(err as { code?: string }).code = fsMode.failWith
      throw err
    }
    sink.set(String(path), (sink.get(String(path)) ?? '') + text)
  },
  mkdir: async (path: string, _opts?: unknown) => {
    mkdirCalls.push(String(path))
  },
}))

mock.module('../../src/shared', () => ({
  ...realShared,
  logForDebugging: (message: string, options?: { level?: string }) => {
    debugLogCalls.push({ message, level: options?.level })
  },
}))

// 消费方（project.ts 等）须在 mock 注册后首 import
const {
  recordTranscript,
  resetProjectForTesting,
  clearSessionMessagesCache,
  flushSessionStorage,
  setSessionEnv,
  getSessionEnv,
  getTranscriptPath,
} = await import('../../src/engine')

// session env 窗口（func 层同口径）：假 projects dir（mock 面永不真触盘）+
// TEST_ENABLE_SESSION_PERSISTENCE 破 unit 层 shouldSkipPersistence 测试守卫。
setSessionEnv({
  getProjectsDir: () => '/fx31-fake-projects',
  getCwd: () => '/fx31-cwd',
})
process.env.TEST_ENABLE_SESSION_PERSISTENCE = '1'

// ── 基建自检（行为探针；mock 未生效 = 本文件断言全失判别力 → fail-fast，防假红）
// fs mock 生效性：bare 键 mock 注册后首 import 的 appendFile 须按 fail 态抛码
// （真面下该路径实写，不抛码）；shared 门面 mock 生效性：mock 注册后首
// import 的 project.ts 其 logForDebugging 绑定须命中 spy（经 appendEntry
// 他 session 缺文件支——L736 error 日志，与 FX-31 修面正交）。
{
  fsMode.failWith = 'ENOSPC'
  let fsMockLive = false
  try {
    const fsNow = await import('fs/promises')
    await fsNow.appendFile('/fx31-selfcheck', 'x')
  } catch (e) {
    fsMockLive = (e as { code?: string }).code === 'ENOSPC'
  }
  fsMode.failWith = undefined
  if (!fsMockLive) {
    throw new Error('FX-31 infra: fs/promises mock not applied (bare-key consumer still real)')
  }

  const { projectInstance: probeProject } = await import(
    '../../src/engine/session/project'
  )
  const probeEntry: Entry = {
    type: 'custom-title',
    customTitle: 'fx31-selfcheck',
    sessionId: 'fx31-selfcheck',
  }
  await probeProject().appendEntry(probeEntry, 'fx31-selfcheck')
  if (!debugLogCalls.some(c => c.message.startsWith('appendEntry: session file not found'))) {
    throw new Error(
      'FX-31 infra: shared facade mock not applied (project.ts logForDebugging still real)',
    )
  }
  debugLogCalls.length = 0
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

function assistantMsg(uuid: string, text: string): Message {
  return {
    uuid,
    type: 'assistant',
    role: 'assistant',
    timestamp: '2026-01-01T00:00:01Z',
    message: {
      id: `m-${uuid}`,
      model: 'fx31-model',
      role: 'assistant',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
  } as unknown as Message
}

afterEach(() => {
  resetProjectForTesting()
  clearSessionMessagesCache()
})
beforeEach(() => {
  resetProjectForTesting()
  clearSessionMessagesCache()
  debugLogCalls.length = 0
  appendFileCalls.length = 0
  mkdirCalls.length = 0
  sink.clear()
  fsMode.failWith = undefined
})

describe('FX-31 transcript 写失败记日志（unit：fs mock + 日志缝观测）', () => {
  test('ENOSPC 写失败：log 有记录（error + 路径 + 原因，非静默）且主流程不阻断', async () => {
    getSessionEnv().switchSession('fx31-enospc')
    fsMode.failWith = 'ENOSPC'

    // 主流程：recordTranscript 入队即返（void 写队列），不抛
    await recordTranscript([userMsg('u1', 'fx31-disk-full')])
    const transcriptPath = getTranscriptPath()

    // 修前：drain rejection 传导（flush reject）；修后：失败在日志缝吸收，
    // flush resolve（写失败不阻断）
    const flushOutcome = await flushSessionStorage().then(
      () => 'resolved' as const,
      (err: unknown) =>
        `rejected:${err instanceof Error ? err.message : String(err)}` as const,
    )
    expect(flushOutcome).toBe('resolved')

    // 非静默断言：error 日志已记录（路径 + ENOSPC 原因）
    const failureLogs = debugLogCalls.filter(c =>
      c.message.startsWith('transcript write failed:'),
    )
    expect(failureLogs.length).toBeGreaterThanOrEqual(1)
    expect(failureLogs[0].message).toContain(transcriptPath)
    expect(failureLogs[0].message).toContain('ENOSPC')
    expect(failureLogs[0].level).toBe('error')

    // 写语义不变：写未落盘（sink 无字节；丢失本身不变，只是「被记录」）
    expect(sink.get(transcriptPath)).toBeUndefined()
    // 重试支零变更：appendFile 恰 2 次（初写 + mkdir 后重试各 1）
    expect(
      appendFileCalls.filter(p => p === transcriptPath),
    ).toHaveLength(2)
  })

  test('零回归：写成功路径零变更（sink 落盘 + 无失败日志 + flush resolve）', async () => {
    getSessionEnv().switchSession('fx31-ok')

    await recordTranscript([
      userMsg('u1', 'fx31-ok-user'),
      assistantMsg('a1', 'fx31-ok-assistant'),
    ])
    const transcriptPath = getTranscriptPath()
    const flushOutcome = await flushSessionStorage().then(
      () => 'resolved' as const,
      (err: unknown) => `rejected:${String(err)}` as const,
    )
    expect(flushOutcome).toBe('resolved')

    // 写成功路径语义不变：两条消息行落 sink
    const raw = sink.get(transcriptPath)
    expect(raw).toBeDefined()
    expect(raw).toContain('fx31-ok-user')
    expect(raw).toContain('fx31-ok-assistant')
    // 无写失败日志（失败日志支仅在写失败时触发）
    expect(
      debugLogCalls.filter(c => c.message.startsWith('transcript write failed:')),
    ).toHaveLength(0)
  })
})
