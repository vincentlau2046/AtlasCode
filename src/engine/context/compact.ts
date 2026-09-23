/**
 * engine/context — compactConversation 核心（§8.23 E-1b T-4b，旧仓 compact.ts 1522L 裁剪版真核心）
 *
 * 链路：guard（空序列）→ pre 计数 → 摘要 prompt（getCompactPrompt）→ 摘要 LLM 调用
 *   （deps.summarize 注入，modelprovider 门面 chat 是天然提供方）→ formatCompactSummary
 *   → CompactionResult（boundaryMarker + summaryMessages + messagesToKeep）→
 *   buildPostCompactMessages 拼接（ordering 单一事实源）。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - partialCompact（direction up_to/from + pivot 选取）→ 残留守（后续纵切）。
 *   - PTL（prompt-too-long）重试循环 + 流式重试（streamCompactSummary + MAX_PTL_RETRIES）
 *     → 残留守（重试面归 E-1b-full；本版单次摘要调用）。
 *   - 压缩后重建面（createPostCompactFileAttachments / plan / skill / deferred-tools /
 *     MCP-instructions 重宣告 + SessionStart hooks + PostCompactCleanup + readFileState 清空）
 *     → 残留守（attachments/hooks 归 E-5/E-2；CompactionResult 的 attachments/hookResults
 *     字段随之裁掉，buildPostCompactMessages ordering 残留守）。
 *   - getCompactPrompt 文案 = 旧仓 9 段结构真核心（摘要质量关键资产，照抄非重写）；
 *     NO_TOOLS preamble 以一句「不要调用工具」内联（旧仓独立常量残留守）。
 */
import { randomUUID } from 'crypto'
import type { Message } from '../../shared'

export const ERROR_MESSAGE_NOT_ENOUGH_MESSAGES =
  'Not enough messages to compact.'

/** 压缩摘要预留输出 token（旧仓常量）。 */
export const COMPACT_MAX_OUTPUT_TOKENS = 20_000

export interface CompactionResult {
  /** 压缩边界标记（system 消息，post-compact 消息序列头）。 */
  boundaryMarker: Message
  /** 摘要消息（user 消息，getCompactUserSummaryMessage 文案）。 */
  summaryMessages: Message[]
  /** 保留的近期消息（keepRecent>0 时）。 */
  messagesToKeep?: Message[]
  preCompactTokenCount?: number
  postCompactTokenCount?: number
}

export interface CompactDeps {
  /** 摘要 LLM 调用（modelprovider 门面 chat 注入；返回 assistant 文本）。 */
  summarize: (messages: Message[], prompt: Message) => Promise<string>
  /** token 计数（未注入时 pre/post 计数为 undefined，不阻塞压缩）。 */
  countTokens?: (messages: Message[]) => number | Promise<number>
  /** 保留的近期消息数（默认 0 = 全量压缩；partial keep 语义残留守）。 */
  keepRecent?: number
}

/**
 * 压缩摘要 prompt（旧仓 prompt.ts getCompactPrompt 真核心：9 段摘要结构照抄——
 * 摘要质量关键资产，非重写）。customInstructions 追加在结构后（旧仓 mergeHookInstructions
 * 语义：用户指令优先，本版无 hook 指令来源 → 残留守）。
 */
export function getCompactPrompt(customInstructions?: string): string {
  let prompt =
    `You must not call any tools in your response. ` +
    `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions. ` +
    `This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.\n\n` +
    `Your summary should include the following sections:\n\n` +
    `1. Primary Request and Intent\n` +
    `2. Key Technical Concepts\n` +
    `3. Files and Code Sections\n` +
    `4. Errors and fixes\n` +
    `5. Problem Solving\n` +
    `6. All user messages\n` +
    `7. Pending Tasks\n` +
    `8. Current Work\n` +
    `9. Optional Next Step\n\n` +
    `Structure your output as:\n` +
    `<analysis>\n[Your thought process, ensuring all points are covered thoroughly and accurately]\n</analysis>\n\n` +
    `<summary>\n[The numbered sections above]\n</summary>`

  if (customInstructions && customInstructions.trim() !== '') {
    prompt += `\n\nAdditional Instructions:\n${customInstructions}`
  }
  return prompt
}

/**
 * 摘要后处理（旧仓 formatCompactSummary 照抄）：剥 <analysis> 草稿段 +
 * <summary> 标签转 "Summary:" 可读头。
 */
