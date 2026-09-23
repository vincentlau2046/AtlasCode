/**
 * engine/query — Agent 主循环最小纵切（§8.21 E-1 窄 spine T-1 + T-2 工具执行抽离）
 *
 * 跑通 LLM→tool→result 单轮：
 *   取 messages → modelprovider.chat（经 modelprovider 域门面，非直接 new OpenAIProvider）
 *   → 解析 assistant content 里的 tool_use 块
 *   → 委托 engine/pipeline 执行本轮工具（T-2 runToolBatch，4 接缝）
 *   → 追加 tool_result 消息 → 返回
 *
 * 裁剪版真核心（C-Deep 纵切纪律，残留守头注释防「以为已全」）：
 *   - 单轮 queryOneRound（一次 LLM + 一批 tool_use）+ 多轮 queryAgentLoop（T-4a：while +
 *     maxTurns 守卫 + pre-turn autoCompactIfNeeded + terminal=无 tool_use）。
 *   - 工具执行已抽到 engine/pipeline（T-2）：本文件只管 LLM + 消息装配 + 轮次调度，
 *     工具链单一事实源在 pipeline。
 *   - 残留守（后续纵切）：流式 chatStream（E-1b-full）/ 错误恢复 + stop hooks（E-1b）/
 *     MCP 连接生命周期（连接层纵切，见 mcp.ts 头注；MCP 工具路由本身已按 E-2 闭环）/
 *     附件注入（E-5）/ tokenBudget continuation（max_tokens 截断续跑，E-1b）/
 *     工具执行接缝（权限 E-4 / 钩子 E-5 / 并发 E-1b，见 pipeline 残留守）。
 *   - terminal 语义：assistant 无 tool_use 块 = 本轮终止（纯文本回答）。max_tokens 截断的
 *     续跑（tokenBudget continuation）归残留守——本版无 tool_use 即终止，不误续。
 *
 * port 之下全真：LLM 经 modelprovider 域门面 + Tool.call 契约（shared/types.ts）——
 * 防 H6 空洞等价。engine 消费面：modelprovider（DEP-4 allow）+ shared（门面）+ pipeline（域内）。
 */
import type {
  AssistantMessage,
  Message,
  ToolResultBlockParam,
  ToolUseBlock,
  Tools,
} from '../../shared'
import type { ModelProvider, ModelRole } from '../../modelprovider'
import { runToolBatch, type PermissionGate } from '../pipeline'
import {
  autoCompactIfNeeded,
  buildPostCompactMessages,
  type AutoCompactDeps,
  type AutoCompactTrackingState,
} from '../context'

export interface AgentLoopDeps {
  modelProvider: ModelProvider
  role: ModelRole
  signal?: AbortSignal
  /** E-4 S-4d：权限门（createPermissionGate 产物；未注入 = 窄 spine 默认放行）。 */
  checkPermission?: PermissionGate
}

/** 多轮循环默认轮次上限（防不可终止会话无限续跑；调用方可覆写）。 */
export const DEFAULT_AGENT_LOOP_MAX_TURNS = 20

/**
 * 多轮循环上下文配置（T-4a）：pre-turn autoCompact 触发 + 轮次上限。
 * 未注入 = 不跑压缩（窄 spine 默认，安全）。
 */
export interface AgentLoopContextConfig {
  /** autoCompact 触发 deps（deps.compact 已绑定 compactConversation；见 engine 组合根）。 */
  autoCompact: AutoCompactDeps
  /** 轮次上限（默认 DEFAULT_AGENT_LOOP_MAX_TURNS）。 */
  maxTurns?: number
}

/** 多轮循环入参（T-4a）：context 可选（未注入 = 不跑 pre-turn 压缩）。 */
export interface AgentLoopArgs {
  messages: Message[]
  tools?: Tools
  context?: AgentLoopContextConfig
  /** 初始 tracking（续跑/回放时回填；未传 = 全新会话）。 */
  tracking?: AutoCompactTrackingState
}

/** 多轮循环产物（T-4a）：终态消息序列 + 轮次统计。 */
export interface AgentLoopResult {
  /** 终止时的完整消息序列（含各轮 assistant + tool_result + 压缩边界）。 */
  messages: Message[]
  /** 实际执行的轮次数（LLM 调用次数）。 */
  turns: number
  /** 是否自然终止（assistant 无 tool_use）；false = 被 maxTurns 截断。 */
  terminated: boolean
  /** 终态 tracking（调用方回填，供续跑/回放/遥测）。 */
  tracking: AutoCompactTrackingState
  /** 最后一轮单轮结果（供断言/遥测；terminated=false 时为截断前最后一轮）。 */
  lastRound?: AgentRoundResult
}

export interface AgentRoundResult {
  /** 续跑 / 回放用的完整消息序列：入参 messages + assistant 消息 + 各 tool_result 消息 */
  messages: Message[]
  /** 本轮每个 tool_use 的执行产物（供上层断言 / 续跑 / 遥测） */
  toolResults: Array<{ toolUseId: string; name: string; block: ToolResultBlockParam }>
  /** assistant 原始 content（含 text + tool_use 块） */
  assistantContent: unknown[]
  stopReason: string
}

/**
 * 单轮 agent loop：LLM → tool 调度（委托 pipeline）→ tool_result 追加。
 *
 * 入参 tools 是注册表（E-2 工具面填 getAllBaseTools）；本纵切不造全局注册表，
 * 由调用方注入（测试用 fake tool，非 tautology——loop 的 LLM 调用 / 解析 / 追加即被测能力）。
 * 工具执行接缝（权限 E-4 / 钩子 E-5 / MCP E-2 / 并发 E-1b）在 pipeline 内；
 * spine 走薄语义（放行 / 无操作 / 未注册），需注入接缝者直接调 pipeline 的 executeToolUse/runToolBatch。
 */
