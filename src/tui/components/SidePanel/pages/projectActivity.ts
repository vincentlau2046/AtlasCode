// P1a Activity 页（spec 页 3）——消息流 tool_use/tool_result 只读投影
// （纯函数，判别单测可测；零主循环写，红线 2）。
// 数据源 = 主布局传入的 messages（与消息流同源，无额外获取）。

import type { Message } from '../../../types/message.js'
import { jsonStringify } from '../../../utils/slowOperations.js'

export type ActivityStatus = 'ok' | 'error' | 'pending'

export interface ToolActivityItem {
  name: string
  summary: string
  status: ActivityStatus
}

const MAX_ITEMS = 12

/** 工具入参单行摘要（常见工具首选字段，其余 = 截断 JSON）。 */
function summarizeInput(input: unknown): string {
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>
    const first = obj.command ?? obj.file_path ?? obj.pattern ?? obj.query
    if (typeof first === 'string' && first.length > 0) {
      return first.length > 60 ? first.slice(0, 57) + '…' : first
    }
  }
  const s = jsonStringify(input ?? {})
  return s.length > 60 ? s.slice(0, 57) + '…' : s
}

/** 最近 MAX_ITEMS 条 tool_use + 对应 tool_result 状态（ok/error/pending）。 */
export function projectToolActivity(messages: Message[]): ToolActivityItem[] {
  // 第一遍：tool_result 结果（user 侧消息 content 块）
  const statusById = new Map<string, 'ok' | 'error'>()
  for (const m of messages) {
    if (m.type !== 'user') continue
    const content = (m as { message?: { content?: unknown } }).message?.content
    if (!Array.isArray(content)) continue
    for (const b of content) {
      const block = b as
        | { type?: string; tool_use_id?: string; is_error?: boolean }
        | undefined
      if (block && block.type === 'tool_result' && block.tool_use_id) {
        statusById.set(block.tool_use_id, block.is_error ? 'error' : 'ok')
      }
    }
  }
  // 第二遍：tool_use 块（assistant 侧），取最近 MAX_ITEMS
  const all: Array<{ id: string; item: ToolActivityItem }> = []
  for (const m of messages) {
    if (m.type !== 'assistant') continue
    const content = (m as { message?: { content?: unknown } }).message?.content
    if (!Array.isArray(content)) continue
    for (const b of content) {
      const block = b as
        | { type?: string; id?: string; name?: string; input?: unknown }
        | undefined
      if (!block || block.type !== 'tool_use' || !block.id) continue
      all.push({
        id: block.id,
        item: {
          name: block.name ?? 'tool',
          summary: summarizeInput(block.input),
          status: 'pending',
        },
      })
    }
  }
  return all
    .slice(-MAX_ITEMS)
    .map(x => ({ ...x.item, status: statusById.get(x.id) ?? 'pending' }))
}
