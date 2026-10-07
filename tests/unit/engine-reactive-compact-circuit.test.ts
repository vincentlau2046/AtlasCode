/**
 * D1+D2（0.1.37 ③，P2 恢复层）判别单测：
 *   ① isReactiveCompactRecoverableError（throw 形态 413/PTL 判形，纯函数，I/O-free）
 *   ② autoCompactCircuit store（断路器跳闸态单一事实源，模块态，report/clear/subscribe）
 *   ③ queryAgentLoop 反应式压缩消费点 + 一次性门（413 → 消费者重建 + 本回合重试；
 *      同回合二次 413 = 回显原错误，防反应式死循环 = V4 判据③）
 *
 * 非 tautology：断言的是 loop 的 413 恢复调度/一次性门 + store 状态机，fake 仅
 * modelProvider（throw PTL）+ reactiveCompact 消费者（返固定 CompactionResult）。
 * I/O-free（无盘/无网络/无 PTY）→ unit 层。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  autoCompactCircuitStore,
  clearAutoCompactCircuitFailures,
  getAutoCompactCircuitFailures,
  isAutoCompactCircuitTripped,
  isReactiveCompactRecoverableError,
  MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES,
  queryAgentLoop,
  reportAutoCompactCircuitFailures,
  resetAutoCompactCircuitForTesting,
  type AgentLoopArgs,
  type AgentLoopDeps,
  type CompactionResult,
} from '../../src/engine'
import { APIError } from '../../src/modelprovider'
import type { ModelProvider, ModelRole } from '../../src/modelprovider'
import type { Message } from '../../src/shared'

const msg = (uuid: string, role: 'user' | 'assistant' = 'user'): Message =>
  ({
    uuid,
    type: role,
    role,
    timestamp: '2026-10-07T00:00:00.000Z',
    message: { role, content: 'x' },
  }) as Message

const fakeCompactionResult = (): CompactionResult =>
  ({
    boundaryMarker: msg('b'),
    summaryMessages: [msg('s')],
    attachments: [],
    hookResults: [],
  }) as CompactionResult

/** 413/PTL 形错误（classifyAPIError → 'prompt_too_long'）。 */
const PTL_ERROR = new Error('Prompt is too long: 250000 > 200000')
/** media-size 形错误（classifyAPIError → 'image_too_large'）。 */
const MEDIA_ERROR = new APIError('image exceeds maximum size', 400)

describe('D1 ③ 判形 isReactiveCompactRecoverableError（throw 形态，单源 classifyAPIError）', () => {
  test('prompt_too_long（413 输入超窗）= 可恢复', () => {
    expect(isReactiveCompactRecoverableError(PTL_ERROR)).toBe(true)
  })
  test('image_too_large（media-size 400）= 可恢复', () => {
    expect(isReactiveCompactRecoverableError(MEDIA_ERROR)).toBe(true)
  })
  test('rate_limit（429）/ server_overload（500）/ 其它 400 = 不可恢复（穿透原语义）', () => {
    expect(isReactiveCompactRecoverableError(new APIError('rate limited', 429))).toBe(false)
    expect(isReactiveCompactRecoverableError(new APIError('overloaded', 529))).toBe(false)
    expect(isReactiveCompactRecoverableError(new APIError('bad request', 400))).toBe(false)
  })
  test('非 Error（string/null/undefined）= 不可恢复', () => {
    expect(isReactiveCompactRecoverableError('a string')).toBe(false)
    expect(isReactiveCompactRecoverableError(null)).toBe(false)
    expect(isReactiveCompactRecoverableError(undefined)).toBe(false)
  })
})

describe('D2 ③ 断路器跳闸态 store（autoCompactCircuit）', () => {
  beforeEach(() => {
    resetAutoCompactCircuitForTesting()
  })
  afterEach(() => {
    resetAutoCompactCircuitForTesting()
  })

  test('初始 = 0，未跳闸', () => {
    expect(getAutoCompactCircuitFailures()).toBe(0)
    expect(isAutoCompactCircuitTripped()).toBe(false)
  })
  test('report 回灌 ≥ 阈值（= MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES）= 跳闸', () => {
    expect(MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES).toBe(3)
    reportAutoCompactCircuitFailures(2)
    expect(getAutoCompactCircuitFailures()).toBe(2)
    expect(isAutoCompactCircuitTripped()).toBe(false) // 2 < 3
    reportAutoCompactCircuitFailures(3)
    expect(isAutoCompactCircuitTripped()).toBe(true) // 3 >= 3
  })
  test('isAutoCompactCircuitTripped(n) 显式入参面（快照判定，不读 store）', () => {
    expect(isAutoCompactCircuitTripped(2)).toBe(false)
    expect(isAutoCompactCircuitTripped(3)).toBe(true)
    expect(isAutoCompactCircuitTripped(5)).toBe(true)
  })
  test('clear 复位（成功支）= 0 未跳闸', () => {
    reportAutoCompactCircuitFailures(3)
    expect(isAutoCompactCircuitTripped()).toBe(true)
    clearAutoCompactCircuitFailures()
    expect(getAutoCompactCircuitFailures()).toBe(0)
    expect(isAutoCompactCircuitTripped()).toBe(false)
  })
  test('report 同值不重复通知（Object.is 幂等，subscribe 不误触）', () => {
    let fires = 0
    const unsubSub = autoCompactCircuitStore.subscribe(() => {
      fires++
    })
    reportAutoCompactCircuitFailures(1)
    reportAutoCompactCircuitFailures(1) // 同值 = 不通知
    expect(fires).toBe(1)
    reportAutoCompactCircuitFailures(2)
    expect(fires).toBe(2)
    unsubSub()
    reportAutoCompactCircuitFailures(3)
    expect(fires).toBe(2) // 已退订
  })
  test('resetForTesting 清状态 + 清订阅（单测 teardown 面）', () => {
    reportAutoCompactCircuitFailures(3)
    let fires = 0
    autoCompactCircuitStore.subscribe(() => {
      fires++
    })
    resetAutoCompactCircuitForTesting() // setState(0) 通知一次 + 清订阅
    const firesAfterReset = fires
    expect(getAutoCompactCircuitFailures()).toBe(0)
    reportAutoCompactCircuitFailures(1) // 订阅已清 = 不再触发
    expect(fires).toBe(firesAfterReset) // 无新增触发（订阅已清）
  })
})

