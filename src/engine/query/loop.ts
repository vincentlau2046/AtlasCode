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
 *   - 错误恢复（E-1b-full）：回合级有界恢复已落（#262，turnRecovery.ts
 *     withTurnRecovery——queryOneRound 两处 modelProvider.chat 经有界 + 指数退避 +
 *     signal 感知续试穿越 5xx 风暴窗，长跑不中断；非可重试/abort 立即穿透）。
 *   - D1/D2（0.1.37 ③，P2 恢复层）：413/PTL 反应式压缩消费点（C3 缺口，
 *     CC query.ts:1119 同构：queryAgentLoop 轮内 provider 413/PTL 类 throw
 *     （isReactiveCompactRecoverableError 判形）→ DI 槽 deps.reactiveCompact
 *     （宿主注入消费者）+ isReactiveCompactEnabled 门 + 本回合一次性门 →
 *     buildPostCompactMessages 重建 + 本回合重试一次；失败回显原错误）+
 *     断路器跳闸态 store 更新点（C2 缺口，pre-turn 成功复位/失败回灌双支
 *     → context/autoCompactCircuit store，TUI 渲染 + 模型侧告知消费面）。
 *     未注入槽 = 窄 spine 零行为（headless 缺省不变）。
 *   - 残留守（后续纵切）：流式 chatStream + 流式 hooks runner 消费面（runHooksStream，
 *     §8.40 S-5b 前向接缝登记，防 H6 死接缝）/
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
import {
  PROVIDER_EMPTY_CONTENT_PLACEHOLDER,
  shouldRetryModelError,
  type ModelProvider,
  type ModelRole,
  type StreamDelta,
} from '../../modelprovider'
import type { LoopHooks } from '../hooks'
import { nextFallbackRef, withTurnRecovery } from './turnRecovery'
import { isCompactBoundaryMessage } from '../session'
import {
  DEFAULT_MAX_GOAL_TURNS,
  clearGoal,
  evaluateGoal,
  getGoalCondition,
  goalContinuationReminder,
  isGoalArmed,
  isGoalPaused,
  pauseGoal,
  classifyGoalError,
  goalHookGateNotification,
} from '../goal/goalState'
import { shouldDisableAllHooksIncludingManaged } from '../config/hooksConfig'
import { runToolBatch, type PermissionGate } from '../pipeline'
import {
  autoCompactIfNeeded,
  buildPostCompactMessages,
  clearAutoCompactCircuitFailures,
  isReactiveCompactEnabled,
  reportAutoCompactCircuitFailures,
  type AutoCompactDeps,
  type AutoCompactTrackingState,
  type CompactionResult,
} from '../context'
import { isReactiveCompactRecoverableError } from './reactiveCompactError'
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
  /**
   * 0.1.62 /goal P1：goal 状态变更持久化面（loop 清 goal 时回写 session
   * metadata 缓存，防 reAppendSessionMetadata 写陈旧 armed 态）。null = cleared
   * 快照。producer = loop terminal 支（met/maxTurns 清 goal 时调）；缺省 =
   * 无持久化（测试面可 stub）。
   */
  saveGoalState?(goal: { armed: boolean; condition: string } | null): void
  /**
   * 0.1.67 C-1：post-compact 追加完成后会话元数据重钉面（64KB 尾窗重钉）。
   * compact 体内的 pre-append reAppend（engine/context/compact.ts）发生在
   * post-compact 序列落盘**之前**；loop record(messages) +
   * recordContentReplacement（可达数百 KB）之后，custom-title / mode /
   * model-setting 等元数据条目被顶出 64KB 尾窗（readLiteMetadata head+tail
   * 64KB lite 读两头皆不可见 → /resume 名称面回退原名）。本槽 = post-append
   * 重钉（宿主注入：TUI 车道 = sessionStorage.reAppendSessionMetadata 闭包，
   * 与 pending replacement 写异步串行保序；headless 车道 = engine/session
   * reAppendSessionMetadata）。未注入 = 窄 spine 零行为变更。
   * 消费点 = autoCompact 支（record + replacement 之后）+ 轮间入参
   * boundary 门控支（手动 /compact 等价位）。
   */
  reAppendSessionMetadata?(): void
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
  | {
      /**
       * 0.1.70 G-2（composing token 回归波）：per-token delta 事件（逆转 §8.74.2
       * 「streaming chatStream 不入引擎面」裁定——per-token 现经 emit 槽入引擎
       * 面，React-free 红线不破：纯数据回调不引 React）。载荷 = modelprovider
       * StreamDelta（delta 类 4 事件子集；本波 TUI 消费 text 面，tool 面
       * 0.1.71 候选）。瞬态进度面——不入 transcript record（round_end
       * assistantMessage 仍是唯一持久化面）。
       */
      type: 'stream_delta'
      delta: StreamDelta
    }
  | { type: 'loop_end'; result: AgentLoopResult }
  | {
      type: 'goal_met'
      condition: string
    }
  | {
      type: 'goal_continuation'
      condition: string
      turn: number
      reason: string
    }
  | {
      /** 0.1.63 P2：可恢复错误 → goal paused（配额恢复后 resume）。 */
      type: 'goal_paused'
      condition: string
      reason: string
    }
  | {
      /** 0.1.63 P3：不可恢复错误 → goal cleared（不再 armed）。 */
      type: 'goal_unrecoverable'
      condition: string
      reason: string
    }

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
   * R6（P0，user-e2e 第 3 轮）：工具调用 context 桥（TUI 面注入活 ToolUseContext；
   * 型 = object 保 engine React-free，跨域面单点 = TUI buildAgentLoopParams 装配，
   * loopPermissionBridge 同型）。未注入 = 窄 spine（tool.call/validateInput 第 2 参
   * = 最小 context { signal, checkPermission }，headless 行为零改动）；注入时
   * pipeline 合并 { ...toolContext, signal, checkPermission }（engine 字段优先）透传。
   */
  toolContext?: object
  /**
   * E-5 S-5a：钩子消费面（engine/hooks createLoopHooks 产物；未注入 = 窄 spine
   * 无操作；生产装配 = E-wave-end compose 接线——现仅测试消费，E-wave-end 消费
   * 接缝清单登记，§8.42 审视 MINOR-8）。
   */
  hooks?: LoopHooks
  /** S-E3 A11：transcript 写面（未注入 = 窄 spine 无持久化安全缺省）。 */
  transcript?: LoopTranscriptSink
  /**
   * D1（0.1.37 ③，P2 恢复层 C3 缺口）：413/PTL 反应式压缩消费者槽（CC
   * query.ts:1119 同构；P2 报告 §5 D1「delta = 一个消费点 + 一次性门」）。
   * 消费点（queryAgentLoop 轮内）：provider 抛 413/PTL 类错误
   * （isReactiveCompactRecoverableError 判形，throw 形态 = 谓词层
   * isWithheldPromptTooLong/isWithheldMediaSizeError 的 CC stream-withholding
   * 形等价）且 isReactiveCompactEnabled()（谓词层单源，默认开，
   * ATLAS_DISABLE_REACTIVE_COMPACT kill-switch）且本回合未尝试过（一次性门，
   * 防反应式死循环 = V4 判据③）→ 调本槽消费者（宿主注入：TUI 车道 =
   * 宿主体 tryReactiveCompact 闭包 / headless 车道 = engine 窄体
   * compactConversation 闭包，两车道同消费点）→ 成功经 buildPostCompactMessages
   * 重建序列 + 本回合重试一次（重试不占新轮次，CC 同语义）；失败/消费者
   * 异常/二次 413 = 回显原始错误（宿主体 :130-135 已登记回落）。
   * 未注入 = 窄 spine 零行为（headless 缺省不变；413 错误按现状穿透）。
   * 注：既有 413/maxTokens 自修语义（withRetry maxTokensOverride A 类 400）
   * 零回归——本槽只消费 classifyAPIError 'prompt_too_long'/'image_too_large'
   * 族（B 类 400 输入超窗，A 类经 withRetry 自修不抵此消费点）。
   */
  reactiveCompact?: (params: {
    /** 当前消息序列（出错前）。 */
    messages: Message[]
    /** 当前轮次（遥测/审计面；不参与判定）。 */
    turn: number
  }) => Promise<CompactionResult | null>
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
  /**
   * 0.1.59 C 簇（CC 2.1.166）：回合级跨回合有序 fallback 表（≤3 ref）。区别于
   * 单串 fallbackModel（in-request 池末位，getRoleModels 追加）——本表是**跨回合**
   * 有序重试支：queryAgentLoop 轮内主模型可重试错误（shouldRetryModelError，
   * 5xx/429 过载，已耗尽 in-request retry 预算）→ 钉下一 ref 为本回合
   * sessionModel 重跑本回合（不占新轮次，同 reactiveRetried 一次性门；每 ref
   * 一次性）。未配置面（缺省 undefined）= 零行为变更（catch 原样穿透）。
   * 判别纯面 = turnRecovery.nextFallbackRef（React-free 叶子）。
   */
  fallbackModels?: string[]
  /**
   * 0.1.63 P5（CC 演化 2.1.173→2.1.295）：后台任务状态查询谓词——评估器
   * 触发前置守卫。返回 true = 后台任务（LocalShellTask 族）运行中 → 评估器
   * 零调用（不提前触发，等终态）；返回 false = 终态 → 评估正常进行。
   * 未注入 = 零回归（无守卫，评估正常触发——headless 缺省无后台任务）。
   * TUI 车道注入（src/tui/tasks/ LocalShellTask 族状态查询）。
   */
  hasPendingBackgroundTasks?: () => boolean
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
  /**
   * 0.1.62 /goal（CC 2.1.139）：goal 续跑轮次硬上限（防 runaway——goal armed
   * 时评估器每判未达成续跑一轮，maxGoalTurns 截断防无限续跑）。缺省 =
   * DEFAULT_MAX_GOAL_TURNS（10）。REPL unboundedTurns 模式下仍生效（goal
   * runaway 独立于主循环轮次上限——主循环无上限但 goal 不可无上限）。
   */
  maxGoalTurns?: number
}

