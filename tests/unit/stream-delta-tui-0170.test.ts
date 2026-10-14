/**
 * 0.1.70 G-4 + 端到端 composing 面（工单 §0 G-4 / §2① 末件）：
 * TUI handleMessageFromStream stream_delta 分支激活死代码 +
 * composing 面（token 计数器 / 流式文本渐进 / mode 转换）单测。
 *
 * 被测能力（src/tui/utils/messages.ts handleMessageFromStream）：
 *  - stream_delta(text_delta) 到达 = onSetStreamMode('responding')（mode ↑→↓）
 *    + onUpdateLength(delta.text)（responseLength 增长 → token 计数器激活）
 *    + onStreamingText 追加（流式文本渐进）；onMessage 不调（delta 非完整消息）。
 *  - stream_delta(tool_use 类 delta) = 零副作用（本波仅 text 面，Main 定项②；
 *    tool_use 经 round_end toolResultMessages 已可见，0.1.71 候选）。
 *  - stream_delta 未到达面恒等锚 = 既有各分支（assistant / stream_request_start /
 *    stream_event content_block_delta）逐字节同值（分支不落 = 既有行为不变）。
 *
 * 端到端 composing 面（G-1→G-4 全链单测镜像，REPL 接线面模拟）：
 *  stream_request_start + N stream_delta 序列 → mode=responding +
 *  totalTokens>0（SpinnerAnimationRow chars/4 估算法）+ showTokens 开
 *  （spinnerGates 5s 门 + totalTokens>0 值门）+ streamingText 渐进。
 *  修前红 = responseLength 恒 0 → totalTokens 恒 0 → showTokens 恒 false +
 *  mode 卡 requesting = 用户主诉「composing 只有箭头没有 token」。
 *
 * 分层纪律：unit 层——纯函数面（handleMessageFromStream 回调注入 +
 * spinnerGates 纯函数），零网络 / 零盘 / 零 React 渲染。
 */
import { describe, test, expect } from 'bun:test'
import { handleMessageFromStream } from '../../src/tui/utils/messages.js'
import {
  getSpinnerDisplayGates,
  SHOW_TOKENS_AFTER_MS,
} from '../../src/tui/components/Spinner/spinnerGates.js'
import type { StreamDelta } from '../../src/modelprovider'

/** REPL 接线面模拟（REPL.tsx:2437-2440 setResponseLength(length => length + newContent.length)）。 */
function makeStreamState() {
  const state = {
    mode: 'idle' as string,
    responseLength: 0,
    streamingText: null as string | null,
    messages: [] as unknown[],
    lengthUpdates: [] as string[],
  }
  const onMessage = (m: unknown) => state.messages.push(m)
  const onUpdateLength = (newContent: string) => {
    state.lengthUpdates.push(newContent)
    state.responseLength += newContent.length
  }
  const onSetStreamMode = (mode: string) => {
    state.mode = mode
  }
  const onStreamingToolUses = (_f: (cur: unknown[]) => unknown[]) => {}
  const onStreamingText = (f: (cur: string | null) => string | null) => {
    state.streamingText = f(state.streamingText)
  }
  const dispatch = (message: Parameters<typeof handleMessageFromStream>[0]) => {
    handleMessageFromStream(
      message,
      onMessage,
      onUpdateLength,
      onSetStreamMode,
      onStreamingToolUses,
      undefined,
      undefined,
      undefined,
      onStreamingText,
    )
  }
  return { state, dispatch, onMessage }
}

const textDelta = (text: string): StreamDelta => ({ type: 'text_delta', text })
const assistantMsg = {
  type: 'assistant' as const,
  uuid: 'u-1',
  timestamp: '2026-10-14T00:00:00Z',
  message: {
    id: 'm-1',
    model: 'fake-model',
    role: 'assistant' as const,
    content: [{ type: 'text', text: 'done' }],
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  },
}

