// Cost segment——当前会话累计成本（时长 + 行数）
// 数据源：input.cost（buildStatusLineCommandInput 已提供 total_duration/lines）

import * as React from 'react'
import { Text } from '../../../ink.js'
import type { SegmentComponent } from './types.js'

export const CostSegment: SegmentComponent = ({ input }) => {
  const cost = input.cost
  if (!cost) return null

  // 显示总 API 耗时（秒）
  const secs = Math.round(cost.total_api_duration_ms / 1000)
  if (secs < 60) {
    return <Text dimColor>{secs}s</Text>
  }
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  return <Text dimColor>{mins}m{remSecs}s</Text>
}
