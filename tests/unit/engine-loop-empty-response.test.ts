/**
 * R1（P0 静默终止）：空内容响应重试 + 空终止标识判别测试。
 *
 * 被测能力 = queryOneRound 空内容判定（content 无非空 text 块且无 tool_use 块 = 空，
 * 仅 thinking / 全空 = 空）+ 有界重试（空且未 abort → 再试 1 次）+ queryAgentLoop
 * 末轮 emptyTerminated 标识。fake LLM 分「先空后实」（验重试恢复）与「恒空」（验
 * 重试仍空 → empty=true）两种，非 tautology：断言的是 loop 的空判定/重试调度/末轮
 * 标识，非 fake 自证。I/O-free（无盘/无网络/无 PTY）→ unit 层。
 *
 * #271 #5（0.1.23，e2e「empty 0-0 有界重试判据」）：网关 0/0 占位响应经
 * OpenAI 协议映射 = provider 合成占位块（PROVIDER_EMPTY_CONTENT_PLACEHOLDER，
 * usage 0/0）；旧空判定把占位块当非空 text → 有界重试/空终止提示全不触发
 * （静默穿越，e2e empty 场景 FAIL）。⑧⑩ 判别（修前红：占位被当非空 → 不重试、
 * empty=false）；⑨ 占位+实内容共存 → 非空（防「有占位即空」过度修）。
 */
import { describe, test, expect } from 'bun:test'
import { queryOneRound, queryAgentLoop } from '../../src/engine'
import type { AgentLoopDeps } from '../../src/engine'
import { PROVIDER_EMPTY_CONTENT_PLACEHOLDER, type ModelProvider, type ModelRole } from '../../src/modelprovider'
import type { Message } from '../../src/shared'

const NOT_EXERCISED = async () => {
  throw new Error('fake ModelProvider: 方法未被 loop 消费')
}

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}
type Resp = { content: unknown[]; stopReason?: string; usage?: Usage }

const DEFAULT_USAGE: Usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

/** fake LLM：按调用序返回 responses（超出长度取末条），计数 chat 调用次数。 */
function makeProvider(responses: Resp[]): { provider: ModelProvider; calls: () => number } {
  let n = 0
  const provider: ModelProvider = {
    chat: async () => {
      const r = responses[Math.min(n, responses.length - 1)]
      n++
      return {
        type: 'assistant',
        uuid: `fake-${n}`,
        timestamp: '2026-10-02T00:00:00Z',
        message: {
          id: `m-${n}`,
          model: 'fake-model',
          role: 'assistant',
          content: r.content,
          stop_reason: r.stopReason ?? 'end_turn',
          usage: r.usage ?? DEFAULT_USAGE,
        },
      }
    },
    chatStream: NOT_EXERCISED as unknown as ModelProvider['chatStream'],
    healthCheck: NOT_EXERCISED as unknown as ModelProvider['healthCheck'],
    countTokens: NOT_EXERCISED as unknown as ModelProvider['countTokens'],
    listModels: async () => [],
    transcribeAudio: NOT_EXERCISED as unknown as ModelProvider['transcribeAudio'],
    synthesizeSpeech: NOT_EXERCISED as unknown as ModelProvider['synthesizeSpeech'],
    verifyKey: async () => true,
  }
  return { provider, calls: () => n }
}

const EMPTY: Resp = { content: [] }
const TEXT: Resp = { content: [{ type: 'text', text: 'done' }] }
const THINKING_ONLY: Resp = { content: [{ type: 'thinking', thinking: 'hmm' }] }
// #271 #5：网关 0/0 占位响应经 provider 映射的合成占位块（usage 0/0 忠实 e2e 场景）
const USAGE_00: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const PLACEHOLDER_00: Resp = {
  content: [{ type: 'text', text: PROVIDER_EMPTY_CONTENT_PLACEHOLDER }],
  usage: USAGE_00,
}