describe('G-4 handleMessageFromStream stream_delta 分支（激活 W-opt 死代码接线）', () => {
  test('① text_delta 到达 → mode responding + onUpdateLength + onStreamingText 渐进（修前 delta 误落通用支 = onMessage 误调 + streamingText 清零红）', () => {
    const { state, dispatch } = makeStreamState()
    dispatch({ type: 'stream_request_start' })
    dispatch({ type: 'stream_delta', delta: textDelta('ab') })
    dispatch({ type: 'stream_delta', delta: textDelta('cd') })
    // mode 转换（SpinnerModeGlyph ↑→↓）
    expect(state.mode).toBe('responding')
    // responseLength 增长（REPL 接线面累加语义）+ 逐 delta 载荷保真
    expect(state.responseLength).toBe(4)
    expect(state.lengthUpdates).toEqual(['ab', 'cd'])
    // 流式文本渐进累积
    expect(state.streamingText).toBe('abcd')
    // delta 非完整消息 = onMessage 零调用（修前红 = delta 误落通用支 onMessage 误调）
    expect(state.messages.length).toBe(0)
  })

  test('② tool_use 类 delta 零副作用 = 本波仅 text 面（Main 定项②，tool 面 0.1.71 候选）', () => {
    const { state, dispatch } = makeStreamState()
    dispatch({ type: 'stream_request_start' })
    dispatch({
      type: 'stream_delta',
      delta: { type: 'tool_use_delta', id: 'tc-1', inputJsonDelta: '{"a"' } as StreamDelta,
    })
    expect(state.mode).toBe('requesting') // 未转 responding（仅 text 面转）
    expect(state.responseLength).toBe(0)
    expect(state.streamingText).toBeNull()
    expect(state.messages.length).toBe(0)
  })

  test('③ stream_delta 未到达面恒等锚 = assistant 支 onMessage + streamingText 清零（逐字节同值）', () => {
    const { state, dispatch } = makeStreamState()
    dispatch({ type: 'stream_request_start' })
    state.streamingText = 'partial'
    dispatch(assistantMsg as never)
    expect(state.messages.length).toBe(1)
    // 完成消息到达 = streamingText 原子交接清零（既有语义，修前同值）
    expect(state.streamingText).toBeNull()
  })

  test('④ stream_event content_block_delta 既有支恒等锚（修前同路径逐字节同值）', () => {
    const { state, dispatch } = makeStreamState()
    dispatch({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'xy' } },
    } as never)
    expect(state.responseLength).toBe(2)
    expect(state.streamingText).toBe('xy')
  })
})

describe('端到端 composing 面（G-1→G-4 全链单测镜像；修前 responseLength 恒 0 = 主诉根因面）', () => {
  test('⑤ stream_request_start + N stream_delta → mode responding + totalTokens>0 + showTokens 开 + 完成消息原子交接', () => {
    const { state, dispatch } = makeStreamState()
    dispatch({ type: 'stream_request_start' })
    expect(state.mode).toBe('requesting')
    // 慢模型长回合模拟（3 段 token，17 chars）
    dispatch({ type: 'stream_delta', delta: textDelta('hello ') })
    dispatch({ type: 'stream_delta', delta: textDelta('world') })
    dispatch({ type: 'stream_delta', delta: textDelta('! ') })
    // mode 转（↑→↓）
    expect(state.mode).toBe('responding')
    // totalTokens = SpinnerAnimationRow chars/4 估算法（L164 Math.round(len/4)）
    const totalTokens = Math.round(state.responseLength / 4)
    expect(totalTokens).toBeGreaterThan(0)
    // spinnerGates 5s 门（回合超 5s = 慢模型常态）+ totalTokens>0 值门 = showTokens 开
    // （SpinnerAnimationRow.tsx:200 第三合取 = 终端宽度面，非 unit 判域）
    const gates = getSpinnerDisplayGates({
      verbose: false,
      hasRunningTeammates: false,
      effectiveElapsedMs: SHOW_TOKENS_AFTER_MS + 1,
    })
    const showTokens = gates.wantsTokens && totalTokens > 0
    expect(showTokens).toBe(true)
    // 流式文本渐进（完整累积）
    expect(state.streamingText).toBe('hello world! ')
    // 完成消息到达 = 原子交接（streamingText 清零 + 消息列表接管）
    dispatch(assistantMsg as never)
    expect(state.streamingText).toBeNull()
    expect(state.messages.length).toBe(1)
    // 5s 门内（快速回合）= token 不显（值门防 0 计数闪帧，既有语义恒等）
    const earlyGates = getSpinnerDisplayGates({
      verbose: false,
      hasRunningTeammates: false,
      effectiveElapsedMs: 1_000,
    })
    expect(earlyGates.wantsTokens).toBe(false)
  })

  test('⑥ 零 delta 面（空响应回合）= totalTokens 0 + showTokens 关（恒等锚：不显 0 计数）', () => {
    const { state, dispatch } = makeStreamState()
    dispatch({ type: 'stream_request_start' })
    dispatch(assistantMsg as never)
    const totalTokens = Math.round(state.responseLength / 4)
    expect(totalTokens).toBe(0)
    const gates = getSpinnerDisplayGates({
      verbose: false,
      hasRunningTeammates: false,
      effectiveElapsedMs: SHOW_TOKENS_AFTER_MS + 1,
    })
    expect(gates.wantsTokens && totalTokens > 0).toBe(false)
  })
})
