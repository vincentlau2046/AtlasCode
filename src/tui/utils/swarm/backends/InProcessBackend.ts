import type { ToolUseContext } from '../../../Tool.js'
import { getSystemPrompt } from '../../../constants/prompts.js'
import {
  findTeammateTaskByAgentId,
  requestTeammateShutdown,
} from '../../../tasks/InProcessTeammateTask/InProcessTeammateTask.js'
// 0.1.94 C-3（f4 §13①）：onMessage 钩子消费面——progress tracker +
// task.messages 逐消息镜像 + inProgressToolUseIDs 维护（旧 TUI 副本
// for-await 体逐字消费形，随换道改由 engine 单源 onMessage 回调驱动）。
import { appendCappedMessage } from '../../../tasks/InProcessTeammateTask/types.js'
import type { InProcessTeammateTaskState } from '../../../tasks/InProcessTeammateTask/types.js'
import {
  createActivityDescriptionResolver,
  createProgressTracker,
  getProgressUpdate,
  updateProgressFromMessage,
} from '../../../tasks/LocalAgentTask/LocalAgentTask.js'
import type { Message as TuiMessage } from '../../../types/message.js'
import { parseAgentId } from '../../../utils/agentId.js'
import { logForDebugging } from '../../../utils/debug.js'
import { jsonStringify } from '../../../utils/slowOperations.js'
import {
  createShutdownRequestMessage,
  writeToMailbox,
} from '../../../utils/teammateMailbox.js'
// 0.1.94 C-3（f4 §13③）：换道 seam——src/swarm 单源 runner（fail-fast
// 端口；tui/factory 组合根 setStartInProcessTeammate 接线）。
import { requireStartInProcessTeammate } from '../../../../swarm/index.js'
import {
  killInProcessTeammate,
  spawnInProcessTeammate,
} from '../spawnInProcess.js'
import type {
  TeammateExecutor,
  TeammateMessage,
  TeammateSpawnConfig,
  TeammateSpawnResult,
} from './types.js'

/**
 * InProcessBackend implements TeammateExecutor for in-process teammates.
 *
 * Unlike pane-based backends (tmux/iTerm2), in-process teammates run in the
 * same Node.js process with isolated context via AsyncLocalStorage. They:
 * - Share resources (API client, MCP connections) with the leader
 * - Communicate via file-based mailbox (same as pane-based teammates)
 * - Are terminated via AbortController (not kill-pane)
 *
 * IMPORTANT: Before spawning, call setContext() to provide the ToolUseContext
 * needed for AppState access. This is intended for use via the TeammateExecutor
 * abstraction (getTeammateExecutor() in registry.ts).
 */
export class InProcessBackend implements TeammateExecutor {
  readonly type = 'in-process' as const

  /**
   * Tool use context for AppState access.
   * Must be set via setContext() before spawn() is called.
   */
  private context: ToolUseContext | null = null

  /**
   * Sets the ToolUseContext for this backend.
   * Called by TeammateTool before spawning to provide AppState access.
   */
  setContext(context: ToolUseContext): void {
    this.context = context
  }

  /**
   * In-process backend is always available (no external dependencies).
   */
  async isAvailable(): Promise<boolean> {
    return true
  }

