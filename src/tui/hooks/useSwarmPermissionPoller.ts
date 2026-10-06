/**
 * Swarm Permission Poller Hook
 *
 * This hook polls for permission responses from the team leader when running
 * as a worker agent in a swarm. When a response is received, it calls the
 * appropriate callback (onAllow/onReject) to continue execution.
 *
 * This hook should be used in conjunction with the worker-side integration
 * in useCanUseTool.ts, which creates pending requests that this hook monitors.
 */

import { useCallback, useEffect, useRef } from 'react'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import {
  type PermissionUpdate,
  permissionUpdateSchema,
} from '../utils/permissions/PermissionUpdateSchema.js'
import {
  isSwarmWorker,
  type PermissionResponse,
  pollForResponse,
  removeWorkerResponse,
} from '../utils/swarm/permissionSync.js'
import { getAgentName, getTeamName } from '../utils/teammate.js'

const POLL_INTERVAL_MS = 500

/**
 * Validate permissionUpdates from external sources (mailbox IPC, disk polling).
 * Malformed entries from buggy/old teammate processes are filtered out rather
 * than propagated unchecked into callback.onAllow().
 */
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
 * ⑧（0.1.37）：pending 回调计数（func 层判别单测 / 泄漏观测缝）。
 * 正常生命周期：register →（poller 命中 / deadline / abort 任一终态）→ 0。
 */
export function pendingPermissionCallbackCount(): number {
  return pendingCallbacks.size
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
    // ⑧ P6-a（0.1.37）：drop 支结构化审计（与 engine 侧 0.1.36 切片①
    // permissionPoller decided:unavailable 同型）——承载原则 5 asked/decided
    // 配对的 decided 侧（如 deadline 已 fail-closed / /clear 后 in-flight）。
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
    // ⑧ P6-a（0.1.37）：sandbox 变体 drop 支结构化审计（同型 decided:unavailable）。
    logForDebugging(
      `[SwarmPermissionPoller] sandbox approval response dropped (no pending callback, decided:unavailable) request_id=${params.requestId} allow=${params.allow}`,
      { level: 'warn' },
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

/**
 * Process a permission response by invoking the registered callback
 */
function processResponse(response: PermissionResponse): boolean {
  const callback = pendingCallbacks.get(response.requestId)

  if (!callback) {
    // ⑧ P6-a（0.1.37）：磁盘轮询 drop 支结构化审计（同型 decided:unavailable）。
    logForDebugging(
      `[SwarmPermissionPoller] approval response dropped (no pending callback, decided:unavailable) request_id=${response.requestId} decision=${response.decision}`,
      { level: 'warn' },
    )
    return false
  }

  logForDebugging(
    `[SwarmPermissionPoller] Processing response for request ${response.requestId}: ${response.decision}`,
  )

  // Remove from registry before invoking callback
  pendingCallbacks.delete(response.requestId)

  if (response.decision === 'approved') {
    const permissionUpdates = parsePermissionUpdates(response.permissionUpdates)
    const updatedInput = response.updatedInput
    callback.onAllow(updatedInput, permissionUpdates)
  } else {
    callback.onReject(response.feedback)
  }

  return true
}

/**
 * Hook that polls for permission responses when running as a swarm worker.
 *
 * This hook:
 * 1. Only activates when isSwarmWorker() returns true
 * 2. Polls every 500ms for responses
 * 3. When a response is found, invokes the registered callback
 * 4. Cleans up the response file after processing
 */
export function useSwarmPermissionPoller(): void {
  const isProcessingRef = useRef(false)

  const poll = useCallback(async () => {
    // Don't poll if not a swarm worker
    if (!isSwarmWorker()) {
      return
    }

    // Prevent concurrent polling
    if (isProcessingRef.current) {
      return
    }

    // Don't poll if no callbacks are registered
    if (pendingCallbacks.size === 0) {
      return
    }

    isProcessingRef.current = true

    try {
      const agentName = getAgentName()
      const teamName = getTeamName()

      if (!agentName || !teamName) {
        return
      }

      // Check each pending request for a response
      for (const [requestId, _callback] of pendingCallbacks) {
        const response = await pollForResponse(requestId, agentName, teamName)

        if (response) {
          // Process the response
          const processed = processResponse(response)

          if (processed) {
            // Clean up the response from the worker's inbox
            await removeWorkerResponse(requestId, agentName, teamName)
          }
        }
      }
    } catch (error) {
      logForDebugging(
        `[SwarmPermissionPoller] Error during poll: ${errorMessage(error)}`,
      )
    } finally {
      isProcessingRef.current = false
    }
  }, [])

  // Only poll if we're a swarm worker
  const shouldPoll = isSwarmWorker()
  // ⑧ P1 用户面封口（0.1.37）：500ms poll timer unref（与 engine 侧 0.1.36 切片①
  // 双 timer unref 同型）——ref'd interval 会阻塞 worker 侧进程干净退出（poller
  // 活跃时进程挂死不退出）。usehooks-ts useInterval 不暴露 timer 句柄 → 本地
  // effect 实现（行为等价：shouldPoll=false 不排程；卸载/切换时清 timer）。
  useEffect(() => {
    if (!shouldPoll) return
    const pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS)
    pollTimer.unref()
    return () => clearInterval(pollTimer)
  }, [poll, shouldPoll])

  // Initial poll on mount
  useEffect(() => {
    if (isSwarmWorker()) {
      void poll()
    }
  }, [poll])
}
