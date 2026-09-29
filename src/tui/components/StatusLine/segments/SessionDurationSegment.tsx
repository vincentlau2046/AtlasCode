// Session duration segment——会话时长 ⏱ 1h23m
// 数据源：ctx.messages[0].timestamp（首条消息时间戳）→ Date.now() 反算
// getTotalDuration 是 bootstrap 桩函数（返回 undefined），不能直接用

import * as React from 'react'
import { Text } from '../../../ink.js'
import type { SegmentComponent } from './types.js'

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`
  return `${m}m`
}

export const SessionDurationSegment: SegmentComponent = (ctx) => {
  const messages = ctx.messages as Array<{ timestamp?: string }> | undefined
  if (!messages || messages.length === 0) return null

  const first = messages[0]
  if (!first?.timestamp) return null

  const start = new Date(first.timestamp).getTime()
  if (isNaN(start)) return null

  const elapsed = Date.now() - start
  if (elapsed < 0) return null

  return (
    <Text dimColor>
      ⏱ {formatDuration(elapsed)}
    </Text>
  )
}