/** fake modelProvider：前 n 次 chat 抛 PTL，之后返固定文本（end_turn 无 tool）。 */
function flakyProvider(ptlTimes: number, calls: number[]): ModelProvider {
  const notExercised = async () => {
    throw new Error('fake ModelProvider: 未被 loop 消费')
  }
  return {
    chat: async () => {
      calls.push(1)
      if (calls.length <= ptlTimes) {
        throw PTL_ERROR
      }
      return {
        type: 'assistant',
        uuid: 'fake-uuid',
        timestamp: '2026-10-07T00:00:00Z',
        message: {
          id: 'fake-msg',
          model: 'fake-model',
          role: 'assistant',
          content: [{ type: 'text', text: 'recovered' }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      }
    },
    chatStream: notExercised as unknown as ModelProvider['chatStream'],
    healthCheck: notExercised as unknown as ModelProvider['healthCheck'],
    countTokens: notExercised as unknown as ModelProvider['countTokens'],
    listModels: async () => [],
    transcribeAudio: notExercised as unknown as ModelProvider['transcribeAudio'],
    synthesizeSpeech: notExercised as unknown as ModelProvider['synthesizeSpeech'],
    verifyKey: async () => true,
  }
}

describe('D1 ③ loop 反应式压缩消费点 + 一次性门（queryAgentLoop）', () => {
  beforeEach(() => {
    delete process.env.ATLAS_DISABLE_REACTIVE_COMPACT
  })

  test('413 → 消费者重建 + 本回合重试一次（回合存活，V4 判据②）', async () => {
    const calls: number[] = []
    let consumerCalls = 0
    const deps: AgentLoopDeps = {
      modelProvider: flakyProvider(1, calls), // 首 413，重试成功
      role: 'small' as ModelRole,
      reactiveCompact: async ({ messages }) => {
        consumerCalls++
        expect(messages.length).toBeGreaterThanOrEqual(1)
        return fakeCompactionResult()
      },
    }
    const args: AgentLoopArgs = {
      messages: [msg('u1')],
      tools: [],
    }
    const result = await queryAgentLoop(deps, args)
    // 消费者恰被调 1 次（本回合一次性）
    expect(consumerCalls).toBe(1)
    // LLM 被调 2 次（首 413 + 重试成功）
    expect(calls.length).toBe(2)
    // 回合存活：末条 = 恢复后的 assistant 文本
    const last = result.messages[result.messages.length - 1] as {
      message?: { content?: unknown }
    }
    expect((last.message?.content as Array<{ type: string; text?: string }>)[0].text).toBe(
      'recovered',
    )
  })

  test('一次性门：同回合二次 413 不重压，回显原始错误（V4 判据③，防反应式死循环）', async () => {
    const calls: number[] = []
    let consumerCalls = 0
    const deps: AgentLoopDeps = {
      modelProvider: flakyProvider(Number.MAX_SAFE_INTEGER, calls), // 恒 413
      role: 'small' as ModelRole,
      reactiveCompact: async () => {
        consumerCalls++
        return fakeCompactionResult()
      },
    }
    const args: AgentLoopArgs = {
      messages: [msg('u1')],
      tools: [],
    }
    await expect(queryAgentLoop(deps, args)).rejects.toThrow('Prompt is too long')
    // 消费者只被调 1 次（首 413 触发；二次 413 因 reactiveRetried 已置位跳过）
    expect(consumerCalls).toBe(1)
  })

  test('env 可杀（ATLAS_DISABLE_REACTIVE_COMPACT=true）= 不触发反应式，直接穿透原 413', async () => {
    process.env.ATLAS_DISABLE_REACTIVE_COMPACT = 'true'
    const calls: number[] = []
    let consumerCalls = 0
    const deps: AgentLoopDeps = {
      modelProvider: flakyProvider(1, calls),
      role: 'small' as ModelRole,
      reactiveCompact: async () => {
        consumerCalls++
        return fakeCompactionResult()
      },
    }
    await expect(
      queryAgentLoop(deps, { messages: [msg('u1')], tools: [] }),
    ).rejects.toThrow('Prompt is too long')
    expect(consumerCalls).toBe(0) // kill-switch = 消费者不被调
  })

  test('未注 reactiveCompact 槽（窄 spine 缺省）= 413 按现状穿透（零行为变更）', async () => {
    const calls: number[] = []
    const deps: AgentLoopDeps = {
      modelProvider: flakyProvider(1, calls),
      role: 'small' as ModelRole,
      // 不注 reactiveCompact = 窄 spine（headless 缺省不变）
    }
    await expect(
      queryAgentLoop(deps, { messages: [msg('u1')], tools: [] }),
    ).rejects.toThrow('Prompt is too long')
    expect(calls.length).toBe(1) // 只 1 次（无重试）
  })
})
