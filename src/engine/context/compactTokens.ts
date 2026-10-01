/**
 * engine/context — 压缩路径 token 工具族（D-2a S3，M5 切端回填）：
 * 旧仓 tui/utils/tokens.ts（getTokenUsage / tokenCountFromLastAPIResponse /
 * tokenCountWithEstimation）+ services/tokenEstimation.ts rough 估算逐字
 * 移植；零 tui 依赖（engine React-free 红线）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  ① SYNTHETIC guard 裁：旧 getTokenUsage/getAssistantMessageId 跳
 *     SYNTHETIC_MESSAGES/SYNTHETIC_MODEL（本地合成 assistant 消息）——合成
 *     消息不经 API 调用无 usage/id 字段，`'usage' in message.message` /
 *     message.id 检查已天然排除 = 行为不变。
 *  ② roughTokenCountEstimationForMessages attachment 分支：旧走
 *     normalizeAttachmentForAPI（tui attachments 域 LLM 面）→ 本移植
 *     JSON 长度/4 估算（保守偏高；truePostCompactTokenCount 为软信号
 *     ——下一轮 shouldAutoCompact 参考量，非正确性路径，近似等价可接受）。
 *  ③ rough 估算 = chars/4（旧 roughTokenCountEstimation 逐字；块级仅 text
 *     块计长，image/document 块 0 = 旧 IMAGE_MAX_TOKEN_SIZE 定值裁面）。
 */
import type { Message, Usage } from '../../shared'

/** 旧 tokens.ts:7 逐字（delta ①：SYNTHETIC guard 裁）。 */
export function getTokenUsage(message: Message): Usage | undefined {
  if (
    message?.type === 'assistant' &&
    message.message &&
    'usage' in (message.message as Record<string, unknown>)
  ) {
    return (message.message as { usage?: Usage }).usage
  }
  return undefined
}

/**
 * 旧 tokens.ts:37 逐字（API 响应 id；同 id = 同一 API 响应的拆分块）。
 * delta ①：SYNTHETIC_MODEL 检查裁（合成消息无 id）。
 */
function getAssistantMessageId(message: Message): string | undefined {
  if (message?.type !== 'assistant' || !message.message) return undefined
  return (message.message as { id?: string }).id
}

/** 旧 tokens.ts:46 逐字（input + cache_creation + cache_read + output）。 */
export function getTokenCountFromUsage(usage: Usage): number {
  return (
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.output_tokens ?? 0)
  )
}

/** 旧 tokens.ts:55 逐字（末条带 usage 消息的 API 调用总上下文量）。 */
export function tokenCountFromLastAPIResponse(messages: Message[]): number {
  let i = messages.length - 1
  while (i >= 0) {
    const message = messages[i]
    const usage = message ? getTokenUsage(message) : undefined
    if (usage) {
      return getTokenCountFromUsage(usage)
    }
    i--
  }
  return 0
}

/** 旧 tokenEstimation.ts:160 逐字（chars/4）。 */
export function roughTokenCountEstimation(content: string): number {
  if (!content) return 0
  return Math.round(content.length / 4)
}

/**
 * 内容 rough 估算（旧 roughTokenCountEstimationForContent 移植，delta ③）。
 */
export function roughTokenCountEstimationForContent(content: unknown): number {
  if (typeof content === 'string') return roughTokenCountEstimation(content)
  if (Array.isArray(content)) {
    let n = 0
    for (const block of content) {
      if (typeof block === 'string') {
        n += roughTokenCountEstimation(block)
      } else if (
        block &&
        typeof block === 'object' &&
        (block as { type?: string }).type === 'text'
      ) {
        n += roughTokenCountEstimation(
          String((block as { text?: unknown }).text ?? ''),
        )
      }
    }
    return n
  }
  return 0
}

/**
 * 消息序列 rough 估算（旧 tokenEstimation.ts:241 移植；user/assistant 走
 * 内容块估算，attachment 走 delta ② JSON 估算）。
 */
export function roughTokenCountEstimationForMessages(
  messages: readonly {
    type?: string
    message?: { content?: unknown }
    attachment?: unknown
  }[],
): number {
  let totalTokens = 0
  for (const message of messages) {
    if (!message) continue
    if (
      (message.type === 'assistant' || message.type === 'user') &&
      message.message?.content
    ) {
      totalTokens += roughTokenCountEstimationForContent(message.message.content)
    } else if (message.type === 'attachment' && message.attachment) {
      totalTokens += Math.round(JSON.stringify(message.attachment).length / 4)
    }
  }
  return totalTokens
}

/**
 * 旧 tokens.ts:226 逐字：末 usage 消息锚定（同 id 拆分块回扫至首兄弟）+
 * 尾部 rough 估算 = 当前上下文窗口大小。
 */
export function tokenCountWithEstimation(messages: readonly Message[]): number {
  let i = messages.length - 1
  while (i >= 0) {
    const message = messages[i]
    const usage = message ? getTokenUsage(message) : undefined
    if (message && usage) {
      const responseId = getAssistantMessageId(message)
      if (responseId) {
        let j = i - 1
        while (j >= 0) {
          const prior = messages[j]
          const priorId = prior ? getAssistantMessageId(prior) : undefined
          if (priorId === responseId) {
            i = j
          } else if (priorId !== undefined) {
            break
          }
          j--
        }
      }
      return (
        getTokenCountFromUsage(usage) +
        roughTokenCountEstimationForMessages(messages.slice(i + 1) as never)
      )
    }
    i--
  }
  return roughTokenCountEstimationForMessages(messages as never)
}
