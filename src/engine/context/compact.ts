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
 *   - PTL（prompt-too-long）重试循环 + 流式重试：D-2a S3 起富模式已落
 *     （compactPtl.ts truncateHeadForPTLRetry/MAX_PTL_RETRIES 逐字 +
 *     ports.summarize 单端口承载 streamCompactSummary fork/流式双支——
 *     宿主注完整 LLM 路径，engine 本体零 modelprovider 直调）；裁剪模式
 *     仍单次摘要调用（deps.summarize）。
 *   - 压缩后重建面（附件重建簇 / SessionStart hooks / PostCompact hooks /
 *     markPostCompaction/notifyCompaction / readFileState 清空）：D-2a S3
 *     起富模式已落（CompactPorts DI 缝——LLM-bound / 文件 IO / 宿主模块态
 *     叶全走 setCompactPorts 宿主注入，engine 保 React-free 零 tui 依赖）；
 *     S8 切端时 tui 挂真实现。CompactionResult attachments/hookResults 字段
 *     + buildPostCompactMessages 富 ordering = S2 复原，S3 富 producer 置位。
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
import type { Message, Usage } from '../../shared'
import { logForDebugging } from '../../shared'
import { PROMPT_TOO_LONG_ERROR_MESSAGE, startsWithApiErrorPrefix } from '../../modelprovider'
import { getTranscriptPath, reAppendSessionMetadata } from '../session'
import { createUserMessage } from '../tools'
import type { ContentReplacementRecord } from '../session/types'
import {
  ERROR_MESSAGE_PROMPT_TOO_LONG,
  MAX_PTL_RETRIES,
  extractDiscoveredToolNames,
  getAssistantMessageText,
  truncateHeadForPTLRetry,
} from './compactPtl'
import {
  getTokenUsage,
  roughTokenCountEstimationForMessages,
  tokenCountFromLastAPIResponse,
  tokenCountWithEstimation,
} from './compactTokens'
import {
  getCompactPorts,
  type CacheSafeParams,
  type CompactContext,
  type RecompactionInfo,
} from './compactPorts'

export const ERROR_MESSAGE_NOT_ENOUGH_MESSAGES =
  'Not enough messages to compact.'

/** 压缩摘要预留输出 token（旧仓常量）。 */
export const COMPACT_MAX_OUTPUT_TOKENS = 20_000

/** 摘要中断错误（旧仓 compact.ts:283 逐字，D-2a S1 回填）。 */
export const ERROR_MESSAGE_INCOMPLETE_RESPONSE =
  'Compaction interrupted · This may be due to network issues — please try again.'

/**
 * D-2a S2（M5 切端）：post-compact 附件消息（旧 tui types/message.ts:8 形状
 * `UserMessage & { attachment?: T }` 的 engine 等价——Message 取 shared 宽形，
 * attachment 默认 any 对齐旧仓 T=any；S8 TUI 消费方若需更强附件收窄在调用
 * 点处理，类型契约先立）。
 */
export type AttachmentMessage<T = any> = Message & { attachment?: T }

/** D-2a S2（M5 切端）：hook 结果消息（旧 tui types/message.ts:20 逐字）。 */
export type HookResultMessage = {
  type: 'hook_result'
  hookName?: string
  result?: unknown
  [key: string]: any
}

