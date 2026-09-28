/**
 * SDK stdio 协议本地型面（S-C3 §8.71.1.4 · cli 域单一事实源）。
 *
 * 旧仓来源：@modelcontextprotocol/sdk/types.js（ElicitResult / JSONRPCMessage）
 * + entrypoints/sdk/coreTypes·controlTypes（全 any-stub 零约束）+
 * hooks/useCanUseTool.tsx CanUseToolFn（L26 签名）。
 *
 * 裁登记（复审勿当遗漏重提）：
 *   - 旧仓 SDK 类型文件全 any-stub（型面无约束）→ 本文件 = cli 域最小结构型
 *     单一事实源：wire 字段保真（structuredIO / print + SDK host 侧消费），
 *     开放字段经索引签名承载（SDK 协议前向兼容字段不拒绝）。
 *   - 新仓无 @modelcontextprotocol/sdk npm 依赖（mcp 域 = 自建 mcpJsonRpc，
 *     lsp 域同构先例 delta ①）→ ElicitResult / JsonRpcMessage wire 型本地
 *     转写。
 *   - CanUseToolFn 旧仓签名逐字（富 Tool / 富 ToolUseContext → 新仓窄视图
 *     SdkToolView / SdkToolUseContext；SdkToolView 结构兼容 permissions 根
 *     门面 PermissionTool——name 必需 + 可选成员——直接可赋）。
 *   - HookCallback 返回值 = 新仓 hooks 域 HookJSONOutput（薄主字段面 +
 *     passthrough 开放字段）；旧仓 per-event hookSpecificOutput 联合裁
 *     （hooks 域薄骨架裁定 §8.56）；callback 入参 = SDK host wire JSON
 *     （unknown，强型 HookInput 不适于裸 wire 数据）。
 */
import { z, type ZodType } from 'zod'
import type {
  AssistantMessage,
  PermissionDecision,
  PermissionUpdate,
  ToolPermissionContext,
} from '../shared'
import type { HookJSONOutput } from '../hooks'

// ── SDK wire 消息（旧仓 coreTypes any-stub 最小面）──────────────────────

/** wire 消息：SDK user 消息（replay / bridge 注入；prependUserMessage 产点）。 */
export interface SdkUserMessage {
  type: 'user'
  session_id?: string
  message: { role: 'user'; content: unknown; [key: string]: unknown }
  parent_tool_use_id?: string | null
  [key: string]: unknown
}

/** wire 消息：assistant 消息（流式 / replay）。 */
export interface SdkAssistantMessage {
  type: 'assistant'
  session_id?: string
  message?: Record<string, unknown>
  [key: string]: unknown
}

/** wire 消息：system 消息（init / compact_boundary / 等）。 */
export interface SdkSystemMessage {
  type: 'system'
  subtype?: string
  session_id?: string
  [key: string]: unknown
}

/** wire 消息：result（回合终消息，print drain 环 result flush 站点消费）。 */
export interface SdkResultMessage {
  type: 'result'
  subtype?: string
  session_id?: string
  is_error?: boolean
  num_turns?: number
  result?: string
  [key: string]: unknown
}

/**
 * SDK wire 消息联合（封闭 4 成员）。旧仓尾开放成员裁：开放
 * `type: string` 成员会污染判别式窄化（`message.type === 'control_response'`
 * 后 `.response` 降 unknown，全 processLine 面 TS 失守）——runtime 未知
 * type 由 processLine 的未知 type 守卫支兜底（log + ignore），型面不承载。
 */
export type SDKMessage =
  | SdkUserMessage
  | SdkAssistantMessage
  | SdkSystemMessage
  | SdkResultMessage

// ── 控制协议（旧仓 controlTypes any-stub 最小面）──────────────────────

