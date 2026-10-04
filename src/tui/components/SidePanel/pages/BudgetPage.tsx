// P1a Budget 页（spec 页 5 还剩多少 + 谁在答）：三层只读投影——
// ① 模型摘要层（spec 信任线「谁在答」直达目标：主循环模型 + 按模型用量）
// ② 上下文窗口（占用 % + autoCompact 状态，与 StatusLine ContextBar 同源
//   口径：getCurrentUsage + getContextWindowForModel + calculateContextPercentages）
// ③ 会话累计（cost-tracker 既有 getter）。全部只读，零主循环写（红线 2）。

import * as React from 'react'
import { Box, Text } from '../../../ink.js'
import { useMainLoopModel } from '../../../hooks/useMainLoopModel.js'
import { getCurrentUsage } from '../../../utils/tokens.js'
import {
  calculateContextPercentages,
  getContextWindowForModel,
} from '../../../utils/context.js'
import { calculateTokenWarningState, isAutoCompactEnabled } from 'src/engine'
import {
  getTotalCacheReadInputTokens,
  getTotalInputTokens,
  getTotalOutputTokens,
  getModelUsage,
} from '../../../cost-tracker.js'
import type { Message } from '../../../types/message.js'

function fmtTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

export function BudgetPage({ messages }: { messages: Message[] }): React.ReactNode {
  const model = useMainLoopModel()
  const usage = getCurrentUsage(messages)
  const ctxWindow = getContextWindowForModel(model)
  const { used, remaining } = calculateContextPercentages(usage, ctxWindow)
  const usedTokens = usage
    ? usage.input_tokens +
      usage.cache_creation_input_tokens +
      usage.cache_read_input_tokens
    : 0
  const warn = calculateTokenWarningState(usedTokens, model)
  const autoOn = isAutoCompactEnabled()
  const byModel = Object.entries(getModelUsage()).sort(
    (a, b) =>
      b[1].inputTokens + b[1].outputTokens - (a[1].inputTokens + a[1].outputTokens),
  )
  const topModel = byModel[0]
  return (
    <Box flexDirection="column">
      <Text bold>谁在答（模型摘要）</Text>
      <Text>主循环模型：{model}</Text>
      {topModel ? (
        <Text dimColor>
          {`用量 top: ${topModel[0]}（in ${fmtTokens(topModel[1].inputTokens)} / out ${fmtTokens(
            topModel[1].outputTokens,
          )}）`}
        </Text>
      ) : null}
      <Text bold>还剩多少（上下文窗口）</Text>
      <Text>
        {used !== null && remaining !== null
          ? `已用 ${Math.round(used)}% · 余 ${Math.round(remaining)}%（窗口 ${fmtTokens(ctxWindow)}）`
          : '暂无用量数据'}
      </Text>
      <Text dimColor>
        {`自动压缩：${autoOn ? '已启用' : '已停用'}`}
        {warn.isAboveAutoCompactThreshold ? ' · 已超自动压缩阈值' : ''}
        {warn.isAboveWarningThreshold && !warn.isAboveAutoCompactThreshold
          ? ' · 预警区'
          : ''}
      </Text>
      <Text bold>会话累计</Text>
      <Text dimColor>
        {`in ${fmtTokens(getTotalInputTokens())} · out ${fmtTokens(getTotalOutputTokens())} · cache-read ${fmtTokens(getTotalCacheReadInputTokens())}`}
      </Text>
    </Box>
  )
}
