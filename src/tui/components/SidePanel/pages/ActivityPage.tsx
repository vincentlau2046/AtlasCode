// P1a Activity 页（spec 页 3 本回合工具活动）：消息流 tool_use 只读投影
// （projectToolActivity 纯函数）+ 结果概览（ok / error / running）。

import * as React from 'react'
import { Box, Text } from '../../../ink.js'
import type { Message } from '../../../types/message.js'
import { projectToolActivity } from './projectActivity.js'

const STATUS_LABEL = { ok: '✓ 完成', error: '✗ 出错', pending: '… 运行中' } as const
const STATUS_COLOR = { ok: 'green', error: 'red', pending: 'yellow' } as const

export function ActivityPage({ messages }: { messages: Message[] }): React.ReactNode {
  const items = projectToolActivity(messages)
  if (items.length === 0) {
    return <Text dimColor>本会话尚无工具调用</Text>
  }
  return (
    <Box flexDirection="column">
      {items.map((it, i) => (
        <Box key={i} flexDirection="column">
          <Text color={STATUS_COLOR[it.status]}>
            {`${STATUS_LABEL[it.status]}  ${it.name}`}
          </Text>
          {it.summary ? <Text dimColor>{it.summary}</Text> : null}
        </Box>
      ))}
    </Box>
  )
}