describe('R1 空内容响应：queryOneRound 有界重试 + empty 标识', () => {
  test('① 先空后实：首次空 → 重试 1 次取实内容，empty=false 且共 2 次 LLM 调用', async () => {
    const { provider, calls } = makeProvider([EMPTY, TEXT])
    const deps: AgentLoopDeps = { modelProvider: provider, role: 'small' as ModelRole }
    const r = await queryOneRound(deps, [], [{ role: 'user', content: 'hi' }] as Message[])
    expect(r.empty).toBe(false) // 重试恢复 → 非空
    expect(r.assistantContent).toEqual(TEXT.content)
    expect(calls()).toBe(2) // 初调 1 + 重试 1
  })

  test('② 恒空：重试仍空 → empty=true 且共 2 次 LLM 调用', async () => {
    const { provider, calls } = makeProvider([EMPTY, EMPTY])
    const deps: AgentLoopDeps = { modelProvider: provider, role: 'small' as ModelRole }
    const r = await queryOneRound(deps, [], [{ role: 'user', content: 'hi' }] as Message[])
    expect(r.empty).toBe(true)
    expect(calls()).toBe(2) // 初调 1 + 重试 1（仍空）
  })

  test('③ 正常文本：无重试，empty=false 且仅 1 次 LLM 调用', async () => {
    const { provider, calls } = makeProvider([TEXT])
    const deps: AgentLoopDeps = { modelProvider: provider, role: 'small' as ModelRole }
    const r = await queryOneRound(deps, [], [{ role: 'user', content: 'hi' }] as Message[])
    expect(r.empty).toBe(false)
    expect(calls()).toBe(1) // 非空不重试
  })

  test('④ 仅 thinking（无 text 无 tool_use）= 空：重试后仍空 → empty=true', async () => {
    const { provider } = makeProvider([THINKING_ONLY, THINKING_ONLY])
    const deps: AgentLoopDeps = { modelProvider: provider, role: 'small' as ModelRole }
    const r = await queryOneRound(deps, [], [{ role: 'user', content: 'hi' }] as Message[])
    expect(r.empty).toBe(true)
  })

  test('⑤ signal 已 abort：空响应不追加重试（仅 1 次调用）', async () => {
    const { provider, calls } = makeProvider([EMPTY])
    const abort = new AbortController()
    abort.abort()
    const deps: AgentLoopDeps = { modelProvider: provider, role: 'small' as ModelRole, signal: abort.signal }
    const r = await queryOneRound(deps, [], [{ role: 'user', content: 'hi' }] as Message[])
    expect(r.empty).toBe(true)
    expect(calls()).toBe(1) // abort → 不重试
  })
})

describe('R1 空内容响应：queryAgentLoop 末轮 emptyTerminated', () => {
  test('⑥ 恒空 → 末轮空终止：emptyTerminated=true 且 lastRound.empty=true', async () => {
    const { provider } = makeProvider([EMPTY, EMPTY])
    const deps: AgentLoopDeps = { modelProvider: provider, role: 'small' as ModelRole }
    const r = await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(r.terminated).toBe(true)
    expect(r.emptyTerminated).toBe(true)
    expect(r.lastRound?.empty).toBe(true)
  })

  test('⑦ 正常文本终止（非空）：emptyTerminated=false', async () => {
    const { provider } = makeProvider([TEXT])
    const deps: AgentLoopDeps = { modelProvider: provider, role: 'small' as ModelRole }
    const r = await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(r.terminated).toBe(true)
    expect(r.emptyTerminated).toBe(false)
  })
})

describe('#271 #5 网关 0/0 占位响应（provider 合成占位块）走空判定 + 有界重试', () => {
  test('⑧ 恒占位（usage 0/0）= 空：重试仍空 → empty=true 且共 2 次 LLM 调用（修前红=占位被当非空）', async () => {
    const { provider, calls } = makeProvider([PLACEHOLDER_00, PLACEHOLDER_00])
    const deps: AgentLoopDeps = { modelProvider: provider, role: 'small' as ModelRole }
    const r = await queryOneRound(deps, [], [{ role: 'user', content: 'hi' }] as Message[])
    expect(r.empty).toBe(true) // 占位 ≠ 模型产出 → 空
    expect(calls()).toBe(2) // 初调 1 + 有界重试 1（仍占位）
  })

  test('⑨ 占位 + 实内容共存：真实 text 仍算非空（防「有占位即空」过度修），无重试', async () => {
    const { provider, calls } = makeProvider([
      { content: [{ type: 'text', text: PROVIDER_EMPTY_CONTENT_PLACEHOLDER }, { type: 'text', text: 'done' }] },
    ])
    const deps: AgentLoopDeps = { modelProvider: provider, role: 'small' as ModelRole }
    const r = await queryOneRound(deps, [], [{ role: 'user', content: 'hi' }] as Message[])
    expect(r.empty).toBe(false) // 实内容在 → 非空（占位块只是被忽略，不是「有占位即空」）
    expect(calls()).toBe(1) // 非空不重试
  })

  test('⑩ queryAgentLoop 末轮恒占位：emptyTerminated=true 且 lastRound.empty=true（e2e 判据 loop 面）', async () => {
    const { provider } = makeProvider([PLACEHOLDER_00, PLACEHOLDER_00])
    const deps: AgentLoopDeps = { modelProvider: provider, role: 'small' as ModelRole }
    const r = await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(r.terminated).toBe(true)
    expect(r.emptyTerminated).toBe(true)
    expect(r.lastRound?.empty).toBe(true)
  })
})
