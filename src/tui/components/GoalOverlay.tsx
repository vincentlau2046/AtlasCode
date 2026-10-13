// Goal overlay panel——0.1.62 /goal C0-3（CC 2.1.139 live elapsed/turns/tokens）。
// 活面板三要素 = elapsed（wall + API 时长）/ turns（对话 assistant 轮次）/
// tokens（in+out），叠加 armed goal 条件（未 armed 显示占位行）。
// 纯展示组件：三要素 + 条件全走 props（cost-tracker getter + 消息计数 +
// goalState 的组装面在调用方 goal.tsx，组件保持纯展示易判别单测）。
//
// 0.1.63 P7（CC 演化 2.1.173→2.1.295）：空闲 5Hz 零重渲染。未 armed 时
// 面板内容静态（elapsed/turns/tokens 不变——无活跑），React.memo 按 armed
// 短路：未 armed 且 props 未变 → 跳过重渲染。armed 时活面板仍 5Hz 刷新
// （elapsed 实时变化 = 预期行为，非空闲）。

import * as React from 'react'
import { Box, Text } from '../ink.js'
import { formatDuration, formatTokens } from '../utils/format.js'

export type GoalOverlayProps = {
  /** goal 是否 armed（C0-1 状态机读面）。 */
  armed: boolean
  /** armed goal 条件（未 armed = null）。 */
  condition: string | null
  /** 会话 assistant 轮次（turns 计数器组装）。 */
  turns: number
  /** 会话 wall 累计时长（cost-tracker getTotalDuration，ms）。 */
  elapsedMs: number
  /** API 累计时长（cost-tracker getTotalAPIDuration，ms）。 */
  apiMs: number
  /** 累计输入 tokens（cost-tracker getTotalInputTokens）。 */
  inTokens: number
  /** 累计输出 tokens（cost-tracker getTotalOutputTokens）。 */
  outTokens: number
}

function GoalOverlayInner({
  armed,
  condition,
  turns,
  elapsedMs,
  apiMs,
  inTokens,
  outTokens,
}: GoalOverlayProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderDimColor
      paddingX={1}
      paddingY={1}
    >
      <Text bold color="yellow">
        {'🎯 Goal'}
      </Text>
      <Text>{armed ? (condition ?? '') : '(no goal armed)'}</Text>
      <Text dimColor>
        {`Elapsed ${formatDuration(elapsedMs)} · API ${formatDuration(apiMs)}`}
      </Text>
      <Text dimColor>{`Turns ${turns}`}</Text>
      <Text dimColor>
        {`Tokens ${formatTokens(inTokens)} in · ${formatTokens(outTokens)} out`}
      </Text>
    </Box>
  )
}

/**
 * P7：React.memo 空闲零重渲染。未 armed 时 elapsed/turns/tokens 不参与
 * 用户可见面（面板显示占位行），memo 按 props 浅比较跳过重渲染。armed 时
 * props 变化（elapsedMs 随 5Hz 递增）→ 正常重渲染（活面板预期行为）。
 */
export const GoalOverlay = React.memo(GoalOverlayInner)
