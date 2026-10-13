/**
 * 0.1.63 /goal 演化波 P5+P6 — 评估器时序守卫 + hook 门控显式报错判别单测。
 *
 * 判别矩阵（工单 §2）：
 *   P5  后台任务运行中 → 评估器零调用（不提前触发）；终态 → 触发评估
 *   P6  disableAllHooks 等配置 → 显式报错面（非静默挂起）
 *
 * P5 判别力 = mock hasPendingBackgroundTasks 谓词注入（DI 槽）——零模型零
 * 磁盘。P6 判别力 = mock.module hooksConfig（shouldDisableAllHooksIncludingManaged
 * 单名覆写，全导出面 spread 先例 = mock-module-export-surface 标准对策）。
 *
 * I/O-free → unit 层。goal 状态 = 模块级单例，beforeEach reset。
 */
import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
  queryAgentLoop,
  armGoal,
  isGoalArmed,
  resetGoalStateForTesting,
  goalHookGateNotification,
  type AgentLoopDeps,
  type AgentLoopEvent,
  type AgentLoopResult,
} from '../../src/engine'
import type { Message } from '../../src/shared'
import type { ModelProvider, ModelRole } from '../../src/modelprovider'

// ── P6 mock.module：hooksConfig 全导出面 spread + 单名覆写 ──────────
// 先取真实全导出面（7 名），再 mock.module spread 覆写
// shouldDisableAllHooksIncludingManaged（mock-module-export-surface 标准对策）。
const HOOKS_CONFIG_PATH = '../../src/engine/config/hooksConfig.js'
const realHooksConfig = await import('../../src/engine/config/hooksConfig')

let hooksDisabledOverride = false
mock.module(HOOKS_CONFIG_PATH, () => ({
  ...realHooksConfig,
  shouldDisableAllHooksIncludingManaged: () => hooksDisabledOverride,
}))

// ── 共用 mock provider（同 engine-goal-loop.test.ts 模式）─────────────
const MET = 'MET\nThe goal condition is satisfied by the evidence.'

function goalProvider(judgeCanned: string[]) {
  let judgeCall = 0
  const provider: ModelProvider = {
    chat: async (params) => {
      if ((params as { role?: ModelRole }).role === 'small') {
        const canned = judgeCanned[Math.min(judgeCall, judgeCanned.length - 1)] ?? 'UNMET'
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
      return {
        type: 'assistant',
        uuid: `u-${Date.now()}`,
        timestamp: '2026-09-30T00:00:00Z',
        message: {
          id: `m-${Date.now()}`,
          model: 'fake-model',
          role: 'assistant',
          content: [{ type: 'text', text: 'work done' }],
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

beforeEach(() => {
  resetGoalStateForTesting()
  hooksDisabledOverride = false
})

describe('P5 评估器时序守卫（后台任务运行中 → 评估器零调用）', () => {
  test('hasPendingBackgroundTasks=true → 评估器零调用（不提前触发）', async () => {
    const { provider, judgeCalls } = goalProvider([MET])
    const events: AgentLoopEvent[] = []
    const deps = {
      modelProvider: provider,
      role: 'premium' as ModelRole,
      emit: (e: AgentLoopEvent) => {
        events.push(e)
      },
      hasPendingBackgroundTasks: () => true,
    } as unknown as AgentLoopDeps
    armGoal('ship it')
    const r = await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'go' }] as Message[],
      tools: [],
      context: { maxGoalTurns: 5 },
    })
    // 评估器零调用（后台任务运行中 = 守卫阻断）
    expect(judgeCalls()).toBe(0)
    // goal 仍 armed（未清除——后台任务终态后才会评估）
    expect(isGoalArmed()).toBe(true)
    // 循环正常终止（不续跑——守卫阻断评估+续跑）
    expect(r.terminated).toBe(true)
  })

  test('hasPendingBackgroundTasks=false → 评估器触发（终态正常评估）', async () => {
    const { provider, judgeCalls } = goalProvider([MET])
    const events: AgentLoopEvent[] = []
    const deps = {
      modelProvider: provider,
      role: 'premium' as ModelRole,
      emit: (e: AgentLoopEvent) => {
        events.push(e)
      },
      hasPendingBackgroundTasks: () => false,
    } as unknown as AgentLoopDeps
    armGoal('ship it')
    const r = await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'go' }] as Message[],
      tools: [],
      context: { maxGoalTurns: 5 },
    })
    // 评估器触发（终态 = 无后台任务 → 评估正常进行）
    expect(judgeCalls()).toBe(1)
    // 达成 → 自清除
    expect(isGoalArmed()).toBe(false)
    expect(r.terminated).toBe(true)
  })

  test('hasPendingBackgroundTasks 未注入 → 零回归（恒等守卫：评估正常触发）', async () => {
    const { provider, judgeCalls } = goalProvider([MET])
    const deps = {
      modelProvider: provider,
      role: 'premium' as ModelRole,
    } as unknown as AgentLoopDeps
    armGoal('ship it')
    await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'go' }] as Message[],
      tools: [],
      context: { maxGoalTurns: 5 },
    })
    // 未注入 = 无守卫 = 评估正常触发（零回归）
    expect(judgeCalls()).toBe(1)
  })
})

describe('P6 hook 门控显式报错（disableAllHooks → 非静默）', () => {
  test('goalHookGateNotification 在场 + 含 hooks disabled 语义', () => {
    const note = goalHookGateNotification()
    expect(note).toContain('hooks')
    expect(note.toLowerCase()).toContain('disabled')
  })

  test('disableAllHooks=true → goal cleared + 显式报错事件（非静默挂起）', async () => {
    hooksDisabledOverride = true
    const { provider, judgeCalls } = goalProvider([MET])
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
    armGoal('ship it')
    const r = await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'go' }] as Message[],
      tools: [],
      context: { maxGoalTurns: 5 },
    })
    // 评估器零调用（hook 门控阻断 = 不评估）
    expect(judgeCalls()).toBe(0)
    // goal cleared（不再 armed = fail-closed，非静默挂起）
    expect(isGoalArmed()).toBe(false)
    // 显式报错事件在场（goal_unrecoverable）
    const errEvent = events.find(e => e.type === 'goal_unrecoverable')
    expect(errEvent).toBeDefined()
    // cleared 快照回写
    expect(savedGoalStates).toContain(null)
    expect(r.terminated).toBe(true)
  })

  test('disableAllHooks=false → 零回归（goal 正常评估，无门控报错）', async () => {
    hooksDisabledOverride = false
    const { provider, judgeCalls } = goalProvider([MET])
    const events: AgentLoopEvent[] = []
    const deps = {
      modelProvider: provider,
      role: 'premium' as ModelRole,
      emit: (e: AgentLoopEvent) => {
        events.push(e)
      },
    } as unknown as AgentLoopDeps
    armGoal('ship it')
    await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'go' }] as Message[],
      tools: [],
      context: { maxGoalTurns: 5 },
    })
    // 评估正常触发（零回归）
    expect(judgeCalls()).toBe(1)
    // 无门控报错事件
    expect(events.find(e => e.type === 'goal_unrecoverable')).toBeUndefined()
  })
})
