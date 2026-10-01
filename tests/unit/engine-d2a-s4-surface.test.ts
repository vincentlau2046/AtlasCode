/**
 * D-2a S4（M5 切端）判别单测：microcompactMessages 富重载（context/querySource
 * 形，旧仓 orchestrator 507L 面）+ resetMicrocompactState 富重置 +
 * cached-MC env kill-switch + time-based 触发内容清空 + 主线程 source 门。
 *
 * 富路径 LLM-bound/宿主模块态叶（cached-MC module 簇）走 CachedMCModulePort
 * DI 缝（缺省 stub = 旧仓全 any-stub + feature OFF 死路径的等价语义）；
 * time-based config 源走 setTimeBasedMCConfigSource 注入（旧 GB 读面宿主化）。
 */
import {
  isCachedMicrocompactEnabled,
  isMainThreadSource,
  microcompactMessages,
  resetMicrocompactState,
  setCachedMCModulePort,
  setTimeBasedMCConfigSource,
  type MicrocompactResult,
} from '../../src/engine'
import type { Message } from '../../src/shared'

const userMsg = (uuid: string, content: unknown): Message => ({
  uuid,
  type: 'user',
  role: 'user',
  timestamp: '2026-10-01T00:00:00.000Z',
  message: { role: 'user', content },
})

const asstMsg = (uuid: string, blocks: unknown[], ts: string): Message => ({
  uuid,
  type: 'assistant',
  role: 'assistant',
  timestamp: ts,
  message: { id: uuid, content: blocks },
})

const blockContent = (m: Message): Array<{ content?: unknown }> =>
  (m.message as { content?: unknown }).content as Array<{ content?: unknown }>

describe('D-2a S4 isMainThreadSource（startsWith 前缀匹配，旧仓逐字）', () => {
  test('repl_main_thread + outputStyle 变体过 / 非主线程拒 / undefined 过（cached-MC 向后兼容）', () => {
    expect(isMainThreadSource('repl_main_thread')).toBe(true)
    expect(isMainThreadSource('repl_main_thread:outputStyle:custom')).toBe(true)
    expect(isMainThreadSource('session_memory')).toBe(false)
    expect(isMainThreadSource(undefined)).toBe(true)
  })
})

describe('D-2a S4 isCachedMicrocompactEnabled（env kill-switch，缺省 OFF）', () => {
  test('缺省 OFF / ATLAS_ENABLE_CACHED_MICROCOMPACT=true ON / 其他值 OFF', () => {
    expect(isCachedMicrocompactEnabled({} as NodeJS.ProcessEnv)).toBe(false)
    expect(
      isCachedMicrocompactEnabled({
        ATLAS_ENABLE_CACHED_MICROCOMPACT: 'true',
      } as NodeJS.ProcessEnv),
    ).toBe(true)
    expect(
      isCachedMicrocompactEnabled({
        ATLAS_ENABLE_CACHED_MICROCOMPACT: '1',
      } as NodeJS.ProcessEnv),
    ).toBe(false)
  })
})

