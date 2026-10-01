/**
 * engine/context — PTL（prompt-too-long）重试族 + 消息分组/文本提取纯逻辑
 * （D-2a S3，M5 切端回填）：旧仓 compact.ts（truncateHeadForPTLRetry /
 * MAX_PTL_RETRIES / PTL_RETRY_MARKER / ERROR_MESSAGE_PROMPT_TOO_LONG）+
 * context/grouping.ts（groupMessagesByApiRound）+ tui/utils/apiErrors.ts
 * （PTL gap 解析）+ messages.ts（getAssistantMessageText）+ toolSearch.ts
 * （extractDiscoveredToolNames）逐字移植；零 tui 依赖。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  ① extractDiscoveredToolNames 的 logForDebugging 动态工具加载日志裁
 *    （纯集合面保留；调试日志非消费面）。
 *  ② truncateHeadForPTLRetry 的 rough 估算走 compactTokens 移植版（delta ②/③
 *    同 compactTokens.ts 头注）。
 */
import type { Message } from '../../shared'
import { PROMPT_TOO_LONG_ERROR_MESSAGE } from '../../modelprovider'
import { createUserMessage } from '../tools'
import { roughTokenCountEstimationForMessages } from './compactTokens'

export const MAX_PTL_RETRIES = 3
export const PTL_RETRY_MARKER =
  '[earlier conversation truncated for compaction retry]'

export const ERROR_MESSAGE_PROMPT_TOO_LONG =
  'Conversation too long. Press esc twice to go up a few messages and try again.'

/**
 * 旧 grouping.ts:22 逐字：API-round 边界分组（assistant message.id 为唯一
 * 边界门——同 id 流式块留组内，新 id 开新组）。
 */
export function groupMessagesByApiRound(messages: Message[]): Message[][] {
  const groups: Message[][] = []
  let current: Message[] = []
  let lastAssistantId: string | undefined
  for (const msg of messages) {
    const id = (msg.message as { id?: string } | undefined)?.id
    if (
      msg.type === 'assistant' &&
      id !== lastAssistantId &&
      current.length > 0
    ) {
      groups.push(current)
      current = [msg]
    } else {
      current.push(msg)
    }
    if (msg.type === 'assistant') {
      lastAssistantId = id
    }
  }
  if (current.length > 0) {
    groups.push(current)
  }
  return groups
}

/**
 * 旧 apiErrors.ts PTL 谓词族移植（结构面：isApiErrorMessage + text 块
 * 'Prompt is too long' 前缀）。
 */
export function isPromptTooLongMessage(
  msg: {
    isApiErrorMessage?: boolean
    message?: { content?: unknown }
  },
): boolean {
  if (!msg.isApiErrorMessage) return false
  const content = msg.message?.content
  if (!Array.isArray(content)) return false
  return content.some(
    (block: { type?: string; text?: unknown }) =>
      block?.type === 'text' &&
      typeof block.text === 'string' &&
      block.text.startsWith(PROMPT_TOO_LONG_ERROR_MESSAGE),
  )
}

/** 旧 apiErrors.ts:74 逐字（'prompt is too long N tokens > M' 解析）。 */
export function parsePromptTooLongTokenCounts(rawMessage: string): {
  actualTokens: number | undefined
  limitTokens: number | undefined
} {
  const match = rawMessage.match(
    /prompt is too long[^0-9]*(\d+)\s*tokens?\s*>\s*(\d+)/i,
  )
  return {
    actualTokens: match ? parseInt(match[1]!, 10) : undefined,
    limitTokens: match ? parseInt(match[2]!, 10) : undefined,
  }
}

/** 旧 apiErrors.ts:81 逐字（PTL 缺口 = actual - limit，>0 才返回）。 */
export function getPromptTooLongTokenGap(
  msg: {
    isApiErrorMessage?: boolean
    errorDetails?: string
    message?: { content?: unknown }
  },
): number | undefined {
  if (!isPromptTooLongMessage(msg) || !msg.errorDetails) {
    return undefined
  }
  const { actualTokens, limitTokens } =
    parsePromptTooLongTokenCounts(msg.errorDetails)
  if (actualTokens === undefined || limitTokens === undefined) {
    return undefined
  }
  const gap = actualTokens - limitTokens
  return gap > 0 ? gap : undefined
}

