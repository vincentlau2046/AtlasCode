// Context absolute segment——显示绝对 token 数 "(78k/100k)"
// 仅 detailed 模式使用

import * as React from 'react'
import { Text } from '../../../ink.js'
import type { SegmentComponent } from './types.js'

function formatK(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

export const ContextAbsoluteSegment: SegmentComponent = ({ input }) => {
  const cw = input.context_window
  if (!cw) return null

  const used = (cw.current_usage?.input_tokens ?? 0)
    + (cw.current_usage?.cache_creation_input_tokens ?? 0)
    + (cw.current_usage?.cache_read_input_tokens ?? 0)
  const total = cw.context_window_size

  return (
    <Text dimColor>
      ({formatK(used)}/{formatK(total)})
    </Text>
  )
}
