/**
 * engine/context — HIGH GAP 重体端口缝（D-2a S6，M5 切端）：
 * TUI 活消费但本体 LLM-bound/宿主耦合的 4 名（trySessionMemoryCompaction /
 * tryReactiveCompact / reactiveCompactOnPromptTooLong / partialCompactConversation）
 * 的「engine 名 + 契约」落位——本体归属 tui 宿主侧（S8 接线把旧 orchestrator
 * 本体迁出 orchestrator 目录后经 set*Port 注入；本体全量 engine 化 = W-opt
 * 后续，H6 防空洞登记：LLM-bound 本体不迁 engine 本体，防引擎膨胀）。
 *
 * 契约（复审基准）：
 *  - 端口未注册时门面显式 THROW（fail-fast 不静默退化——S3 CompactPorts 先例）；
 *    S8 前 TUI 经 engineCompat 冲突块仍走 orchestrator 富体（引擎门面仅
 *    单测可达，S8 接线保证注端口，零生产影响）。
 *  - 签名/结果形 = 旧仓 orchestrator 逐字（调用点 compact.ts / REPL.tsx
 *    零改动）；reactive 4 谓词名（isReactiveCompactEnabled 等）= engine
 *    reactiveCompact.ts 单源（W2-2-pre ④），本模块仅 LLM-bound 入口对。
 */
import type { Message } from '../../shared'
import type { CompactionResult } from './compact'
import type { CacheSafeParams, CompactContext } from './compactPorts'

/**
 * 旧仓 tui PartialCompactDirection 逐字（4 值联合）：'up_to' = 摘要 pivot
 * 之前 / 'from' = 之后；'older'/'newer' = REPL 部分压缩 UI 的别名面（宿主
 * 本体仅判 === 'up_to' 二分，余值走 'from' 族）。
 */
export type PartialCompactDirection = 'older' | 'newer' | 'up_to' | 'from'

/** 旧仓 TryReactiveCompactParams 结构面（reactiveCompact.ts L74-88 逐字）。 */
export interface TryReactiveCompactParams {
  /** 本轮是否已尝试过 reactive compact？ */
  hasAttempted: boolean
  /** query source（防 compact / session_memory 递归）。 */
  querySource: string
  /** 请求是否已中断？ */
  aborted: boolean
  /** 当前消息数组（出错前）。 */
  messages: Message[]
  /** fork 压缩缓存安全参数（Pick 面 = 旧仓逐字）。 */
  cacheSafeParams: Pick<
    CacheSafeParams,
    'systemPrompt' | 'userContext' | 'systemContext' | 'toolUseContext' | 'forkContextMessages'
  >
}

/** 旧仓 ReactiveCompactResult 逐字（/compact 手动支 + PTL 反应支共用）。 */
export type ReactiveCompactOutcome =
  | {
      ok: true
      messages: Message[]
      postCompactMessages: Message[]
      compactionResult: CompactionResult
    }
  | {
      ok: false
      reason?: 'too_few_groups' | 'aborted' | 'exhausted' | 'error' | 'media_unstrippable'
    }

/** session-memory 压缩端口（旧仓 sessionMemoryCompact.ts 615L 本体宿主侧持有）。 */
export interface SessionMemoryCompactPort {
  trySessionMemoryCompaction: (
    messages: Message[],
    agentId?: string,
    autoCompactThreshold?: number,
  ) => Promise<CompactionResult | null>
}

/** reactive-compact LLM-bound 入口对端口（旧仓 reactiveCompact.ts 本体宿主侧持有）。 */
export interface ReactiveCompactPort {
  tryReactiveCompact: (params: TryReactiveCompactParams) => Promise<CompactionResult | null>
  reactiveCompactOnPromptTooLong: (
    messages: Message[],
    cacheSafeParams: CacheSafeParams,
    options: { customInstructions?: string; trigger: 'manual' | 'auto' },
  ) => Promise<ReactiveCompactOutcome>
}

