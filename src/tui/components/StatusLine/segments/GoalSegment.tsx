// Goal segment——footer goal 指示器（0.1.62 /goal C0-4）
// goal armed 时右对齐 chip 显示「🎯 <condition>」（截断）；
// 未 armed = null（零渲染，零回归）。
//
// 0.1.63 P7（CC 演化 2.1.173→2.1.295）：空闲 5Hz 零重渲染。StatusLine 按
// 5Hz 重渲染（elapsed/_tokens 活刷新），但 goal 状态（armed/condition）不
// 随 5Hz 变化——仅 arm/clear/pause/resume 时变更。模块级缓存：goal 状态
// 不变 → 返回同一缓存节点引用（零 JSX 构造 + 零截断计算）；状态变更 →
// 缓存失效重算。判别力 = 多次调用引用相等断言（空闲零重渲染）。

import * as React from 'react'
import { Text } from '../../../ink.js'
import { isGoalArmed, getGoalCondition } from '../../../../engine/index.js'
import { truncateToWidth } from './types.js'
import type { SegmentComponent } from './types.js'

// chip 前缀 + 最大条件显示宽度（CJK 宽度近似 = 字符数上限）
const GOAL_PREFIX = '🎯 '
const MAX_GOAL_DISPLAY_CHARS = 40

// P7 缓存：goal 状态（armed + condition）不变 → 返回同一节点引用
let _cachedArmed = false
let _cachedCondition: string | undefined
let _cachedNode: React.ReactNode = null

/** 测试复位（单测隔离惯例——缓存归 null 强制首次重算）。 */
export function resetGoalSegmentCache(): void {
  _cachedArmed = false
  _cachedCondition = undefined
  _cachedNode = null
}

export const GoalSegment: SegmentComponent = () => {
  const armed = isGoalArmed()
  const condition = getGoalCondition()
  // goal 状态不变 → 缓存命中（5Hz 空闲零重渲染）
  if (armed === _cachedArmed && condition === _cachedCondition) {
    return _cachedNode
  }
  // 状态变更 → 缓存失效重算
  _cachedArmed = armed
  _cachedCondition = condition
  if (!armed) {
    _cachedNode = null
  } else {
    const truncated = truncateToWidth(condition ?? '', MAX_GOAL_DISPLAY_CHARS)
    _cachedNode = (
      <Text color="yellow">
        {GOAL_PREFIX}
        {truncated}
      </Text>
    )
  }
  return _cachedNode
}
