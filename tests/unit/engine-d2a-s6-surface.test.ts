/**
 * D-2a S6（M5 切端）判别单测：post-compact 清理注册表（主线程门控 + 注册序）
 * + HIGH GAP 4 名端口缝（未注册 THROW / 注端口透传 = 契约面，本体归宿主）。
 */
import {
  clearPostCompactResetsForTesting,
  partialCompactConversation,
  reactiveCompactOnPromptTooLong,
  registerPostCompactReset,
  runPostCompactCleanup,
  setPartialCompactPort,
  setReactiveCompactPort,
  setSessionMemoryCompactPort,
  tryReactiveCompact,
  trySessionMemoryCompaction,
  type CompactionResult,
  type TryReactiveCompactParams,
} from '../../src/engine'
import type { Message } from '../../src/shared'

const msg = (uuid: string): Message => ({
  uuid,
  type: 'user',
  role: 'user',
  timestamp: '2026-10-01T00:00:00.000Z',
  message: { role: 'user', content: 'x' },
})

const fakeCompactionResult = (): CompactionResult =>
  ({
    boundaryMarker: msg('b'),
    summaryMessages: [msg('s')],
    attachments: [],
    hookResults: [],
  }) as CompactionResult

describe('D-2a S6 postCompactCleanup 注册表', () => {
  afterEach(() => {
    clearPostCompactResetsForTesting()
  })

  test('reset 按注册序执行，querySource 透传', () => {
    const calls: Array<string | undefined> = []
    registerPostCompactReset((qs) => calls.push(qs))
    registerPostCompactReset((qs) => calls.push(qs))
    runPostCompactCleanup('repl_main_thread')
    expect(calls).toEqual(['repl_main_thread', 'repl_main_thread'])
  })

  test('mainThreadOnly：subagent source 跳过 / 主线程 source（undefined/sdk/repl 前缀）执行', () => {
    let mt = 0
    let all = 0
    registerPostCompactReset(() => {
      mt++
    }, { mainThreadOnly: true })
    registerPostCompactReset(() => {
      all++
    })

    runPostCompactCleanup('agent:worker-1')
    expect(mt).toBe(0)
    expect(all).toBe(1)

    runPostCompactCleanup(undefined)
    expect(mt).toBe(1)
    expect(all).toBe(2)

    runPostCompactCleanup('sdk')
    expect(mt).toBe(2)
    expect(all).toBe(3)

    runPostCompactCleanup('repl_main_thread:outputStyle:custom')
    expect(mt).toBe(3)
    expect(all).toBe(4)
  })
})

describe('D-2a S6 HIGH GAP 端口缝', () => {
  afterEach(() => {
    setSessionMemoryCompactPort(null)
    setReactiveCompactPort(null)
    setPartialCompactPort(null)
  })

  test('端口未注册：门面全 THROW（fail-fast 不静默退化，同步 throw）', () => {
    expect(() => trySessionMemoryCompaction([msg('u1')])).toThrow(
      '未注册',
    )
    expect(
      () => tryReactiveCompact({} as unknown as TryReactiveCompactParams),
    ).toThrow('未注册')
    expect(() =>
      reactiveCompactOnPromptTooLong([msg('u1')], {} as never, {
        trigger: 'manual',
      }),
    ).toThrow('未注册')
    expect(() =>
      partialCompactConversation([msg('u1')], 0, {} as never, {} as never),
    ).toThrow('未注册')
  })

  test('注端口后透传（门面 = 契约面，本体 = 宿主侧）', async () => {
    const sm = fakeCompactionResult()
    setSessionMemoryCompactPort({
      trySessionMemoryCompaction: async (messages, agentId, threshold) => {
        expect(messages).toHaveLength(1)
        expect(agentId).toBe('agent-1')
        expect(threshold).toBe(1000)
        return sm
      },
    })
    expect(await trySessionMemoryCompaction([msg('u1')], 'agent-1', 1000)).toBe(sm)

    const full = fakeCompactionResult()
    setReactiveCompactPort({
      tryReactiveCompact: async () => full,
      reactiveCompactOnPromptTooLong: async (messages) => ({
        ok: true,
        messages,
        postCompactMessages: [],
        compactionResult: full,
      }),
    })
    expect(
      await tryReactiveCompact({
        hasAttempted: false,
        querySource: 'repl_main_thread',
        aborted: false,
        messages: [msg('u1')],
        cacheSafeParams: {} as never,
      }),
    ).toBe(full)
    const outcome = await reactiveCompactOnPromptTooLong(
      [msg('u1')],
      {} as never,
      { trigger: 'manual', customInstructions: 'focus on X' },
    )
    expect(outcome.ok).toBe(true)

    const partial = fakeCompactionResult()
    setPartialCompactPort({
      partialCompactConversation: async (allMessages, pivotIndex, _c, _p, feedback, direction) => {
        expect(allMessages).toHaveLength(2)
        expect(pivotIndex).toBe(1)
        expect(feedback).toBe('fb')
        expect(direction).toBe('up_to')
        return partial
      },
    })
    expect(
      await partialCompactConversation(
        [msg('u1'), msg('u2')],
        1,
        {} as never,
        {} as never,
        'fb',
        'up_to',
      ),
    ).toBe(partial)
  })
})
