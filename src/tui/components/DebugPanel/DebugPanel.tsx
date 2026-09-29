// DebugPanel 组件——调试事件面板
// 17-TUI设计方案 §9.6：左下角固定区域，环形 buffer + useInterval 轮询
// debug 密度档（ctrl+shift+b 第三态）激活时自动显示

import * as React from 'react'
import { Box, Text, useInterval } from '../../ink.js'
import { useSyncExternalStore } from 'react'
import {
  subscribeToDebugEvents,
  getDebugEventSnapshot,
  type DebugEvent,
} from './debugEventBuffer.js'

export function DebugPanel(): React.ReactNode {
  const events = useSyncExternalStore(subscribeToDebugEvents, getDebugEventSnapshot)

  // debug 密度档已砍除（两态 compact/detailed），DebugPanel 暂不显示
  // 保留组件骨架，后续若恢复 debug 态或改为 detailed 附加面板时复用
  if (events.length === 0) return null

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="dim" paddingX={1}>
      <Text dimColor bold>🔧 Debug Events ({events.length})</Text>
      <Box flexDirection="column">
        {events.slice(0, 8).map((ev, i) => {
          const time = new Date(ev.timestamp)
          const timeStr = `${String(time.getMinutes()).padStart(2, '0')}:${String(time.getSeconds()).padStart(2, '0')}`

          if (ev.type === 'tool_call') {
            return (
              <Box key={`${ev.toolUseId}-${i}`} gap={1}>
                <Text dimColor>{timeStr}</Text>
                <Text color="cyan">→</Text>
                <Text color="cyan" wrap="truncate">{ev.toolName}</Text>
                {ev.inputSummary && (
                  <Text dimColor wrap="truncate">{ev.inputSummary}</Text>
                )}
              </Box>
            )
          }

          // tool_result
          const statusColor = ev.status === 'error' ? 'red' : 'green'
          const statusIcon = ev.status === 'error' ? '✗' : '✓'
          return (
            <Box key={`${ev.toolUseId}-${i}`} gap={1}>
              <Text dimColor>{timeStr}</Text>
              <Text color={statusColor}>{statusIcon}</Text>
              <Text color={statusColor} wrap="truncate">{ev.toolName}</Text>
              {ev.durationMs != null && (
                <Text dimColor>{ev.durationMs}ms</Text>
              )}
              {ev.outputSummary && (
                <Text dimColor wrap="truncate">{ev.outputSummary}</Text>
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
