// useDebugEventTracker——观察 messages 变化，将 tool_use/tool_result 推入环形 buffer
// 架构红线 §9.9.1：不碰 core/QueryEngine，纯 TUI 层观察消息流

import { useEffect, useRef } from 'react'
import type { Message } from '../../types/message.js'
import {
  pushDebugEvent,
  truncateSummary,
} from './debugEventBuffer.js'

/** 已处理过的 toolUseId 集合（避免重复推入） */
const processedIds = new Set<string>()

/**
 * 观察 messages 数组变化，检测新的 tool_use / tool_result 块并推入 debug buffer。
 * 在 REPL 层调用，不碰 core。
 */
export function useDebugEventTracker(messages: Message[]): void {
  const prevLenRef = useRef(0)

  useEffect(() => {
    const prevLen = prevLenRef.current
    if (messages.length <= prevLen) {
      prevLenRef.current = messages.length
      return
    }

    // 只看新增的消息
    for (let i = prevLen; i < messages.length; i++) {
      const msg = messages[i]
      if (!msg) continue

      // assistant 消息里的 tool_use 块
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block?.type === 'tool_use' && !processedIds.has(block.id)) {
            processedIds.add(block.id)
            pushDebugEvent({
              type: 'tool_call',
              toolName: block.name,
              toolUseId: block.id,
              timestamp: typeof msg.timestamp === 'number'
                ? msg.timestamp
                : Date.now(),
              inputSummary: truncateSummary(
                typeof block.input === 'string'
                  ? block.input
                  : JSON.stringify(block.input ?? {}),
              ),
            })
          }
        }
      }

      // user 消息里的 tool_result 块（SDK 把 tool_result 包在 user 消息里）
      if (msg.type === 'user' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block?.type === 'tool_result' && !processedIds.has(`result-${block.tool_use_id}`)) {
            processedIds.add(`result-${block.tool_use_id}`)
            const content = Array.isArray(block.content)
              ? block.content.map(c => typeof c === 'string' ? c : c?.text ?? '').join('')
              : typeof block.content === 'string' ? block.content : ''
            pushDebugEvent({
              type: 'tool_result',
              toolName: '', // tool_result 块不带 name，从 toolUseId 关联
              toolUseId: block.tool_use_id,
              timestamp: typeof msg.timestamp === 'number'
                ? msg.timestamp
                : Date.now(),
              status: block.is_error ? 'error' : 'success',
              outputSummary: truncateSummary(content),
            })
          }
        }
      }
    }

    prevLenRef.current = messages.length
  }, [messages])
}