/** can_use_tool 请求载荷（createCanUseTool / createSandboxAskCallback 产点）。 */
export interface SdkCanUseToolRequest {
  subtype: 'can_use_tool'
  tool_name: string
  input: Record<string, unknown>
  permission_suggestions?: PermissionUpdate[]
  blocked_path?: string
  decision_reason?: string
  tool_use_id?: string
  agent_id?: string
  description?: string
}

/** hook_callback 请求载荷（createHookCallback 产点）。 */
export interface SdkHookCallbackRequest {
  subtype: 'hook_callback'
  callback_id: string
  input: unknown
  tool_use_id?: string
}

/** elicitation 请求载荷（handleElicitation 产点）。 */
export interface SdkElicitationRequest {
  subtype: 'elicitation'
  mcp_server_name: string
  message: string
  mode?: 'form' | 'url'
  url?: string
  elicitation_id?: string
  requested_schema?: Record<string, unknown>
}

/** mcp_message 请求载荷（sendMcpMessage 产点）。 */
export interface SdkMcpMessageRequest {
  subtype: 'mcp_message'
  server_name: string
  message: JsonRpcMessage
}

/**
 * control_request 内嵌请求（S-C3 入域 subtype 族；旧仓全 20+ subtype 联合 =
 * S-C4 handlers/* 前向接缝，尾开放成员保持 wire 面开放）。
 */
export type SDKControlRequestInner =
  | SdkCanUseToolRequest
  | SdkHookCallbackRequest
  | SdkElicitationRequest
  | SdkMcpMessageRequest
  | {
      subtype:
        | 'initialize'
        | 'mcp_set_servers'
        | 'rewind_files'
        | 'set_permission_mode'
        | (string & {})
      [key: string]: unknown
    }

/** control_request 信封（structuredIO sendRequest 产点 / stdin 读点）。 */
export interface SDKControlRequest {
  type: 'control_request'
  request_id: string
  request: SDKControlRequestInner
}

/** control_response 信封（stdin 读点；response 嵌套层 requestId 兼容见 normalizeControlMessageKeys）。 */
export interface SDKControlResponse {
  type: 'control_response'
  response: {
    subtype: 'success' | 'error'
    request_id: string
    response?: { toolUseID?: string; [key: string]: unknown }
    error?: string
  }
}

/** control_cancel_request（sendRequest abort 支 + injectControlResponse 产点）。 */
export interface SdkControlCancelRequest {
  type: 'control_cancel_request'
  request_id: string
}

/** keep_alive（processLine 静默忽略支）。 */
export interface SdkKeepAliveMessage {
  type: 'keep_alive'
  [key: string]: unknown
}

/**
 * update_environment_variables（bridge session runner auth token 刷新，
 * 旧仓注释保真：直接应用 process.env，REPL 进程自身可读，非仅子 Bash 命令）。
 */
export interface SdkUpdateEnvironmentVariables {
  type: 'update_environment_variables'
  variables: Record<string, string>
}

/** stdin 读面：SDK 消息 + 控制协议 + bridge 扩展。 */
export type StdinMessage =
  | SDKMessage
  | SDKControlRequest
  | SDKControlResponse
  | SdkControlCancelRequest
  | SdkKeepAliveMessage
  | SdkUpdateEnvironmentVariables

/** stdout 写面：SDK 消息 + 控制协议（StructuredIO.write / print drain 环写点）。 */
export type StdoutMessage =
  | SDKMessage
  | SDKControlRequest
  | SDKControlResponse
  | SdkControlCancelRequest

// ── MCP wire 型（旧仓 @modelcontextprotocol/sdk 本地转写）─────────────

/** MCP elicitation 结果（旧仓 SDKControlElicitationResponseSchema 同形）。 */
export type ElicitResult = {
  action: 'accept' | 'decline' | 'cancel'
  content?: Record<string, unknown>
}

/**
 * JSON-RPC 2.0 wire 消息（新仓无 MCP npm 依赖 → 本地最小结构型；响应成员
 * result XOR error，通知成员无 id）。
 */
