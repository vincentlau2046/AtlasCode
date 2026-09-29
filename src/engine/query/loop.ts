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
 *   - 工具 schema 注入面 W3-3d 已落（§8.74.20）：queryOneRound → modelProvider
 *     .chat tools 槽（shared Tool[] → buildOpenAITools）；活探针揭出的未登记
 *     缺面补位（H6）。
 *   - 残留守（后续纵切）：流式 chatStream + 流式 hooks runner 消费面（runHooksStream，
 *     §8.40 S-5b 前向接缝登记，防 H6 死接缝）/ 错误恢复（E-1b-full）/
 *     MCP 连接生命周期（连接层纵切，见 mcp.ts 头注；MCP 工具路由本身已按 E-2 闭环）/
 *     附件渲染 + 钩子输出上下文回灌（消息/REPL 波残留守，§8.38 C-3/C-6）/
 *     tokenBudget continuation（max_tokens 截断续跑，E-1b）/
 *     工具执行接缝（权限 E-4 已落 / 钩子 E-5 S-5a 已落 / 并发 E-1b，见 pipeline 残留守）。
 *   - terminal 语义：assistant 无 tool_use 块 = 本轮终止（纯文本回答）。max_tokens 截断的
 *     续跑（tokenBudget continuation）归残留守——本版无 tool_use 即终止，不误续。
 *
 * port 之下全真：LLM 经 modelprovider 域门面 + Tool.call 契约（shared/types.ts）——
 * 防 H6 空洞等价。engine 消费面：modelprovider（DEP-4 allow）+ shared（门面）+ pipeline（域内）。
 */
import { randomUUID } from 'crypto'
import {
  errorMessage,
  logForDebugging,
  type AssistantMessage,
  type Message,
  type SystemPrompt,
  type ThinkingConfig,
  type ToolResultBlockParam,
  type ToolUseBlock,
  type Tools,
} from '../../shared'
import type { ModelProvider, ModelRole } from '../../modelprovider'
import type { LoopHooks } from '../hooks'
import { runToolBatch, type PermissionGate } from '../pipeline'
import {
  autoCompactIfNeeded,
  buildPostCompactMessages,
  type AutoCompactDeps,
  type AutoCompactTrackingState,
} from '../context'
import type { ContentReplacementRecord } from '../session/types'

/**
 * loop transcript 写面（S-E3 A11，§8.52）：旧仓 QueryEngine 7 点 recordTranscript
 * + query/loop.ts:377 recordContentReplacement 收敛到窄 spine 的追加/compact 面。
 * 组合根注入 session 域 record 面（compose 构建器 deps.transcript；未注入 =
 * 窄 spine 无持久化安全缺省，同 checkPermission/hooks 惯例）。
 *
 * 7 点映射（执行前分析冻结，§8.52 S-E3；审视 M-1/M-2 形态订正后）：
 *   - L450 进 loop 前 persist → queryAgentLoop entry await record(args.messages)
 *   - L722/724/774/828（assistant void / 非 assistant await / progress /
 *     attachment）→ queryOneRound 尾部 void record([...messages, assistantMsg,
 *     ...resultMessages]) = **全量序列**（M-2 修复：旧 L722 全量数组形态，前缀
 *     追踪 walk 才能恢复 startingParentUuid 接链；result 消息恒戳
 *     uuid/timestamp = M-1 修复，旧 createUserMessage L525-526 不变量；
 *     新 spine 无 progress/attachment 消息面 = 消息/REPL 波残留守）
 *   - L607 compact boundary persist → compact 支 await record(post-compact 序列)
 *     （boundary 新根 by design：insertMessageChain parentUuid=null +
 *     logicalParentUuid relink，与旧仓同款——前缀 walk 在 boundary 处
 *     必断，scanner pre-compact 截读即消费本形态）
 *   - L706 preservedSegment tail flush = E-1b-full 裁面（新 CompactionResult
 *     无 preservedSegment 三段 uuid）
 *   - React 侧 5 点 = B12（shell/message 波）
 */