/**
 * 旧 messages.ts:2847 逐字：assistant 文本块拼接（非 assistant / 字符串
 * content → null）。
 */
export function getAssistantMessageText(message: Message): string | null {
  if (message?.type !== 'assistant') return null
  const content = (message.message as { content?: unknown } | undefined)
    ?.content
  if (!Array.isArray(content)) return null
  const text = content
    .filter(
      (block: { type?: string; text?: unknown }) =>
        block?.type === 'text' && typeof block.text === 'string',
    )
    .map((block: { text: string }) => block.text)
    .join('\n')
    .trim()
  return text || null
}

/**
 * 旧 compact.ts:230 逐字（CC-1180 逃逸阀）：PTL 时丢最旧 API-round 组至
 * 覆盖 tokenGap（gap 不可解析 = 20% 兜底）；assistant 头补 meta marker
 * （API 首消息须 role=user）。无可丢 → null。
 */
export function truncateHeadForPTLRetry(
  messages: Message[],
  ptlResponse: Message,
): Message[] | null {
  // Strip our own synthetic marker from a previous retry before grouping.
  const first = messages[0] as
    | { type?: string; isMeta?: boolean; message?: { content?: unknown } }
    | undefined
  const input =
    first?.type === 'user' &&
    first.isMeta &&
    first.message?.content === PTL_RETRY_MARKER
      ? messages.slice(1)
      : messages

  const groups = groupMessagesByApiRound(input)
  if (groups.length < 2) return null

  const tokenGap = getPromptTooLongTokenGap(
    ptlResponse as { isApiErrorMessage?: boolean; errorDetails?: string; message?: { content?: unknown } },
  )
  let dropCount: number
  if (tokenGap !== undefined) {
    let acc = 0
    dropCount = 0
    for (const g of groups) {
      acc += roughTokenCountEstimationForMessages(g as never)
      dropCount++
      if (acc >= tokenGap) break
    }
  } else {
    dropCount = Math.max(1, Math.floor(groups.length * 0.2))
  }

  dropCount = Math.min(dropCount, groups.length - 1)
  if (dropCount < 1) return null

  const sliced = groups.slice(dropCount).flat()
  if (sliced[0]?.type === 'assistant') {
    return [
      createUserMessage({ content: PTL_RETRY_MARKER, isMeta: true }) as unknown as Message,
      ...sliced,
    ]
  }
  return sliced
}

/**
 * 旧 toolSearch.ts:520 逐字（delta ①：调试日志裁）：compact 边界携载集
 * （compactMetadata.preCompactDiscoveredTools）+ user tool_result 内
 * tool_reference 块扫描。
 */
export function extractDiscoveredToolNames(messages: Message[]): Set<string> {
  const discoveredTools = new Set<string>()

  for (const msg of messages) {
    const m = msg as {
      type?: string
      subtype?: string
      compactMetadata?: { preCompactDiscoveredTools?: string[] }
      message?: { content?: unknown }
    }
    if (m.type === 'system' && m.subtype === 'compact_boundary') {
      const carried = m.compactMetadata?.preCompactDiscoveredTools
      if (carried) {
        for (const name of carried) discoveredTools.add(name)
      }
      continue
    }

    if (m.type !== 'user') continue
    const content = m.message?.content
    if (!Array.isArray(content)) continue

    for (const block of content as Array<{ type?: string; content?: unknown }>) {
      if (block?.type !== 'tool_result' || !Array.isArray(block.content)) continue
      for (const item of block.content as Array<{ type?: string; tool_name?: string }>) {
        if (item?.type === 'tool_reference' && item.tool_name) {
          discoveredTools.add(item.tool_name)
        }
      }
    }
  }

  return discoveredTools
}
