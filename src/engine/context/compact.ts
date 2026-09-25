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
 *     → 残留守（attachment 渲染 = message/REPL 波（§8.40 C-3 前向接缝登记）；
 *     SessionStart hooks 执行器已随 E-5 落（hooks 域 5 高频执行器），压缩重建面
 *     接线归后续纵切；CompactionResult 的 attachments/hookResults 字段随之裁掉，
 *     buildPostCompactMessages ordering 残留守）。
 *   - getCompactPrompt 文案 = 旧仓 prompt.ts 全文照抄（NO_TOOLS_PREAMBLE +
 *     BASE_COMPACT_PROMPT（含 DETAILED_ANALYSIS_INSTRUCTION_BASE + 9 段结构 + <example>
 *     模板 + 自定义指令示例段）+ NO_TOOLS_TRAILER，摘要质量关键资产，review 2026-09-23
 *     I-1 恢复全文——此前仅存 9 段名 + 一句结构提示的简化重写，已订正）。
 *   - partialCompact 三 prompt 变体（DETAILED_ANALYSIS_INSTRUCTION_PARTIAL /
 *     PARTIAL_COMPACT_PROMPT / PARTIAL_COMPACT_UP_TO_PROMPT + getPartialCompactPrompt）
 *     → 残留守（随 partialCompact 面后续纵切回填）。
 *   - getCompactUserSummaryMessage 旧仓 transcriptPath / recentMessagesPreserved 两参
 *     → 残留守（transcript 文件面 + partial keep 面归后续纵切；本版签名仅
 *     (summary, suppressFollowUpQuestions?)，调用点固定 true）。
 *   - 摘要调用无 abort CANCEL 短路（signal 未接）→ 残留守（E-1b-full 工具/流式面）。
 */
import { randomUUID } from 'crypto'
import type { Message } from '../../shared'
import type { ContentReplacementRecord } from '../session/types'

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
  /**
   * S-E3 A11-Δ2（§8.52）：content replacement 记录载体（旧 loop.ts:377
   * recordContentReplacement 触发面）。producer = E-1b-full budget 纵切（旧
   * applyToolResultBudget），本波零 producer（compactConversation 不置位）=
   * 前向接缝登记；loop compact 写面经 queryAgentLoop 消费（persistReplacements
   * 门 = autoCompact.querySource 前缀判据）。
   */
  contentReplacements?: ContentReplacementRecord[]
}

export interface CompactDeps {
  /** 摘要 LLM 调用（modelprovider 门面 chat 注入；返回 assistant 文本）。 */
  summarize: (messages: Message[], prompt: Message) => Promise<string>
  /** token 计数（未注入时 pre/post 计数为 undefined，不阻塞压缩）。 */
  countTokens?: (messages: Message[]) => number | Promise<number>
  /** 保留的近期消息数（默认 0 = 全量压缩；partial keep 语义残留守）。 */
  keepRecent?: number
}

// 旧仓 prompt.ts 常量全文照抄（摘要质量关键资产；模块私有，同旧仓）。
// NO_TOOLS_PREAMBLE 置首且明示拒绝后果：缓存共享 fork 路径继承父工具集，
// 模型偶发在弱 trailer 约束下仍试工具调用，置首 + 明示 = 防浪费唯一轮次。
const NO_TOOLS_PREAMBLE = `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.

- Do NOT use Read, Bash, Grep, Glob, Edit, Write, or ANY other tool.
- You already have all the context you need in the conversation above.
- Tool calls will be REJECTED and will waste your only turn — you will fail the task.
- Your entire response must be plain text: an <analysis> block followed by a <summary> block.

`

// <analysis> 块是草稿便签，formatCompactSummary() 在摘要入上下文前剥掉。
const DETAILED_ANALYSIS_INSTRUCTION_BASE = `Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Chronologically analyze each message and section of the conversation. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like:
     - file names
     - full code snippets
     - function signatures
     - file edits
   - Errors that you ran into and how you fixed them
   - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
2. Double-check for technical accuracy and completeness, addressing each required element thoroughly.`

