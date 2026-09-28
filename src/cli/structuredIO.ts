/**
 * SDK 结构化 stdio IO（旧仓 cli/structuredIO.ts 859L 逐字随迁 + remap 登记）。
 *
 * remap（旧 → 新）：
 *   - feature / logForDebugging / AssistantMessage / PermissionDecision /
 *     PermissionDecisionReason / PermissionUpdate / ToolPermissionContext =
 *     shared 根门面；hasPermissionsToUseTool = permissions 根门面（旧仓富
 *     ToolUseContext 调用面 → 新仓 CanUseToolFn 窄 context 对象，双注入
 *     getToolPermissionContext + getAppState 活 TPC 窄视图）；
 *     persistPermissionUpdates = engine 根门面；applyPermissionUpdates =
 *     permissions 根门面；AbortError = engine 根门面（tools 子门面随迁）。
 *   - zod 惯例：旧 `zod/v4` → 新仓 `zod` 主入口即 v4；schema 型 = ZodType。
 *   - jsonStringify / jsonParse（旧 slowOperations 剖析包裹）→ 本地
 *     JSON.stringify / JSON.parse（剖析面裁，行为等价）。
 *   - writeToStdout（旧 utils/process.ts）→ 本地本地转写（destroyed 守卫 +
 *     无背压，旧 writeOut 注释保真）。
 *   - logForDiagnosticsNoPII（诊断面缺席）/ notifyCommandLifecycle（命令
 *     生命周期面 → session 域）裁 = no-op 删点（头注登记，行为不变量：
 *     仅观测，无控制流依赖）。
 *   - executePermissionRequestHooks（旧 utils/hooks.ts L4114 生成器）/
 *     notifySessionStateChanged（旧 utils/sessionState.ts）→ 预声明接缝
 *     （H6 防空洞：hooks 域薄骨架无 PermissionRequest 执行器 / session 域
 *     未建，见文件内 seam 注释）。
 *   - Stream / ndjsonSafeStringify = 域内本地件（./stream · ./ndjsonSafeStringify）。
 *   - SDK 类型族 / CanUseToolFn / HookCallback / ElicitResult / JsonRpcMessage =
 *     ./sdkTypes 本地型面（旧仓 any-stub 族 + MCP npm 依赖裁）；permission
 *     prompt schema + 转换 = ./permissionPrompt（旧仓 127L 本地转写）。
 *   - 型面 delta（封闭 SDKMessage 联合的运行时兜底）：result 消息出现在
 *     stdin = 协议违例——旧仓 unknown-type 守卫支（白名单 user/
 *     control_request/assistant/system）log warn + ignore，新封闭联合
 *     同支行为逐字（result 不在白名单 → 同 log warn + ignore，不硬失败）。
 */
import { randomUUID } from 'crypto'
import { z, type ZodType } from 'zod'
import {
  feature,
  logForDebugging,
  type AssistantMessage,
  type PermissionDecision,
  type PermissionDecisionReason,
  type PermissionUpdate,
} from '../shared'
import { hasPermissionsToUseTool } from '../permissions'
import { AbortError } from '../engine'
import type { HookJSONOutput } from '../hooks'
import {
  sdkElicitationResponseSchema,
  sdkHookJSONOutputSchema,
  type CanUseToolFn,
  type ElicitResult,
  type HookCallback,
  type JsonRpcMessage,
  type SDKControlRequest,
  type SDKControlResponse,
  type SDKMessage,
  type SdkToolUseContext,
  type SdkToolView,
  type SdkUserMessage,
  type StdinMessage,
  type StdoutMessage,
} from './sdkTypes'
import {
  permissionPromptToolResultToPermissionDecision,
  permissionToolOutputSchema,
  type PermissionToolOutput,
} from './permissionPrompt'
import { Stream } from './stream'
import { ndjsonSafeStringify } from './ndjsonSafeStringify'

/**
 * Synthetic tool name used when forwarding sandbox network permission
 * requests via the can_use_tool control_request protocol. SDK hosts
 * see this as a normal tool permission prompt.（旧仓注释逐字）
 */
export const SANDBOX_NETWORK_ACCESS_TOOL_NAME = 'SandboxNetworkAccess'

/**
 * RequiresActionDetails（旧仓 sessionState.ts 本地转写；session 域 =
 * 前向接缝 → cli 域本地型，wire 5 字段逐字）。
 */
