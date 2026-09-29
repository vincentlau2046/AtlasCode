// Context segment——纯文字上下文用量（合并原 context-bar + context-absolute）
// 格式：93.6k/262k tok (36%)
// 色阶（§4.3）：<50% 绿 / 50-70% 黄 / >70% 红
// 进度条砍除：数字本身是最好的进度指示，方块条视觉粗糙且信息密度低

import * as React from 'react'
import { Text } from '../../../ink.js'
import { contextColorForPercentage, type SegmentComponent } from './types.js'

function formatK(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

export const ContextBarSegment: SegmentComponent = ({ input }) => {
  const cw = input.context_window
  if (!cw) return null

  const pct = cw.used_percentage ?? null
  const used = (cw.current_usage?.input_tokens ?? 0)
    + (cw.current_usage?.cache_creation_input_tokens ?? 0)
    + (cw.current_usage?.cache_read_input_tokens ?? 0)
  const total = cw.context_window_size

  if (pct == null) {
    // 无数据时 dim 占位（不固定宽度——数字自解释，无数据段直接隐藏更好）
    return null
  }

  const color = contextColorForPercentage(pct)

  return (
    <Text color={color}>
      ▤ {formatK(used)}/{formatK(total)} tok ({pct}%)
    </Text>
  )
}