export type JsonRpcMessage =
  | {
      jsonrpc: '2.0'
      id?: number | string | null
      result?: unknown
      error?: { code: number; message: string; data?: unknown }
    }
  | {
      jsonrpc: '2.0'
      id?: number | string | null
      method: string
      params?: unknown
    }

// ── 工具 / 上下文窄视图 + CanUseToolFn ────────────────────────────────

/**
 * SDK 协议消费的窄 Tool 视图（旧仓富 Tool 接口 → 本域消费的 4 字段；
 * 结构兼容 permissions 根门面 PermissionTool——name 必需 + 可选成员——
 * 直接可赋）。
 */
export interface SdkToolView {
  name: string
  userFacingName?(input: Record<string, unknown>): string
  getActivityDescription?(input: Record<string, unknown>): string
  getToolUseSummary?(input: Record<string, unknown>): string
}

/**
 * SDK 协议消费的窄 ToolUseContext 视图（旧仓富 ToolUseContext → structuredIO /
 * createCanUseTool 消费的 4 字段；全字段面 = 残留守，交互路径由壳波 #152
 * 消费）。
 */
export interface SdkToolUseContext {
  abortController: AbortController
  agentId?: string
  getAppState(): { toolPermissionContext: ToolPermissionContext }
  setAppState(
    updater: (prev: {
      toolPermissionContext: ToolPermissionContext
    }) => { toolPermissionContext: ToolPermissionContext },
  ): void
  options?: { isNonInteractiveSession?: boolean }
}

/**
 * 旧仓 CanUseToolFn 签名（useCanUseTool.tsx L26 逐字；富 Tool / 富
 * ToolUseContext → 新仓窄视图；返回 = 新仓 shared PermissionDecision 三态）。
 */
export type CanUseToolFn = (
  tool: SdkToolView,
  input: Record<string, unknown>,
  toolUseContext: SdkToolUseContext,
  assistantMessage: AssistantMessage,
  toolUseID: string,
  forceDecision?: PermissionDecision,
) => Promise<PermissionDecision>

// ── hook 回调 + wire schema ───────────────────────────────────────────

/**
 * hook 回调（SDK hook_callback control_request；旧仓型 = hooks 域
 * HookCallback 本地窄视图；入参 = SDK host wire JSON（unknown），返回值
 * 经 sdkHookJSONOutputSchema 校验。
 */
export interface HookCallback {
  type: 'callback'
  timeout?: number
  callback: (
    input: unknown,
    toolUseID: string | null,
    abort: AbortSignal | undefined,
  ) => Promise<HookJSONOutput>
}

/**
 * hook 输出校验 schema（旧仓 hookJSONOutputSchema 最小转写：旧仓 per-event
 * hookSpecificOutput 联合裁——新仓 hooks 域 HookJSONOutput = 薄主字段面 +
 * passthrough 开放字段，wire 面保持开放，校验行为对已知字段等价）。
 */
export const sdkHookJSONOutputSchema: ZodType<HookJSONOutput> = z
  .object({
    continue: z.boolean().optional(),
    suppressOutput: z.boolean().optional(),
    stopReason: z.string().optional(),
    decision: z.enum(['approve', 'block']).optional(),
    reason: z.string().optional(),
    systemMessage: z.string().optional(),
    permissionDecision: z.enum(['allow', 'deny', 'ask']).optional(),
    updatedInput: z.record(z.string(), z.unknown()).optional(),
    async: z.literal(true).optional(),
    asyncTimeout: z.number().optional(),
  })
  .passthrough()

/** MCP elicitation 响应 schema（旧仓 SDKControlElicitationResponseSchema 逐字）。 */
export const sdkElicitationResponseSchema: ZodType<ElicitResult> = z.object({
  action: z.enum(['accept', 'decline', 'cancel']),
  content: z.record(z.string(), z.unknown()).optional(),
})