export interface RequiresActionDetails {
  tool_name: string
  action_description: string
  tool_use_id: string
  request_id: string
  input: Record<string, unknown>
}

function serializeDecisionReason(
  reason: PermissionDecisionReason | undefined,
): string | undefined {
  if (!reason) {
    return undefined
  }

  if (
    (feature('BASH_CLASSIFIER') || feature('TRANSCRIPT_CLASSIFIER')) &&
    reason.type === 'classifier'
  ) {
    return reason.reason
  }
  // 新仓 shared 联合 7 变体（旧 hook/asyncAgent/sandboxOverride/
  // permissionPromptTool 变体不在新联合 → 裁；classifier 归 reason 暴露支，
  // 旧仓 feature 早退支保留逐字）
  switch (reason.type) {
    case 'rule':
    case 'mode':
    case 'subcommandResults':
      return undefined
    case 'classifier':
    case 'workingDir':
    case 'safetyCheck':
    case 'other':
      return reason.reason
  }
}

function buildRequiresActionDetails(
  tool: SdkToolView,
  input: Record<string, unknown>,
  toolUseID: string,
  requestId: string,
): RequiresActionDetails {
  // Per-tool summary methods may throw on malformed input; permission
  // handling must not break because of a bad description.
  let description: string
  try {
    description =
      tool.getActivityDescription?.(input) ??
      tool.getToolUseSummary?.(input) ??
      tool.userFacingName?.(input)
  } catch {
    description = tool.name
  }
  return {
    tool_name: tool.name,
    action_description: description,
    tool_use_id: toolUseID,
    request_id: requestId,
    input,
  }
}

/**
 * 本地转写（旧仓 utils/controlMessageCompat.ts 32L 逐字）：normalize
 * camelCase `requestId` → snake_case `request_id` on incoming control
 * messages (control_request, control_response)。
 *
 * Older iOS app builds send `requestId` due to a missing Swift CodingKeys
 * mapping. Without this shim, `isSDKControlRequest` in replBridge.ts
 * rejects the message (it checks `'request_id' in value`), and
 * structuredIO.ts reads `message.response.request_id` as undefined — both
 * silently drop the message.
 *
 * If both `request_id` and `requestId` are present, snake_case wins.
 * Mutates the object in place.
 */
export function normalizeControlMessageKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj
  const record = obj as Record<string, unknown>
  if ('requestId' in record && !('request_id' in record)) {
    record.request_id = record.requestId
    delete record.requestId
  }
  if (
    'response' in record &&
    record.response !== null &&
    typeof record.response === 'object'
  ) {
    const response = record.response as Record<string, unknown>
    if ('requestId' in response && !('request_id' in response)) {
      response.request_id = response.requestId
      delete response.requestId
    }
  }
  return obj
}

/**
 * 本地转写（旧仓 utils/process.ts writeToStdout）：destroyed 守卫 +
 * 无背压（旧 writeOut 注释保真：we don't handle backpressure
 * (write() returning false)）。
 */
function writeToStdoutLocal(data: string): void {
  if (process.stdout.destroyed) {
    return
  }
  process.stdout.write(data)
}

type PendingRequest<T> = {
  resolve: (result: T) => void
  reject: (error: unknown) => void
  schema?: ZodType<unknown>
  request: SDKControlRequest
}

/**
 * 预声明接缝（H6 防空洞，复审勿当遗漏重提）：
 *
 *   ① executePermissionRequestHooksForSDK —— 新仓 hooks 域 = 薄骨架（5 高频
 *      执行器 PreToolUse/PostToolUse/SessionStart/Stop/SessionEnd + Task 族 +
 *      流式；无 PermissionRequest 执行器）→ 恒 undefined，hook 支恒输给
 *      SDK prompt（行为 = 纯 SDK prompt 决断，旧「hook 先决」支保留代码
 *      形状）。hooks 波落 PermissionRequest 执行器（旧 utils/hooks.ts L4114
 *      executePermissionRequestHooks 生成器）后，此 no-op 换真实现即双向
 *      race 复活。
 *   ② notifySessionStateChangedLocal —— 新仓 session 域未建（旧
 *      utils/sessionState.ts；session 4 站点 = S-C4 前向接缝）→ no-op。
 *      旧仓语义 = 弹框期间状态机 running ↔ awaiting 转换，headless 路径
 *      无 UI 消费点，纯 bridge 观测面。
 */