export interface LoopTranscriptSink {
  /** 消息追加面记录（recordTranscript 消费；dedup 幂等在内，重记安全）。 */
  record(messages: readonly Message[]): Promise<unknown>
  /**
   * loop compact 写面（旧 query/loop.ts:377 recordContentReplacement；旧
   * loop.ts:360-363 persistReplacements 门 = querySource 前缀判据）。producer =
   * E-1b-full budget 纵切（旧 applyToolResultBudget），本波零 producer = 前向
   * 接缝登记（fake compact 测试面可 seed）。
   */
  recordContentReplacement?(replacements: readonly ContentReplacementRecord[]): Promise<void>
}

/**
 * W3-3a（§8.74.2/§8.74.14）：loop 事件发射面 — 轮粒度事件族（assistant 消息 /
 * tool result 消息 / 压缩边界 / 终态）。per-token 流式面 = W-opt 残留守
 * （streaming chatStream 不入引擎面，§8.74.2 裁定；本面只重放轮粒度契约，
 * TUI 侧事件适配层消费 = src/tui/loopEvents.ts）。
 *
 * 发射点 = queryAgentLoop 驱动层（queryOneRound 单轮 API 不发射，H6 登记：
 * 单轮直调方如需事件 = 自包驱动层）；emit 同步观察面（适配器入队不抛；
 * 抛 = 观察方 bug，传播语义 = 同步观察者契约，不 catch 不吞）。
 */
export type AgentLoopEvent =
  | { type: 'loop_start'; messageCount: number }
  | { type: 'compacted'; turn: number; messages: Message[] }
  | { type: 'round_start'; turn: number }
  | {
      type: 'round_end'
      turn: number
      result: AgentRoundResult
      /** 本轮 assistant 消息对象（tui Message 同形，适配层直接消费）。 */
      assistantMessage: AssistantMessage
      /** 本轮 tool_result 消息族（顺序 = toolResults 顺序；terminal 轮 = 空族）。 */
      toolResultMessages: Message[]
    }
  | { type: 'loop_end'; result: AgentLoopResult }