/** 多轮循环入参（T-4a）：context 可选（未注入 = 不跑 pre-turn 压缩）。 */
export interface AgentLoopArgs {
  messages: Message[]
  tools?: Tools
  context?: AgentLoopContextConfig
  /** 初始 tracking（续跑/回放时回填；未传 = 全新会话）。 */
  tracking?: AutoCompactTrackingState
}

/**
 * AD-45 0.1.52：defer 挂起面载荷（CC 2.1.89 TOP#1）——挂起 tool_use 的
 * 判别信息（resume 重评消费支经标记重建 tool_use 入参，此处携判别面）。
 */
export interface DeferredToolUsePayload {
  toolUseId: string
  toolName: string
  deferReason?: string
}

/** 多轮循环产物（T-4a）：终态消息序列 + 轮次统计。 */
export interface AgentLoopResult {
  /** 终止时的完整消息序列（含各轮 assistant + tool_result + 压缩边界）。 */
  messages: Message[]
  /** 实际执行的轮次数（LLM 调用次数）。 */
  turns: number
  /**
   * 是否自然终止（assistant 无 tool_use）；false = 被 maxTurns 截断
   * （或 AD-45 defer 挂起——挂起非自然终止亦非截断，判别式 = 下方 deferred）。
   */
  terminated: boolean
  /** 终态 tracking（调用方回填，供续跑/回放/遥测）。 */
  tracking: AutoCompactTrackingState
  /** 最后一轮单轮结果（供断言/遥测；terminated=false 时为截断前最后一轮）。 */
  lastRound?: AgentRoundResult
  /**
   * R1（P0 静默终止）：循环末轮是否为空内容响应（末轮 empty）——REPL 据此出
   * 用户可见「本轮未产生响应」提示面（非静默）。正常文本终止 / 非空截断 =
   * false/absent。
   */
  emptyTerminated?: boolean
  /**
   * AD-45 0.1.52：defer 挂起（某轮 pre-hook 'defer' 裁定）——不自然终止、
   * 非 maxTurns 截断；挂起面 = 轮末挂起标记（messages 末位）+ 本载荷
   * （headless 消费支：print.ts 挂起 result + --resume 重评）。
   */
  deferred?: DeferredToolUsePayload
}

