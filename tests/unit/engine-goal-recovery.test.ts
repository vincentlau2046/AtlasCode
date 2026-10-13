/**
 * 0.1.63 /goal 演化波 P2+P3 — goal 跑动中错误恢复 + 不可恢复自清除判别单测。
 *
 * 判别矩阵（工单 §2）：
 *   P2  可恢复错误（5xx/429 配额耗尽）→ goal = paused + 暂停说明行在场 +
 *     配额恢复后 resume（paused→armed 不丢条件）
 *   P3  不可恢复错误（401 auth 吊销 / 上下文溢出）→ goal cleared + 通知行 +
 *     不再 armed（fail-closed，防 armed goal 静默挂死）
 *   P2/P3 零回归：无 error 时 goal 正常态不受影响（armed→paused 非自动，
 *     须显式 error 触发）
 *
 * 判别力 = mock provider throw（按 error 类型判别：可恢复/不可恢复）——零模型
 * 非定式。I/O-free → unit 层。goal 状态 = 模块级单例，beforeEach reset。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  armGoal,
  clearGoal,
  isGoalArmed,
  isGoalPaused,
  getGoalCondition,
  pauseGoal,
  resumeGoal,
  classifyGoalError,
  goalPausedNotification,
  goalUnrecoverableNotification,
  getGoalStateForPersistence,
  restoreGoalState,
  resetGoalStateForTesting,
  type GoalStateSnapshot,
} from '../../src/engine'

beforeEach(() => {
  resetGoalStateForTesting()
})

describe('P2 goal 跑动中错误恢复（paused 状态机）', () => {
  test('可恢复错误 → pauseGoal → paused + 条件不丢', () => {
    armGoal('ship the parser')
    pauseGoal('API rate limited (429)')
    expect(isGoalArmed()).toBe(true) // 仍 armed（paused 是 armed 子态）
    expect(isGoalPaused()).toBe(true)
    expect(getGoalCondition()).toBe('ship the parser') // 条件不丢
  })

  test('resumeGoal → paused→armed（配额恢复后续跑）', () => {
    armGoal('ship it')
    pauseGoal('quota exhausted')
    expect(isGoalPaused()).toBe(true)
    resumeGoal()
    expect(isGoalPaused()).toBe(false)
    expect(isGoalArmed()).toBe(true)
    expect(getGoalCondition()).toBe('ship it') // resume 后条件仍在
  })

  test('暂停说明行在场 + 含原因', () => {
    const note = goalPausedNotification('API rate limited (429)')
    expect(note).toContain('paused')
    expect(note).toContain('429')
  })

  test('paused 持久化快照 round-trip（resume 后恢复 armed）', () => {
    armGoal('persist me')
    pauseGoal('transient 5xx')
    const snap: GoalStateSnapshot = getGoalStateForPersistence()
    expect(snap.armed).toBe(true)
    expect(snap.condition).toBe('persist me')
    // 恢复后 armed 态不丢（paused 标记不跨 session——每 session 重判）
    resetGoalStateForTesting()
    restoreGoalState(snap)
    expect(isGoalArmed()).toBe(true)
    expect(getGoalCondition()).toBe('persist me')
  })
})

describe('P3 不可恢复自清除（cleared + 通知）', () => {
  test('不可恢复错误 → 通知行在场 + 含原因', () => {
    const note = goalUnrecoverableNotification('auth token revoked (401)')
    expect(note).toContain('cleared')
    expect(note).toContain('401')
  })

  test('clearGoal 后不再 armed（fail-closed）', () => {
    armGoal('ship it')
    clearGoal()
    expect(isGoalArmed()).toBe(false)
    expect(isGoalPaused()).toBe(false)
    expect(getGoalCondition()).toBeUndefined()
  })
})

describe('P2/P3 错误分类器 classifyGoalError', () => {
  test('401/403 auth = 不可恢复', () => {
    expect(classifyGoalError(new Error('401 Unauthorized'))).toBe('unrecoverable')
    expect(classifyGoalError(new Error('403 Forbidden'))).toBe('unrecoverable')
  })

  test('上下文溢出 = 不可恢复', () => {
    expect(classifyGoalError(new Error('context length exceeded'))).toBe('unrecoverable')
    expect(classifyGoalError(new Error('prompt too long'))).toBe('unrecoverable')
  })

  test('429/5xx/连接抖动 = 可恢复（pause + retry）', () => {
    expect(classifyGoalError(new Error('429 Too Many Requests'))).toBe('recoverable')
    expect(classifyGoalError(new Error('500 Internal Server Error'))).toBe('recoverable')
    expect(classifyGoalError(new Error('502 Bad Gateway'))).toBe('recoverable')
    expect(classifyGoalError(new Error('ECONNRESET'))).toBe('recoverable')
  })

  test('未知错误 = 可恢复（fail-safe pause，不误清 goal）', () => {
    expect(classifyGoalError(new Error('something weird'))).toBe('recoverable')
    expect(classifyGoalError(new Error(''))).toBe('recoverable')
  })
})