async function executePermissionRequestHooksForSDK(
  _toolName: string,
  _toolUseID: string,
  _input: Record<string, unknown>,
  _toolUseContext: SdkToolUseContext,
  _suggestions: PermissionUpdate[] | undefined,
): Promise<undefined> {
  return undefined
}

function notifySessionStateChangedLocal(
  _state: string,
  _details?: RequiresActionDetails,
): void {
  // seam ② no-op（见头注）
}

/**
 * Provides a structured way to read and write SDK messages from stdio,
 * capturing the SDK protocol.（旧仓注释逐字）
 */
// Maximum number of resolved tool_use IDs to track. Once exceeded, the oldest
// entry is evicted. This bounds memory in very long sessions while keeping
// enough history to catch duplicate control_response deliveries.
const MAX_RESOLVED_TOOL_USE_IDS = 1000

export class StructuredIO {
  readonly structuredInput: AsyncGenerator<StdinMessage | SDKMessage>
  private readonly pendingRequests = new Map<string, PendingRequest<unknown>>()

  // CCR external_metadata read back on worker start; null when the
  // transport doesn't restore. Assigned by RemoteIO.（旧仓注释逐字；
  // RemoteIO = 域外裁〔remote 族波〕→ 字段保留，类型降本地 unknown 视图，
  // remote 波消费时回填真型）
  restoredWorkerState: Promise<Record<string, unknown> | null> =
    Promise.resolve(null)

  private inputClosed = false
  private unexpectedResponseCallback?: (
    response: SDKControlResponse,
  ) => Promise<void>

  // Tracks tool_use IDs that have been resolved through the normal permission
  // flow (or aborted by a hook). When a duplicate control_response arrives
  // after the original was already handled, this Set prevents the orphan
  // handler from re-processing it — which would push duplicate assistant
  // messages into mutableMessages and cause a 400 "tool_use ids must be unique"
  // error from the API.
  private readonly resolvedToolUseIds = new Set<string>()
  private prependedLines: string[] = []
  private onControlRequestSent?: (request: SDKControlRequest) => void
  private onControlRequestResolved?: (requestId: string) => void

  // sendRequest() and print.ts both enqueue here; the drain loop is the
  // only writer. Prevents control_request from overtaking queued stream_events.
  readonly outbound = new Stream<StdoutMessage>()

  constructor(
    private readonly input: AsyncIterable<string>,
    private readonly replayUserMessages?: boolean,
  ) {
    this.input = input
    this.structuredInput = this.read()
  }

  /**
   * Records a tool_use ID as resolved so that late/duplicate control_response
   * messages for the same tool are ignored by the orphan handler.
   */
  private trackResolvedToolUseId(request: SDKControlRequest): void {
    const inner = request.request
    if (inner.subtype === 'can_use_tool') {
      // 型面：开放 subtype 成员（索引签名）使 TS 拒绝对整个联合做判别式
      // 窄化（实测：index-signature 成员在列时 `===` 检查不收缩联合）→
      // 结构视图 cast + 字符串守卫（产点 createCanUseTool /
      // createSandboxAskCallback 恒携 string tool_use_id，守卫仅护开放成员）
      const toolUseId = (inner as { tool_use_id?: unknown }).tool_use_id
      if (typeof toolUseId !== 'string') {
        return
      }
      this.resolvedToolUseIds.add(toolUseId)
      if (this.resolvedToolUseIds.size > MAX_RESOLVED_TOOL_USE_IDS) {
        // Evict the oldest entry (Sets iterate in insertion order)
        const first = this.resolvedToolUseIds.values().next().value
        if (first !== undefined) {
          this.resolvedToolUseIds.delete(first)
        }
      }
    }
  }

  /** Flush pending internal events. No-op for non-remote IO. Overridden by RemoteIO.（域外裁登记） */
  flushInternalEvents(): Promise<void> {
    return Promise.resolve()
  }

  /** Internal-event queue depth. Overridden by RemoteIO; zero otherwise.（域外裁登记） */
  get internalEventsPending(): number {
    return 0
  }

