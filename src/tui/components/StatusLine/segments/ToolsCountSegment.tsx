// Tools count segment——工具调用统计 🔧 7 calls ✅ 5 ✗ 1
// 数据源：从 ctx.messages 派生
// - assistant 消息 content[].type === 'tool_use' → 总调用数
// - user 消息 content[].type === 'tool_result' → is_error 判断成败
// 替换原 "🔧 ready" 占位

import * as React from 'react'
import { Text } from '../../../ink.js'
import type { SegmentComponent } from './types.js'

interface ContentBlock {
  type: string
  id?: string
  is_error?: boolean
}
interface MessageLike {
  type: string
  message?: {
    content?: ContentBlock[]
  }
}

export const ToolsCountSegment: SegmentComponent = (ctx) => {
  const messages = ctx.messages as MessageLike[] | undefined
  if (!messages || messages.length === 0) return null

  let total = 0
  let ok = 0
  let err = 0

  for (const msg of messages) {
    const content = msg?.message?.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (block.type === 'tool_use') {
        total++
      } else if (block.type === 'tool_result') {
        if (block.is_error) {
          err++
        } else {
          ok++
        }
      }
    }
  }

  if (total === 0) return null

  return (
    <Text dimColor>
      🔧 {total} calls{' '}
      <Text color="green">✅ {ok}</Text>{' '}
      {err > 0 && <Text color="red">✗ {err}</Text>}
    </Text>
  )
}