  /**
   * Spawns an in-process teammate.
   *
   * Uses spawnInProcessTeammate() to:
   * 1. Create TeammateContext via createTeammateContext()
   * 2. Create independent AbortController (not linked to parent)
   * 3. Register teammate in AppState.tasks
   * 4. Start agent execution via startInProcessTeammate()
   * 5. Return spawn result with agentId, taskId, abortController
   */
  async spawn(config: TeammateSpawnConfig): Promise<TeammateSpawnResult> {
    if (!this.context) {
      logForDebugging(
        `[InProcessBackend] spawn() called without context for ${config.name}`,
      )
      return {
        success: false,
        agentId: `${config.name}@${config.teamName}`,
        error:
          'InProcessBackend not initialized. Call setContext() before spawn().',
      }
    }

    logForDebugging(`[InProcessBackend] spawn() called for ${config.name}`)

    const result = await spawnInProcessTeammate(
      {
        name: config.name,
        teamName: config.teamName,
        prompt: config.prompt,
        color: config.color,
        planModeRequired: config.planModeRequired ?? false,
      },
      this.context,
    )

    // If spawn succeeded, start the agent execution loop
    if (
      result.success &&
      result.taskId &&
      result.teammateContext &&
      result.abortController
    ) {
      const taskId = result.taskId
      const ctx = this.context

      // 0.1.94 C-3（f4 §13① C-1#2）：task 态更新（镜像旧 TUI 副本本地
      // updateTaskState 形：in_process_teammate 守卫 + 引用不变短路）。
      const updateTask = (
        updater: (task: InProcessTeammateTaskState) => InProcessTeammateTaskState,
      ): void => {
        ctx.setAppState(prev => {
          const task = prev.tasks[taskId]
          if (!task || task.type !== 'in_process_teammate') {
            return prev
          }
          const updated = updater(task)
          if (updated === task) {
            return prev
          }
          return {
            ...prev,
            tasks: {
              ...prev.tasks,
              [taskId]: updated,
            },
          }
        })
      }

      // 0.1.94 C-3（f4 §13⑤）：主系统提示词策略面——TUI 域内显式计算
      //（≡ 旧 TUI 副本 inline L924-929 getSystemPrompt 全量主提示词）；
      // replace 模式不传（单源 runner replace 支直用 systemPrompt）。
      const mainSystemPrompt =
        config.systemPromptMode === 'replace'
          ? undefined
          : (
              await getSystemPrompt(
                ctx.options.tools,
                ctx.options.mainLoopModel,
                undefined,
                ctx.options.mcpClients,
              )
            ).join('\n')

      // 0.1.94 C-3（f4 §13① C-1#1）：progress tracker（单 tracker per
      // spawn——调用点无法感知单源 runner 的 prompt 迭代边界，progress
      // 跨 prompt 累积而非逐 prompt 重置 = 已登记 minor UX 偏差）。
      const tracker = createProgressTracker()
      const resolveActivity = createActivityDescriptionResolver(ctx.options.tools)

      // Start the agent loop in the background (fire-and-forget)
      // The prompt is passed through the task state and config
      requireStartInProcessTeammate()({
        identity: {
          agentId: result.agentId,
          agentName: config.name,
          teamName: config.teamName,
          color: config.color,
          planModeRequired: config.planModeRequired ?? false,
          parentSessionId: result.teammateContext.parentSessionId,
        },
        taskId,
        prompt: config.prompt,
        teammateContext: result.teammateContext,
        // Strip messages: the teammate never reads toolUseContext.messages
        // (runAgent overrides it via createSubagentContext). Passing the
        // parent's conversation would pin it for the teammate's lifetime.
        toolUseContext: { ...ctx, messages: [] },
        abortController: result.abortController,
        model: config.model,
        systemPrompt: config.systemPrompt,
        systemPromptMode: config.systemPromptMode,
        allowedTools: config.permissions,
        allowPermissionPrompts: config.allowPermissionPrompts,
        // ── 0.1.94 C-3 换道反向面四钩子（f4 §13①②⑤）──
        mainSystemPrompt,
        // §13①：逐消息观测（≡ 旧 TUI 副本 for-await 体 L1218-1266 逐字
        // 消费形：tracker 镜像 + inProgressToolUseIDs 维护 + 逐消息
        // appendCappedMessage；engine Message → TUI Message 投影 cast）。
        onMessage: message => {
          const tuiMessage = message as unknown as TuiMessage
          updateProgressFromMessage(
            tracker,
            tuiMessage,
            resolveActivity,
            ctx.options.tools,
          )
          const progress = getProgressUpdate(tracker)
          updateTask(task => {
            // Track in-progress tool use IDs for animation in transcript view
            let inProgressToolUseIDs = task.inProgressToolUseIDs
            if (tuiMessage.type === 'assistant') {
              for (const block of tuiMessage.message.content) {
                if (block.type === 'tool_use') {
                  inProgressToolUseIDs = new Set([
                    ...(inProgressToolUseIDs ?? []),
                    block.id,
                  ])
                }
              }
            } else if (tuiMessage.type === 'user') {
              const content = tuiMessage.message.content
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (
                    typeof block === 'object' &&
                    'type' in block &&
                    block.type === 'tool_result'
                  ) {
                    if (inProgressToolUseIDs) {
                      inProgressToolUseIDs = new Set(inProgressToolUseIDs)
                      inProgressToolUseIDs.delete(block.tool_use_id)
                    }
                  }
                }
              }
            }
            return {
              ...task,
              progress,
              messages: appendCappedMessage(task.messages, tuiMessage),
              inProgressToolUseIDs,
            }
          })
        },
        // §13① C-1#3：权限等待记账（gate leader 队列支 settle 点回调）。
        onPermissionWaitMs: waitMs => {
          updateTask(task => ({
            ...task,
            totalPausedMs: (task.totalPausedMs ?? 0) + waitMs,
          }))
        },
        // §13② 案 1：per-iteration permissionMode（leader Shift+Tab cycle
        // 面；TPC 构建点活读 task 态，fresh 读 ≡ 旧每轮读取语义）。
        getPermissionMode: () => {
          const st = ctx.getAppState()
          const t = st.tasks[taskId]
          return t && t.type === 'in_process_teammate'
            ? t.permissionMode
            : undefined
        },
      })

