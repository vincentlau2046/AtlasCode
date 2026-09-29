/**
 * engine/context — reactive-compact 谓词面（W2-2-pre 缺面先迁④，§8.74.2/§8.74.9）：
 * 旧仓 core/orchestrator/context/reactiveCompact.ts 4 纯谓词移植（stream-level
 * 413/media 错误 withholding 判定；零 I/O，env 读侧 = isReactiveCompactEnabled /
 * isReactiveOnlyMode 两枚，config 面读语义与旧仓逐字）。
 *
 * reactive-compact 裁断（§8.74.9）：
 *   - 4 谓词（isReactiveCompactEnabled / isWithheldPromptTooLong /
 *     isWithheldMediaSizeError / isReactiveOnlyMode）= 零依赖纯函数 → 移植。
 *   - 2 LLM-bound 入口（tryReactiveCompact / reactiveCompactOnPromptTooLong）
 *     依赖 tui 富 compactConversation（ToolUseContext + CacheSafeParams fork 支）
 *     + buildPostCompactMessages → **前向接缝不迁**（H6 防空洞：engine 窄 spine
 *     compactConversation 为 DI summarize 单调用体，与 tui 富体契约不匹配；迁移
 *     = 需先迁 fork 支 = 引擎面膨胀，归 W-opt）。owner = W-opt 优化波。
 * 本模块 REACTIVE_COMPACT 为 ant-only feature（feature() env 门控缺省 OFF =
 * 死路径零运行时影响，对齐 CACHED_MICROCOMPACT 残留守登记）。
 */
import type { Message } from '../../shared'

/** reactive-compact 子系统运行时开关（旧仓逐字：ATLAS_DISABLE_REACTIVE_COMPACT）。 */
export function isReactiveCompactEnabled(): boolean {
  return process.env.ATLAS_DISABLE_REACTIVE_COMPACT !== 'true'
}

/**
 * 判定 stream 事件（assistant 消息 isApiErrorMessage）是否为 prompt-too-long
 * 错误（reactive compact 应 withholding 以压缩重试，而非向用户暴露错误）。
 * 旧仓逐字。
 */
export function isWithheldPromptTooLong(message: Message): boolean {
  if (message?.type !== 'assistant') return false
  const apiErr = (message as { isApiErrorMessage?: boolean }).isApiErrorMessage
  if (!apiErr) return false
  const content = (message.message as { content?: unknown } | undefined)?.content
  if (!Array.isArray(content)) return false
  return content.some(
    (block: { type?: string; text?: unknown }) =>
      block?.type === 'text' &&
      typeof block.text === 'string' &&
      block.text.startsWith('Prompt is too long'),
  )
}

/**
 * 判定 stream 事件是否为 media-size 错误（图片/resize 校验失败，API 调用前）
 * 应 withholding。旧仓逐字。
 */
export function isWithheldMediaSizeError(message: Message): boolean {
  if (message?.type !== 'assistant') return false
  const apiErr = (message as { isApiErrorMessage?: boolean }).isApiErrorMessage
  if (!apiErr) return false
  const content = (message.message as { content?: unknown } | undefined)?.content
  if (!Array.isArray(content)) return false
  return content.some(
    (block: { type?: string; text?: unknown }) =>
      block?.type === 'text' &&
      typeof block.text === 'string' &&
      block.text.startsWith('Image was too large'),
  )
}

/**
 * reactive-only 模式（旧仓逐字：ATLAS_REACTIVE_ONLY）——主动 auto-compact
 * 全抑制，仅 API 413/media 错误触发 reactive 压缩。
 */
export function isReactiveOnlyMode(): boolean {
  return process.env.ATLAS_REACTIVE_ONLY === 'true'
}