export interface AgentLoopDeps {
  modelProvider: ModelProvider
  role: ModelRole
  /**
   * W3-3b（§8.74.15）：会话级主模型 pin（getRoleModels(role, sessionModel)
   * 池头语义——会话主模型优先，失败回落角色池；未注入 = 角色池原行为
   * 不变，窄 spine 缺省）。TUI REPL 主链活态装配消费（mainLoopModel 会话
   * 面）；headless 经 createAgentLoopDeps 构建器同槽透传（D-5b
   * fallbackModel 同款前向槽模式，H6 登记防复审当遗漏）。
   */
  sessionModel?: string
  signal?: AbortSignal
  /**
   * W3-3a（§8.74.2）：loop 事件发射槽（未注入 = 不发射，headless 行为零改动，
   * 窄 spine 语义不变）。TUI 活链路接线（W3-3b）经 src/tui/loopEvents.ts
   * 适配层注入；headless print.ts 不注入 = 现状零变化。
   */
  emit?: (event: AgentLoopEvent) => void
  /** E-4 S-4d：权限门（createPermissionGate 产物；未注入 = 窄 spine 默认放行）。 */
  checkPermission?: PermissionGate
  /**
   * E-5 S-5a：钩子消费面（engine/hooks createLoopHooks 产物；未注入 = 窄 spine
   * 无操作；生产装配 = E-wave-end compose 接线——现仅测试消费，E-wave-end 消费
   * 接缝清单登记，§8.42 审视 MINOR-8）。
   */
  hooks?: LoopHooks
  /** S-E3 A11：transcript 写面（未注入 = 窄 spine 无持久化安全缺省）。 */
  transcript?: LoopTranscriptSink
  /**
   * D-5b（S-4，§8.73.2）：headless 高频 5 选项 + --effort → LLM 调用真消费面
   * （runHeadless 组合根注入；未注入 = 窄 spine 缺省，行为不变）。
   *   - systemPrompt    = --system-prompt + --append-system-prompt 合并（SystemPrompt）
   *   - thinkingConfig  = --thinking / --max-thinking-tokens 构建的 ThinkingConfig
   *   - responseFormat  = --json-schema 经 modelprovider toResponseFormat 产物
   *   - effortValue     = --effort（buildOpenAIParams options.effortValue → reasoning_effort）
   *   - fallbackModel   = --fallback-model（role 池末位，getRoleModels 追加）
   *
   * H6 防空洞：本 5 槽经 queryOneRound 逐字段透传 modelProvider.chat（非仅接口
   * 声明），tests/unit/engine-headless-options.test.ts 假 provider 断言逐槽消费。
   */
  systemPrompt?: SystemPrompt
  thinkingConfig?: ThinkingConfig
  responseFormat?: unknown
  effortValue?: string
  fallbackModel?: string
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
  /**
   * W3-3b（§8.74.15）：无轮次上限（REPL 活链路面）——旧仓 REPL queryLoop
   * while(true) 无 maxTurns 门（maxTurns 缺省 = 不截断，仅自然终止 / abort 止）；
   * headless 经构建器不置位 = 保留 DEFAULT_AGENT_LOOP_MAX_TURNS 防不可终止兜底。
   * 置 true 时 maxTurns 参数忽略（循环仅由自然终止 / 压缩熔断 / abort 终止）。
   */
  unboundedTurns?: boolean
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
    // W3-3b（§8.74.15）：会话主模型 pin 透传（getRoleModels 池头；未设 =
    // 角色池原行为，窄 spine 缺省不变）。
    sessionModel: deps.sessionModel,
    signal: deps.signal,
    // D-5b（S-4）：headless 5 选项 + --effort 真消费透传（引擎面 → LLM 调用）。
    // effortValue 经 options 槽（buildOpenAIParams 读 options.effortValue）；
    // 未设任一 = 字段 undefined，窄 spine 缺省行为不变。
    // W3-3d（§8.74.20）：工具 schema 注入面（shared Tool[] → modelprovider
    // buildOpenAITools → OpenAI function schema）。H6 登记：本面此前缺位——
    // fixture replay 纪律（脚本化 provider 直接发 tool_use 块）从未向真 LLM
    // 送过 schema，活探针（W3-3d G-α）揭出；未传/空集 = params.tools 键不
    // 出现，窄 spine 缺省不变。
    tools: tools.length > 0 ? tools : undefined,
    systemPrompt: deps.systemPrompt,
    thinkingConfig: deps.thinkingConfig,
    responseFormat: deps.responseFormat,
    fallbackModel: deps.fallbackModel,
    options:
      deps.effortValue !== undefined ? { effortValue: deps.effortValue } : undefined,
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
    // E-4 S-4d：权限门透传（queryOneRound→runToolBatch 唯一点；F1 已落 S-E1
    // （§8.52 A2）：子代理面经 runAgent checkPermission 透传同门执行）
    checkPermission: deps.checkPermission,
    // E-5 S-5a：工具钩子透传（同上唯一点；未注入 = 窄 spine 无操作）
    hooks: deps.hooks?.toolHooks,
  })
  const toolResults = outcomes.map((o) => ({
    toolUseId: o.toolUseId,
    name: o.name,
    block: o.block,
  }))
  // S-E3 审视 M-1 修复（§8.52 双只读 A 路）：result 消息恒戳 uuid/timestamp
  // （旧仓 messages.ts:525-526 createUserMessage 逐字语义：`uuid || randomUUID()`
  // + `timestamp ?? ISO`——旧仓 record 面消息恒带 uuid 是 transcript 不变量）。
  // 未修前：A11 sink 接线后这些消息经 project.ts insertMessageChain
  // `uuid: message.uuid as string` 对 undefined 纯透传 → JSONL 条目缺 uuid
  // 字段（dedup miss 重复追加 + 父链 `parentUuid = message.uuid` 断裂）。
  const now = new Date().toISOString()
  const resultMessages = outcomes.map((o) => ({
    type: 'user',
    role: 'user',
    uuid: randomUUID(),
    timestamp: now,
    message: { role: 'user', content: [o.block] },
  }))

  // S-E3 A11（旧 L722/724/774/828 收敛）：轮末追加面记录——assistant void
  // 语义（fire-and-forget，未注入 = 无操作）；新 spine 无 progress/attachment
  // 消息面（裁面登记，见 LoopTranscriptSink 头注映射表）。
  // S-E3 审视 M-2 修复：record 传**全量序列**（旧 L722 全量数组形态）——
  // recordTranscript 前缀追踪 walk（record.ts `!seenNewMessage &&
  // isChainParticipant`，P-S1 探针锚点）只在入参含已记录前缀时恢复
  // startingParentUuid；增量切片形态会使每次调用点开新根（磁盘链碎裂，
  // resume 回放退化为末段）。n-4 消解：全量入参使 allMessages 缺省 =
  // messages（同调用内 tool_use/tool_result 对同落，REPL 孤儿风险面消除）。
  // n-5 登记：旧 L724 非 assistant 支 await 翻转为统一 void（order-preserving
  // 写队列排序无损；进程退出前 drain 风险与旧 bare 变体同构）。
  // n-1 登记（B 路 2026-09-25）：void record 的 unhandled rejection 风险 =
  // 旧 L722 同款继承语义（rejection 不阻塞 loop，仅 unhandled rejection
  // 面）；测试面以 sink promise 跟踪 settle 消竞（F-3 recPromises 纪律）。
  // M-1 微残留登记（零行为）：旧 L137 `sourceToolAssistantUUID` 戳未随迁
  // （result 行不戳）——M-2 全量序列接链不依赖 project.ts 该戳覆写机制
  // （同轮 tool_use/tool_result 同落，前序链参与者 = 正确 assistant，恒走
  // sequential-parent 回落即正确链）；登记防复审当遗漏重提。
  if (deps.transcript) {
    void deps.transcript.record([...messages, assistantMsg, ...resultMessages])
  }

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
 *   3. terminal 判定：lastRound.toolResults 为空（assistant 未调工具）→
 *      E-5 S-5a stop hooks 消费点（deps.hooks?.stopHooks，preventContinuation=true
 *      → 阻止停止续跑）；未防停 → 终止；否则续跑
 *   4. 继续轮末 turnCounter 自增（旧仓 L1458-1460，仅 compacted 会话）
 *   5. maxTurns 截断（terminated=false，防不可终止会话；stop-hooks 防停亦受此兜底）
 *
 * 裁剪版真核心：无 error recovery / tokenBudget continuation（残留守，见头注）；
 * stop hooks 已落 E-5 S-5a（terminal 支消费点，C-4 归属订正）。
 * 未注入 context = 纯多轮（不压缩），窄 spine 语义。
 * 残留守：pre-turn microcompact 未接线（旧仓 pre-turn 序 budget→snip→microcompact→
 * collapse→autocompact，本版只接 autocompact；microcompact 归 E-1b-full）。
 */