const BASE_COMPACT_PROMPT = `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.

${DETAILED_ANALYSIS_INSTRUCTION_BASE}

Your summary should include the following sections:

1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Pay special attention to the most recent messages and include full code snippets where applicable and include a summary of why this file read or edit is important.
4. Errors and fixes: List all errors that you ran into, and how you fixed them. Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. All user messages: List ALL user messages that are not tool results. These are critical for understanding the users' feedback and changing intent.
7. Pending Tasks: Outline any pending tasks that you have explicitly been asked to work on.
8. Current Work: Describe in detail precisely what was being worked on immediately before this summary request, paying special attention to the most recent messages from both user and assistant. Include file names and code snippets where applicable.
9. Optional Next Step: List the next step that you will take that is related to the most recent work you were doing. IMPORTANT: ensure that this step is DIRECTLY in line with the user's most recent explicit requests, and the task you were working on immediately before this summary request. If your last task was concluded, then only list next steps if they are explicitly in line with the users request. Do not start on tangential requests or really old requests that were already completed without confirming with the user first.
                       If there is a next step, include direct quotes from the most recent conversation showing exactly what task you were working on and where you left off. This should be verbatim to ensure there's no drift in task interpretation.

Here's an example of how your output should be structured:

<example>
<analysis>
[Your thought process, ensuring all points are covered thoroughly and accurately]
</analysis>

<summary>
1. Primary Request and Intent:
   [Detailed description]

2. Key Technical Concepts:
   - [Concept 1]
   - [Concept 2]
   - [...]

3. Files and Code Sections:
   - [File Name 1]
      - [Summary of why this file is important]
      - [Summary of the changes made to this file, if any]
      - [Important Code Snippet]
   - [File Name 2]
      - [Important Code Snippet]
   - [...]

4. Errors and fixes:
    - [Detailed description of error 1]:
      - [How you fixed the error]
      - [User feedback on the error if any]
    - [...]

5. Problem Solving:
   [Description of solved problems and ongoing troubleshooting]

6. All user messages:
    - [Detailed non tool use user message]
    - [...]

7. Pending Tasks:
   - [Task 1]
   - [Task 2]
   - [...]

8. Current Work:
   [Precise description of current work]

9. Optional Next Step:
   [Optional Next step to take]

</summary>
</example>

Please provide your summary based on the conversation so far, following this structure and ensuring precision and thoroughness in your response.

There may be additional summarization instructions provided in the included context. If so, remember to follow these instructions when creating the above summary. Examples of instructions include:
<example>
## Compact Instructions
When summarizing the conversation focus on typescript code changes and also remember the mistakes you made and how you fixed them.
</example>

<example>
# Summary instructions
When you are using compact - please focus on test output and code changes. Include file reads verbatim.
</example>
`

const NO_TOOLS_TRAILER =
  '\n\nREMINDER: Do NOT call any tools. Respond with plain text only — ' +
  'an <analysis> block followed by a <summary> block. ' +
  'Tool calls will be rejected and you will fail the task.'

/**
 * 压缩摘要 prompt（旧仓 prompt.ts getCompactPrompt 全文照抄：NO_TOOLS_PREAMBLE +
 * BASE_COMPACT_PROMPT + NO_TOOLS_TRAILER；customInstructions 插于结构后、trailer 前
 * （旧仓 mergeHookInstructions 语义：用户指令优先，本版无 hook 指令来源 → 残留守））。
 */
export function getCompactPrompt(customInstructions?: string): string {
  let prompt = NO_TOOLS_PREAMBLE + BASE_COMPACT_PROMPT

  if (customInstructions && customInstructions.trim() !== '') {
    prompt += `\n\nAdditional Instructions:\n${customInstructions}`
  }

  prompt += NO_TOOLS_TRAILER

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

/**
 * 摘要回注文案（旧仓 getCompactUserSummaryMessage 裁剪版：base 文案 +
 * suppressFollowUpQuestions 续跑段照抄；旧仓 transcriptPath / recentMessagesPreserved
 * 两参残留守——transcript 文件面 / partial keep 面归后续纵切，见头注）。
 */
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

/**
 * 压缩边界标记（旧仓 createCompactBoundaryMessage 裁剪：system 消息 + compact
 * 元信息）。
 *
 * S-E3 A11-Δ1 保真修复（§8.52 执行前分析勘查新发现）：补旧仓判别式
 * `subtype: 'compact_boundary'`（旧 messages.ts:4518 SystemCompactBoundaryMessage
 * 逐字面 + content/isMeta/level 字段）——消费面：isCompactBoundaryMessage 谓词
 * （insertMessageChain parentUuid-null relink）+ scanner 字节标记
 * `'"compact_boundary"'`（#15 同点）+ 旧 L471/L595 ack 分支。保留 role/message
 * wire 形（post-compact 序列进 LLM 调用面）。delta 登记：旧 compactMetadata
 * {trigger, userContext} 无新 producer（compactConversation 现签名不携）=
 * 裁面，createdAt 保留（新面，无消费断言）。
 */
export function createCompactBoundaryMessage(
  preTokens: number | undefined,
  messagesSummarized: number,
): Message {
  return {
    type: 'system',
    subtype: 'compact_boundary',
    role: 'system',
    content: 'Conversation compacted',
    isMeta: false,
    level: 'info',
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
