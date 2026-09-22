/**
 * modelprovider 域类型 — 从旧仓 types/atlas.ts + modelprovider/types.ts 迁入
 *
 * APIError 类族：旧仓 types/atlas.ts:12-66 自定义错误类（非 openai SDK 原生），
 * modelprovider errorMessaging/errorUtils/modelErrors 依赖 instanceof 判定，
 * 必须保留运行时类定义（不能只做 type）。
 *
 * StreamEvent：旧仓 modelprovider/types.ts:1-77 原生流事件联合类型。
 *
 * SDKAssistantMessageError：旧仓 entrypoints/agentSdkTypes.ts:504 = any stub。
 * // TODO: PR to shared — SDKAssistantMessageError 真实联合待 C 波补全
 */

// ════════════════════════════════════════════════════════════════
// APIError 类族（旧仓 types/atlas.ts:12-66）
// ════════════════════════════════════════════════════════════════

export class APIError extends Error {
  status?: number
  error?: unknown
  constructor(message: string, status?: number, error?: unknown) {
    super(message)
    this.name = 'APIError'
    if (status !== undefined) this.status = status
    if (error !== undefined) this.error = error
  }
}

export class RateLimitError extends APIError {}
export class AuthenticationError extends APIError {}
export class NotFoundError extends APIError {}
export class APIConnectionError extends APIError {}
export class APIConnectionTimeoutError extends APIConnectionError {}
export class APIUserAbortError extends APIError {}

// 旧仓 = any stub
// TODO: PR to shared — BetaMessage 真实类型待 C 波从 SDK 补全
export type BetaMessage = any

// 旧仓 entrypoints/agentSdkTypes.ts:504 = any stub
// TODO: PR to shared — SDKAssistantMessageError 真实联合待 C 波补全
export type SDKAssistantMessageError = any

// ════════════════════════════════════════════════════════════════
// StreamEvent（旧仓 modelprovider/types.ts:1-77）
// ════════════════════════════════════════════════════════════════

/** Shared usage block — snake_case, aligned with Usage + utils/tokens.ts. */
export interface StreamUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

export interface TextDeltaEvent {
  type: 'text_delta'
  text: string
}

export interface ToolUseStartEvent {
  type: 'tool_use_start'
  id: string
  name: string
}

export interface ToolUseDeltaEvent {
  type: 'tool_use_delta'
  id: string
  inputJsonDelta: string
}

export interface ToolUseEndEvent {
  type: 'tool_use_end'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface MessageStartEvent {
  type: 'message_start'
  message: unknown
}

export interface MessageStopEvent {
  type: 'message_stop'
  usage?: StreamUsage
  stopReason?: string
}

export type LLMErrorCode =
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'API_ERROR'
  | 'INVALID_REQUEST'
  | 'UNKNOWN'

export interface ErrorEvent {
  type: 'error'
  code: LLMErrorCode
  message: string
  retryable: boolean
}

/** Native stream event — replaces GatewayStreamEvent and ProviderStreamEvent. */
export type StreamEvent =
  | TextDeltaEvent
  | ToolUseStartEvent
  | ToolUseDeltaEvent
  | ToolUseEndEvent
  | MessageStartEvent
  | MessageStopEvent
  | ErrorEvent
