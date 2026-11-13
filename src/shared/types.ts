/**
 * shared 纯类型骨架 — 契约冻结（B 波分叉前锁死，charter §2 第 1 项）
 *
 * 旧仓来源（a8af45b）→ 新仓 shared 下沉：
 *   atlas types    ← src/types/atlas.ts
 *   message types  ← src/types/message.ts / src/utils/messages.ts
 *   SystemPrompt   ← src/utils/systemPromptType.ts
 *   ThinkingConfig ← src/utils/thinking.ts
 *   Effort         ← src/utils/effort.ts（EffortLevel 旧仓 = any stub，此处冻结为真实联合）
 *   Tool/Tools     ← src/Tool.ts（仅类型部分，React render 字段用 unknown）
 *
 * 签名和旧仓对齐（B/C 波迁移代码 import 这些类型），实现可空。
 * 两个 fork session（S1 sandbox+executor / S2 memory+modelprovider）共享此契约。
 */

// ════════════════════════════════════════════════════════════════
// atlas types（旧仓 src/types/atlas.ts:1-97）
// ════════════════════════════════════════════════════════════════

export interface ContentBlock {
  type: string
  [key: string]: unknown
}

export interface ContentBlockParam {
  type: string
  [key: string]: unknown
}

export interface Usage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
  [key: string]: unknown
}

export interface ToolUseBlock extends ContentBlock {
  type: "tool_use"
  id: string
  name: string
  input: unknown
}

export interface ToolResultBlockParam extends ContentBlockParam {
  type: "tool_result"
  tool_use_id: string
  content?: string | ContentBlockParam[]
  is_error?: boolean
}

export type TextBlock = ContentBlock & { type: "text"; text: string }

export type ThinkingBlock = {
  type: "thinking"
  thinking: string
  signature: string
}

export type RedactedThinkingBlock = { type: "redacted_thinking"; data: string }

export type MessageParam = {
  role: string
  content: string | ContentBlockParam[]
}

// ════════════════════════════════════════════════════════════════
// message types（旧仓 src/types/message.ts:1-55）
// ════════════════════════════════════════════════════════════════

export interface Message {
  role?: string
  content?: unknown
  id?: string
  uuid?: string
  usage?: Usage
  stop_reason?: string
  timestamp?: number | string
  metadata?: unknown
  type?: string
  message?: unknown
  [key: string]: unknown
}

export interface UserMessage extends Message {
  role?: "user"
  content?: unknown
  isImage?: boolean
}

export interface AssistantMessage extends Message {
  role?: "assistant"
  content?: unknown
  stop_reason?: string
  usage?: Usage
}

export interface SystemMessage extends Message {
  role: "system"
}

export type SystemAPIErrorMessage = SystemMessage & { error: string }

export type NormalizedMessage = {
  role: string
  content: string
  id?: string
  [key: string]: unknown
}

// ════════════════════════════════════════════════════════════════
// SystemPrompt（旧仓 src/utils/systemPromptType.ts:8-14）
// ════════════════════════════════════════════════════════════════

export type SystemPrompt = readonly string[] & {
  readonly __brand: "SystemPrompt"
}

export function asSystemPrompt(value: readonly string[]): SystemPrompt {
  return value as SystemPrompt
}

// ════════════════════════════════════════════════════════════════
// ThinkingConfig（旧仓 src/utils/thinking.ts:7-10）
// ════════════════════════════════════════════════════════════════

export type ThinkingConfig =
  | { type: "adaptive" }
  | { type: "enabled"; budgetTokens: number }
  | { type: "disabled" }

// ════════════════════════════════════════════════════════════════
// Effort（旧仓 src/utils/effort.ts — EffortLevel 旧仓 = any stub，此处冻结真实联合）
// ════════════════════════════════════════════════════════════════

/** 旧仓 runtimeTypes.ts:22 = any stub；真实运行时集见 EFFORT_LEVELS（effort.ts:7-17） */
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max"

export const EFFORT_LEVELS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const satisfies readonly EffortLevel[]

export type EffortValue = EffortLevel | number

// ════════════════════════════════════════════════════════════════
// Tool / Tools（旧仓 src/Tool.ts:375-728 — 仅类型部分下沉 shared）
// React render 字段用 unknown（shared 纯叶子不含 React 依赖）
// ════════════════════════════════════════════════════════════════

export type ToolInputJSONSchema = {
  [x: string]: unknown
  type: "object"
  properties?: { [x: string]: unknown }
}

export type ToolProgressData = unknown

export type ToolResult<T = unknown> = {
  data: T
  newMessages?: unknown[]
  contextModifier?: (context: unknown) => unknown
  mcpMeta?: { _meta?: Record<string, unknown>; structuredContent?: Record<string, unknown> }
}

export type ValidationResult =
  | { result: true }
  | { result: false; message: string; errorCode: number }

/**
 * Tool 契约（跨域消费的核心字段）。
 * 完整旧仓 Tool 有 ~40 字段含 React render；此处锁 modelprovider/params.ts
 * 和 engine/pipeline 消费的类型部分。React render 字段 C/D 波补。
 */
export interface Tool<
  Input extends ToolInputJSONSchema = ToolInputJSONSchema,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
> {
  readonly name: string
  readonly inputSchema: Input
  readonly inputJSONSchema?: ToolInputJSONSchema
  outputSchema?: unknown
  maxResultSizeChars: number
  readonly strict?: boolean
  readonly shouldDefer?: boolean
  readonly alwaysLoad?: boolean
  isMcp?: boolean
  isLsp?: boolean
  aliases?: string[]
  searchHint?: string
  mcpInfo?: { serverName: string; toolName: string }

  call(
    args: unknown,
    context: unknown,
    canUseTool: unknown,
    parentMessage: AssistantMessage,
    onProgress?: (progress: P) => void,
  ): Promise<ToolResult<Output>>
  description(
    input: unknown,
    options: {
      isNonInteractiveSession: boolean
      toolPermissionContext: unknown
      tools: Tools
    },
  ): Promise<string>
  isConcurrencySafe(input: unknown): boolean
  isEnabled(): boolean
  isReadOnly(input: unknown): boolean
  isDestructive?(input: unknown): boolean
  interruptBehavior?(): "cancel" | "block"
  checkPermissions(input: unknown, context: unknown): Promise<unknown>
  validateInput?(input: unknown, context: unknown): Promise<ValidationResult>
  userFacingName(input: unknown): string
  toAutoClassifierInput(input: unknown): unknown
  mapToolResultToToolResultBlockParam(
    content: Output,
    toolUseID: string,
  ): ToolResultBlockParam
  renderToolUseMessage(
    input: unknown,
    options: { theme: unknown; verbose: boolean; commands?: unknown[] },
  ): unknown
  renderToolResultMessage?(
    content: Output,
    progressMessages: unknown[],
    options: unknown,
  ): unknown
  extractSearchText?(out: Output): string
  foldResult?(data: Output): string | null
  isResultTruncated?(output: Output): boolean
}

export type Tools = readonly Tool[]