  /**
   * Queue a user turn to be yielded before the next message from this.input.
   * Works before iteration starts and mid-stream — read() re-checks
   * prependedLines between each yielded message.
   */
  prependUserMessage(content: string): void {
    this.prependedLines.push(
      JSON.stringify({
        type: 'user',
        session_id: '',
        message: { role: 'user', content },
        parent_tool_use_id: null,
      } satisfies SdkUserMessage) + '\n',
    )
  }

  private async *read() {
    let content = ''

    // Called once before for-await (an empty this.input otherwise skips the
    // loop body entirely), then again per block. prependedLines re-check is
    // inside the while so a prepend pushed between two messages in the SAME
    // block still lands first.
    const splitAndProcess = async function* (this: StructuredIO) {
      for (;;) {
        if (this.prependedLines.length > 0) {
          content = this.prependedLines.join('') + content
          this.prependedLines = []
        }
        const newline = content.indexOf('\n')
        if (newline === -1) break
        const line = content.slice(0, newline)
        content = content.slice(newline + 1)
        const message = await this.processLine(line)
        if (message) {
          // 旧仓 logForDiagnosticsNoPII('info', 'cli_stdin_message_parsed',
          // { type }) 裁（诊断面缺席，仅观测无控制流）
          yield message
        }
      }
    }.bind(this)

    yield* splitAndProcess()

    for await (const block of this.input) {
      content += block
      yield* splitAndProcess()
    }
    if (content) {
      const message = await this.processLine(content)
      if (message) {
        yield message
      }
    }
    this.inputClosed = true
    for (const request of this.pendingRequests.values()) {
      // Reject all pending requests if the input stream
      request.reject(
        new Error('Tool permission stream closed before response received'),
      )
    }
  }

  getPendingPermissionRequests() {
    return Array.from(this.pendingRequests.values())
      .map(entry => entry.request)
      .filter(pr => pr.request.subtype === 'can_use_tool')
  }

  setUnexpectedResponseCallback(
    callback: (response: SDKControlResponse) => Promise<void>,
  ): void {
    this.unexpectedResponseCallback = callback
  }

  /**
   * Inject a control_response message to resolve a pending permission request.
   * Used by the bridge to feed permission responses from claude.ai into the
   * SDK permission flow.
   *
   * Also sends a control_cancel_request to the SDK consumer so its canUseTool
   * callback is aborted via the signal — otherwise the callback hangs.
   */
  injectControlResponse(response: SDKControlResponse): void {
    const requestId = response.response?.request_id
    if (!requestId) return
    const request = this.pendingRequests.get(requestId)
    if (!request) return
    this.trackResolvedToolUseId(request.request)
    this.pendingRequests.delete(requestId)
    // Cancel the SDK consumer's canUseTool callback — the bridge won.
    void this.write({
      type: 'control_cancel_request',
      request_id: requestId,
    })
    if (response.response.subtype === 'error') {
      request.reject(new Error(response.response.error))
    } else {
      const result = response.response.response
      if (request.schema) {
        try {
          request.resolve(request.schema.parse(result))
        } catch (error) {
          request.reject(error)
        }
      } else {
        request.resolve({})
      }
    }
  }

  /**
   * Register a callback invoked whenever a can_use_tool control_request
   * is written to stdout. Used by the bridge to forward permission
   * requests to claude.ai.
   */
  setOnControlRequestSent(
    callback: ((request: SDKControlRequest) => void) | undefined,
  ): void {
    this.onControlRequestSent = callback
  }

  /**
   * Register a callback invoked when a can_use_tool control_response arrives
   * from the SDK consumer (via stdin). Used by the bridge to cancel the
   * stale permission prompt on claude.ai when the SDK consumer wins the race.
   */
  setOnControlRequestResolved(
    callback: ((requestId: string) => void) | undefined,
  ): void {
    this.onControlRequestResolved = callback
  }

