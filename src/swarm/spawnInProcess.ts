/**
 * In-process teammate spawning（C 桶 ③ shell·swarm 波 S-E2b，§8.66）。
 *
 * 创建并注册 in-process teammate task。与进程系 teammate（tmux/iTerm2）
 * 不同，in-process teammate 在同一 Node.js 进程内以 AsyncLocalStorage
 * 隔离运行。本模块负责：
 * 1. 创建 TeammateContext
 * 2. 创建联动 AbortController
 * 3. 注册 InProcessTeammateTaskState
 * 4. 返回 spawn 结果供 backend 消费
 * （实际 agent 执行循环 = S-E2d inProcessRunner，经 runWithTeammateContext
 * 拉起。）
 *
 * import 面重映射：
 *   - getSessionId → bootstrap 域门面
 *   - createTaskStateBase/generateTaskId/InProcessTeammateTaskState/
 *     TeammateIdentity/isInProcessTeammateTask/SetAppState → task 域门面
 *   - createAbortController/registerTask/evictTerminalTask/
 *     STOPPED_DISPLAY_MS → engine 域根门面
 *   - evictTaskOutput → task 域门面（diskOutput 面）
 *   - createTeammateContext/formatAgentId → 域内
 *   - registerCleanup → 域内 cleanupRegistry（旧 utils/cleanupRegistry 镜像）
 *   - removeMemberByAgentId → 域内 teamHelpers
 *
 * 裁面登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - lodash-es sample（spinnerVerb/pastTenseVerb 字段）整支裁除：TUI 动词
 *     列表（constants/spinnerVerbs + turnCompletionVerbs）新仓未落 + 3 依赖
 *     纪律禁 lodash（本地 one-liner 亦无消费语义可保）→ 两字段不置位。
 *   - emitTaskTerminatedSdk（SDK 事件队列）调用支裁除：SDK 事件面新仓未落
 *     （engine/coordinator/tasks/stopTask.ts:9 同型裁面先例）；
 *     notified:true 预设 + 终态 evict 面逐字保留。旧 kill 捕获的
 *     toolUseId/description 两变量唯一消费端 = 该 SDK emit 支（旧
 *     emitTaskTerminatedSdk(taskId, 'stopped', { toolUseId, summary:
 *     description })）→ 捕获面随裁除删除（零消费者残留）。
 *   - perfetto tracing（isPerfettoTracingEnabled/register/unregister）裁除：
 *     遥测域未落（analytics 波 #143）。
 *   - kill 支 teamContext.teammates 清理支裁除：teamContext 状态面 = TUI 波
 *     （旧 AppState.teamContext ∉ 新仓 task 域最小 AppState）。
 *   - kill 更新面 `inProgressToolUseIDs/currentWorkAbortController: undefined`
 *     置位裁除（重建 ③：LocalAgentTaskState 同族字段，in-process 态不持，
 *     登记见 task/inProcessTeammate.ts 头注）。
 */
import { getSessionId } from '../bootstrap'
import {
  createTaskStateBase,
  evictTaskOutput,
  generateTaskId,
  isInProcessTeammateTask,
  type InProcessTeammateTaskState,
  type SetAppState,
  type TeammateIdentity,
} from '../task'
import {
  createAbortController,
  evictTerminalTask,
  registerTask,
  STOPPED_DISPLAY_MS,
} from '../engine'
import { logForDebugging } from '../shared'
import { createTeammateContext } from './teammateContext'
import { formatAgentId } from './agentId'
import { registerCleanup } from './cleanupRegistry'
import { removeMemberByAgentId } from './teamHelpers'

/**
 * Minimal context required for spawning an in-process teammate.
 * This is a subset of ToolUseContext - only what spawnInProcessTeammate actually uses.
 */
export type SpawnContext = {
  setAppState: SetAppState
  toolUseId?: string
}

/**
 * Configuration for spawning an in-process teammate.
 */
export type InProcessSpawnConfig = {
  /** Display name for the teammate, e.g., "researcher" */
  name: string
  /** Team this teammate belongs to */
  teamName: string
  /** Initial prompt/task for the teammate */
  prompt: string
  /** Optional UI color for the teammate */
  color?: string
  /** Whether teammate must enter plan mode before implementing */
  planModeRequired: boolean
  /** Optional model override for this teammate */
  model?: string
}

/**
 * Result from spawning an in-process teammate.
 */
export type InProcessSpawnOutput = {
  /** Whether spawn was successful */
  success: boolean
  /** Full agent ID (format: "name@team") */
  agentId: string
  /** Task ID for tracking in AppState */
  taskId?: string
  /** AbortController for this teammate (linked to parent) */
  abortController?: AbortController
  /** Teammate context for AsyncLocalStorage */
  teammateContext?: ReturnType<typeof createTeammateContext>
  /** Error message if spawn failed */
  error?: string
}

/**
 * Spawns an in-process teammate.
 *
 * Creates the teammate's context, registers the task in AppState, and returns
 * the spawn result. The actual agent execution is driven by the
 * InProcessTeammateTask component which uses runWithTeammateContext() to
 * execute the agent loop with proper identity isolation.
 *
 * @param config - Spawn configuration
 * @param context - Context with setAppState for registering task
 * @returns Spawn result with teammate info
 */