/** 部分压缩端口（旧仓 compact.ts L682-967 direction-aware 变体宿主侧持有）。 */
export interface PartialCompactPort {
  partialCompactConversation: (
    allMessages: Message[],
    pivotIndex: number,
    context: CompactContext,
    cacheSafeParams: CacheSafeParams,
    userFeedback?: string,
    direction?: PartialCompactDirection,
  ) => Promise<CompactionResult>
}

let sessionMemoryCompactPort: SessionMemoryCompactPort | null = null

/** 宿主注 session-memory 端口（S8 tui 接线）；传 null 复位（单测 teardown）。 */
export function setSessionMemoryCompactPort(
  next: SessionMemoryCompactPort | null,
): void {
  sessionMemoryCompactPort = next
}

let reactiveCompactPort: ReactiveCompactPort | null = null

export function setReactiveCompactPort(next: ReactiveCompactPort | null): void {
  reactiveCompactPort = next
}

let partialCompactPort: PartialCompactPort | null = null

export function setPartialCompactPort(next: PartialCompactPort | null): void {
  partialCompactPort = next
}

// ── 门面（旧仓名/签名保形；端口未注册显式 THROW）────────────────────────

/**
 * session-memory 压缩（旧仓 L508 签名逐字）：SM 实验分支——先于全量压缩
 * 尝试（/compact 无自定义指令支 + autoCompactIfNeeded SM 支）。
 */
export function trySessionMemoryCompaction(
  messages: Message[],
  agentId?: string,
  autoCompactThreshold?: number,
): Promise<CompactionResult | null> {
  if (!sessionMemoryCompactPort) {
    throw new Error(
      'trySessionMemoryCompaction: port 未注册（S8 tui 接线 setSessionMemoryCompactPort）',
    )
  }
  return sessionMemoryCompactPort.trySessionMemoryCompaction(
    messages,
    agentId,
    autoCompactThreshold,
  )
}

/**
 * 413/media 错误 withholding 后的反应压缩（旧仓 L97 签名逐字）；
 * 不适用/失败 → null（调用方回显原错误）。
 */
export function tryReactiveCompact(
  params: TryReactiveCompactParams,
): Promise<CompactionResult | null> {
  if (!reactiveCompactPort) {
    throw new Error(
      'tryReactiveCompact: port 未注册（S8 tui 接线 setReactiveCompactPort）',
    )
  }
  return reactiveCompactPort.tryReactiveCompact(params)
}

/**
 * 手动 / PTL 反应压缩入口（旧仓 L159 签名逐字）：/compact 命令 +
 * prompt-too-long 可剥离内容触发；失败回 { ok: false, reason }。
 */
export function reactiveCompactOnPromptTooLong(
  messages: Message[],
  cacheSafeParams: CacheSafeParams,
  options: { customInstructions?: string; trigger: 'manual' | 'auto' },
): Promise<ReactiveCompactOutcome> {
  if (!reactiveCompactPort) {
    throw new Error(
      'reactiveCompactOnPromptTooLong: port 未注册（S8 tui 接线 setReactiveCompactPort）',
    )
  }
  return reactiveCompactPort.reactiveCompactOnPromptTooLong(
    messages,
    cacheSafeParams,
    options,
  )
}

/**
 * direction-aware 部分压缩（旧仓 L682 签名逐字；活消费点 REPL.tsx
 * L4579）：按 pivotIndex 切分「摘要侧 / 保留侧」（'up_to' 摘要 pivot 之前 /
 * 'from' 之后），direction 缺省 'from'。
 */
export function partialCompactConversation(
  allMessages: Message[],
  pivotIndex: number,
  context: CompactContext,
  cacheSafeParams: CacheSafeParams,
  userFeedback?: string,
  direction?: PartialCompactDirection,
): Promise<CompactionResult> {
  if (!partialCompactPort) {
    throw new Error(
      'partialCompactConversation: port 未注册（S8 tui 接线 setPartialCompactPort）',
    )
  }
  return partialCompactPort.partialCompactConversation(
    allMessages,
    pivotIndex,
    context,
    cacheSafeParams,
    userFeedback,
    direction,
  )
}
