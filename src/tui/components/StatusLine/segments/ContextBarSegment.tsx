// Context segment——纯文字上下文用量（合并原 context-bar + context-absolute）
// 格式：93.6k/262k tok (36%)
// 色阶（§4.3，2026-10-05 §4b B2 改）：<70% cyan（正常，对齐 model 段）/
// 70-90% 黄 / >90% 红
// 进度条砍除：数字本身是最好的进度指示，方块条视觉粗糙且信息密度低
//
// B2（P0b② 持续监控）：autoCompact 熔断预警折入本段——独立
// auto-compact-warning segment 删除。autoCompact 启用且用量进入阈值预警区
// （阈值 − 20k 缓冲 = calculateTokenWarningState.isAboveWarningThreshold，
// 与被删段同一数据源/谓词）→ 尾部黄 ▲。autoCompact 关 → 不会自动压缩 →
// 无预警。纯读 at-render（无 hook，hook 安全）；engine 面经 src/engine
// 门面（model-string 形 + 0 参形），TUI→engine 单向边（无环）。

import * as React from 'react'
import { Text } from '../../../ink.js'
import {
  calculateTokenWarningState,
  isAutoCompactEnabled,
} from 'src/engine'
import {
  contextColorForPercentage,
  type SegmentComponent,
  type StatusLineCommandInputLike,
} from './types.js'

function formatK(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

/** input 侧上下文占用 = input + cache_creation + cache_read（"used" 口径，▲ 谓词数据源） */
function usedContextTokens(
  cw: StatusLineCommandInputLike['context_window'],
): number {
  const u = cw?.current_usage
  if (!u) return 0
  return (
    (u.input_tokens ?? 0) +
    (u.cache_creation_input_tokens ?? 0) +
    (u.cache_read_input_tokens ?? 0)
  )
}

export const ContextBarSegment: SegmentComponent = ({ input }) => {
  const cw = input.context_window
  if (!cw) return null

  const pct = cw.used_percentage ?? null
  const used = usedContextTokens(cw)
  const total = cw.context_window_size

  if (pct == null) {
    // 无数据时 dim 占位（不固定宽度——数字自解释，无数据段直接隐藏更好）
    return null
  }

  const color = contextColorForPercentage(pct)
  // B2：熔断预警（复用被删 AutoCompactWarningSegment 的谓词）
  const modelId = input.model?.id
  const showCompactWarning =
    modelId != null &&
    isAutoCompactEnabled() &&
    calculateTokenWarningState(used, modelId).isAboveWarningThreshold
  return (
    <Text color={color}>
      ▤ {formatK(used)}/{formatK(total)} tok ({pct}%)
      {showCompactWarning && <Text color="yellow"> ▲</Text>}
    </Text>
  )
}