export async function spawnInProcessTeammate(
  config: InProcessSpawnConfig,
  context: SpawnContext,
): Promise<InProcessSpawnOutput> {
  const { name, teamName, prompt, color, planModeRequired, model } = config
  const { setAppState } = context

  // Generate deterministic agent ID
  const agentId = formatAgentId(name, teamName)
  const taskId = generateTaskId('in_process_teammate')

  logForDebugging(
    `[spawnInProcessTeammate] Spawning ${agentId} (taskId: ${taskId})`,
  )

  try {
    // Create independent AbortController for this teammate
    // Teammates should not be aborted when the leader's query is interrupted
    const abortController = createAbortController()

    // Get parent session ID for transcript correlation
    const parentSessionId = getSessionId()

    // Create teammate identity (stored as plain data in AppState)
    const identity: TeammateIdentity = {
      agentId,
      agentName: name,
      teamName,
      color,
      planModeRequired,
      parentSessionId,
    }

    // Create teammate context for AsyncLocalStorage
    // This will be used by runWithTeammateContext() during agent execution
    const teammateContext = createTeammateContext({
      agentId,
      agentName: name,
      teamName,
      color,
      planModeRequired,
      parentSessionId,
      abortController,
    })

    // Create task state
    const description = `${name}: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`

    const taskState: InProcessTeammateTaskState = {
      ...createTaskStateBase(
        taskId,
        'in_process_teammate',
        description,
        context.toolUseId,
      ),
      type: 'in_process_teammate',
      status: 'running',
      identity,
      prompt,
      model,
      abortController,
      awaitingPlanApproval: false,
      permissionMode: planModeRequired ? 'plan' : 'default',
      isIdle: false,
      shutdownRequested: false,
      lastReportedToolCount: 0,
      lastReportedTokenCount: 0,
      pendingUserMessages: [],
      messages: [], // Initialize to empty array so getDisplayedMessages works immediately
    }

    // Register cleanup handler for graceful shutdown
    const unregisterCleanup = registerCleanup(async () => {
      logForDebugging(`[spawnInProcessTeammate] Cleanup called for ${agentId}`)
      abortController.abort()
      // Task state will be updated by the execution loop when it detects abort
    })
    taskState.unregisterCleanup = unregisterCleanup

    // Register task in AppState
    registerTask(taskState, setAppState)

    logForDebugging(
      `[spawnInProcessTeammate] Registered ${agentId} in AppState`,
    )

    return {
      success: true,
      agentId,
      taskId,
      abortController,
      teammateContext,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error during spawn'
    logForDebugging(
      `[spawnInProcessTeammate] Failed to spawn ${agentId}: ${errorMessage}`,
    )
    return {
      success: false,
      agentId,
      error: errorMessage,
    }
  }
}

/**
 * Kills an in-process teammate by aborting its controller.
 *
 * Note: This is the implementation called by InProcessBackend.kill().
 *
 * @param taskId - Task ID of the teammate to kill
 * @param setAppState - task 域 AppState setter
 * @returns true if killed successfully
 */
export function killInProcessTeammate(
  taskId: string,
  setAppState: SetAppState,
): boolean {
  let killed = false
  let teamName: string | null = null
  let agentId: string | null = null

  setAppState(prev => {
    const task = prev.tasks[taskId]
    if (!task || !isInProcessTeammateTask(task)) {
      return prev
    }

    const teammateTask = task

    if (teammateTask.status !== 'running') {
      return prev
    }

    // Capture identity for cleanup after state update
    teamName = teammateTask.identity.teamName
    agentId = teammateTask.identity.agentId

    // Abort the controller to stop execution
    teammateTask.abortController?.abort()

    // Call cleanup handler
    teammateTask.unregisterCleanup?.()

    // Update task state
    killed = true

    // Call pending idle callbacks to unblock any waiters (e.g., engine.waitForIdle)
    teammateTask.onIdleCallbacks?.forEach(cb => cb())

    return {
      ...prev,
      tasks: {
        ...prev.tasks,
        [taskId]: {
          ...teammateTask,
          status: 'killed' as const,
          notified: true,
          endTime: Date.now(),
          onIdleCallbacks: [], // Clear callbacks to prevent stale references
          messages: teammateTask.messages?.length
            ? [teammateTask.messages[teammateTask.messages.length - 1]!]
            : undefined,
          pendingUserMessages: [],
          abortController: undefined,
          unregisterCleanup: undefined,
        },
      },
    }
  })

  // Remove from team file (outside state updater to avoid file I/O in callback)
  if (teamName && agentId) {
    removeMemberByAgentId(teamName, agentId)
  }

  if (killed) {
    void evictTaskOutput(taskId)
    // notified:true was pre-set so no XML notification fires.
    setTimeout(
      evictTerminalTask.bind(null, taskId, setAppState),
      STOPPED_DISPLAY_MS,
    )
  }

  return killed
}