export interface CompactionResult {
  /** 压缩边界标记（system 消息，post-compact 消息序列头）。 */
  boundaryMarker: Message
  /** 摘要消息（user 消息，getCompactUserSummaryMessage 文案）。 */
  summaryMessages: Message[]
  /**
   * D-2a S2（M5 切端）：post-compact 附件消息（旧仓富面字段复原；engine 裁剪
   * producer 置空数组，富放置归 S3 富体回填）。
   */
  attachments: AttachmentMessage[]
  /**
   * D-2a S2（M5 切端）：PreCompact/PostCompact hook 结果消息（旧仓富面字段
   * 复原；engine 裁剪 producer 置空数组，富放置归 S3）。
   */
  hookResults: HookResultMessage[]
  /** 保留的近期消息（keepRecent>0 时）。 */
  messagesToKeep?: Message[]
  /** D-2a S2（M5 切端）：压缩展示消息（TUI 用户可见压缩反馈行；S3 富体置位）。 */
  userDisplayMessage?: string
  preCompactTokenCount?: number
  postCompactTokenCount?: number
  /** D-2a S2（M5 切端）：真实 post-compact token 计数（S3 富体重算置位）。 */
  truePostCompactTokenCount?: number
  /** D-2a S2（M5 切端）：压缩调用自身 token usage（S3 富体置位）。 */
  compactionUsage?: Usage
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
/**
 * 旧仓 prompt.ts:328 逐字（D-2a S3 扩 4 参：transcriptPath /
 * recentMessagesPreserved 两段复原——旧仓全量压缩路径传 3 参，partial 路径
 * 传 4 参；2 参旧调用向后兼容）。
 */
export function getCompactUserSummaryMessage(
  summary: string,
  suppressFollowUpQuestions?: boolean,
  transcriptPath?: string,
  recentMessagesPreserved?: boolean,
): string {
  const formattedSummary = formatCompactSummary(summary)

  let baseSummary = `This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.

${formattedSummary}`

  if (transcriptPath) {
    baseSummary += `\n\nIf you need specific details from before compaction (like exact code snippets, error messages, or content you generated), read the full transcript at: ${transcriptPath}`
  }

  if (recentMessagesPreserved) {
    baseSummary += `\n\nRecent messages are preserved verbatim.`
  }

  if (suppressFollowUpQuestions) {
    const continuation = `${baseSummary}
Continue the conversation from where it left off without asking the user any further questions. Resume directly — do not acknowledge the summary, do not recap what was happening, do not preface with "I'll continue" or similar. Pick up the last task as if the break never happened.`

    return continuation
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
 * `'"compact_boundary"'`（#15 同点）。审视 n-3 措辞订正（2026-09-25 双只读 A 路）：
 * 旧 L471（replayableMessages ack 过滤）/ L595（!shouldQuery 支 SDK yield）
 * 消费分支本仓无对应代码——判别式补齐使上述**未来消费方的前向依赖**成立
 * （shell/message 波），非「代码恢复面」（此前措辞易误导复审）。保留 role/
 * message wire 形（post-compact 序列进 LLM 调用面）。delta 登记：旧
 * compactMetadata {trigger, userContext} 无新 producer（compactConversation
 * 现签名不携）= 裁面，createdAt 保留（新面，无消费断言）。
 */
export function createCompactBoundaryMessage(
  trigger: 'manual' | 'auto',
  preTokens: number,
  lastPreCompactMessageUuid?: string,
  userContext?: string,
  messagesSummarized?: number,
): Message
export function createCompactBoundaryMessage(
  preTokens: number | undefined,
  messagesSummarized: number,
): Message
export function createCompactBoundaryMessage(
  triggerOrPreTokens: 'manual' | 'auto' | number | undefined,
  second: number,
  lastPreCompactMessageUuid?: string,
  userContext?: string,
  messagesSummarized?: number,
): Message {
  // 富形（旧 tui/utils/messages.ts:4518 逐字）：trigger 元信息 +
  // logicalParentUuid relink（D-2a S3 回填）
  if (typeof triggerOrPreTokens === 'string') {
    return {
      type: 'system',
      subtype: 'compact_boundary',
      content: `Conversation compacted`,
      isMeta: false,
      level: 'info',
      uuid: randomUUID(),
      timestamp: new Date().toISOString(),
      compactMetadata: {
        trigger: triggerOrPreTokens,
        preTokens: second,
        userContext,
        messagesSummarized,
      },
      ...(lastPreCompactMessageUuid && {
        logicalParentUuid: lastPreCompactMessageUuid,
      }),
    }
  }
  // 裁剪形（S-E3 A11-Δ1 判别式补全面）：preTokens/messagesSummarized/createdAt
  const preTokens = triggerOrPreTokens
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
      messagesSummarized: second,
      createdAt: new Date().toISOString(),
    },
  }
}

/**
 * post-compact 消息序列拼接（旧仓 buildPostCompactMessages ordering 照抄：
 * boundaryMarker → summaryMessages → messagesToKeep → attachments → hookResults；
 * D-2a S2 复原富 ordering——裁剪 producer 空数组时退化为旧 3 段，行为零变更）。
 */
export function buildPostCompactMessages(result: CompactionResult): Message[] {
  return [
    result.boundaryMarker,
    ...result.summaryMessages,
    ...(result.messagesToKeep ?? []),
    ...result.attachments,
    ...result.hookResults,
  ]
}

/**
 * 压缩体（D-2a S3，M5 切端）双模式重载——
 *  - 裁剪模式（DI deps，E-1b T-4b 真核心）：guard → 计数 → 摘要调用 → 结果构造
 *  - 富模式（CompactContext，旧仓 orchestrator 300L 真体移植）：PreCompact
 *    hooks + PTL 重试（CC-1180 截头）+ 压缩后附件重建（DI 端口）+ SessionStart
 *    hooks + PostCompact hooks + markPostCompaction/notifyCompaction +
 *    reAppendSessionMetadata。LLM-bound / tui 耦合叶全走 CompactPorts DI 缝
 *    （setCompactPorts 宿主注入；engine React-free 红线——本体零 tui 依赖）。
 *
 * 重载判别：第二参有 getAppState = 富模式，有 summarize = 裁剪模式。
 * S8 切端后 TUI 7 参调用点解析富模式；engine 内部 agentLoopDeps /
 * autoCompact deps.compact 仍走裁剪模式（行为零变更）。
 */
export function compactConversation(
  messages: Message[],
  deps: CompactDeps,
  customInstructions?: string,
): Promise<CompactionResult>
export function compactConversation(
  messages: Message[],
  context: CompactContext,
  cacheSafeParams: CacheSafeParams,
  suppressFollowUpQuestions: boolean,
  customInstructions?: string,
  isAutoCompact?: boolean,
  recompactionInfo?: RecompactionInfo,
): Promise<CompactionResult>
export function compactConversation(
  messages: Message[],
  contextOrDeps: CompactContext | CompactDeps,
  cacheSafeParamsOrInstructions?: CacheSafeParams | string,
  suppressFollowUpQuestions?: boolean,
  customInstructions?: string,
  isAutoCompact?: boolean,
  recompactionInfo?: RecompactionInfo,
): Promise<CompactionResult> {
  const rich =
    typeof (contextOrDeps as { getAppState?: unknown }).getAppState === 'function'
  if (rich) {
    return richCompactConversation(
      messages,
      contextOrDeps as CompactContext,
      cacheSafeParamsOrInstructions as CacheSafeParams,
      suppressFollowUpQuestions ?? false,
      customInstructions,
      isAutoCompact ?? false,
      recompactionInfo,
    )
  }
  return trimmedCompactConversation(
    messages,
    contextOrDeps as CompactDeps,
    typeof cacheSafeParamsOrInstructions === 'string'
      ? cacheSafeParamsOrInstructions
      : undefined,
  )
}

/** 裁剪模式体（E-1b T-4b 真核心，行为不变）。 */
async function trimmedCompactConversation(
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

  // D-2a S2：attachments/hookResults 必填字段先立——裁剪 producer 置空数组
  // （空 spread = 旧 3 段 ordering 零变更），富放置归 S3 富体回填。
  const result: CompactionResult = {
    boundaryMarker,
    summaryMessages,
    attachments: [],
    hookResults: [],
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

/**
 * 富模式体（旧仓 tui/core/orchestrator/context/compact.ts:374-677 移植；
 * D-2a S3 移植裁定——LLM-bound / tui 耦合叶全走 CompactPorts DI 缝）：
 *  - streamCompactSummary（fork 支 runForkedAgent + 流式兜底 chatStream +
 *    GB cache-prefix 门 + sessionActivity 心跳）→ ports.summarize 单端口
 *    （宿主注完整 LLM 路径；返回完整 assistant 消息供 PTL 文本前缀判定）
 *  - executePre/PostCompactHooks（tui utils/hooks.ts executeHooksOutsideREPL
 *    链）/ processSessionStartHooks（plugin 加载/bare mode/watch paths 包装）
 *    → ports hook 执行器（engine hooks 域 5 高频执行器不含 Pre/PostCompact）
 *  - 附件重建簇（createPostCompactFileAttachments 文件 IO + plan/skill/
 *    async-agent 模块态 + deferred-tools/agent-listing/MCP 重宣告）→
 *    ports.buildPostCompactAttachments 单端口（文件 IO + 模块态留宿主）
 *  - markPostCompaction/notifyCompaction（宿主模块态；旧仓 bootstrapState
 *    本 fork 为 stub）→ 可选端口（未注 = no-op，宿主按需注）
 *  - GB gate（promptCacheSharingEnabled / PROMPT_CACHE_BREAK_DETECTION
 *    feature() 构建期门）裁：cache 共享判定归宿主 summarize 实现，
 *    notifyCompaction 无条件走可选端口（宿主自门控）
 *  - getCompactUserSummaryMessage 3 参（transcriptPath 段；recentMessages
 *    4 参段归 partial 路径 S6）
 */
async function richCompactConversation(
  messages: Message[],
  context: CompactContext,
  cacheSafeParams: CacheSafeParams,
  suppressFollowUpQuestions: boolean,
  customInstructions: string | undefined,
  isAutoCompact: boolean,
  recompactionInfo: RecompactionInfo | undefined,
): Promise<CompactionResult> {
  const p = getCompactPorts()
  if (!p) {
    throw new Error(
      'compactConversation rich path requires setCompactPorts(...) — register host compact ports (tui wiring, D-2a S8)',
    )
  }
  try {
    if (messages.length === 0) {
      throw new Error(ERROR_MESSAGE_NOT_ENOUGH_MESSAGES)
    }

    const preCompactTokenCount = tokenCountWithEstimation(messages)

    context.onCompactProgress?.({
      type: 'hooks_start',
      hookType: 'pre_compact',
    })

    context.setSDKStatus?.('compacting')
    const hookResult = await p.executePreCompactHooks(
      {
        trigger: isAutoCompact ? 'auto' : 'manual',
        customInstructions: customInstructions ?? null,
      },
      context.abortController.signal,
    )
    customInstructions = mergeHookInstructions(
      customInstructions,
      hookResult.newCustomInstructions,
    )
    const userDisplayMessage = hookResult.userDisplayMessage

    context.setStreamMode?.('requesting')
    context.setResponseLength?.(() => 0)
    context.onCompactProgress?.({ type: 'compact_start' })

    const compactPrompt = getCompactPrompt(customInstructions)
    const summaryRequest = createUserMessage({
      content: compactPrompt,
    }) as unknown as Message

    let messagesToSummarize = messages
    let retryCacheSafeParams = cacheSafeParams
    let summaryResponse: Message
    let summary: string | null
    let ptlAttempts = 0
    for (;;) {
      summaryResponse = await p.summarize({
        messages: messagesToSummarize,
        summaryRequest,
        preCompactTokenCount,
        cacheSafeParams: retryCacheSafeParams,
        signal: context.abortController.signal,
        onProgress: context.onCompactProgress,
      })
      summary = getAssistantMessageText(summaryResponse)
      if (summary !== null && !summary.startsWith(PROMPT_TOO_LONG_ERROR_MESSAGE)) {
        break
      }

      // CC-1180: compact request itself hit prompt-too-long. Truncate the
      // oldest API-round groups and retry rather than leaving the user stuck.
      ptlAttempts++
      const truncated =
        ptlAttempts <= MAX_PTL_RETRIES
          ? truncateHeadForPTLRetry(messagesToSummarize, summaryResponse)
          : null
      if (!truncated) {
        throw new Error(ERROR_MESSAGE_PROMPT_TOO_LONG)
      }
      messagesToSummarize = truncated
      // 截断集同步 fork 支参数（宿主 summarize 经 cacheSafeParams 消费）
      retryCacheSafeParams = {
        ...retryCacheSafeParams,
        forkContextMessages: truncated,
      }
    }

    if (!summary) {
      logForDebugging('Compact failed: no summary text in response.', {
        level: 'error',
      })
      throw new Error(
        'Failed to generate conversation summary - response did not contain valid text content',
      )
    } else if (startsWithApiErrorPrefix(summary)) {
      throw new Error(summary)
    }

    // 清空前保存文件态（post-compact 附件重建 DI 端口消费；重建簇留宿主）
    const preCompactReadFileState = Object.fromEntries(
      context.readFileState.entries(),
    )

    context.readFileState.clear()
    context.loadedNestedMemoryPaths?.clear()

    context.onCompactProgress?.({
      type: 'hooks_start',
      hookType: 'session_start',
    })
    const hookMessages = await p.processSessionStartHooks('compact', {
      model: context.options.mainLoopModel,
    })

    const postCompactFileAttachments = await p.buildPostCompactAttachments(
      preCompactReadFileState,
      context,
    )

    const boundaryMarker = createCompactBoundaryMessage(
      isAutoCompact ? 'auto' : 'manual',
      preCompactTokenCount ?? 0,
      (messages.at(-1) as { uuid?: string } | undefined)?.uuid,
    )
    // 携带 loaded-tool 状态（摘要不保 tool_reference 块，post-compact
    // schema filter 需此集持续下发已加载 deferred 工具 schema）
    const preCompactDiscovered = extractDiscoveredToolNames(messages)
    if (preCompactDiscovered.size > 0) {
      ;(
        boundaryMarker as { compactMetadata?: Record<string, unknown> }
      ).compactMetadata = {
        ...((boundaryMarker as { compactMetadata?: Record<string, unknown> })
          .compactMetadata ?? {}),
        preCompactDiscoveredTools: [...preCompactDiscovered].sort(),
      }
    }

    const transcriptPath = getTranscriptPath()
    const summaryMessages: Message[] = [
      {
        type: 'user',
        role: 'user',
        uuid: randomUUID(),
        timestamp: new Date().toISOString(),
        message: {
          role: 'user',
          content: getCompactUserSummaryMessage(
            summary,
            suppressFollowUpQuestions,
            transcriptPath,
          ),
        },
      },
    ]

    // 「postCompactTokenCount」= 压缩 API 调用总 usage（旧仓事件字段
    // 连续性保留命名），非结果上下文大小
    const compactionCallTotalTokens = tokenCountFromLastAPIResponse([
      summaryResponse,
    ])

    // 结果上下文消息载荷估算（软信号：下一轮 shouldAutoCompact 参考量）
    const truePostCompactTokenCount = roughTokenCountEstimationForMessages([
      boundaryMarker,
      ...summaryMessages,
      ...postCompactFileAttachments,
      ...hookMessages,
    ] as never)

    const compactionUsage = getTokenUsage(summaryResponse)

    p.notifyCompaction?.(
      recompactionInfo?.querySource ?? context.options.querySource ?? 'compact',
      context.agentId,
    )
    p.markPostCompaction?.()

    // 压缩后重追加会话元数据（custom title/tag 保 16KB tail 窗口）
    reAppendSessionMetadata()

    context.onCompactProgress?.({
      type: 'hooks_start',
      hookType: 'post_compact',
    })
    const postCompactHookResult = await p.executePostCompactHooks(
      {
        trigger: isAutoCompact ? 'auto' : 'manual',
        compactSummary: summary,
      },
      context.abortController.signal,
    )

    const combinedUserDisplayMessage = [
      userDisplayMessage,
      postCompactHookResult.userDisplayMessage,
    ]
      .filter(Boolean)
      .join('\n')

    const result: CompactionResult = {
      boundaryMarker,
      summaryMessages,
      attachments: postCompactFileAttachments,
      hookResults: hookMessages,
      userDisplayMessage: combinedUserDisplayMessage || undefined,
      preCompactTokenCount,
      postCompactTokenCount: compactionCallTotalTokens,
      truePostCompactTokenCount,
      compactionUsage,
    }
    return result
  } catch (error) {
    // 仅手动 /compact 弹错误通知（自动压缩失败下轮重试，旧仓注释逐字）；
    // USER_ABORT / NOT_ENOUGH_MESSAGES 不通知（旧 addErrorNotificationIfNeeded
    // hasExactErrorMessage 语义移植）。
    if (!isAutoCompact) {
      const msg = error instanceof Error ? error.message : String(error)
      if (
        msg !== ERROR_MESSAGE_USER_ABORT &&
        msg !== ERROR_MESSAGE_NOT_ENOUGH_MESSAGES
      ) {
        context.addNotification?.({
          key: 'error-compacting-conversation',
          text: 'Error compacting conversation',
          priority: 'immediate',
          color: 'error',
        })
      }
    }
    throw error
  } finally {
    context.setStreamMode?.('requesting')
    context.setResponseLength?.(() => 0)
    context.onCompactProgress?.({ type: 'compact_end' })
    context.setSDKStatus?.(null)
  }
}

/**
 * S-E2c swarm backends 族扩面（C 桶 ③ shell·swarm 波 §8.66）：
 * 用户中断错误消息常量（旧仓 a8af45b core/orchestrator/context/compact.ts:282
 * 逐字）。消费 = S-E2d inProcessRunner abort 支（旧仓 inProcessRunner.ts:1283
 * `createAssistantAPIErrorMessage({ content: ERROR_MESSAGE_USER_ABORT })`
 * → appendCappedMessage，见该文件头注）。
 */
export const ERROR_MESSAGE_USER_ABORT = 'API Error: Request was aborted.'

// ── W2-2-pre 缺面先迁②（§8.74.2 compact 4 extras）：2 纯函数移植 + 2 前向接缝 ──
// 裁断（§8.74.9 落盘）：stripImagesFromMessages / mergeHookInstructions = 零依赖
// 纯函数 → 移植；createCompactCanUseTool（依赖 tui CanUseToolFn/PermissionDecision
// 类型面，engine 权限面为 GateVerdict 异型；唯一消费方 = fork 压缩支，本体归
// 本文件 PTL/fork 残留守）+ createPlanAttachmentIfNeeded（依赖 plan 域
// getPlan/getPlanFilePath + 附件域 createAttachmentMessage/AttachmentMessage，
// 附件面 = §8.40 C-3 前向接缝已登记）→ 前向接缝不迁（H6 防空洞：零消费方 +
// 依赖域未入门面，迁移 = 空头体）。owner = W3 活链路接线 / E-wave-end 审计。

/** 内容块结构窄视图（stripImagesFromMessages 仅读 type/text/content 字段；
 * engine shared Message.message 为 unknown 松散型，块数组经本窄视图 cast）。 */
interface MediaContentBlock {
  type: string
  text?: string
  content?: unknown
  [key: string]: unknown
}

/**
 * 摘要前剥离图片/文档块（旧仓 compact.ts stripImagesFromMessages 语义逐字，
 * W2-2-pre 缺面先迁②）：user 消息的 image/document 块（含 tool_result 嵌套）
 * 替换为文本标记，防压缩 API 调用自身撞 prompt-too-long。纯函数零 I/O。
 */
export function stripImagesFromMessages(messages: Message[]): Message[] {
  return messages.map(message => {
    if (message.type !== 'user') {
      return message
    }
    const inner = (message.message ?? {}) as { content?: unknown }
    const content = inner.content
    if (!Array.isArray(content)) {
      return message
    }
    const blocks = content as MediaContentBlock[]

    let hasMediaBlock = false
    const newContent = blocks.flatMap(block => {
      if (block.type === 'image') {
        hasMediaBlock = true
        return [{ type: 'text' as const, text: '[image]' }]
      }
      if (block.type === 'document') {
        hasMediaBlock = true
        return [{ type: 'text' as const, text: '[document]' }]
      }
      // 嵌套 tool_result 内容数组内的 image/document 同步剥离
      if (block.type === 'tool_result' && Array.isArray(block.content)) {
        const items = block.content as MediaContentBlock[]
        let toolHasMedia = false
        const newToolContent = items.map(item => {
          if (item.type === 'image') {
            toolHasMedia = true
            return { type: 'text' as const, text: '[image]' }
          }
          if (item.type === 'document') {
            toolHasMedia = true
            return { type: 'text' as const, text: '[document]' }
          }
          return item
        })
        if (toolHasMedia) {
          hasMediaBlock = true
          return [{ ...block, content: newToolContent }]
        }
      }
      return [block]
    })

    if (!hasMediaBlock) {
      return message
    }
    return {
      ...message,
      message: {
        ...((message.message ?? {}) as Record<string, unknown>),
        content: newContent,
      },
    } as Message
  })
}

/**
 * 合并用户自定义指令与 hook 指令（旧仓 compact.ts mergeHookInstructions
 * 语义逐字，W2-2-pre 缺面先迁②）：用户指令在前、hook 指令追加；
 * 空串归一 undefined。纯函数零 I/O。
 */
export function mergeHookInstructions(
  userInstructions: string | undefined,
  hookInstructions: string | undefined,
): string | undefined {
  if (!hookInstructions) return userInstructions || undefined
  if (!userInstructions) return hookInstructions
  return `${userInstructions}\n\n${hookInstructions}`
}