export interface AgentRoundResult {
  /** 续跑 / 回放用的完整消息序列：入参 messages + assistant 消息 + 各 tool_result 消息 */
  messages: Message[]
  /** 本轮每个 tool_use 的执行产物（供上层断言 / 续跑 / 遥测） */
  toolResults: Array<{ toolUseId: string; name: string; block: ToolResultBlockParam }>
  /** assistant 原始 content（含 text + tool_use 块） */
  assistantContent: unknown[]
  stopReason: string
  /**
   * R1（P0 静默终止）：本轮 assistant 为「空内容响应」——content 无非空 text 块
   * 且无 tool_use 块（网关 0/0 或模型空输出）。queryOneRound 已做 1 次有界重试
   * 仍空 = true。上层（queryAgentLoop → REPL）据此出用户可见提示，非静默终止。
   * 正常 end_turn（含 text）/ 正常工具轮恒 false/absent。
   */
  empty?: boolean
  /** AD-45 0.1.52：本轮 defer 挂起（批次短路，挂起面消费 = queryAgentLoop break）。 */
  deferred?: DeferredToolUsePayload
}

/**
 * AD-45 0.1.52：defer 挂起标记（system 消息 subtype 判别式，compact_boundary 同形）
 * ——挂起 tool_use 的持久化面（queryOneRound 轮末经 transcript.record 自动落盘，
 * JSONL '"deferred_tool_use"' 字节标记）。无字符串 content → LLM 映射
 * （modelprovider/params.ts system 支）滤除不进 API；resume 重评检测面 =
 * print.ts findDeferredToolUseState（标记在场 + 其后无对应 tool_result = 挂起态）。
 */
