/**
 * 0.1.70 G-2 + G-3（composing token 回归波，工单 §0 G-2/G-3）：
 * queryOneRound onStreamDelta 透传 + AgentLoopEvent stream_delta 型 +
 * tui/loopEvents.ts stream_delta 转发判别单测。
 *
 * 被测能力：
 *  - G-2（src/engine/query/loop.ts）：queryOneRound chatArgs 增
 *    onStreamDelta = deps.emit 已注入面透传 emit（逐 token stream_delta
 *    事件）；emit 未注入面 = onStreamDelta undefined = chat 零回调零开销
 *    恒等锚。空内容重试（第 2 次 chat 同 chatArgs 对象）= 两调用均带槽。
 *  - G-3（src/tui/loopEvents.ts）：EngineLoopStreamEvent 扩 stream_delta
 *    型 + emit 回调 stream_delta 入 pending 队列（修前落 else 被丢弃 =
 *    TUI 永不收 per-token 根因面）；TUI for-await 消费序 =
 *    stream_request_start → N× stream_delta → round_end 消息族。
 *
 * 非 tautology：fake provider 按真实流式语义脚本化（onStreamDelta 在场时
 * 逐 delta 同步回调后返回完整 message，未在场 = 零回调），断言事件调度行为
 * （透传守卫 / 事件顺序 / 未注入零行为 / 适配层队列转发），非 fake 自证。
 * I/O-free → unit 层。
 */
import { describe, test, expect } from 'bun:test'
import {
  queryAgentLoop,
  queryOneRound,
  type AgentLoopDeps,
  type AgentLoopEvent,
} from '../../src/engine'
import { queryEngineLoopStream, type EngineLoopStreamEvent } from '../../src/tui/loopEvents.js'
import type { ModelProvider, ModelRole, StreamDelta } from '../../src/modelprovider'