  private async processLine(
    line: string,
  ): Promise<StdinMessage | SDKMessage | undefined> {
    // Skip empty lines (e.g. from double newlines in piped stdin)
    if (!line) {
      return undefined
    }
    try {
      const message = normalizeControlMessageKeys(JSON.parse(line)) as
        | StdinMessage
        | SDKMessage
      if (message.type === 'keep_alive') {
        // Silently ignore keep-alive messages
        return undefined
      }
      if (message.type === 'update_environment_variables') {
        // Apply environment variable updates directly to process.env.
        // Used by bridge session runner for auth token refresh
        // (ATLAS_SESSION_ACCESS_TOKEN) which must be readable
        // by the REPL process itself, not just child Bash commands.
        const keys = Object.keys(message.variables)
        for (const [key, value] of Object.entries(message.variables)) {
          process.env[key] = value as string
        }
        logForDebugging(
          `[structuredIO] applied update_environment_variables: ${keys.join(', ')}`,
        )
        return undefined
      }
      if (message.type === 'control_response') {
        // 旧仓 notifyCommandLifecycle(uuid, 'completed') 裁（命令生命周期面
        // → session 域前向接缝；仅观测，无控制流依赖）
        const request = this.pendingRequests.get(message.response.request_id)
        if (!request) {
          // Check if this tool_use was already resolved through the normal
          // permission flow. Duplicate control_response deliveries (e.g. from
          // WebSocket reconnects) arrive after the original was handled, and
          // re-processing them would push duplicate assistant messages into
          // the conversation, causing API 400 errors.
          const responsePayload =
            message.response.subtype === 'success'
              ? message.response.response
              : undefined
          const toolUseID = responsePayload?.toolUseID
          if (
            typeof toolUseID === 'string' &&
            this.resolvedToolUseIds.has(toolUseID)
          ) {
            logForDebugging(
              `Ignoring duplicate control_response for already-resolved toolUseID=${toolUseID} request_id=${message.response.request_id}`,
            )
            return undefined
          }
          if (this.unexpectedResponseCallback) {
            await this.unexpectedResponseCallback(message)
          }
          return undefined // Ignore responses for requests we don't know about
        }
        this.trackResolvedToolUseId(request.request)
        this.pendingRequests.delete(message.response.request_id)
        // Notify the bridge when the SDK consumer resolves a can_use_tool
        // request, so it can cancel the stale permission prompt on claude.ai.
        if (
          request.request.request.subtype === 'can_use_tool' &&
          this.onControlRequestResolved
        ) {
          this.onControlRequestResolved(message.response.request_id)
        }

        if (message.response.subtype === 'error') {
          request.reject(new Error(message.response.error))
          return undefined
        }
        const result = message.response.response
        if (request.schema) {
          try {
            request.resolve(request.schema.parse(result))
          } catch (error) {
            request.reject(error)
          }
        } else {
          request.resolve({})
        }
        // Propagate control responses when replay is enabled
        if (this.replayUserMessages) {
          return message
        }
        return undefined
      }
      if (
        message.type !== 'user' &&
        message.type !== 'control_request' &&
        message.type !== 'assistant' &&
        message.type !== 'system'
      ) {
        logForDebugging(`Ignoring unknown message type: ${message.type}`, {
          level: 'warn',
        })
        return undefined
      }
      if (message.type === 'control_request') {
        if (!message.request) {
          exitWithMessage(`Error: Missing request on control_request`)
        }
        return message
      }
      if (message.type === 'assistant' || message.type === 'system') {
        return message
      }
      if (message.message.role !== 'user') {
        exitWithMessage(
          `Error: Expected message role 'user', got '${message.message.role}'`,
        )
      }
      return message
    } catch (error) {
      // 旧仓 biome-ignore 注释裁（新仓无 biome）：intentional console output
      console.error(`Error parsing streaming input line: ${line}: ${error}`)
      process.exit(1)
    }
  }

  async write(message: StdoutMessage): Promise<void> {
    writeToStdoutLocal(ndjsonSafeStringify(message) + '\n')
  }

