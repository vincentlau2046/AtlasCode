/**
 * messaging 域 — 入轮命令队列类型面（E-7 S-7e d2，§8.50）。
 *
 * 旧仓来源（a8af45b）：
 *   - PromptInputMode / EditablePromptInputMode / QueuePriority /
 *     QueuedCommand ← src/types/textInputTypes.ts（shell UI 巨文件 ~500L 不
 *     随迁；仅入轮队列层 4 型 + 关联类型族随迁，§8.50 d2 执行前分析
 *     bb570f4 裁定；字段面 + 字段 JSDoc 逐字）
 *   - PastedContent ← src/utils/config.ts:46-54（新仓 grep 0 命中——config
 *     域未随迁 pasted 面；形逐字）
 *   - ImageDimensions ← src/utils/imageResizer.ts:137（形逐字；
 *     imageResizer 体 = shell 波不随迁）
 *   - OrphanedPermission ← 旧 textInputTypes.ts 尾（旧形 =
 *     { permissionResult: PermissionResult; assistantMessage:
 *     AssistantMessage }，两型 ∉ 新仓）
 *   - MessageOrigin ← 旧 types/message.ts:43（`any` stub）
 *   - AppState ← 旧 state/AppState.ts（React 状态接口 = 壳层）
 *
 * 类型面 delta（H6 登记，复审勿当遗漏重提）：
 *   - OrphanedPermission → unknown 字段最小形（H6：仅类型字段，引擎面无
 *     消费者；旧形 PermissionResult / AssistantMessage 归 sdk/permissions
 *     波，前向接缝）。
 *   - MessageOrigin（旧 any-stub）→ string 最小形（BackendType 先例；
 *     H6：绝不把 `: any` stub 签名当真行为）。
 *   - AppState → `object` 不透明最小形：SetAppState duck 化类型面
 *     （queueManager 仅导出类型不触体）；shell 波组合根注真状态。
 *   - UUID / AgentId（旧 crypto 品牌串 / brand）→ session 域 `string`
 *     别名（coordinator/worktree 域先例；as-cast 恒为 no-op）。
 *   - Permutations（旧 types/utils any-stub）不随迁：旧
 *     `satisfies Permutations<…> as any` 链在 stub 下本未生效 →
 *     queueManager 删链（Set 构造语义等价，非行为回归；登记见
 *     queueManager.ts 头注）。
 */
import type { AgentId, UUID } from '../session'
import type { ContentBlockParam } from '../../shared'

/**
 * Input modes for the prompt
 */
export type PromptInputMode =
  | 'bash'
  | 'prompt'
  | 'orphaned-permission'
  | 'task-notification'

export type EditablePromptInputMode = Exclude<
  PromptInputMode,
  `${string}-notification`
>

/**
 * Queue priority levels.
 *
 *  - `now`   — Interrupt and send immediately. Aborts any in-flight tool
 *              call (equivalent to Esc + send). Consumers (print.ts,
 *              REPL.tsx) subscribe to queue changes and abort when they
 *              see a 'now' command.
 *  - `next`  — Mid-turn drain. Let the current tool call finish, then
 *              send this message between the tool result and the next API
 *              round-trip.
 *  - `later` — End-of-turn drain. Wait for the current turn to finish,
 *              then process as a new query.
 */
export type QueuePriority = 'now' | 'next' | 'later'

/**
 * Queued command type
 */
export type QueuedCommand = {
  value: string | Array<ContentBlockParam>
  mode: PromptInputMode
  /** Defaults to the priority implied by `mode` when enqueued. */
  priority?: QueuePriority
  uuid?: UUID
  orphanedPermission?: OrphanedPermission
  /** Raw pasted contents including images. Images are resized at execution time. */
  pastedContents?: Record<number, PastedContent>
  /**
   * The input string before [Pasted text #N] placeholders were expanded.
   * Used for ultraplan keyword detection so pasted content containing the
   * keyword does not trigger a CCR session. Falls back to `value` when
   * unset (bridge/UDS/MCP sources have no paste expansion).
   */
  preExpansionValue?: string
  /**
   * When true, the input is treated as plain text even if it starts with `/`.
   * Used for remotely-received messages (e.g. bridge/CCR) that should not
   * trigger local slash commands or skills.
   */
  skipSlashCommands?: boolean
  /**
   * When true, slash commands are dispatched but filtered through
   * isBridgeSafeCommand() — 'local-jsx' and terminal-only commands return
   * a helpful error instead of executing. Set by the Remote Control bridge
   * inbound path so mobile/web clients can run skills and benign commands
   * without re-exposing the PR #19134 bug (/model popping the local picker).
   */
  bridgeOrigin?: boolean
  /**
   * When true, the resulting UserMessage gets `isMeta: true` — hidden in
   * the transcript UI but visible to the model. Used by system-generated
   * prompts (teammate messages, resource updates) that route through
   * the queue instead of calling `onQuery` directly.
   */
  isMeta?: boolean
  /**
   * Provenance of this command. Stamped onto the resulting UserMessage so
   * the transcript records origin structurally (not just via XML tags in
   * content).
   * undefined = human (keyboard).
   */
  origin?: MessageOrigin
  /**
   * Workload tag threaded through to cc_workload= in the billing-header
   * attribution block. The queue is the async boundary between the cron
   * scheduler firing and the turn actually running — a user prompt can
   * slip in between — so the tag rides on the QueuedCommand itself and is
   * only hoisted into bootstrap state when THIS command is dequeued.
   */
  workload?: string
  /**
   * Agent that should receive this notification. Undefined = main thread.
   * Subagents run in-process and share the module-level command queue; the
   * drain gate in query.ts filters by this field so a subagent's background
   * task notifications don't leak into the coordinator's context (PR #18453
   * unified the queue but lost the isolation the dual-queue accidentally
   * had).
   */
  agentId?: AgentId
}

/**
 * （旧 config.ts:46 PastedContent 形逐字；ImageDimensions 见下，
 * imageResizer 体 = shell 波不随迁）
 */
export type PastedContent = {
  id: number // Sequential numeric ID
  type: 'text' | 'image'
  content: string
  mediaType?: string // e.g., 'image/png', 'image/jpeg'
  filename?: string // Display name for images in attachment slot
  dimensions?: ImageDimensions
  sourcePath?: string // Original file path for images dragged onto the terminal
}

/**
 * （旧 imageResizer.ts:137 ImageDimensions 形逐字）
 */
export type ImageDimensions = {
  originalWidth?: number
  originalHeight?: number
  displayWidth?: number
  displayHeight?: number
}

/**
 * （旧 OrphanedPermission 最小形——旧形两型 ∉ 新仓，delta 登记见文件头）
 */
export type OrphanedPermission = {
  permissionResult: unknown
  assistantMessage: unknown
}

/**
 * （旧 message.ts:43 MessageOrigin = any stub → string 最小形，
 * delta 登记见文件头）
 */
export type MessageOrigin = string

/**
 * （旧 state/AppState React 状态接口 = 壳层 → 不透明最小形；
 * SetAppState duck 化，shell 波组合根注真状态，delta 登记见文件头）
 */
export type AppState = object