// ── fake provider（真实流式语义脚本化：onStreamDelta 在场 = 逐 delta 同步回调）──
function makeAssistant(uuid: string, text: string) {
  return {
    type: 'assistant' as const,
    uuid,
    timestamp: '2026-10-14T00:00:00Z',
    message: {
      id: `m-${uuid}`,
      model: 'fake-model',
      role: 'assistant' as const,
      content: text ? [{ type: 'text', text }] : [],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
  }
}

function fakeStreamProvider(opts: {
  deltas?: StreamDelta[]
  /** 首返空内容（R1 空响应有界重试面）后第 2 次返实内容。 */
  emptyFirst?: boolean
}) {
  const calls: Array<{ onStreamDelta?: (d: StreamDelta) => void }> = []
  let call = 0
  const provider: ModelProvider = {
    chat: async (args: any) => {
      calls.push({ onStreamDelta: args.onStreamDelta })
      call++
      const empty = opts.emptyFirst && call === 1
      // 真实流式语义：onStreamDelta 在场 = 逐 delta 同步回调（yield 点内），
      // 回调后返回完整 message（G-1 chatWithDelta 契约）。未在场 = 零回调。
      if (args.onStreamDelta && !empty) {
        for (const d of opts.deltas ?? []) args.onStreamDelta(d)
      }
      return makeAssistant(`u-${call}`, empty ? '' : 'done')
    },
    chatStream: (async function* () {}) as ModelProvider['chatStream'],
    healthCheck: (async () => ({ ok: true, model: '', latencyMs: 0 })) as ModelProvider['healthCheck'],
    countTokens: (async () => 0) as unknown as ModelProvider['countTokens'],
    listModels: async () => [],
    transcribeAudio: (async () => '') as unknown as ModelProvider['transcribeAudio'],
    synthesizeSpeech: (async () => new Uint8Array()) as unknown as ModelProvider['synthesizeSpeech'],
    verifyKey: async () => true,
    getTimeoutMs: () => 600_000,
  }
  return { provider, calls }
}

const textDeltas = (): StreamDelta[] => [
  { type: 'text_delta', text: 'a' },
  { type: 'text_delta', text: 'b' },
  { type: 'text_delta', text: 'c' },
]
const msgs = [{ role: 'user', content: 'hi' }] as any[]

describe('G-2 queryOneRound onStreamDelta 透传 + AgentLoopEvent stream_delta 型', () => {
  test('① emit 已注入 → stream_delta 事件逐 delta emit（顺序保真，载荷 = StreamDelta）', async () => {
    const { provider } = fakeStreamProvider({ deltas: textDeltas() })
    const events: AgentLoopEvent[] = []
    const deps: AgentLoopDeps = {
      modelProvider: provider,
      role: 'small' as ModelRole,
      emit: e => events.push(e),
    }
    const result = await queryOneRound(deps, [], msgs)
    const deltas = events.filter(
      (e): e is Extract<AgentLoopEvent, { type: 'stream_delta' }> => e.type === 'stream_delta',
    )
    expect(deltas.map(d => d.delta)).toEqual(textDeltas())
    // H6 登记（loop.ts 头注）：发射点 = queryAgentLoop 驱动层——单轮 API 不发射
    // 轮粒度事件（round_start/round_end 归驱动层，⑥ 覆盖）；单轮直调面 = 仅
    // stream_delta 瞬态进度面（不入 transcript，round_end assistantMessage 仍
    // 是驱动层唯一持久化面）。
    expect(events.length).toBe(3)
    // AgentRoundResult 面不变（assistantContent = assistant 原始 content）
    expect(result.assistantContent).toEqual([{ type: 'text', text: 'done' }])
    expect(result.stopReason).toBe('end_turn')
  })

  test('② emit 未注入面 = onStreamDelta 不传（chat 零回调恒等锚）', async () => {
    const { provider, calls } = fakeStreamProvider({ deltas: textDeltas() })
    const deps: AgentLoopDeps = { modelProvider: provider, role: 'small' as ModelRole }
    await queryOneRound(deps, [], msgs)
    expect(calls.length).toBe(1)
    expect(calls[0].onStreamDelta).toBeUndefined()
  })

  test('③ 空内容重试面 = 第 2 次 chat 同带槽（两调用均透传，第 2 次回调 deltas）', async () => {
    const { provider, calls } = fakeStreamProvider({ deltas: textDeltas(), emptyFirst: true })
    const events: AgentLoopEvent[] = []
    const deps: AgentLoopDeps = {
      modelProvider: provider,
      role: 'small' as ModelRole,
      emit: e => events.push(e),
    }
    const result = await queryOneRound(deps, [], msgs)
    expect(calls.length).toBe(2)
    expect(calls[0].onStreamDelta).toBeDefined()
    expect(calls[1].onStreamDelta).toBeDefined()
    // 空首返 = 无 delta 回调；重发 = 3 delta
    const deltaCount = events.filter(e => e.type === 'stream_delta').length
    expect(deltaCount).toBe(3)
    expect(result.assistantContent).toEqual([{ type: 'text', text: 'done' }])
    expect(result.stopReason).toBe('end_turn')
  })
})

describe('G-3 loopEvents.ts stream_delta 转发（修前落 else 丢弃 = TUI 永不收 per-token 根因面）', () => {
  test('④ TUI for-await 消费序 = stream_request_start → N× stream_delta → round_end 消息族', async () => {
    const { provider } = fakeStreamProvider({ deltas: textDeltas() })
    const deps: AgentLoopDeps = { modelProvider: provider, role: 'small' as ModelRole }
    const gen = queryEngineLoopStream({ deps, args: { messages: msgs, tools: [] } })
    const stream: EngineLoopStreamEvent[] = []
    for await (const ev of gen) {
      stream.push(ev)
    }
    // 顺序面：首 = request 启动；其后 = 3 stream_delta（顺序保真）；尾 = assistant 消息
    expect(stream[0]).toEqual({ type: 'stream_request_start' })
    const deltas = stream.filter(
      (e): e is { type: 'stream_delta'; delta: StreamDelta } =>
        (e as { type?: string }).type === 'stream_delta',
    )
    expect(deltas.map(d => d.delta.text)).toEqual(['a', 'b', 'c'])
    // delta 全部先于 round_end assistant 消息（流式进度面先于完成消息）
    const firstAssistantIdx = stream.findIndex(
      (e) => (e as { type?: string }).type === 'assistant',
    )
    const lastDeltaIdx = stream.length - 1 - [...stream].reverse().findIndex(
      (e) => (e as { type?: string }).type === 'stream_delta',
    )
    expect(lastDeltaIdx).toBeLessThan(firstAssistantIdx)
  })

  test('⑤ provider 未回调面（onStreamDelta 无 delta 产出）= 流族无 stream_delta（零注入恒等锚）', async () => {
    const { provider } = fakeStreamProvider({ deltas: [] })
    const deps: AgentLoopDeps = { modelProvider: provider, role: 'small' as ModelRole }
    const gen = queryEngineLoopStream({ deps, args: { messages: msgs, tools: [] } })
    const stream: EngineLoopStreamEvent[] = []
    for await (const ev of gen) {
      stream.push(ev)
    }
    expect(stream[0]).toEqual({ type: 'stream_request_start' })
    expect(
      stream.some((e) => (e as { type?: string }).type === 'stream_delta'),
    ).toBe(false)
    expect(stream.some((e) => (e as { type?: string }).type === 'assistant')).toBe(true)
  })

  test('⑥ queryAgentLoop 直驱 emit 面 stream_delta 在场（G-2/G-3 接缝：emit 槽 → 队列单路）', async () => {
    const { provider } = fakeStreamProvider({ deltas: textDeltas() })
    const events: AgentLoopEvent[] = []
    await queryAgentLoop(
      {
        modelProvider: provider,
        role: 'small' as ModelRole,
        emit: e => events.push(e),
      },
      { messages: msgs, tools: [] },
    )
    expect(events.filter(e => e.type === 'stream_delta').length).toBe(3)
    // 既有事件族零回归锚（stream_delta = 加性新成员，既有成员序不变）
    const types = events.map(e => e.type)
    expect(types[0]).toBe('loop_start')
    expect(types).toContain('round_start')
    expect(types).toContain('round_end')
    expect(types[types.length - 1]).toBe('loop_end')
  })
})