export async function queryOneRound(
  deps: AgentLoopDeps,
  tools: Tools,
  messages: Message[],
): Promise<AgentRoundResult> {
  const resp = await deps.modelProvider.chat({
    messages,
    role: deps.role,
    signal: deps.signal,
  })

  const assistantContent: unknown[] = resp.message.content ?? []
  const assistantMsg: AssistantMessage = {
    type: 'assistant',
    role: 'assistant',
    uuid: resp.uuid,
    timestamp: resp.timestamp,
    stop_reason: resp.message.stop_reason,
    message: resp.message,
  }

  const toolUses = assistantContent.filter(
    (c): c is ToolUseBlock => !!c && (c as { type?: string }).type === 'tool_use',
  )

  // loop 内工具执行委托 pipeline（T-2）：find→权限门→validate→hooks→call→mapResult→result 追加
  // signal 透传（T-4c）：经 PipelineDeps.signal → tool.call 第 2 参 context。
  const outcomes = await runToolBatch(toolUses, assistantMsg, {
    tools,
    signal: deps.signal,
    // E-4 S-4d：权限门透传（queryAgentLoop 逐轮委托本函数，唯一点）
    checkPermission: deps.checkPermission,
  })
  const toolResults = outcomes.map((o) => ({
    toolUseId: o.toolUseId,
    name: o.name,
    block: o.block,
  }))
  const resultMessages = outcomes.map((o) => ({
    type: 'user',
    role: 'user',
    message: { role: 'user', content: [o.block] },
  }))

  return {
    messages: [...messages, assistantMsg, ...resultMessages],
    toolResults,
    assistantContent,
    stopReason: resp.message.stop_reason,
  }
}

/**
 * 多轮 agent loop（§8.23 E-1b T-4a）：while + maxTurns 守卫 + pre-turn autoCompact
 * + terminal（无 tool_use）。
 *
 * 每轮：
 *   1. pre-turn：autoCompactIfNeeded（超阈值 → buildPostCompactMessages 重建序列；
 *      成功 → tracking 重置；失败 → consecutiveFailures 回灌 tracking（旧仓 L504-511），
 *      连续 3 次失败熔断跳闸后 pre-turn 短路不再 hammer  doomed 摘要调用）
 *   2. queryOneRound（LLM→tool→result 单轮，工具链委托 pipeline）
 *   3. terminal 判定：lastRound.toolResults 为空（assistant 未调工具）→ 终止；否则续跑
 *   4. 继续轮末 turnCounter 自增（旧仓 L1458-1460，仅 compacted 会话）
 *   5. maxTurns 截断（terminated=false，防不可终止会话）
 *
 * 裁剪版真核心：无 error recovery / stop hooks / tokenBudget continuation（残留守，见头注）。
 * 未注入 context = 纯多轮（不压缩），窄 spine 语义。
 * 残留守：pre-turn microcompact 未接线（旧仓 pre-turn 序 budget→snip→microcompact→
 * collapse→autocompact，本版只接 autocompact；microcompact 归 E-1b-full）。
 */
export async function queryAgentLoop(
  deps: AgentLoopDeps,
  args: AgentLoopArgs,
): Promise<AgentLoopResult> {
  const tools = args.tools ?? []
  const maxTurns = args.context?.maxTurns ?? DEFAULT_AGENT_LOOP_MAX_TURNS
  let tracking: AutoCompactTrackingState = args.tracking ?? {
    compacted: false,
    turnCounter: 0,
    turnId: 'turn-0',
  }
  let messages: Message[] = args.messages
  let turns = 0
  let terminated = false
  let lastRound: AgentRoundResult | undefined

  while (turns < maxTurns) {
    turns++
    // pre-turn 压缩（未注入 context = 跳过，窄 spine 语义）
    if (args.context?.autoCompact) {
      const oc = await autoCompactIfNeeded(messages, tracking, args.context.autoCompact)
      if (oc.wasCompacted && oc.compactionResult) {
        messages = buildPostCompactMessages(oc.compactionResult)
        if (oc.tracking) {
          // 成功：重置 tracking（turnCounter 0 + 新 turnId + 失败计数清零，旧仓 L485-494）
          tracking = oc.tracking
        }
      } else if (oc.consecutiveFailures !== undefined) {
        // 失败：回灌熔断计数（旧仓 loop.ts:504-511 语义）。不回灌则熔断器在 loop 里
        // 永不跳闸——超限不可恢复会话每轮 hammer 一次注定失败的摘要 LLM 调用。
        tracking = { ...tracking, consecutiveFailures: oc.consecutiveFailures }
      }
    }
    lastRound = await queryOneRound(deps, tools, messages)
    messages = lastRound.messages
    if (lastRound.toolResults.length === 0) {
      terminated = true
      break
    }
    // 继续轮末：距上次 compact 的轮数自增（旧仓 loop.ts:1458-1460：仅 tracking.compacted
    // 会话、仅继续轮——terminal 轮不增，语义 = 「距上次 compact 几轮」）。
    if (tracking.compacted) {
      tracking = { ...tracking, turnCounter: tracking.turnCounter + 1 }
    }
  }

  return { messages, turns, terminated, tracking, lastRound }
}
