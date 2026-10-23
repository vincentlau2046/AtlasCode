/**
 * modelprovider 域类型 — 从旧仓 types/atlas.ts + modelprovider/types.ts 迁入
 *
 * APIError 类族：旧仓 types/atlas.ts:12-66 自定义错误类（非 openai SDK 原生），
 * modelprovider errorMessaging/errorUtils/modelErrors 依赖 instanceof 判定，
 * 必须保留运行时类定义（不能只做 type）。
 * 0.1.79 W-C (F-4)：双族合并归一类 — 本文件为单一事实源，tui/types/atlas.ts
 * re-export（原 tui 侧独立 opts 形状定义删除）；构造函数双形状并集
 * （positional `(message, status?, error?)` + opts `{status, code, headers,
 * error}`），子类 name 语义并（RateLimit/Authentication 设名 = tui 语义，
 * 零 src 构造点纯增益；其余子类保持 name='APIError' = modelprovider 语义，
 * modelprovider.ts abort/连接分类器按 name 读面向 SDK 形状外来错误）。
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
  code?: string
  headers?: any
  error?: unknown
  [k: string]: any
  constructor(
    message?: string,
    statusOrOpts?: number | { status?: number; code?: string; headers?: any; error?: unknown },
    error?: unknown,
  ) {
    super(message ?? 'API error')
    this.name = 'APIError'
    if (typeof statusOrOpts === 'number') {
      // positional 形状（modelprovider 面：errorMessaging/errorUtils 分类构造）
      if (statusOrOpts !== undefined) this.status = statusOrOpts
      if (error !== undefined) this.error = error
    } else if (statusOrOpts) {
      // opts 形状（tui 面：SDK 兼容 `{status, code, headers}`）
      if (statusOrOpts.status !== undefined) this.status = statusOrOpts.status
      if (statusOrOpts.code !== undefined) this.code = statusOrOpts.code
      if (statusOrOpts.headers !== undefined) this.headers = statusOrOpts.headers
      if (statusOrOpts.error !== undefined) this.error = statusOrOpts.error
    }
  }
}

// tui 语义保留：设名 + retryAfter（零 src 构造点，行为面纯增益）。
export class RateLimitError extends APIError {
  retryAfter?: number
  constructor(
    message?: string,
    opts?: { status?: number; code?: string; headers?: any; retryAfter?: number },
  ) {
    super(message, opts)
    this.name = 'RateLimitError'
    if (opts && opts.retryAfter !== undefined) this.retryAfter = opts.retryAfter
  }
}

export class AuthenticationError extends APIError {
  constructor(
    message?: string,
    opts?: { status?: number; code?: string; headers?: any },
  ) {
    super(message, opts)
    this.name = 'AuthenticationError'
  }
}

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

/**
 * 0.1.70 G-1（composing token 回归波）：per-token delta 面 — StreamEvent 的
 * delta 类 4 事件子集（text_delta / tool_use_start / tool_use_delta /
 * tool_use_end；message_stop / error / assistant = 终态事件，不转发）。
 * 消费 = modelProvider.chat onStreamDelta 槽（engine queryOneRound 透传 emit
 * stream_delta 事件面，TUI stream_delta 分支本波消费 text 面；tool_use 面 +
 * thinking_delta 面 = 0.1.71 候选，届时到达 G-1 零改动）。
 */
export type StreamDelta =
  | TextDeltaEvent
  | ToolUseStartEvent
  | ToolUseDeltaEvent
  | ToolUseEndEvent