export function formatCompactSummary(summary: string): string {
  let formattedSummary = summary
  formattedSummary = formattedSummary.replace(
    /<analysis>[\s\S]*?<\/analysis>/,
    '',
  )
  const summaryMatch = formattedSummary.match(/<summary>([\s\S]*?)<\/summary>/)
  if (summaryMatch) {
    const content = summaryMatch[1] || ''
    formattedSummary = formattedSummary.replace(
      /<summary>[\s\S]*?<\/summary>/,
      `Summary:\n${content.trim()}`,
    )
  }
  formattedSummary = formattedSummary.replace(/\n\n+/g, '\n\n')
  return formattedSummary.trim()
}

/** 摘要回注文案（旧仓 getCompactUserSummaryMessage 真核心照抄）。 */
export function getCompactUserSummaryMessage(
  summary: string,
  suppressFollowUpQuestions?: boolean,
): string {
  const formattedSummary = formatCompactSummary(summary)
  let baseSummary = `This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.

${formattedSummary}`
  if (suppressFollowUpQuestions) {
    baseSummary +=
      `\nContinue the conversation from where it left off without asking the user any further questions. ` +
      `Resume directly — do not acknowledge the summary, do not recap what was happening, do not preface with "I'll continue" or similar. Pick up the last task as if the break never happened.`
  }
  return baseSummary
}

/** 压缩边界标记（旧仓 createCompactBoundaryMessage 裁剪：system 消息 + compact 元信息）。 */
export function createCompactBoundaryMessage(
  preTokens: number | undefined,
  messagesSummarized: number,
): Message {
  return {
    type: 'system',
    role: 'system',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    message: { role: 'system', content: 'Conversation compacted' },
    compactMetadata: {
      preTokens,
      messagesSummarized,
      createdAt: new Date().toISOString(),
    },
  }
}

/**
 * post-compact 消息序列拼接（旧仓 buildPostCompactMessages ordering 照抄：
 * boundaryMarker → summaryMessages → messagesToKeep；attachments/hookResults 残留守）。
 */
export function buildPostCompactMessages(result: CompactionResult): Message[] {
  return [
    result.boundaryMarker,
    ...result.summaryMessages,
    ...(result.messagesToKeep ?? []),
  ]
}

/**
 * 压缩体（旧仓 compactConversation 裁剪真核心：guard → 计数 → 摘要调用 → 结果构造）。
 * PTL/流式重试 + 压缩后重建面（attachments/hooks/cleanup）归残留守（见头注）。
 */
export async function compactConversation(
  messages: Message[],
  deps: CompactDeps,
  customInstructions?: string,
): Promise<CompactionResult> {
  if (messages.length === 0) {
    throw new Error(ERROR_MESSAGE_NOT_ENOUGH_MESSAGES)
  }

  const preCompactTokenCount = deps.countTokens
    ? await deps.countTokens(messages)
    : undefined

  const compactPrompt = getCompactPrompt(customInstructions)
  const summaryRequest: Message = {
    type: 'user',
    role: 'user',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    message: { role: 'user', content: compactPrompt },
  }

  const summary = await deps.summarize(messages, summaryRequest)
  if (!summary) {
    throw new Error(
      'Failed to generate conversation summary - response did not contain valid text content',
    )
  }

  // 近期消息保留（keepRecent>0 时；默认 0 = 全量压缩）。
  const keepRecent = deps.keepRecent ?? 0
  const messagesToKeep = keepRecent > 0 ? messages.slice(-keepRecent) : undefined

  const summaryMessages: Message[] = [
    {
      type: 'user',
      role: 'user',
      uuid: randomUUID(),
      timestamp: new Date().toISOString(),
      message: {
        role: 'user',
        content: getCompactUserSummaryMessage(summary, true),
      },
    },
  ]
  const boundaryMarker = createCompactBoundaryMessage(
    preCompactTokenCount,
    messages.length,
  )

  const result: CompactionResult = {
    boundaryMarker,
    summaryMessages,
    ...(messagesToKeep ? { messagesToKeep } : {}),
    ...(preCompactTokenCount !== undefined
      ? { preCompactTokenCount }
      : {}),
  }
  if (deps.countTokens) {
    result.postCompactTokenCount = await deps.countTokens(
      buildPostCompactMessages(result),
    )
  }
  return result
}
