/**
 * P1a Decisions 页 ring buffer（decisionLog）判别单测。
 * 被测：append-only + cap 50 丢最旧 + 稳定快照引用 + signal 发射。
 * 分层纪律：纯 TUI leaf（无网络/无盘/无 PTY/无 React 渲染）。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  getDecisionLog,
  recordDecision,
  resetDecisionLogForTests,
  subscribeToDecisionLog,
} from '../../src/tui/utils/decisionLog'

describe('P1a decisionLog', () => {
  beforeEach(() => {
    resetDecisionLogForTests()
  })

  test('初始空（稳定空快照）', () => {
    const s1 = getDecisionLog()
    expect(s1).toEqual([])
    expect(getDecisionLog()).toBe(s1)
  })

  test('recordDecision 按序追加（含字段透传）', () => {
    recordDecision('allow', 'Bash', 't1', undefined)
    recordDecision('deny', 'Edit', 't2', { type: 'mode', mode: 'default' })
    const log = getDecisionLog()
    expect(log.length).toBe(2)
    expect(log[0].behavior).toBe('allow')
    expect(log[0].toolName).toBe('Bash')
    expect(log[0].toolUseID).toBe('t1')
    expect(log[0].reason).toBeUndefined()
    expect(log[1].behavior).toBe('deny')
    expect(log[1].reason).toEqual({ type: 'mode', mode: 'default' })
    expect(typeof log[1].at).toBe('number')
  })

  test('cap 50：第 51 条记录时丢最旧', () => {
    for (let i = 0; i < 55; i++) {
      recordDecision('ask', `tool${i}`, `id${i}`, undefined)
    }
    const log = getDecisionLog()
    expect(log.length).toBe(50)
    expect(log[0].toolName).toBe('tool5')
    expect(log[49].toolName).toBe('tool54')
  })

  test('快照引用仅变更时换新（useSyncExternalStore 契约）', () => {
    const s1 = getDecisionLog()
    expect(getDecisionLog()).toBe(s1)
    recordDecision('allow', 'Bash', 't1', undefined)
    const s2 = getDecisionLog()
    expect(s2).not.toBe(s1)
    expect(getDecisionLog()).toBe(s2)
  })

  test('变更发射 signal（订阅者感知一次）', () => {
    let emitted = 0
    const unsub = subscribeToDecisionLog(() => {
      emitted += 1
    })
    recordDecision('allow', 'Bash', 't1', undefined)
    expect(emitted).toBe(1)
    recordDecision('deny', 'Edit', 't2', undefined)
    expect(emitted).toBe(2)
    unsub()
    recordDecision('ask', 'Read', 't3', undefined)
    expect(emitted).toBe(2)
  })
})
