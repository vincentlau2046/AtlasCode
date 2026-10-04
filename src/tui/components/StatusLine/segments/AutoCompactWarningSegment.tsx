// Auto-compact-warning segment——P0b② 熔断预警「将自动压缩，可 /rewind 回退」
//
// autoCompact 档位接 statusline：当前上下文用量进入 autoCompact 阈值预警区
// （阈值 − 20k 缓冲 = calculateTokenWarningState.isAboveWarningThreshold）且
// autoCompact 启用时，提示"即将自动压缩，可 /rewind 回退"（给用户一个撤销点，
// 而非压缩后才发现）。
//
// 数据：ctx.input.context_window.current_usage（input 侧占用，与 ContextBar "used"
// 口径一致）+ ctx.input.model.id。纯读 at-render（无 hook，hook 安全）。
// engine 面经 src/engine 门面（calculateTokenWarningState model-string 形 +
// isAutoCompactEnabled 0 参形），TUI→engine 单向边（无环）。

import * as React from 'react'
import { Text } from '../../../ink.js'
import {
  calculateTokenWarningState,
  isAutoCompactEnabled,
} from 'src/engine'
import { type SegmentComponent, type StatusLineCommandInputLike } from './types.js'

/** input 侧上下文占用 = input + cache_creation + cache_read（ContextBar "used" 口径）。 */
function usedContextTokens(cw: StatusLineCommandInputLike['context_window']): number {
  const u = cw?.current_usage
  if (!u) return 0
  return (
    (u.input_tokens ?? 0) +
    (u.cache_creation_input_tokens ?? 0) +
    (u.cache_read_input_tokens ?? 0)
  )
}

export const AutoCompactWarningSegment: SegmentComponent = ({ input }) => {
  const cw = input.context_window
  const modelId = input.model?.id
  if (!cw || !modelId) return null
  // autoCompact 关 → 不会自动压缩 → 阈值退化为 full window，无"将压缩"预警
  if (!isAutoCompactEnabled()) return null
  const state = calculateTokenWarningState(usedContextTokens(cw), modelId)
  // 达 autoCompact 阈值前（阈值 − 20k 缓冲预警区）→ 提示可 /rewind 回退
  if (!state.isAboveWarningThreshold) return null
  return (
    <Text color="yellow">
      将自动压缩，可 /rewind 回退
    </Text>
  )
}
