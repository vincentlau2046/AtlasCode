import {
  approvalUnavailableReason,
  feature,
  resolveMailboxPermissionDeadlineMs,
} from 'src/shared'
import type { ContentBlockParam } from '../../../types/atlas.js'
import type { PendingClassifierCheck } from '../../../types/permissions.js'
import { isAgentSwarmsEnabled } from '../../../utils/agentSwarmsEnabled.js'
import { toError } from '../../../utils/errors.js'
import { logError } from '../../../utils/log.js'
import type { PermissionDecision } from '../../../utils/permissions/PermissionResult.js'
import type { PermissionUpdate } from '../../../utils/permissions/PermissionUpdateSchema.js'
import {
  createPermissionRequest,
  isSwarmWorker,
  sendPermissionRequestViaMailbox,
} from '../../../utils/swarm/permissionSync.js'
import {
  registerPermissionCallback,
  unregisterPermissionCallback,
} from '../../useSwarmPermissionPoller.js'
import type { PermissionContext } from '../PermissionContext.js'
import { createResolveOnce } from '../PermissionContext.js'

type SwarmWorkerPermissionParams = {
  ctx: PermissionContext
  description: string
  pendingClassifierCheck?: PendingClassifierCheck | undefined
  updatedInput: Record<string, unknown> | undefined
  suggestions: PermissionUpdate[] | undefined
}

/**
 * Handles the swarm worker permission flow.
 *
 * When running as a swarm worker:
 * 1. Tries classifier auto-approval for bash commands
 * 2. Forwards the permission request to the leader via mailbox
 * 3. Registers callbacks for when the leader responds
 * 4. Sets the pending indicator while waiting
 *
 * Returns a PermissionDecision if the classifier auto-approves,
 * or a Promise that resolves when the leader responds.
 * Returns null if swarms are not enabled or this is not a swarm worker,
 * so the caller can fall through to interactive handling.
 */
async function handleSwarmWorkerPermission(
  params: SwarmWorkerPermissionParams,
): Promise<PermissionDecision | null> {
  if (!isAgentSwarmsEnabled() || !isSwarmWorker()) {
    return null
  }

  const { ctx, description, updatedInput, suggestions } = params

  // For bash commands, try classifier auto-approval before forwarding to
  // the leader. Agents await the classifier result (rather than racing it
  // against user interaction like the main agent).
  const classifierResult = feature('BASH_CLASSIFIER')
    ? await ctx.tryClassifier?.(params.pendingClassifierCheck, updatedInput)
    : null
  if (classifierResult) {
    return classifierResult
  }

  // Forward permission request to the leader via mailbox
  try {
    const clearPendingRequest = (): void =>
      ctx.toolUseContext.setAppState(prev => ({
        ...prev,
        pendingWorkerRequest: null,
      }))

    const decision = await new Promise<PermissionDecision>(resolve => {
      const { resolve: resolveOnce, claim } = createResolveOnce(resolve)

      // Create the permission request
      const request = createPermissionRequest({
        toolName: ctx.tool.name,
        toolUseId: ctx.toolUseID,
        input: ctx.input,
        description,
        permissionSuggestions: suggestions,
      })

      // ⑧ P1 用户面封口（0.1.37）：第 4 终态（协作式 deadline，fail-closed）——
      // 与 engine 侧 0.1.36 切片①（src/swarm/inProcessRunner mailbox 回退支）同型：
      // leader 失响应/被杀 → 500ms poller 永远收不到响应，本 promise 永挂（回合
      // 冻结）+ pendingCallbacks 泄漏 + ref'd timer 阻塞进程退出。deadline 到期
      // （首胜 claim，与 allow/reject/abort 三终态互斥不二次 settle）→ fail-closed
      // deny（buildReject = 拒绝消息送回 agent，回合继续不 abort，A2 语义）+ 清
      // pending 指示 + 释放注册表（不泄漏）+ 摘 abort listener。策略单一事实源 =
      // shared 门面（env ATLAS_PERM_MAILBOX_DEADLINE_MS，缺省 30s，与 engine 面同型）。
      const effDeadlineMs = resolveMailboxPermissionDeadlineMs()
      let onAbort: (() => void) | undefined
      const deadlineTimer = setTimeout(() => {
        if (!claim()) return
        if (onAbort) {
          ctx.toolUseContext.abortController.signal.removeEventListener(
            'abort',
            onAbort,
          )
        }
        clearPendingRequest()
        unregisterPermissionCallback(request.id)
        ctx.logDecision({
          decision: 'reject',
          source: { type: 'unavailable' },
        })
        resolveOnce(ctx.buildReject(approvalUnavailableReason(effDeadlineMs)))
      }, effDeadlineMs)
      deadlineTimer.unref()
      const cleanup = (): void => {
        clearTimeout(deadlineTimer)
        if (onAbort) {
          ctx.toolUseContext.abortController.signal.removeEventListener(
            'abort',
            onAbort,
          )
        }
      }

      // Register callback BEFORE sending the request to avoid race condition
      // where leader responds before callback is registered
      registerPermissionCallback({
        requestId: request.id,
        toolUseId: ctx.toolUseID,
        async onAllow(
          allowedInput: Record<string, unknown> | undefined,
          permissionUpdates: PermissionUpdate[],
          feedback?: string,
          contentBlocks?: ContentBlockParam[],
        ) {
          if (!claim()) return // atomic check-and-mark before await
          cleanup()
          clearPendingRequest()

          // Merge the updated input with the original input
          const finalInput =
            allowedInput && Object.keys(allowedInput).length > 0
              ? allowedInput
              : ctx.input

          resolveOnce(
            await ctx.handleUserAllow(
              finalInput,
              permissionUpdates,
              feedback,
              undefined,
              contentBlocks,
            ),
          )
        },
        onReject(feedback?: string, contentBlocks?: ContentBlockParam[]) {
          if (!claim()) return
          cleanup()
          clearPendingRequest()

          ctx.logDecision({
            decision: 'reject',
            source: { type: 'user_reject', hasFeedback: !!feedback },
          })

          // 2026-10-05 §4b A 波 A2：显式拒绝不 abort（worker 为 sub，本就
          // 不 abort；与主 agent buildReject 语义对齐）
          resolveOnce(ctx.buildReject(feedback, contentBlocks))
        },
      })

      // Now that callback is registered, send the request to the leader
      void sendPermissionRequestViaMailbox(request)

      // Show visual indicator that we're waiting for leader approval
      ctx.toolUseContext.setAppState(prev => ({
        ...prev,
        pendingWorkerRequest: {
          toolName: ctx.tool.name,
          toolUseId: ctx.toolUseID,
          description,
        },
      }))

      // If the abort signal fires while waiting for the leader response,
      // resolve the promise with a cancel decision so it does not hang.
      // ⑧：abort 支亦释放注册表（非 poller 驱动终态，注册表条目须显式 unregister）。
      onAbort = () => {
        if (!claim()) return
        clearPendingRequest()
        unregisterPermissionCallback(request.id)
        ctx.logCancelled()
        resolveOnce(ctx.cancelAndAbort(undefined, true))
      }
      ctx.toolUseContext.abortController.signal.addEventListener(
        'abort',
        onAbort,
        { once: true },
      )
    })

    return decision
  } catch (error) {
    // If swarm permission submission fails, fall back to local handling
    logError(toError(error))
    // Continue to local UI handling below
    return null
  }
}

export { handleSwarmWorkerPermission }
export type { SwarmWorkerPermissionParams }