export function makeDeferredToolUseMarker(payload: {
  toolUseId: string
  toolName: string
  deferReason?: string
}): Message {
  return {
    type: 'system',
    subtype: 'deferred_tool_use',
    role: 'system',
    tool_use_id: payload.toolUseId,
    tool_name: payload.toolName,
    defer_reason: payload.deferReason,
    isMeta: false,
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
  }
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
  // R1（P0 静默终止）：空内容响应（网关 0/0 / 模型空输出）检测 + 有界重试。
  // 原逻辑空内容 → toolUses 空 → terminal 判 toolResults===0 → 静默终止（无
  // assistant 可见产出、无错误面，用户只见 spinner 停 = 主诉「无响应」间歇面）。
  // 区分「空可重试」与「正常 end_turn（含 text）」：空走 1 次有界重试（signal 感知），
  // 仍空 → empty=true 供上层（queryAgentLoop → REPL）出用户可见提示，非静默。
  const chatArgs = {
    messages,
    role: deps.role,
    // W3-3b（§8.74.15）：会话主模型 pin 透传（getRoleModels 池头；未设 = 角色池原行为）。
    sessionModel: deps.sessionModel,
    signal: deps.signal,
    // W3-3d（§8.74.20）：工具 schema 注入面（shared Tool[] → buildOpenAITools）。
    // H6 登记：本面此前缺位（fixture replay 从未向真 LLM 送 schema，活探针揭出）；
    // 未传/空集 = params.tools 键不出现，窄 spine 缺省不变。
    tools: tools.length > 0 ? tools : undefined,
    systemPrompt: deps.systemPrompt,
    thinkingConfig: deps.thinkingConfig,
    responseFormat: deps.responseFormat,
    fallbackModel: deps.fallbackModel,
    // D-5b（S-4）：headless --effort 真消费透传（options.effortValue → reasoning_effort）。
    options:
      deps.effortValue !== undefined ? { effortValue: deps.effortValue } : undefined,
    // 0.1.70 G-2（composing token 回归波）：per-token 透传——仅 emit 已注入面
    // 传 onStreamDelta（TUI 活链）；emit 未注入面（headless / 单轮直调方）=
    // undefined = chat 非流式路径零回调零开销恒等锚。
    onStreamDelta: deps.emit
      ? (delta: StreamDelta) => deps.emit!({ type: 'stream_delta', delta })
      : undefined,
  }
  // loop-robustness 缺口②（#262）：回合级有界恢复——provider 内部 3 次重试预算
  // 耗尽仍抛「可重试模型错误」（5xx 风暴 / 网关持续抖动）→ withTurnRecovery 有界
  // + 指数退避 + signal 感知续试，穿越风暴窗（长跑不中断），非整个任务被回合级
  // 丢弃。非可重试（400/死网）/ client-timeout fail-fast / abort 立即穿透（不放大
  // #260 快速失败）。退避/预算 env 可调（见 turnRecovery.ts 头注）。
  let resp = await withTurnRecovery(() => deps.modelProvider.chat(chatArgs), {
    signal: deps.signal,
  })
  let assistantContent: unknown[] = resp.message.content ?? []
  // 空内容判据：无非空 text 块且无 tool_use 块（仅 thinking / 全空 = 空响应）。
  // 与 terminal 判据（toolUses 空）同源但更宽：正常 end_turn 含 text 块 → 非空。
  // #271 #5（0.1.23，e2e「empty 0-0 有界重试判据」）：provider 合成占位块
  // （PROVIDER_EMPTY_CONTENT_PLACEHOLDER = 网关 0/0 占位响应标记，非模型产出）
  // 不计入「非空」——否则 0/0 占位响应伪装成非空 text 块 → 空判定 / R1 有界
  // 重试 / emptyTerminated 用户可见提示全不触发（静默穿越，e2e empty 场景 FAIL）。
  // 不用 usage 0/0 作独立判据：mapOpenAIUsage 对缺 usage 字段的响应归一 0/0，
  // 纯 usage 判别会误伤真内容；占位标记才是 provider「真无内容」的精确信号
  // （仅 content 全空时合成，真实产出路径恒无占位）。
  const isEmptyContent = (content: unknown): boolean => {
    if (!Array.isArray(content)) return true
    return !content.some(block => {
      const b = block as { type?: string; text?: unknown } | null
      if (!b) return false
      if (b.type === 'tool_use') return true
      if (b.type !== 'text') return false
      const t = String(b.text ?? '').trim()
      return t !== '' && t !== PROVIDER_EMPTY_CONTENT_PLACEHOLDER
    })
  }
  // 首次空响应再试 1 次（瞬时 0/0 恢复面；signal aborted 即止，不追加挂起调用）。
  if (isEmptyContent(assistantContent) && !deps.signal?.aborted) {
    // 空内容重发同样走回合级恢复（同一 5xx 故障类；首发已成功仅内容为空，
    // 本次重发若撞网关抖动仍受 withTurnRecovery 兜底）。
    const retried = await withTurnRecovery(() => deps.modelProvider.chat(chatArgs), {
      signal: deps.signal,
    })
    const retriedContent: unknown[] = retried.message.content ?? []
    if (!isEmptyContent(retriedContent)) {
      resp = retried
      assistantContent = retriedContent
    }
  }
  const empty = isEmptyContent(assistantContent)
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
    // R6（P0）：工具调用 context 桥透传（同上唯一点；未注入 = 窄 spine 最小 context）
    toolContext: deps.toolContext,
  })
  // AD-45 0.1.52：defer 挂起 outcome 不产 tool_result（block 缺席）——
  // toolResults / resultMessages 均排除挂起支（批次已短路，挂起后无后续 outcome）。
  const deferredOutcome = outcomes.find((o) => o.deferred)
  const deferredPayload: DeferredToolUsePayload | undefined = deferredOutcome
    ? {
        toolUseId: deferredOutcome.toolUseId,
        toolName: deferredOutcome.name,
        deferReason: deferredOutcome.deferReason,
      }
    : undefined
  const marker: Message | undefined = deferredPayload
    ? makeDeferredToolUseMarker(deferredPayload)
    : undefined
  const toolResults = outcomes
    .filter((o) => !o.deferred)
    .map((o) => ({
      toolUseId: o.toolUseId,
      name: o.name,
      // 非挂起支 block 恒在场（pipeline 不变量；可选化仅为挂起支类型面）
      block: o.block as ToolResultBlockParam,
    }))
  // S-E3 审视 M-1 修复（§8.52 双只读 A 路）：result 消息恒戳 uuid/timestamp
  // （旧仓 messages.ts:525-526 createUserMessage 逐字语义：`uuid || randomUUID()`
  // + `timestamp ?? ISO`——旧仓 record 面消息恒带 uuid 是 transcript 不变量）。
  // 未修前：A11 sink 接线后这些消息经 project.ts insertMessageChain
  // `uuid: message.uuid as string` 对 undefined 纯透传 → JSONL 条目缺 uuid
  // 字段（dedup miss 重复追加 + 父链 `parentUuid = message.uuid` 断裂）。
  const now = new Date().toISOString()
  const resultMessages = outcomes
    .filter((o) => !o.deferred)
    .map((o) => ({
      type: 'user',
      role: 'user',
      uuid: randomUUID(),
      timestamp: now,
      message: { role: 'user', content: [o.block as ToolResultBlockParam] },
      // G1（#258）：toolUseResult 挂入 result user message（旧仓 addToolResult 同语义：
      // 工具原生 Output 随消息走，TUI 渲染面经 message.toolUseResult 消费；早退支
      // 此处 = undefined 不挂，见 toolExecution ToolExecutionOutcome 头注）。
      toolUseResult: o.toolUseResult,
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
  // AD-45 0.1.52：挂起标记随轮末全量序列 record（transcript 持久化 = 挂起面
  // 落盘，--resume 回放经 findDeferredToolUseState 检测）。
  const roundMessages: Message[] = marker
    ? [...messages, assistantMsg, ...resultMessages, marker]
    : [...messages, assistantMsg, ...resultMessages]
  if (deps.transcript) {
    void deps.transcript.record(roundMessages)
  }

  return {
    messages: roundMessages,
    toolResults,
    assistantContent,
    stopReason: resp.message.stop_reason,
    empty,
    deferred: deferredPayload,
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
 * 裁剪版真核心：tokenBudget continuation（残留守，见头注）；error recovery
 * （E-1b-full 回合级有界恢复）已落 #262（queryOneRound 经 withTurnRecovery 穿越
 * 5xx 风暴窗，长跑不中断）。
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
  // 0.1.62 /goal C0-2：goal 续跑计数器（防 runaway 硬守卫；每评估一次未达成
  // 自增，达 maxGoalTurns 强制终止——独立于主 turns 计数）。
  const maxGoalTurns =
    args.context?.maxGoalTurns ?? DEFAULT_MAX_GOAL_TURNS
  let goalTurns = 0
  // AD-45 0.1.52：defer 挂起面（某轮 pre-hook 'defer' 裁定 → 挂起 break，
  // 非自然终止亦非 maxTurns 截断；terminated 保持 false 判别式）。
  let deferredToolUse: DeferredToolUsePayload | undefined

  // S-E3 A11（旧 L450 收敛）：进 loop 前 persist 入参序列——crash-resumable
  // （旧 L437 注释：进程在首个 API 响应前被杀，transcript 仍可 resume；
  // 非 bare await 语义，bare fire-and-forget 变体 = D 波/CLI 面裁面登记）。
  if (deps.transcript) {
    await deps.transcript.record(messages)
    // 0.1.67 C-1：手动 /compact 等价位重钉（post-compact 序列经 loop 入口
    // 落盘 = 手动 /compact 的追加面；入参序列头 = compact boundary 判别式，
    // 非 compact 路径恒不触发 = 零变更恒等锚）。
    if (isCompactBoundaryMessage(messages[0])) {
      deps.transcript.reAppendSessionMetadata?.()
    }
  }

  // W3-3a（§8.74.14）：loop 事件发射面（未注入 emit = 全 no-op，零行为）
  deps.emit?.({ type: 'loop_start', messageCount: messages.length })

  while (turns < maxTurns) {
    turns++
    // pre-turn 压缩（未注入 context = 跳过，窄 spine 语义）
    if (args.context?.autoCompact) {
      const oc = await autoCompactIfNeeded(messages, tracking, args.context.autoCompact)
      // 0.1.68 F-1a：skip 载体门（AD-22 PreCompact hook block → 富路径返回
      // compactionSkipped 载体，压缩未执行）= 不得以占位字段 buildPostCompactMessages
      // 换消息面（会误丢原上下文，同 reactive 支 L762 先例）——skip = 本回合
      // 压缩不可用，序列原样继续（非失败：不回灌熔断计数，tracking 不动）。
      if (oc.wasCompacted && oc.compactionResult && !oc.compactionResult.compactionSkipped) {
        messages = buildPostCompactMessages(oc.compactionResult)
        if (oc.tracking) {
          // 成功：重置 tracking（turnCounter 0 + 新 turnId + 失败计数清零，旧仓 L485-494）
          tracking = oc.tracking
        }
        // D2（0.1.37 ③，C2 缺口）：pre-turn 压缩成功 = 断路器复位（跳闸态
        // store 清零；TUI 跳闸态渲染 + 模型侧告知面随之解除）
        clearAutoCompactCircuitFailures()
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
        // 0.1.67 C-1：post-compact 追加完成 → 元数据重钉（compact 体内的
        // pre-append reAppend 补成 post-append 语义：custom-title / mode /
        // model-setting 重进 64KB 尾窗；重钉顺序由 sink 侧与 replacement 写
        // 异步串行保证，本处 fire-and-forget 不阻塞 query 循环）。
        deps.transcript?.reAppendSessionMetadata?.()
      } else if (oc.consecutiveFailures !== undefined) {
        // 失败：回灌熔断计数（旧仓 loop.ts:504-511 语义）。不回灌则熔断器在 loop 里
        // 永不跳闸——超限不可恢复会话每轮 hammer 一次注定失败的摘要 LLM 调用。
        tracking = { ...tracking, consecutiveFailures: oc.consecutiveFailures }
        // D2（0.1.37 ③，C2 缺口）：失败回灌同步更新断路器跳闸态 store（≥3 =
        // 跳闸，TUI 渲染「auto-compact 已暂停（N 次失败）」+ 模型侧告知注入；
        // 静默失能 → 可见 + 有出口，P2 报告 §5 D2）
        reportAutoCompactCircuitFailures(oc.consecutiveFailures)
      }
      if (
        oc.wasCompacted &&
        oc.compactionResult &&
        !oc.compactionResult.compactionSkipped
      ) {
        // W3-3a：压缩边界事件（post-compact 全序列；适配层消费 messages[0] 边界面）
        // 0.1.68 F-1a：skip 载体不发 compacted 事件（压缩未执行，无边界可发）
        deps.emit?.({ type: 'compacted', turn: turns, messages })
      }
    }
    deps.emit?.({ type: 'round_start', turn: turns })
    // D1（0.1.37 ③，P2 恢复层 C3 缺口）：413/PTL 反应式压缩消费点（CC
    // query.ts:1119 同构）——provider 抛 413/PTL 类错误时（throw 形态判形
    // isReactiveCompactRecoverableError；门 = isReactiveCompactEnabled 谓词层
    // 单源 + DI 槽注入 + 本回合一次性门 reactiveRetried 防反应式死循环，
    // V4 判据③）→ 消费者（宿主注入）成功经 buildPostCompactMessages 重建
    // 序列 + 本回合重试一次（重试不占新轮次，CC 同语义；失败轮不发射
    // round_end）；失败/消费者异常/二次 413 = 回显原始错误（穿透原语义，
    // 既有 413/maxTokens 自修零回归——本消费点只消费 B 类 400 输入超窗族，
    // A 类经 withRetry maxTokensOverride 自修不抵此点）。
    let reactiveRetried = false
    // 0.1.59 C 簇（CC 2.1.166）：回合级跨回合有序 fallback 表（≤3）。
    // effectiveDeps 逐 ref 钉 sessionModel 重跑本回合（不占新轮次）；
    // triedFallbackRefs 每 ref 一次性（防死循环）。未配置面（fallbackModels
    // 缺省）= effectiveDeps 恒 = deps + 零 fallback 分支，catch 原样穿透。
    let effectiveDeps: AgentLoopDeps = deps
    const triedFallbackRefs = new Set<string>()
    for (;;) {
      const roundInputLen = messages.length
      try {
        lastRound = await queryOneRound(effectiveDeps, tools, messages)
      } catch (err) {
        if (
          !reactiveRetried &&
          deps.reactiveCompact !== undefined &&
          isReactiveCompactEnabled() &&
          isReactiveCompactRecoverableError(err)
        ) {
          reactiveRetried = true
          let recovered: Message[] | undefined
          try {
            const result = await deps.reactiveCompact({ messages, turn: turns })
            // AD-22（0.1.50，CC 2.1.105）：PreCompact hook block → skip 载体
            // （压缩未执行）= 恢复不可用（穿透回显原 413 错误）——不得以
            // skip 载体 buildPostCompactMessages 换消息面（占位字段会误丢
            // 原上下文）。
            if (result && !result.compactionSkipped) {
              recovered = buildPostCompactMessages(result)
            }
          } catch (compactErr) {
            // 消费者异常 = 恢复不可用（fail-safe：错误路径零行为变更，回显原错误）
            logForDebugging(
              `[reactive-compact] consumer failed: ${errorMessage(compactErr)}`,
            )
          }
          if (recovered && recovered.length > 0) {
            messages = recovered
            // S-E3 A11（旧 L607 同型）：compact 写面 persist post-compact 序列
            if (deps.transcript) {
              await deps.transcript.record(messages)
              // 0.1.67 C-1：reactive-compact 恢复支 = 第三处 post-compact 追加面，
              // 同款 post-append 重钉（与 autoCompact 支等价位）。
              deps.transcript.reAppendSessionMetadata?.()
            }
            // W3-3a：压缩边界事件（post-compact 全序列；适配层消费 messages[0] 边界面）
            deps.emit?.({ type: 'compacted', turn: turns, messages })
            // 一次性重试本回合（reactiveRetried 已置位 → 二次 413 穿透原错误）
            continue
          }
          // 恢复不可用（消费者 null/异常）→ 落回显原始错误
        }
        // 0.1.59 C 簇（CC 2.1.166）：回合级跨回合有序 fallback 表（≤3）。
        // 可重试模型错误（shouldRetryModelError 单一事实源，abort 不重试）+ 表内
        // 下一 ref 未试 → 钉下一 ref 为 sessionModel 重跑本回合（不占新轮次，
        // 同 reactiveRetried 一次性门语义；triedFallbackRefs 每 ref 一次性防
        // 死循环）。未配置面（fallbackModels 缺省）= nextFallbackRef 恒
        // undefined → 原样穿透（catch 原语义零变更）；全表耗尽（≤3 ref 全败）
        // = 末次错误穿透。
        const nextRef = nextFallbackRef(deps.fallbackModels, triedFallbackRefs)
        if (nextRef && shouldRetryModelError(err, deps.signal)) {
          triedFallbackRefs.add(nextRef)
          effectiveDeps = { ...deps, sessionModel: nextRef }
          continue
        }
        // 0.1.63 P2/P3（CC 演化 2.1.173→2.1.295）：goal 跑动中错误恢复 +
        // 不可恢复自清除。turnRecovery/reactive-compact/fallback 全耗尽后穿透
        // 前——若 goal armed 且非 abort（用户主动中断非错误），按 error 分类
        // 更新 goal 状态（防 armed goal 静默挂死——击穿「coding agent 持续长
        // 时间不中断」基本要求）：
        //   unrecoverable（401/403 auth 吊销 / 上下文溢出）→ clearGoal +
        //     通知（不再 armed，fail-closed）
        //   recoverable（429/5xx/连接抖动/未知）→ pauseGoal + 通知
        //     （配额恢复后 /goal resume 续跑，条件不丢）
        // 错误仍穿透（用户可见错误），goal 状态先行更新防静默挂死。
        if (isGoalArmed() && !deps.signal?.aborted) {
          const goalCondition = getGoalCondition()!
          const errorReason = errorMessage(err)
          if (classifyGoalError(err) === 'unrecoverable') {
            clearGoal()
            deps.transcript?.saveGoalState?.(null)
            deps.emit?.({ type: 'goal_unrecoverable', condition: goalCondition, reason: errorReason })
          } else {
            pauseGoal(errorReason)
            deps.emit?.({ type: 'goal_paused', condition: goalCondition, reason: errorReason })
          }
        }
        throw err
      }
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
      break
    }
    if (lastRound.deferred) {
      // AD-45 0.1.52：defer 挂起 → 循环挂起 break（不产 tool_result、不走
      // terminal stop-hooks 支——挂起 ≠ 停止意图）。挂起标记已随轮末序列
      // record（queryOneRound）；消费支 = headless --resume 重评
      // （print.ts findDeferredToolUseState / reEvaluateDeferredToolCalls）。
      deferredToolUse = lastRound.deferred
      break
    }
    if (lastRound.toolResults.length === 0) {
      // 0.1.62 /goal C0-2（CC 2.1.139 核心）+ 0.1.63 P2 paused 守卫：
      // goal armed 且未 paused → 评估器（small 角色无 tools）判达成/未达成：
      //   未达成 = 注入续跑指令（2.1.173 reminder 语义）+ 续跑（不终止）；
      //   达成 = 清 goal + 终止事件（自清除，无「run /goal clear」提示）；
      //   maxGoalTurns 超限 = 强制终止（防 runaway 硬守卫）。
      // goal paused（P2 可恢复错误暂停）→ 不评估不续跑，终止本轮（等配额恢复
      //   后 /goal resume 续跑；评估器在 paused 态调用会重复触发同一错误）。
      // goal 未 armed = 既有 stopHooks 消费点（字节级恒等——零回归守卫项）。
      if (isGoalArmed() && !isGoalPaused()) {
        const condition = getGoalCondition()!
        // 硬守卫：goal 续跑计数超限 → 强制终止（防 runaway，同 maxTurns 兜底模式）
        if (goalTurns >= maxGoalTurns) {
          clearGoal()
          // P1 持久化：cleared 快照回写缓存（防 reAppend 写陈旧 armed 态）
          deps.transcript?.saveGoalState?.(null)
          terminated = true
          break
        }
        // 0.1.63 P6（CC 演化）：hook 门控显式报错——disableAllHooks 时 goal
        // 续跑机制不可用（静默挂起）→ 显式 clearGoal + 报错事件（非静默）。
        if (shouldDisableAllHooksIncludingManaged()) {
          clearGoal()
          deps.transcript?.saveGoalState?.(null)
          deps.emit?.({
            type: 'goal_unrecoverable',
            condition,
            reason: goalHookGateNotification(),
          })
          terminated = true
          break
        }
        // 0.1.63 P5（CC 演化）：评估器时序守卫——后台任务（LocalShellTask 族）
        // 运行中 → 评估器零调用（不提前触发，等终态再评估）。未注入 = 零回归。
        if (deps.hasPendingBackgroundTasks?.()) {
          // 后台任务运行中 = 不评估不续跑，终止本轮（下轮/用户消息后重判）
          terminated = true
          break
        }
        goalTurns++
        // 0.1.63 P2/P3：评估器是独立 small-role chat 调用——可独立注障。
        // 评估器 throw = 按 error 分类更新 goal 状态 + 终止（不穿透——评估器
        // 是内部机制，用户无需见原始错误；通知行承载原因）。
        let evalResult
        try {
          evalResult = await evaluateGoal({
            modelProvider: deps.modelProvider,
            signal: deps.signal,
            messages,
            condition,
          })
        } catch (evalErr) {
          if (deps.signal?.aborted) throw evalErr
          const errorReason = errorMessage(evalErr)
          if (classifyGoalError(evalErr) === 'unrecoverable') {
            clearGoal()
            deps.transcript?.saveGoalState?.(null)
            deps.emit?.({ type: 'goal_unrecoverable', condition, reason: errorReason })
          } else {
            pauseGoal(errorReason)
            deps.emit?.({ type: 'goal_paused', condition, reason: errorReason })
          }
          terminated = true
          break
        }
        if (evalResult.met) {
          // 达成 = 自清除 + 终止（2.1.173 纪律：勿提示 run /goal clear）
          clearGoal()
          // P1 持久化：cleared 快照回写缓存（防 reAppend 写陈旧 armed 态）
          deps.transcript?.saveGoalState?.(null)
          deps.emit?.({ type: 'goal_met', condition })
          terminated = true
          break
        }
        // 未达成 = 注入续跑指令 + 续跑（不终止；turnCounter 继续轮末自增）
        const reminder = goalContinuationReminder(condition)
        messages = [...messages, reminder]
        if (deps.transcript) {
          await deps.transcript.record(messages)
        }
        deps.emit?.({
          type: 'goal_continuation',
          condition,
          turn: turns,
          reason: evalResult.reason,
        })
        // 落继续轮末 turnCounter 续跑（不终止，防停——同 preventStop=true 语义）
      } else if (isGoalPaused()) {
        // 0.1.63 P2：goal paused = 等配额恢复，不评估不续跑（终止本轮；
        // 用户可 /goal resume 或发新消息——paused 态评估器会重复触发错误）。
        terminated = true
        break
      } else {
        // E-5 S-5a：stop hooks 消费点（C-4 归属订正：stop hooks = E-5 非 E-1b，
        // 旧仓 Stop 事件——continue:false 可阻止停止）：preventContinuation=true →
        // 阻止停止续跑（maxTurns 守卫仍为终止兜底）；blockingErrors/additionalContext
        // 回灌 = 消息/REPL 波前向接缝（engine/hooks 头注登记）。
        // ★ 零回归：goal 未 armed 时本支字节级恒等（既有路径零漂移）。
        const stop = deps.hooks?.stopHooks
        const preventStop = stop ? (await stop(deps.signal)).preventContinuation : false
        if (!preventStop) {
          terminated = true
          break
        }
        // preventStop=true → 落继续轮末 turnCounter 续跑（不终止，防停）
      }
    }
    // 继续轮末：距上次 compact 的轮数自增（旧仓 loop.ts:1458-1460：仅 tracking.compacted
    // 会话、仅继续轮——terminal 轮不增，语义 = 「距上次 compact 几轮」）。
    if (tracking.compacted) {
      tracking = { ...tracking, turnCounter: tracking.turnCounter + 1 }
    }
  }

  // R1（P0 静默终止）：末轮空内容（terminal-break 或 maxTurns 截断于空）= 静默空回合
  // 信号。正常文本终止 lastRound.empty=false → 不触发。供 REPL 出用户可见提示。
  const emptyTerminated = lastRound?.empty === true
  const result: AgentLoopResult = {
    messages,
    turns,
    terminated,
    tracking,
    lastRound,
    emptyTerminated,
    deferred: deferredToolUse,
  }
  // W3-3a：终态事件（适配层 = generator return 面）
  deps.emit?.({ type: 'loop_end', result })
  return result
}
