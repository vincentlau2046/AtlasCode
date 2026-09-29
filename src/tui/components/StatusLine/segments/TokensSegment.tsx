// Tokens in/out segment——累计输入/输出 token
// 数据源：input.context_window.total_input_tokens / total_output_tokens

import * as React from 'react'
import { Text } from '../../../ink.js'
import type { SegmentComponent } from './types.js'

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export const TokensInSegment: SegmentComponent = ({ input }) => {
  const cw = input.context_window
  if (!cw) return null
  return <Text dimColor>⇊ in {formatK(cw.total_input_tokens)}</Text>
}

export const TokensOutSegment: SegmentComponent = ({ input }) => {
  const cw = input.context_window
  if (!cw) return null
  return <Text dimColor>⇈ out {formatK(cw.total_output_tokens)}</Text>
}
