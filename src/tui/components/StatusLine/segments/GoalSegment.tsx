// Goal segment——footer goal 指示器（0.1.62 /goal C0-4）
// goal armed 时右对齐 chip 显示「🎯 <condition>」（截断）；
// 未 armed = null（零渲染，零回归）。
// 空闲零重渲染面归 0.1.63 P7——本波仅指示器在场（StatusLine 重渲染时更新）。

import * as React from 'react'
import { Text } from '../../../ink.js'
import { isGoalArmed, getGoalCondition } from '../../../../engine/index.js'
import { truncateToWidth } from './types.js'
import type { SegmentComponent } from './types.js'

// chip 前缀 + 最大条件显示宽度（CJK 宽度近似 = 字符数上限）
const GOAL_PREFIX = '🎯 '
const MAX_GOAL_DISPLAY_CHARS = 40

export const GoalSegment: SegmentComponent = () => {
  if (!isGoalArmed()) return null
  const condition = getGoalCondition() ?? ''
  const truncated = truncateToWidth(condition, MAX_GOAL_DISPLAY_CHARS)
  return (
    <Text color="yellow">
      {GOAL_PREFIX}
      {truncated}
    </Text>
  )
}