export async function queryAgentLoop(
  deps: AgentLoopDeps,
  args: AgentLoopArgs,
): Promise<AgentLoopResult> {
  const tools = args.tools ?? []
  // W3-3b（§8.74.15）：unboundedTurns（REPL 活链路保真）→ 无轮次上限；
  // 未置位 = maxTurns ?? DEFAULT（headless 防不可终止兜底不变）。
  const maxTurns = args.context?.unboundedTurns
    ? Number.MAX_SAFE_INTEGER
    : (args.context?.maxTurns ?? DEFAULT_AGENT_LOOP_MAX_TURNS)
  let tracking: AutoCompactTrackingState = args.tracking ?? {
    compacted: false,
    turnCounter: 0,
    turnId: 'turn-0',
  }
  let messages: Message[] = args.messages
  let turns = 0
  let terminated = false
  let lastRound: AgentRoundResult | undefined

  // S-E3 A11（旧 L450 收敛）：进 loop 前 persist 入参序列——crash-resumable
  // （旧 L437 注释：进程在首个 API 响应前被杀，transcript 仍可 resume；
  // 非 bare await 语义，bare fire-and-forget 变体 = D 波/CLI 面裁面登记）。
  if (deps.transcript) {
    await deps.transcript.record(messages)
  }

  // W3-3a（§8.74.14）：loop 事件发射面（未注入 emit = 全 no-op，零行为）
  deps.emit?.({ type: 'loop_start', messageCount: messages.length })

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
        // S-E3 A11（旧 L607 收敛）：compact 写面 persist post-compact 序列
        // （boundaryMarker 携 subtype 判别式 → JSONL '"compact_boundary"'
        // 标记字节面，scanner 同点 #15 核销；dedup 幂等在内重记安全）。
        if (deps.transcript) {
          await deps.transcript.record(messages)
        }
        // S-E3 A11-Δ2（旧 loop.ts:377 收敛）：content replacement 写面——
        // persistReplacements 门（旧 loop.ts:360-363 逐字：querySource 前缀
        // 判据，agent 路由 sidechain 文件 / repl 主线程 session 文件；
        // 其余 querySource 的 ephemeral 调用方不 persist）。producer = E-1b-full
        // budget 纵切（本波零 producer，CompactionResult 可选载体 = 前向接缝）。
        const replacementRecords = oc.compactionResult.contentReplacements
        if (
          replacementRecords &&
          replacementRecords.length > 0 &&
          deps.transcript?.recordContentReplacement
        ) {
          const qs = args.context.autoCompact.querySource
          const persistReplacements =
            !!qs && (qs.startsWith('agent:') || qs.startsWith('repl_main_thread'))
          if (persistReplacements) {
            // S-E3 审视 m-1 修复：旧 loop.ts:375-378 逐字语义 = void +
            // catch(logError)（吞错 + 日志，永不阻塞/中断 query 循环）。
            // 旧 logError → 域 debug 口 logForDebugging（shared/debug 无
            // logError，域内日志统一 debug 口，killShellTasks 同款裁定）。
            void deps.transcript.recordContentReplacement(replacementRecords).catch(
              error => {
                logForDebugging(
                  `recordContentReplacement failed: ${errorMessage(error)}`,
                )
              },
            )
          }
        }
      } else if (oc.consecutiveFailures !== undefined) {
        // 失败：回灌熔断计数（旧仓 loop.ts:504-511 语义）。不回灌则熔断器在 loop 里
        // 永不跳闸——超限不可恢复会话每轮 hammer 一次注定失败的摘要 LLM 调用。
        tracking = { ...tracking, consecutiveFailures: oc.consecutiveFailures }
      }
      if (oc.wasCompacted && oc.compactionResult) {
        // W3-3a：压缩边界事件（post-compact 全序列；适配层消费 messages[0] 边界面）
        deps.emit?.({ type: 'compacted', turn: turns, messages })
      }
    }
    deps.emit?.({ type: 'round_start', turn: turns })
    const roundInputLen = messages.length
    lastRound = await queryOneRound(deps, tools, messages)
    messages = lastRound.messages
    // W3-3a：轮末事件（assistant 消息 + tool result 消息族，派生不变式 =
    // queryOneRound 构造序 [...入参, assistantMsg, ...resultMessages]，
    // resultMessages 长度 = toolResults 长度）。
    deps.emit?.({
      type: 'round_end',
      turn: turns,
      result: lastRound,
      assistantMessage: lastRound.messages[roundInputLen] as AssistantMessage,
      toolResultMessages: lastRound.messages.slice(roundInputLen + 1),
    })
    if (lastRound.toolResults.length === 0) {
      // E-5 S-5a：stop hooks 消费点（C-4 归属订正：stop hooks = E-5 非 E-1b，
      // 旧仓 Stop 事件——continue:false 可阻止停止）：preventContinuation=true →
      // 阻止停止续跑（maxTurns 守卫仍为终止兜底）；blockingErrors/additionalContext
      // 回灌 = 消息/REPL 波前向接缝（engine/hooks 头注登记）。
      const stop = deps.hooks?.stopHooks
      const preventStop = stop ? (await stop(deps.signal)).preventContinuation : false
      if (!preventStop) {
        terminated = true
        break
      }
      // preventStop=true → 落继续轮末 turnCounter 续跑（不终止，防停）
    }
    // 继续轮末：距上次 compact 的轮数自增（旧仓 loop.ts:1458-1460：仅 tracking.compacted
    // 会话、仅继续轮——terminal 轮不增，语义 = 「距上次 compact 几轮」）。
    if (tracking.compacted) {
      tracking = { ...tracking, turnCounter: tracking.turnCounter + 1 }
    }
  }

  const result: AgentLoopResult = { messages, turns, terminated, tracking, lastRound }
  // W3-3a：终态事件（适配层 = generator return 面）
  deps.emit?.({ type: 'loop_end', result })
  return result
}