describe('D-2a S4 富 microcompactMessages（重载：context/querySource 形）', () => {
  afterEach(() => {
    setCachedMCModulePort(null)
    setTimeBasedMCConfigSource(null)
  })

  test('单参形 = 富：未触发时原 messages 原样返回（引用不变）', async () => {
    const msgs = [userMsg('u1', 'hi')]
    const out = await microcompactMessages(msgs)
    expect(out.messages).toBe(msgs)
  })

  test('time-based 触发（config 启用 + 主线程 + gap 超阈）→ 清旧 tool_result 保最近', async () => {
    setTimeBasedMCConfigSource(() => ({
      enabled: true,
      gapThresholdMinutes: 60,
      keepRecent: 1,
    }))
    const oldTs = new Date(Date.now() - 120 * 60_000).toISOString()
    const newTs = new Date(Date.now() - 61 * 60_000).toISOString()
    const msgs = [
      asstMsg('a1', [{ type: 'tool_use', id: 'tu-old', name: 'Read', input: {} }], oldTs),
      userMsg('u1', [
        { type: 'tool_result', tool_use_id: 'tu-old', content: 'BIG-OLD'.repeat(100) },
      ]),
      asstMsg('a2', [{ type: 'tool_use', id: 'tu-new', name: 'Read', input: {} }], newTs),
      userMsg('u2', [{ type: 'tool_result', tool_use_id: 'tu-new', content: 'new-result' }]),
    ]
    const out: MicrocompactResult = await microcompactMessages(
      msgs,
      undefined,
      'repl_main_thread',
    )
    const u1 = out.messages.find((m) => m.uuid === 'u1')
    const u2 = out.messages.find((m) => m.uuid === 'u2')
    expect(blockContent(u1!)[0].content).toBe('[Old tool result content cleared]')
    expect(blockContent(u2!)[0].content).toBe('new-result')
  })

  test('非主线程 source 不触发 time-based（analysis-only 调用方语义）', async () => {
    setTimeBasedMCConfigSource(() => ({
      enabled: true,
      gapThresholdMinutes: 1,
      keepRecent: 1,
    }))
    const oldTs = new Date(Date.now() - 120 * 60_000).toISOString()
    const msgs = [
      asstMsg('a1', [{ type: 'tool_use', id: 'tu-old', name: 'Read', input: {} }], oldTs),
      userMsg('u1', [
        { type: 'tool_result', tool_use_id: 'tu-old', content: 'BIG'.repeat(100) },
      ]),
    ]
    const out = await microcompactMessages(msgs, undefined, 'session_memory')
    expect(blockContent(out.messages.find((m) => m.uuid === 'u1')!)[0].content).toBe(
      'BIG'.repeat(100),
    )
  })

  test('cached-MC 路径：env ON + 主线程 + port 启用 → port 结果透传；非主线程不进 port', async () => {
    const portCalls: string[] = []
    setCachedMCModulePort({
      isCachedMicrocompactEnabled: () => true,
      isModelSupportedForCacheEditing: (m: string | undefined) => m === 'test-model',
      cachedMicrocompactPath: async (msgs: Message[]) => {
        portCalls.push('path')
        return {
          messages: msgs,
          compactionInfo: {
            pendingCacheEdits: {
              trigger: 'auto',
              deletedToolIds: ['x'],
              baselineCacheDeletedTokens: 0,
            },
          },
        }
      },
      resetCachedMCState: () => undefined,
    })
    const msgs = [userMsg('u1', 'hi')]
    const ctx = {
      abortController: new AbortController(),
      readFileState: { clear: () => undefined, entries: () => [] as IterableIterator<never> },
      getAppState: () => ({}),
      options: { mainLoopModel: 'test-model' },
    }
    process.env.ATLAS_ENABLE_CACHED_MICROCOMPACT = 'true'
    try {
      const out = await microcompactMessages(msgs, ctx, 'repl_main_thread')
      expect(out.compactionInfo?.pendingCacheEdits?.deletedToolIds).toEqual(['x'])
      expect(portCalls).toEqual(['path'])

      portCalls.length = 0
      const out2 = await microcompactMessages(msgs, ctx, 'session_memory')
      expect(portCalls).toEqual([])
      expect(out2.messages).toBe(msgs)
    } finally {
      delete process.env.ATLAS_ENABLE_CACHED_MICROCOMPACT
    }
  })

  test('cached-MC 缺省 stub port：env ON 也不进 cached 路径（旧仓 stub + feature OFF 等价）', async () => {
    const msgs = [userMsg('u1', 'hi')]
    process.env.ATLAS_ENABLE_CACHED_MICROCOMPACT = 'true'
    try {
      const out = await microcompactMessages(msgs, undefined, 'repl_main_thread')
      expect(out.messages).toBe(msgs)
      expect(out.compactionInfo).toBeUndefined()
    } finally {
      delete process.env.ATLAS_ENABLE_CACHED_MICROCOMPACT
    }
  })
})

describe('D-2a S4 resetMicrocompactState（富重置）', () => {
  test('注入 port 后 reset 被调；复位默认 port 后 no-op 不抛', () => {
    let resetCalls = 0
    setCachedMCModulePort({
      isCachedMicrocompactEnabled: () => false,
      isModelSupportedForCacheEditing: () => false,
      resetCachedMCState: () => {
        resetCalls++
      },
    })
    resetMicrocompactState()
    expect(resetCalls).toBe(1)
    setCachedMCModulePort(null)
    expect(() => resetMicrocompactState()).not.toThrow()
  })
})