      logForDebugging(
        `[InProcessBackend] Started agent execution for ${result.agentId}`,
      )
    }

    return {
      success: result.success,
      agentId: result.agentId,
      taskId: result.taskId,
      abortController: result.abortController,
      error: result.error,
    }
  }

  /**
   * Sends a message to an in-process teammate.
   *
   * All teammates use file-based mailboxes for simplicity.
   */
  async sendMessage(agentId: string, message: TeammateMessage): Promise<void> {
    logForDebugging(
      `[InProcessBackend] sendMessage() to ${agentId}: ${message.text.substring(0, 50)}...`,
    )

    // Parse agentId to get agentName and teamName
    // agentId format: "agentName@teamName" (e.g., "researcher@my-team")
    const parsed = parseAgentId(agentId)
    if (!parsed) {
      logForDebugging(`[InProcessBackend] Invalid agentId format: ${agentId}`)
      throw new Error(
        `Invalid agentId format: ${agentId}. Expected format: agentName@teamName`,
      )
    }

    const { agentName, teamName } = parsed

    // Write to file-based mailbox
    await writeToMailbox(
      agentName,
      {
        text: message.text,
        from: message.from,
        color: message.color,
        timestamp: message.timestamp ?? new Date().toISOString(),
      },
      teamName,
    )

    logForDebugging(`[InProcessBackend] sendMessage() completed for ${agentId}`)
  }

  /**
   * Gracefully terminates an in-process teammate.
   *
   * Sends a shutdown request message to the teammate and sets the
   * shutdownRequested flag. The teammate processes the request and
   * either approves (exits) or rejects (continues working).
   *
   * Unlike pane-based teammates, in-process teammates handle their own
   * exit via the shutdown flow - no external killPane() is needed.
   */
  async terminate(agentId: string, reason?: string): Promise<boolean> {
    logForDebugging(
      `[InProcessBackend] terminate() called for ${agentId}: ${reason}`,
    )

    if (!this.context) {
      logForDebugging(
        `[InProcessBackend] terminate() failed: no context set for ${agentId}`,
      )
      return false
    }

    // Get current AppState to find the task
    const state = this.context.getAppState()
    const task = findTeammateTaskByAgentId(agentId, state.tasks)

    if (!task) {
      logForDebugging(
        `[InProcessBackend] terminate() failed: task not found for ${agentId}`,
      )
      return false
    }

    // Don't send another shutdown request if one is already pending
    if (task.shutdownRequested) {
      logForDebugging(
        `[InProcessBackend] terminate(): shutdown already requested for ${agentId}`,
      )
      return true
    }

    // Generate deterministic request ID
    const requestId = `shutdown-${agentId}-${Date.now()}`

    // Create shutdown request message
    const shutdownRequest = createShutdownRequestMessage({
      requestId,
      from: 'team-lead', // Terminate is always called by the leader
      reason,
    })

    // Send to teammate's mailbox
    const teammateAgentName = task.identity.agentName
    await writeToMailbox(
      teammateAgentName,
      {
        from: 'team-lead',
        text: jsonStringify(shutdownRequest),
        timestamp: new Date().toISOString(),
      },
      task.identity.teamName,
    )

    // Mark the task as shutdown requested
    requestTeammateShutdown(task.id, this.context.setAppState)

    logForDebugging(
      `[InProcessBackend] terminate() sent shutdown request to ${agentId}`,
    )

    return true
  }

  /**
   * Force kills an in-process teammate immediately.
   *
   * Uses the teammate's AbortController to cancel all async operations
   * and updates the task state to 'killed'.
   */
  async kill(agentId: string): Promise<boolean> {
    logForDebugging(`[InProcessBackend] kill() called for ${agentId}`)

    if (!this.context) {
      logForDebugging(
        `[InProcessBackend] kill() failed: no context set for ${agentId}`,
      )
      return false
    }

    // Get current AppState to find the task
    const state = this.context.getAppState()
    const task = findTeammateTaskByAgentId(agentId, state.tasks)

    if (!task) {
      logForDebugging(
        `[InProcessBackend] kill() failed: task not found for ${agentId}`,
      )
      return false
    }

    // Kill the teammate via the existing helper function
    const killed = killInProcessTeammate(task.id, this.context.setAppState)

    logForDebugging(
      `[InProcessBackend] kill() ${killed ? 'succeeded' : 'failed'} for ${agentId}`,
    )

    return killed
  }

  /**
   * Checks if an in-process teammate is still active.
   *
   * Returns true if the teammate exists, has status 'running',
   * and its AbortController has not been aborted.
   */
  async isActive(agentId: string): Promise<boolean> {
    logForDebugging(`[InProcessBackend] isActive() called for ${agentId}`)

    if (!this.context) {
      logForDebugging(
        `[InProcessBackend] isActive() failed: no context set for ${agentId}`,
      )
      return false
    }

    // Get current AppState to find the task
    const state = this.context.getAppState()
    const task = findTeammateTaskByAgentId(agentId, state.tasks)

    if (!task) {
      logForDebugging(
        `[InProcessBackend] isActive(): task not found for ${agentId}`,
      )
      return false
    }

    // Check if task is running and not aborted
    const isRunning = task.status === 'running'
    const isAborted = task.abortController?.signal.aborted ?? true

    const active = isRunning && !isAborted

    logForDebugging(
      `[InProcessBackend] isActive() for ${agentId}: ${active} (running=${isRunning}, aborted=${isAborted})`,
    )

    return active
  }
}

/**
 * Factory function to create an InProcessBackend instance.
 * Used by the registry (Task #8) to get backend instances.
 */
export function createInProcessBackend(): InProcessBackend {
  return new InProcessBackend()
}
