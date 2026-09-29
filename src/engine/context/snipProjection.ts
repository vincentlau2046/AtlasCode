/**
 * engine/context — snip 投影面（W2-2-pre 缺面先迁④，§8.74.2/§8.74.9）：
 * 旧仓 core/orchestrator/context/snipProjection.ts 57L 全量移植（纯函数
 * 零 I/O；engine shared Message 松散型经 index 签名访问 subtype）。
 *
 * snip 族裁断（§8.74.9）：snipCompact.ts 265L（LLM-bound 摘要 + 旧仓
 * snip 域 getMessagesAfterCompactBoundary 消费链）= 前向接缝不迁，owner
 * = W3 活链路接线 / E-wave-end 审计；本文件仅投影视图 3 函数（判别单测
 * 覆盖）。
 */
import type { Message } from '../../shared'

/**
 * snip 边界谓词（旧仓逐字）：system 消息 subtype='snip_boundary' 标记 snip
 * 压缩分裂点（更早轮次已被压缩摘要替换）。
 */
export function isSnipBoundaryMessage(message: Message): boolean {
  return (
    message?.type === 'system' && message.subtype === 'snip_boundary'
  )
}

/**
 * 投影消息列表至**模型可见** snip 视图（旧仓逐字）：模型不应看到最近
 * snip 边界之前的轮次（已被摘要替换）；仅返回最后一个 snip_boundary
 * 之后的消息（边界自身不含——下游 normalizeMessagesForAPI 过滤）。
 * 无边界 = 原数组原引用返回。
 */
export function projectSnippedView<T extends Message = Message>(
  messages: T[],
): T[] {
  let boundaryIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isSnipBoundaryMessage(messages[i]!)) {
      boundaryIdx = i
      break
    }
  }
  if (boundaryIdx === -1) return messages
  // 边界自身不含（下游 normalizeMessagesForAPI 处理）。
  return messages.slice(boundaryIdx + 1)
}

/** 便捷别名（旧仓逐字）：等价 projectSnippedView。 */
export function snipProjection<T extends Message = Message>(
  messages: T[],
): T[] {
  return projectSnippedView(messages)
}
