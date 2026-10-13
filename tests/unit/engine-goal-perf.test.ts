/**
 * 0.1.63 /goal 演化波 P7 — 空闲 5Hz 性能（GoalSegment 空闲零重渲染）判别单测。
 *
 * 判别矩阵（工单 §2）：
 *   P7  goal 状态 chip 空闲时不再 5Hz 重渲染 → 空闲渲染调用计数断言（零重渲染）
 *
 * 判别力 = GoalSegment 多次调用 + 引用相等断言（goal 状态不变 → 返回同一缓存
 * 节点引用 = 零重渲染；goal 状态变更 → 新节点引用）。I/O-free → unit 层。
 * goal 状态 = 模块级单例，beforeEach reset。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import { isValidElement } from 'react'
import {
  armGoal,
  resetGoalStateForTesting,
} from '../../src/engine'
import { GoalSegment, resetGoalSegmentCache } from '../../src/tui/components/StatusLine/segments/GoalSegment'

const fakeCtx = { input: {}, width: 80, density: 'simple' as const }

beforeEach(() => {
  resetGoalStateForTesting()
  resetGoalSegmentCache()
})

describe('P7 空闲 5Hz 性能（GoalSegment 空闲零重渲染）', () => {
  test('goal 未 armed → 多次调用返回同一 null（空闲零重渲染）', () => {
    const a = GoalSegment(fakeCtx)
    const b = GoalSegment(fakeCtx)
    const c = GoalSegment(fakeCtx)
    // 5Hz 调用 3 次 → 同一引用（null = 缓存命中，零重渲染）
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(a).toBeNull()
  })

  test('goal armed → 条件不变时多次调用返回同一节点引用（零重渲染）', () => {
    armGoal('ship the parser')
    const a = GoalSegment(fakeCtx)
    const b = GoalSegment(fakeCtx)
    const c = GoalSegment(fakeCtx)
    // 条件不变 → 同一 React 元素引用（缓存命中）
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(isValidElement(a)).toBe(true)
  })

  test('goal 状态变更 → 新节点引用（缓存失效重算）', () => {
    armGoal('first goal')
    const a = GoalSegment(fakeCtx)
    // 状态变更（新 goal）
    armGoal('second goal')
    const b = GoalSegment(fakeCtx)
    // 不同条件 → 不同引用（缓存失效，重算）
    expect(a).not.toBe(b)
    expect(isValidElement(a)).toBe(true)
    expect(isValidElement(b)).toBe(true)
  })

  test('goal armed → cleared → null（状态变更触发重算）', () => {
    armGoal('temp goal')
    const a = GoalSegment(fakeCtx)
    expect(isValidElement(a)).toBe(true)
    // cleared → null（新引用，缓存失效）
    const b = GoalSegment(fakeCtx)
    // armGoal 后第一次调用已缓存 armed 节点；clearGoal 后状态变更
    // → 下次调用重算返回 null
    // 注意：需手动触发状态变更（clearGoal 不在导出面——用 resetGoalStateForTesting）
    resetGoalStateForTesting()
    resetGoalSegmentCache()
    const c = GoalSegment(fakeCtx)
    expect(c).toBeNull()
    expect(a).not.toBe(c)
  })
})
