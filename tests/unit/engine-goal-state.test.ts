/**
 * 0.1.62 /goal 核心+持久化波 — goal 状态机 + 评估器 + 持久化快照判别单测。
 *
 * 判别矩阵（工单 §2，修前红→绿）：
 *   C0-1  /goal set → armed（条件持久化 + ≤500 字符守卫 + one-goal 替换 + 空拒绝）
 *   C0-6  clear/自清除通知（clear → cleared + 通知行；达成通知无「run /goal clear」〔2.1.173 纪律〕）
 *   C0-2  评估器 mock judge 两态（canned MET/UNMET 确定性驱动，零模型非定式；
 *         无法解析 = fail-safe 未达成——不误终止）
 *   P1    持久化快照 round-trip（armed 恢复 / cleared no-op / undefined 重置）
 *
 * I/O-free（fake provider canned 响应 + 纯状态机）→ unit 层。goal 状态 = 模块
 * 级单例，beforeEach 经 resetGoalStateForTesting() 隔离。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  MAX_GOAL_CONDITION_CHARS,
  armGoal,
  clearGoal,
  isGoalArmed,
  getGoalCondition,
  getGoalStateForPersistence,
  restoreGoalState,
  resetGoalStateForTesting,
  evaluateGoal,
  goalContinuationReminder,
  goalMetNotification,
  goalClearedNotification,
  type GoalStateSnapshot,
} from '../../src/engine'
import type { Message } from '../../src/shared'
import type { ModelProvider } from '../../src/modelprovider'

/** canned judge（两态确定性驱动 C0-2 评估器，零模型依赖）。 */
function cannedJudge(text: string): ModelProvider {
  return {
    chat: async () => ({
      type: 'assistant',
      uuid: 'judge-1',
      timestamp: '2026-09-30T00:00:00Z',
      message: {
        id: 'judge-1',
        model: 'fake-model',
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
    }),
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
}

const EVIDENCE: Message[] = [
  {
    type: 'user',
    message: { role: 'user', content: 'user asked to finish the parser' },
  } as unknown as Message,
]

beforeEach(() => {
  resetGoalStateForTesting()
})

describe('C0-1 armGoal 状态机（/goal set）', () => {
  test('set → armed + 条件存储', () => {
    const r = armGoal('build the parser')
    expect(r).toEqual({ ok: true })
    expect(isGoalArmed()).toBe(true)
    expect(getGoalCondition()).toBe('build the parser')
  })

  test('one-goal 替换（新设替换旧）', () => {
    armGoal('first')
    armGoal('second')
    expect(getGoalCondition()).toBe('second')
    expect(isGoalArmed()).toBe(true)
  })

  test('≤500 字符守卫：500 通过 / 501 拒绝（拒绝不改状态）', () => {
    expect(armGoal('a'.repeat(MAX_GOAL_CONDITION_CHARS)).ok).toBe(true)
    resetGoalStateForTesting()
    const r = armGoal('a'.repeat(MAX_GOAL_CONDITION_CHARS + 1))
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.reason).toContain(String(MAX_GOAL_CONDITION_CHARS))
    expect(isGoalArmed()).toBe(false)
  })

  test('空条件拒绝（fail-closed）', () => {
    const r = armGoal('   ')
    expect(r.ok).toBe(false)
    expect(isGoalArmed()).toBe(false)
  })
})

describe('C0-6 clear / 达成自清除通知（2.1.173 纪律）', () => {
  test('clearGoal → cleared + 通知行（无「run /goal clear」）', () => {
    armGoal('x')
    clearGoal()
    expect(isGoalArmed()).toBe(false)
    expect(getGoalCondition()).toBeUndefined()
    expect(goalClearedNotification().toLowerCase()).not.toContain(
      'run /goal clear',
    )
  })

  test('达成通知 = 自清除措辞，无「run /goal clear」提示', () => {
    const note = goalMetNotification('ship it')
    expect(note).toContain('ship it')
    expect(note.toLowerCase()).not.toContain('run /goal clear')
  })
})

describe('C0-2 评估器 mock judge 两态（零模型非定式）', () => {
  test('canned MET → met=true', async () => {
    const r = await evaluateGoal({
      modelProvider: cannedJudge('MET\nThe condition is satisfied by the evidence.'),
      messages: EVIDENCE,
      condition: 'ship it',
    })
    expect(r.met).toBe(true)
  })

  test('canned UNMET → met=false', async () => {
    const r = await evaluateGoal({
      modelProvider: cannedJudge('UNMET\nNot done yet.'),
      messages: EVIDENCE,
      condition: 'ship it',
    })
    expect(r.met).toBe(false)
  })

  test('无法解析 = fail-safe met=false（不误终止）', async () => {
    const r = await evaluateGoal({
      modelProvider: cannedJudge('I am not sure about this one.'),
      messages: EVIDENCE,
      condition: 'ship it',
    })
    expect(r.met).toBe(false)
  })
})

describe('C0-3 续跑指令模板（2.1.173 stop-hook-active reminder）', () => {
  test('reminder = user 消息，含条件变量', () => {
    const m = goalContinuationReminder('ship it')
    expect(m.type).toBe('user')
    const content = (m as { message?: { content?: unknown } }).message?.content
    expect(typeof content).toBe('string')
    expect(content).toContain('ship it')
  })
})

describe('P1 持久化快照 round-trip', () => {
  test('armed 快照 → 恢复重新 arm', () => {
    armGoal('persist me')
    const snap: GoalStateSnapshot = getGoalStateForPersistence()
    expect(snap).toEqual({ armed: true, condition: 'persist me' })
    resetGoalStateForTesting()
    expect(isGoalArmed()).toBe(false)
    restoreGoalState(snap)
    expect(isGoalArmed()).toBe(true)
    expect(getGoalCondition()).toBe('persist me')
  })

  test('cleared 快照 = no-op（覆盖陈旧 armed 态，防旧态泄漏）', () => {
    armGoal('x')
    clearGoal()
    const snap = getGoalStateForPersistence()
    expect(snap).toEqual({ armed: false, condition: '' })
    armGoal('stale')
    restoreGoalState(snap)
    expect(isGoalArmed()).toBe(false)
  })

  test('undefined 快照 = no-op 重置', () => {
    armGoal('x')
    restoreGoalState(undefined)
    expect(isGoalArmed()).toBe(false)
  })
})
