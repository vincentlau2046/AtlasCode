/**
 * Swarm 权限回调注册表（纯 registry 面；S-E2a R2 二分抽取）。
 *
 * 源 = 旧仓 a8af45b src/hooks/useSwarmPermissionPoller.ts（330L）纯 registry 面
 * L35-226 逐字迁移。R2 二分裁定（§8.66.1.2）：
 *   - 随迁（本文件）：parsePermissionUpdates（模块私有）+ PermissionResponseCallback
 *     + pendingCallbacks 注册表 5 函数 + processMailboxPermissionResponse +
 *     sandbox 回调注册表 4 函数。
 *   - 裁剪 → TUI 波（登记非遗漏）：React hook 面 useSwarmPermissionPoller
 *     （useRef/useCallback/useInterval 500ms/useEffect）+ 私有 processResponse
 *     磁盘轮询支（依赖 S-E2d permissionSync pollForResponse/removeWorkerResponse）
 *     + POLL_INTERVAL_MS 常量 + errorMessage import（仅 hook 面消费）。
 * 依赖面：shared（logForDebugging + PermissionUpdate 类型 = types-session 单一事实源）
 * + permissions 域门面 permissionUpdateSchema（lazySchema 包装，调用形 permissionUpdateSchema()
 * 与旧仓一致）。
 * 消费面 = S-E2c inProcessRunner（processMailboxPermissionResponse /
 * register+unregisterPermissionCallback 3 符号，旧仓 import 面一致）。
 */
import { logForDebugging, type PermissionUpdate } from '../shared'
import { permissionUpdateSchema } from '../permissions'

function parsePermissionUpdates(raw: unknown): PermissionUpdate[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const schema = permissionUpdateSchema()
  const valid: PermissionUpdate[] = []
  for (const entry of raw) {
    const result = schema.safeParse(entry)
    if (result.success) {
      valid.push(result.data)
    } else {
      logForDebugging(
        `[SwarmPermissionPoller] Dropping malformed permissionUpdate entry: ${result.error.message}`,
        { level: 'warn' },
      )
    }
  }
  return valid
}

/**
 * Callback signature for handling permission responses
 */
export type PermissionResponseCallback = {
  requestId: string
  toolUseId: string
  onAllow: (
    updatedInput: Record<string, unknown> | undefined,
    permissionUpdates: PermissionUpdate[],
    feedback?: string,
  ) => void
  onReject: (feedback?: string) => void
}

/**
 * Registry for pending permission request callbacks
 * This allows the poller to find and invoke the right callbacks when responses arrive
 */
type PendingCallbackRegistry = Map<string, PermissionResponseCallback>

// Module-level registry that persists across renders
const pendingCallbacks: PendingCallbackRegistry = new Map()

/**
 * Register a callback for a pending permission request
 * Called by useCanUseTool when a worker submits a permission request
 */
export function registerPermissionCallback(
  callback: PermissionResponseCallback,
): void {
  pendingCallbacks.set(callback.requestId, callback)
  logForDebugging(
    `[SwarmPermissionPoller] Registered callback for request ${callback.requestId}`,
  )
}

/**
 * Unregister a callback (e.g., when the request is resolved locally or times out)
 */
export function unregisterPermissionCallback(requestId: string): void {
  pendingCallbacks.delete(requestId)
  logForDebugging(
    `[SwarmPermissionPoller] Unregistered callback for request ${requestId}`,
  )
}

/**
 * Check if a request has a registered callback
 */
export function hasPermissionCallback(requestId: string): boolean {
  return pendingCallbacks.has(requestId)
}

/**
 * Clear all pending callbacks (both permission and sandbox).
 * Called from clearSessionCaches() on /clear to reset stale state,
 * and also used in tests for isolation.
 */
export function clearAllPendingCallbacks(): void {
  pendingCallbacks.clear()
  pendingSandboxCallbacks.clear()
}

/**
 * Process a permission response from a mailbox message.
 * This is called by the inbox poller when it detects a permission_response message.
 *
 * @returns true if the response was processed, false if no callback was registered
 */
export function processMailboxPermissionResponse(params: {
  requestId: string
  decision: 'approved' | 'rejected'
  feedback?: string
  updatedInput?: Record<string, unknown>
  permissionUpdates?: unknown
}): boolean {
  const callback = pendingCallbacks.get(params.requestId)

  if (!callback) {
    // P6-a（0.1.36 切片①）：drop 非静默事件——发 `decided:unavailable` 结构化审计行
    // + debug 日志（post-telemetry 无 audit bus，logForDebugging 结构行承载原则 5
    // asked/decided 配对的 decided 侧；无 pending 回调 = approval 未送达 = unavailable，
    // asker 侧有界重试 / P1 deadline 超时后走 fail-closed deny）。
    logForDebugging(
      `[SwarmPermissionPoller] approval response dropped (no pending callback, decided:unavailable) request_id=${params.requestId} decision=${params.decision}`,
      { level: 'warn' },
    )
    return false
  }

  logForDebugging(
    `[SwarmPermissionPoller] Processing mailbox response for request ${params.requestId}: ${params.decision}`,
  )

  // Remove from registry before invoking callback
  pendingCallbacks.delete(params.requestId)

  if (params.decision === 'approved') {
    const permissionUpdates = parsePermissionUpdates(params.permissionUpdates)
    const updatedInput = params.updatedInput
    callback.onAllow(updatedInput, permissionUpdates)
  } else {
    callback.onReject(params.feedback)
  }

  return true
}

// ============================================================================
// Sandbox Permission Callback Registry
// ============================================================================

/**
 * Callback signature for handling sandbox permission responses
 */
export type SandboxPermissionResponseCallback = {
  requestId: string
  host: string
  resolve: (allow: boolean) => void
}

// Module-level registry for sandbox permission callbacks
const pendingSandboxCallbacks: Map<string, SandboxPermissionResponseCallback> =
  new Map()

/**
 * Register a callback for a pending sandbox permission request
 * Called when a worker sends a sandbox permission request to the leader
 */
export function registerSandboxPermissionCallback(
  callback: SandboxPermissionResponseCallback,
): void {
  pendingSandboxCallbacks.set(callback.requestId, callback)
  logForDebugging(
    `[SwarmPermissionPoller] Registered sandbox callback for request ${callback.requestId}`,
  )
}

/**
 * Check if a sandbox request has a registered callback
 */
export function hasSandboxPermissionCallback(requestId: string): boolean {
  return pendingSandboxCallbacks.has(requestId)
}

/**
 * Process a sandbox permission response from a mailbox message.
 * Called by the inbox poller when it detects a sandbox_permission_response message.
 *
 * @returns true if the response was processed, false if no callback was registered
 */
export function processSandboxPermissionResponse(params: {
  requestId: string
  host: string
  allow: boolean
}): boolean {
  const callback = pendingSandboxCallbacks.get(params.requestId)

  if (!callback) {
    logForDebugging(
      `[SwarmPermissionPoller] No sandbox callback registered for mailbox response ${params.requestId}`,
    )
    return false
  }

  logForDebugging(
    `[SwarmPermissionPoller] Processing sandbox response for request ${params.requestId}: allow=${params.allow}`,
  )

  // Remove from registry before invoking callback
  pendingSandboxCallbacks.delete(params.requestId)

  // Resolve the promise with the allow decision
  callback.resolve(params.allow)

  return true
}
