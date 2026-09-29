// Tok/s segment——基于 transcript JSONL 事后反算解码速度
// 17-TUI设计方案 §9.2 最终决议：从 assistant 条目的 usage.output_tokens + timestamp
// 在窗口内求差/平均（借鉴 ccstatusline speed-metrics 的事后窗口法）。
//
// 数据源：messages 数组（由 StatusLine.tsx 从 messagesRef 传入 SegmentRenderContext）
// 算法：取最近 N 条 assistant 消息，用 (output_tokens差 / timestamp差) 算 tok/s
// 流式期间显示上一请求速率（不更新，直到新 assistant 消息完成）

import * as React from 'react'
import { Text } from '../../../ink.js'
import type { SegmentComponent, SegmentRenderContext } from './types.js'
import { getTokenUsage } from '../../../utils/tokens.js'
import type { Message } from '../../../types/message.js'

// 扩展 SegmentRenderContext：StatusLine.tsx 集成时从 messagesRef 传入
interface TokSRenderContext extends SegmentRenderContext {
  messages?: Message[]
}

/** 从 messages 取最近 N 条有 usage 的 assistant 消息，算 tok/s */
function calculateTokPerSec(messages: Message[] | undefined): number | null {
  if (!messages || messages.length === 0) return null

  // 收集有 usage 的 assistant 消息（从后往前）
  const recent: { outputTokens: number; ts: number }[] = []
  for (let i = messages.length - 1; i >= 0 && recent.length < 5; i--) {
    const msg = messages[i]
    if (msg?.type !== 'assistant') continue
    const usage = getTokenUsage(msg)
    if (!usage || !usage.output_tokens) continue
    const ts = typeof msg.timestamp === 'number'
      ? msg.timestamp
      : typeof msg.timestamp === 'string'
        ? Date.parse(msg.timestamp)
        : NaN
    if (!Number.isFinite(ts)) continue
    recent.push({ outputTokens: usage.output_tokens, ts })
  }

  if (recent.length < 2) {
    // 只有 1 条：用该条 output_tokens / 假设耗时（无法算速率）
    return null
  }

  // recent[0] 是最新的，recent[last] 是最旧的
  // 窗口内总输出 token / 总时间
  const newest = recent[0]
  const oldest = recent[recent.length - 1]
  const totalOutputTokens = recent.reduce((sum, r) => sum + r.outputTokens, 0)
  const elapsedMs = newest.ts - oldest.ts

  if (elapsedMs <= 0) return null

  const seconds = elapsedMs / 1000
  return Math.round(totalOutputTokens / seconds)
}

function formatTokPerSec(tps: number | null): string {
  if (tps == null) return '—'
  if (tps >= 1000) return `${(tps / 1000).toFixed(1)}k t/s`
  return `${tps} t/s`
}

export const TokSegment: SegmentComponent = (ctx: SegmentRenderContext) => {
  const tps = calculateTokPerSec(ctx.messages as Message[] | undefined)

  if (tps == null) {
    // 无数据时固定占位（与 "· NNN t/s" 同宽），避免文本挤压
    return null
  }

  return (
    <Text dimColor>
      ↑ {formatTokPerSec(tps)}
    </Text>
  )
}
