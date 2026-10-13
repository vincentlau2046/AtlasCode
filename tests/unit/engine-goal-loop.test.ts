/**
 * 0.1.62 /goal C0-2 — loop terminal 支 goal 续跑支判别单测（引擎触碰面）。
 *
 * 判别矩阵（工单 §2）：
 *   C0-2  达成 → 终止 + 自清除（goal_met 事件 + clearGoal + saveGoalState(null)）
 *   C0-2  未达成 → 阻断停止 + 续跑（turns+1 + 注入续跑消息在场 + goal_continuation）
 *   maxGoalTurns 硬守卫（续跑计数超限 → 强制终止，防 runaway，不评估）
 *   无 goal 恒等守卫（goal 未 armed → terminal 支字节级恒等：评估器零调用 /
 *     无 goal 事件 / 走既有 stopHooks 路径——★ 永久绿守卫，回归重跑必带）
 *
 * 判别力 = mock judge（goalProvider 按 role 判别：role='small' = 评估器 canned
 * 两态，role='premium' = 主循环脚本步）——零模型非定式。I/O-free → unit 层。
 * goal 状态 = 模块级单例，beforeEach resetGoalStateForTesting() 隔离。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  queryAgentLoop,
  armGoal,
  isGoalArmed,
  resetGoalStateForTesting,
  type AgentLoopDeps,
  type AgentLoopEvent,
  type AgentLoopResult,
} from '../../src/engine'
import type { Message } from '../../src/shared'
import type { ModelProvider, ModelRole } from '../../src/modelprovider'

/** 主循环脚本步（每 terminal 轮返一 text 步）。 */
interface ScriptStep {
  content: unknown[]
  stopReason?: string
}
const textStep = (t: string): ScriptStep => ({
  content: [{ type: 'text', text: t }],
  stopReason: 'end_turn',
})
const MET = 'MET\nThe goal condition is satisfied by the evidence.'
const UNMET = 'UNMET\nThe work is not yet complete.'

/**
 * role 判别 provider：role='small' = goal 评估器（canned 两态，按序/末位兜底），
 * role='premium'（主循环车道）= 脚本步。judgeCalls() 暴露评估器调用计数
 * （无 goal 恒等守卫断言面 = 0）。
 */