  private async sendRequest<Response>(
    request: SDKControlRequest['request'],
    schema: ZodType<unknown>,
    signal?: AbortSignal,
    requestId: string = randomUUID(),
  ): Promise<Response> {
    const message: SDKControlRequest = {
      type: 'control_request',
      request_id: requestId,
      request,
    }
    if (this.inputClosed) {
      throw new Error('Stream closed')
    }
    if (signal?.aborted) {
      throw new Error('Request aborted')
    }
    this.outbound.enqueue(message)
    if (request.subtype === 'can_use_tool' && this.onControlRequestSent) {
      this.onControlRequestSent(message)
    }
    const aborted = () => {
      this.outbound.enqueue({
        type: 'control_cancel_request',
        request_id: requestId,
      })
      // Immediately reject the outstanding promise, without
      // waiting for the host to acknowledge the cancellation.
      const request = this.pendingRequests.get(requestId)
      if (request) {
        // Track the tool_use ID as resolved before rejecting, so that a
        // late response from the host is ignored by the orphan handler.
        this.trackResolvedToolUseId(request.request)
        request.reject(new AbortError())
      }
    }
    if (signal) {
      signal.addEventListener('abort', aborted, {
        once: true,
      })
    }
    try {
      return await new Promise<Response>((resolve, reject) => {
        this.pendingRequests.set(requestId, {
          request: {
            type: 'control_request',
            request_id: requestId,
            request,
          },
          resolve: result => {
            resolve(result as Response)
          },
          reject,
          schema,
        })
      })
    } finally {
      if (signal) {
        signal.removeEventListener('abort', aborted)
      }
      this.pendingRequests.delete(requestId)
    }
  }

  createCanUseTool(
    onPermissionPrompt?: (details: RequiresActionDetails) => void,
  ): CanUseToolFn {
    return async (
      tool: SdkToolView,
      input: { [key: string]: unknown },
      toolUseContext: SdkToolUseContext,
      assistantMessage: AssistantMessage,
      toolUseID: string,
      forceDecision?: PermissionDecision,
    ): Promise<PermissionDecision> => {
      const mainPermissionResult =
        forceDecision ??
        (await hasPermissionsToUseTool(
          tool,
          input,
          {
            getToolPermissionContext: () =>
              toolUseContext.getAppState().toolPermissionContext,
            getAppState: () => toolUseContext.getAppState(),
          },
          assistantMessage,
          toolUseID,
        ))
      // If the tool is allowed or denied, return the result
      if (
        mainPermissionResult.behavior === 'allow' ||
        mainPermissionResult.behavior === 'deny'
      ) {
        return mainPermissionResult
      }

      // Run PermissionRequest hooks in parallel with the SDK permission
      // prompt.  In the terminal CLI, hooks race against the interactive
      // prompt so that e.g. a hook with --delay 20 doesn't block the UI.
      // We need the same behavior here: the SDK host (VS Code, etc.) shows
      // its permission dialog immediately while hooks run in the background.
      // Whichever resolves first wins; the loser is cancelled/ignored.

      // AbortController used to cancel the SDK request if a hook decides first
      const hookAbortController = new AbortController()
      const parentSignal = toolUseContext.abortController.signal
      // Forward parent abort to our local controller
      const onParentAbort = () => hookAbortController.abort()
      parentSignal.addEventListener('abort', onParentAbort, { once: true })

      try {
        // Start the hook evaluation (runs in background)
        const hookPromise = executePermissionRequestHooksForSDK(
          tool.name,
          toolUseID,
          input,
          toolUseContext,
          mainPermissionResult.suggestions,
        ).then(decision => ({ source: 'hook' as const, decision }))

        // Start the SDK permission prompt immediately (don't wait for hooks)
        const requestId = randomUUID()
        onPermissionPrompt?.(
          buildRequiresActionDetails(tool, input, toolUseID, requestId),
        )
        const sdkPromise = this.sendRequest<PermissionToolOutput>(
          {
            subtype: 'can_use_tool',
            tool_name: tool.name,
            input,
            permission_suggestions: mainPermissionResult.suggestions,
            blocked_path: mainPermissionResult.blockedPath,
            decision_reason: serializeDecisionReason(
              mainPermissionResult.decisionReason,
            ),
            tool_use_id: toolUseID,
            agent_id: toolUseContext.agentId,
          },
          permissionToolOutputSchema,
          hookAbortController.signal,
          requestId,
        ).then(result => ({ source: 'sdk' as const, result }))

        // Race: hook completion vs SDK prompt response.
        // The hook promise always resolves (never rejects), returning
        // undefined if no hook made a decision.
        const winner = await Promise.race([hookPromise, sdkPromise])

        if (winner.source === 'hook') {
          if (winner.decision) {
            // Hook decided — abort the pending SDK request.
            // Suppress the expected AbortError rejection from sdkPromise.
            sdkPromise.catch(() => {})
            hookAbortController.abort()
            return winner.decision
          }
          // Hook passed through (no decision) — wait for the SDK prompt
          const sdkResult = await sdkPromise
          return permissionPromptToolResultToPermissionDecision(
            sdkResult.result,
            tool,
            input,
            toolUseContext,
          )
        }

        // SDK prompt responded first — use its result (hook still running
        // in background but its result will be ignored)
        return permissionPromptToolResultToPermissionDecision(
          winner.result,
          tool,
          input,
          toolUseContext,
        )
      } catch (error) {
        return permissionPromptToolResultToPermissionDecision(
          {
            behavior: 'deny',
            message: `Tool permission request failed: ${error}`,
            toolUseID,
          },
          tool,
          input,
          toolUseContext,
        )
      } finally {
        // Only transition back to 'running' if no other permission prompts
        // are pending (concurrent tool execution can have multiple in-flight).
        if (this.getPendingPermissionRequests().length === 0) {
          notifySessionStateChangedLocal('running')
        }
        parentSignal.removeEventListener('abort', onParentAbort)
      }
    }
  }