function goalProvider(mainScript: ScriptStep[], judgeCanned: string[]) {
  let mainCall = 0
  let judgeCall = 0
  const provider: ModelProvider = {
    chat: async (params) => {
      if ((params as { role?: ModelRole }).role === 'small') {
        const canned =
          judgeCanned[Math.min(judgeCall, judgeCanned.length - 1)] ?? 'UNMET'
        judgeCall++
        return {
          type: 'assistant',
          uuid: `judge-${judgeCall}`,
          timestamp: '2026-09-30T00:00:00Z',
          message: {
            id: `j-${judgeCall}`,
            model: 'fake-model',
            role: 'assistant',
            content: [{ type: 'text', text: canned }],
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
      const step = mainScript[mainCall]
      if (!step) {
        throw new Error(`main script exhausted (len ${mainScript.length})`)
      }
      mainCall++
      return {
        type: 'assistant',
        uuid: `u-${mainCall}`,
        timestamp: '2026-09-30T00:00:00Z',
        message: {
          id: `m-${mainCall}`,
          model: 'fake-model',
          role: 'assistant',
          content: step.content,
          stop_reason: step.stopReason ?? 'end_turn',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      }
    },
    chatStream: (() => {
      throw new Error('not exercised')
    }) as unknown as ModelProvider['chatStream'],
    healthCheck: (async () => true) as ModelProvider['healthCheck'],
    countTokens: (async () => 0) as unknown as ModelProvider['countTokens'],
    listModels: async () => [],
    transcribeAudio: (() => {
      throw new Error('not exercised')
    }) as unknown as ModelProvider['transcribeAudio'],
    synthesizeSpeech: (() => {
      throw new Error('not exercised')
    }) as unknown as ModelProvider['synthesizeSpeech'],
    verifyKey: async () => true,
  }
  return { provider, judgeCalls: () => judgeCall }
}

interface RunResult {
  r: AgentLoopResult
  events: AgentLoopEvent[]
  judgeCalls: number
  savedGoalStates: unknown[]
}
async function runLoop(
  mainScript: ScriptStep[],
  judgeCanned: string[],
  opts: { maxGoalTurns?: number; arm?: string } = {},
): Promise<RunResult> {
  const { provider, judgeCalls } = goalProvider(mainScript, judgeCanned)
  const events: AgentLoopEvent[] = []
  const savedGoalStates: unknown[] = []
  const deps = {
    modelProvider: provider,
    role: 'premium' as ModelRole,
    emit: (e: AgentLoopEvent) => {
      events.push(e)
    },
    transcript: {
      record: async () => undefined,
      saveGoalState: (g: unknown) => {
        savedGoalStates.push(g)
      },
    },
  } as unknown as AgentLoopDeps
  if (opts.arm) armGoal(opts.arm)
  const r = await queryAgentLoop(deps, {
    messages: [{ role: 'user', content: 'go' }] as Message[],
    tools: [],
    context: { maxGoalTurns: opts.maxGoalTurns },
  })
  return { r, events, judgeCalls: judgeCalls(), savedGoalStates }
}

beforeEach(() => {
  resetGoalStateForTesting()
})

describe('C0-2 loop terminal 支 goal 续跑支', () => {
  test('达成 → 终止 + 自清除（goal_met + clearGoal + saveGoalState(null)）', async () => {
    const { r, events, judgeCalls, savedGoalStates } = await runLoop(
      [textStep('done')],
      [MET],
      { arm: 'ship it', maxGoalTurns: 5 },
    )
    expect(r.terminated).toBe(true)
    expect(r.turns).toBe(1)
    expect(isGoalArmed()).toBe(false) // 自清除
    expect(judgeCalls).toBe(1)
    expect(events.map(e => e.type)).toEqual([
      'loop_start',
      'round_start',
      'round_end',
      'goal_met',
      'loop_end',
    ])
    const gm = events.find(
      e => e.type === 'goal_met',
    ) as Extract<AgentLoopEvent, { type: 'goal_met' }>
    expect(gm.condition).toBe('ship it')
    expect(savedGoalStates).toEqual([null]) // cleared 快照回写
  })

  test('未达成 → 阻断停止 + 续跑（turns+1 + 注入续跑消息 + goal_continuation），次轮达成终止', async () => {
    const { r, events, judgeCalls } = await runLoop(
      [textStep('wip'), textStep('now done')],
      [UNMET, MET],
      { arm: 'ship it', maxGoalTurns: 5 },
    )
    expect(r.terminated).toBe(true)
    expect(r.turns).toBe(2) // 首轮未达成续跑，次轮达成终止
    expect(isGoalArmed()).toBe(false)
    expect(judgeCalls).toBe(2)
    expect(events.map(e => e.type)).toEqual([
      'loop_start',
      'round_start',
      'round_end',
      'goal_continuation',
      'round_start',
      'round_end',
      'goal_met',
      'loop_end',
    ])
    // 续跑指令注入在场（goal-reminder user 消息入终态消息序列）
    const reminder = r.messages.find(
      m => (m as { uuid?: string }).uuid?.startsWith('goal-reminder-'),
    )
    expect(reminder).toBeDefined()
  })

  test('maxGoalTurns 硬守卫 → 强制终止（防 runaway；超限轮不评估、自清除）', async () => {
    const { r, events, judgeCalls, savedGoalStates } = await runLoop(
      [textStep('a'), textStep('b'), textStep('c')],
      [UNMET],
      { arm: 'ship it', maxGoalTurns: 2 },
    )
    expect(r.terminated).toBe(true)
    expect(r.turns).toBe(3) // 2 次未达成续跑 + 第 3 轮触硬守卫终止
    expect(isGoalArmed()).toBe(false)
    expect(judgeCalls).toBe(2) // 第 3 轮触守卫于评估前
    expect(
      events.filter(e => e.type === 'goal_continuation'),
    ).toHaveLength(2)
    expect(events.map(e => e.type)).not.toContain('goal_met')
    expect(savedGoalStates).toEqual([null])
  })

  test('★ 无 goal 恒等守卫（goal 未 armed → terminal 支字节级恒等：评估器零调用 / 无 goal 事件）', async () => {
    const { r, events, judgeCalls } = await runLoop(
      [textStep('done')],
      [MET],
      { maxGoalTurns: 5 },
    )
    expect(r.terminated).toBe(true)
    expect(r.turns).toBe(1)
    expect(isGoalArmed()).toBe(false)
    expect(judgeCalls).toBe(0) // 评估器永不触发
    expect(events.map(e => e.type)).toEqual([
      'loop_start',
      'round_start',
      'round_end',
      'loop_end',
    ])
  })
})