  createHookCallback(callbackId: string, timeout?: number): HookCallback {
    return {
      type: 'callback',
      timeout,
      callback: async (
        input: unknown,
        toolUseID: string | null,
        abort: AbortSignal | undefined,
      ): Promise<HookJSONOutput> => {
        try {
          const result = await this.sendRequest<HookJSONOutput>(
            {
              subtype: 'hook_callback',
              callback_id: callbackId,
              input,
              tool_use_id: toolUseID || undefined,
            },
            sdkHookJSONOutputSchema,
            abort,
          )
          return result
        } catch (error) {
          // 旧仓 biome-ignore 注释裁（新仓无 biome）：intentional console output
          console.error(`Error in hook callback ${callbackId}:`, error)
          return {}
        }
      },
    }
  }

  /**
   * Sends an elicitation request to the SDK consumer and returns the response.
   */
  async handleElicitation(
    serverName: string,
    message: string,
    requestedSchema?: Record<string, unknown>,
    signal?: AbortSignal,
    mode?: 'form' | 'url',
    url?: string,
    elicitationId?: string,
  ): Promise<ElicitResult> {
    try {
      const result = await this.sendRequest<ElicitResult>(
        {
          subtype: 'elicitation',
          mcp_server_name: serverName,
          message,
          mode,
          url,
          elicitation_id: elicitationId,
          requested_schema: requestedSchema,
        },
        sdkElicitationResponseSchema,
        signal,
      )
      return result
    } catch {
      return { action: 'cancel' as const }
    }
  }

  /**
   * Creates a SandboxAskCallback that forwards sandbox network permission
   * requests to the SDK host as can_use_tool control_requests.
   *
   * This piggybacks on the existing can_use_tool protocol with a synthetic
   * tool name so that SDK hosts (VS Code, CCR, etc.) can prompt the user
   * for network access without requiring a new protocol subtype.
   */
  createSandboxAskCallback(): (hostPattern: {
    host: string
    port?: number
  }) => Promise<boolean> {
    return async (hostPattern): Promise<boolean> => {
      try {
        const result = await this.sendRequest<PermissionToolOutput>(
          {
            subtype: 'can_use_tool',
            tool_name: SANDBOX_NETWORK_ACCESS_TOOL_NAME,
            input: { host: hostPattern.host },
            tool_use_id: randomUUID(),
            description: `Allow network connection to ${hostPattern.host}?`,
          },
          permissionToolOutputSchema,
        )
        return result.behavior === 'allow'
      } catch {
        // If the request fails (stream closed, abort, etc.), deny the connection
        return false
      }
    }
  }

  /**
   * Sends an MCP message to an SDK server and waits for the response
   */
  async sendMcpMessage(
    serverName: string,
    message: JsonRpcMessage,
  ): Promise<JsonRpcMessage> {
    const response = await this.sendRequest<{ mcp_response: JsonRpcMessage }>(
      {
        subtype: 'mcp_message',
        server_name: serverName,
        message,
      },
      z.object({
        mcp_response: z.unknown(),
      }),
    )
    return response.mcp_response
  }
}

function exitWithMessage(message: string): never {
  // 旧仓 biome-ignore 注释裁（新仓无 biome）：intentional console output
  console.error(message)
  process.exit(1)
}
