/**
 * LocalShellTask — 本地 bash 任务态 + spawn/foreground/background 生命周期
 * （旧仓 src/tasks/LocalShellTask/LocalShellTask.tsx 522L 核心随迁，S-7a；
 * guards.ts / killShellTasks.ts 拆独立文件随迁）
 *
 * 旧仓 .tsx 的 React 渲染面（BackgroundTaskPill / MonitorDetails 等）裁出。
 *
 * 裁剪登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - abortSpeculation（PromptSuggestion 未迁）→ enqueueShellNotification 内
 *     调用裁除（同 localAgentTask 头注）。
 *   - isMainSessionTask（旧仓 LocalMainSessionTask）→ 内联
 *     `task.agentType !== 'main-session'`（与 isPanelAgentTask 同一谓词口径，
 *     域内 localAgentTask.isPanelAgentTask 即该谓词本体；主会话任务面随
 *     S-7e messaging 波复核）。
 *   - flushAndCleanup 的 `shellCommand.taskOutput.flush()` → 新仓
 *     TaskOutputHandle 12 成员端口无 flush 方法 → `flushTaskOutput(taskId)`
 *     （task 域 diskOutput 磁盘刷写）+ `shellCommand.cleanup()`；
 *     logError → logForDebugging。
 *   - enqueuePendingNotification → 域内通知注入窗口 enqueueTaskNotification。
 *   - AgentId brand → string（残余 ②）。
 *   - feature('MONITOR_TOOL') 支保留逐字（新仓 shared feature() 为纯可测模块，
 *     旧仓 bun:bundle 不可测坑已解——MONITOR_TOOL 缺省 off，env
 *     FEATURE_MONITOR_TOOL=1 可测）；monitor 任务面（MonitorMcpTask）未迁，
 *     kind === 'monitor' 输入面待 S-7b/S-7e 接线。
 *   - registerForeground / backgroundExistingForegroundTask 的 kind 参缺省
 *     undefined → enqueueShellNotification 回落 'bash'（旧仓同式）。
 */
import { feature, logForDebugging } from '../../../shared'
import type { ShellCommand } from '../../../executor'
import {
  createTaskStateBase,
  evictTaskOutput,
  flushTaskOutput,
  getTaskOutputPath,
  tailFile,
  type LocalShellSpawnInput,
  type SetAppState,
  type Task,
  type TaskAppState,
  type TaskContext,
  type TaskHandle,
} from '../../../task'
import { stat } from 'fs/promises'
import { registerCleanup } from './cleanupRegistry'
import {
  backgroundAgentTask,
  isLocalAgentTask,
} from './localAgentTask'
import {
  type BashTaskKind,
  isLocalShellTask,
  type LocalShellTaskState,
} from './guards'
import { killTask } from './killShellTasks'
import {
  registerTask,
  updateTaskState,
} from './framework'
import { enqueueTaskNotification } from './notification'
import {
  escapeXml,
  OUTPUT_FILE_TAG,
  STATUS_TAG,
  SUMMARY_TAG,
  TASK_ID_TAG,
  TASK_NOTIFICATION_TAG,
  TOOL_USE_ID_TAG,
} from './xml'

/** Prefix that identifies a LocalShellTask summary to the UI collapse transform. */
export const BACKGROUND_BASH_SUMMARY_PREFIX = 'Background command '
const STALL_CHECK_INTERVAL_MS = 5_000
const STALL_THRESHOLD_MS = 45_000
const STALL_TAIL_BYTES = 1024

// Last-line patterns that suggest a command is blocked waiting for keyboard
// input. Used to gate the stall notification — we stay silent on commands that
// are merely slow (git log -S, long builds) and only notify when the tail
// looks like an interactive prompt the model can act on. See CC-1175.
const PROMPT_PATTERNS = [
  /\(y\/n\)/i,
  // (Y/n), (y/N)
  /\[y\/n\]/i,
  // [Y/n], [y/N]
  /\(yes\/no\)/i,
  // directed questions
  /\b(?:Do you|Would you|Shall I|Are you sure|Ready to)\b.*\? *$/i,
  /Press (any key|Enter)/i,
  /Continue\?/i,
  /Overwrite\?/i,
]
export function looksLikePrompt(tail: string): boolean {
  const lastLine = tail.trimEnd().split('\n').pop() ?? ''
  return PROMPT_PATTERNS.some(p => p.test(lastLine))
}

// Output-side analog of peekForStdinData (utils/process.ts): fire a one-shot
// notification if output stops growing and the tail looks like a prompt.
function startStallWatchdog(
  taskId: string,
  description: string,
  kind: BashTaskKind | undefined,
  toolUseId?: string,
  agentId?: string,
): () => void {
  if (kind === 'monitor') return () => {}
  const outputPath = getTaskOutputPath(taskId)
  let lastSize = 0
  let lastGrowth = Date.now()
  let cancelled = false
  const timer = setInterval(() => {
    void stat(outputPath).then(
      s => {
        if (s.size > lastSize) {
          lastSize = s.size
          lastGrowth = Date.now()
          return
        }
        if (Date.now() - lastGrowth < STALL_THRESHOLD_MS) return
        void tailFile(outputPath, STALL_TAIL_BYTES).then(
          ({ content }) => {
            if (cancelled) return
            if (!looksLikePrompt(content)) {
              // Not a prompt — keep watching. Reset so the next check is
              // 45s out instead of re-reading the tail on every tick.
              lastGrowth = Date.now()
              return
            }
            // Latch before the async-boundary-visible side effects so an
            // overlapping tick's callback sees cancelled=true and bails.
            cancelled = true
            clearInterval(timer)
            const toolUseIdLine = toolUseId
              ? `\n<${TOOL_USE_ID_TAG}>${toolUseId}</${TOOL_USE_ID_TAG}>`
              : ''
            const summary = `${BACKGROUND_BASH_SUMMARY_PREFIX}"${description}" appears to be waiting for interactive input`
            // No <status> tag — print.ts treats <status> as a terminal
            // signal and an unknown value falls through to 'completed',
            // falsely closing the task for SDK consumers. Statusless
            // notifications are skipped by the SDK emitter (progress ping).
            const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${taskId}</${TASK_ID_TAG}>${toolUseIdLine}
<${OUTPUT_FILE_TAG}>${outputPath}</${OUTPUT_FILE_TAG}>
<${SUMMARY_TAG}>${escapeXml(summary)}</${SUMMARY_TAG}>
</${TASK_NOTIFICATION_TAG}>
Last output:
${content.trimEnd()}

The command is likely blocked on an interactive prompt. Kill this task and re-run with piped input (e.g., \`echo y | command\`) or a non-interactive flag if one exists.`
            enqueueTaskNotification({
              value: message,
              mode: 'task-notification',
              priority: 'next',
              agentId,
            })
          },
          () => {},
        )
      },
      () => {}, // File may not exist yet
    )
  }, STALL_CHECK_INTERVAL_MS)
  timer.unref()
  return () => {
    cancelled = true
    clearInterval(timer)
  }
}
function enqueueShellNotification(
  taskId: string,
  description: string,
  status: 'completed' | 'failed' | 'killed',
  exitCode: number | undefined,
  setAppState: SetAppState,
  toolUseId?: string,
  kind: BashTaskKind = 'bash',
  agentId?: string,
): void {
  // Atomically check and set notified flag to prevent duplicate notifications.
  // If the task was already marked as notified (e.g., by TaskStopTool), skip
  // enqueueing to avoid sending redundant messages to the model.
  let shouldEnqueue = false
  updateTaskState<LocalShellTaskState>(taskId, setAppState, task => {
    if (task.notified) {
      return task
    }
    shouldEnqueue = true
    return {
      ...task,
      notified: true,
    }
  })
  if (!shouldEnqueue) {
    return
  }

  // 旧仓 abortSpeculation(setAppState) 裁除（头注登记）。
  let summary: string
  if (feature('MONITOR_TOOL') && kind === 'monitor') {
    // Monitor is streaming-only (post-#22764) — the script exiting means
    // the stream ended, not "condition met". Distinct from the bash prefix
    // so Monitor completions don't fold into the "N background commands
    // completed" collapse.
    switch (status) {
      case 'completed':
        summary = `Monitor "${description}" stream ended`
        break
      case 'failed':
        summary = `Monitor "${description}" script failed${exitCode !== undefined ? ` (exit ${exitCode})` : ''}`
        break
      case 'killed':
        summary = `Monitor "${description}" stopped`
        break
    }
  } else {
    switch (status) {
      case 'completed':
        summary = `${BACKGROUND_BASH_SUMMARY_PREFIX}"${description}" completed${exitCode !== undefined ? ` (exit code ${exitCode})` : ''}`
        break
      case 'failed':
        summary = `${BACKGROUND_BASH_SUMMARY_PREFIX}"${description}" failed${exitCode !== undefined ? ` with exit code ${exitCode}` : ''}`
        break
      case 'killed':
        summary = `${BACKGROUND_BASH_SUMMARY_PREFIX}"${description}" was stopped`
        break
    }
  }
  const outputPath = getTaskOutputPath(taskId)
  const toolUseIdLine = toolUseId
    ? `\n<${TOOL_USE_ID_TAG}>${toolUseId}</${TOOL_USE_ID_TAG}>`
    : ''
  const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${taskId}</${TASK_ID_TAG}>${toolUseIdLine}
<${OUTPUT_FILE_TAG}>${outputPath}</${OUTPUT_FILE_TAG}>
<${STATUS_TAG}>${status}</${STATUS_TAG}>
<${SUMMARY_TAG}>${escapeXml(summary)}</${SUMMARY_TAG}>
</${TASK_NOTIFICATION_TAG}>`
  enqueueTaskNotification({
    value: message,
    mode: 'task-notification',
    priority: feature('MONITOR_TOOL') ? 'next' : 'later',
    agentId,
  })
}
export const LocalShellTask: Task = {
  name: 'LocalShellTask',
  type: 'local_bash',
  async kill(taskId, setAppState) {
    killTask(taskId, setAppState)
  },
}
export async function spawnShellTask(
  input: LocalShellSpawnInput & {
    shellCommand: ShellCommand
  },
  context: TaskContext,
): Promise<TaskHandle> {
  const { command, description, shellCommand, toolUseId, agentId, kind } =
    input
  const { setAppState } = context

  // TaskOutput owns the data — use its taskId so disk writes are consistent
  const { taskOutput } = shellCommand
  const taskId = taskOutput.taskId
  const unregisterCleanup = registerCleanup(async () => {
    killTask(taskId, setAppState)
  })
  const taskState: LocalShellTaskState = {
    ...createTaskStateBase(taskId, 'local_bash', description, toolUseId),
    type: 'local_bash',
    status: 'running',
    command,
    completionStatusSentInAttachment: false,
    shellCommand,
    unregisterCleanup,
    lastReportedTotalLines: 0,
    isBackgrounded: true,
    agentId,
    kind,
  }
  registerTask(taskState, setAppState)

  // Data flows through TaskOutput automatically — no stream listeners needed.
  // Just transition to backgrounded state so the process keeps running.
  shellCommand.background(taskId)
  const cancelStallWatchdog = startStallWatchdog(
    taskId,
    description,
    kind,
    toolUseId,
    agentId,
  )
  void shellCommand.result.then(async result => {
    cancelStallWatchdog()
    await flushAndCleanup(shellCommand)
    let wasKilled = false
    updateTaskState<LocalShellTaskState>(taskId, setAppState, task => {
      if (task.status === 'killed') {
        wasKilled = true
        return task
      }
      return {
        ...task,
        status: result.code === 0 ? 'completed' : 'failed',
        result: {
          code: result.code,
          interrupted: result.interrupted,
        },
        shellCommand: null,
        unregisterCleanup: undefined,
        endTime: Date.now(),
      }
    })
    enqueueShellNotification(
      taskId,
      description,
      wasKilled ? 'killed' : result.code === 0 ? 'completed' : 'failed',
      result.code,
      setAppState,
      toolUseId,
      kind,
      agentId,
    )
    void evictTaskOutput(taskId)
  })
  return {
    taskId,
    cleanup: () => {
      unregisterCleanup()
    },
  }
}

/**
 * Register a foreground task that could be backgrounded later.
 * Called when a bash command has been running long enough to show the BackgroundHint.
 * @returns taskId for the registered task
 */
export function registerForeground(
  input: LocalShellSpawnInput & {
    shellCommand: ShellCommand
  },
  setAppState: SetAppState,
  toolUseId?: string,
): string {
  const { command, description, shellCommand, agentId } = input
  const taskId = shellCommand.taskOutput.taskId
  const unregisterCleanup = registerCleanup(async () => {
    killTask(taskId, setAppState)
  })
  const taskState: LocalShellTaskState = {
    ...createTaskStateBase(taskId, 'local_bash', description, toolUseId),
    type: 'local_bash',
    status: 'running',
    command,
    completionStatusSentInAttachment: false,
    shellCommand,
    unregisterCleanup,
    lastReportedTotalLines: 0,
    isBackgrounded: false,
    // Not yet backgrounded - running in foreground
    agentId,
  }
  registerTask(taskState, setAppState)
  return taskId
}

/**
 * Background a specific foreground task.
 * @returns true if backgrounded successfully, false otherwise
 */
function backgroundTask(
  taskId: string,
  getAppState: () => TaskAppState,
  setAppState: SetAppState,
): boolean {
  // Step 1: Get the task and shell command from current state
  const state = getAppState()
  const task = state.tasks[taskId]
  if (!isLocalShellTask(task) || task.isBackgrounded || !task.shellCommand) {
    return false
  }
  const shellCommand = task.shellCommand
  const description = task.description
  const { toolUseId, kind, agentId } = task

  // Transition to backgrounded — TaskOutput continues receiving data automatically
  if (!shellCommand.background(taskId)) {
    return false
  }
  setAppState(prev => {
    const prevTask = prev.tasks[taskId]
    if (!isLocalShellTask(prevTask) || prevTask.isBackgrounded) {
      return prev
    }
    return {
      ...prev,
      tasks: {
        ...prev.tasks,
        [taskId]: {
          ...prevTask,
          isBackgrounded: true,
        },
      },
    }
  })
  const cancelStallWatchdog = startStallWatchdog(
    taskId,
    description,
    kind,
    toolUseId,
    agentId,
  )

  // Set up result handler
  void shellCommand.result.then(async result => {
    cancelStallWatchdog()
    await flushAndCleanup(shellCommand)
    let wasKilled = false
    let cleanupFn: (() => void) | undefined
    updateTaskState<LocalShellTaskState>(taskId, setAppState, t => {
      if (t.status === 'killed') {
        wasKilled = true
        return t
      }

      // Capture cleanup function to call outside of updater
      cleanupFn = t.unregisterCleanup
      return {
        ...t,
        status: result.code === 0 ? 'completed' : 'failed',
        result: {
          code: result.code,
          interrupted: result.interrupted,
        },
        shellCommand: null,
        unregisterCleanup: undefined,
        endTime: Date.now(),
      }
    })

    // Call cleanup outside of the state updater (avoid side effects in updater)
    cleanupFn?.()
    if (wasKilled) {
      enqueueShellNotification(
        taskId,
        description,
        'killed',
        result.code,
        setAppState,
        toolUseId,
        kind,
        agentId,
      )
    } else {
      const finalStatus = result.code === 0 ? 'completed' : 'failed'
      enqueueShellNotification(
        taskId,
        description,
        finalStatus,
        result.code,
        setAppState,
        toolUseId,
        kind,
        agentId,
      )
    }
    void evictTaskOutput(taskId)
  })
  return true
}

/**
 * Background ALL foreground tasks (bash commands and agents).
 * Called when user presses Ctrl+B to background all running tasks.
 */
/**
 * Check if there are any foreground tasks (bash or agent) that can be backgrounded.
 * Used to determine whether Ctrl+B should background existing tasks vs. background the session.
 * （isMainSessionTask 内联 `agentType !== 'main-session'`，头注登记。）
 */
export function hasForegroundTasks(state: TaskAppState): boolean {
  return Object.values(state.tasks).some(task => {
    if (isLocalShellTask(task) && !task.isBackgrounded && task.shellCommand) {
      return true
    }
    // Exclude main session tasks - they display in the main view, not as foreground tasks
    if (
      isLocalAgentTask(task) &&
      !task.isBackgrounded &&
      task.agentType !== 'main-session'
    ) {
      return true
    }
    return false
  })
}
export function backgroundAll(
  getAppState: () => TaskAppState,
  setAppState: SetAppState,
): void {
  const state = getAppState()

  // Background all foreground bash tasks
  const foregroundBashTaskIds = Object.keys(state.tasks).filter(id => {
    const task = state.tasks[id]
    return isLocalShellTask(task) && !task.isBackgrounded && task.shellCommand
  })
  for (const taskId of foregroundBashTaskIds) {
    backgroundTask(taskId, getAppState, setAppState)
  }

  // Background all foreground agent tasks
  const foregroundAgentTaskIds = Object.keys(state.tasks).filter(id => {
    const task = state.tasks[id]
    return isLocalAgentTask(task) && !task.isBackgrounded
  })
  for (const taskId of foregroundAgentTaskIds) {
    backgroundAgentTask(taskId, getAppState, setAppState)
  }
}

/**
 * Background an already-registered foreground task in-place.
 * Unlike spawn(), this does NOT re-register the task — it flips isBackgrounded
 * on the existing registration and sets up a completion handler.
 * Used when the auto-background timer fires after registerForeground() has
 * already registered the task (avoiding duplicate task_started SDK events
 * and leaked cleanup callbacks).
 */
export function backgroundExistingForegroundTask(
  taskId: string,
  shellCommand: ShellCommand,
  description: string,
  setAppState: SetAppState,
  toolUseId?: string,
): boolean {
  if (!shellCommand.background(taskId)) {
    return false
  }
  let agentId: string | undefined
  setAppState(prev => {
    const prevTask = prev.tasks[taskId]
    if (!isLocalShellTask(prevTask) || prevTask.isBackgrounded) {
      return prev
    }
    agentId = prevTask.agentId
    return {
      ...prev,
      tasks: {
        ...prev.tasks,
        [taskId]: {
          ...prevTask,
          isBackgrounded: true,
        },
      },
    }
  })
  const cancelStallWatchdog = startStallWatchdog(
    taskId,
    description,
    undefined,
    toolUseId,
    agentId,
  )

  // Set up result handler (mirrors backgroundTask's handler)
  void shellCommand.result.then(async result => {
    cancelStallWatchdog()
    await flushAndCleanup(shellCommand)
    let wasKilled = false
    let cleanupFn: (() => void) | undefined
    updateTaskState<LocalShellTaskState>(taskId, setAppState, t => {
      if (t.status === 'killed') {
        wasKilled = true
        return t
      }
      cleanupFn = t.unregisterCleanup
      return {
        ...t,
        status: result.code === 0 ? 'completed' : 'failed',
        result: {
          code: result.code,
          interrupted: result.interrupted,
        },
        shellCommand: null,
        unregisterCleanup: undefined,
        endTime: Date.now(),
      }
    })
    cleanupFn?.()
    const finalStatus = wasKilled
      ? 'killed'
      : result.code === 0
        ? 'completed'
        : 'failed'
    enqueueShellNotification(
      taskId,
      description,
      finalStatus,
      result.code,
      setAppState,
      toolUseId,
      undefined,
      agentId,
    )
    void evictTaskOutput(taskId)
  })
  return true
}

/**
 * Mark a task as notified to suppress a pending enqueueShellNotification.
 * Used when backgrounding raced with completion — the tool result already
 * carries the full output, so the <task_notification> would be redundant.
 */
export function markTaskNotified(
  taskId: string,
  setAppState: SetAppState,
): void {
  updateTaskState<LocalShellTaskState>(taskId, setAppState, t =>
    t.notified ? t : { ...t, notified: true },
  )
}

/**
 * Unregister a foreground task when the command completes without being backgrounded.
 */
export function unregisterForeground(
  taskId: string,
  setAppState: SetAppState,
): void {
  let cleanupFn: (() => void) | undefined
  setAppState(prev => {
    const task = prev.tasks[taskId]
    // Only remove if it's a foreground task (not backgrounded)
    if (!isLocalShellTask(task) || task.isBackgrounded) {
      return prev
    }

    // Capture cleanup function to call outside of updater
    cleanupFn = task.unregisterCleanup
    const { [taskId]: _removed, ...rest } = prev.tasks
    return {
      ...prev,
      tasks: rest,
    }
  })

  // Call cleanup outside of the state updater (avoid side effects in updater)
  cleanupFn?.()
}
async function flushAndCleanup(shellCommand: ShellCommand): Promise<void> {
  // 新仓 TaskOutputHandle 12 成员端口无 flush() → 磁盘刷写走 task 域
  // flushTaskOutput（头注登记）。
  try {
    await flushTaskOutput(shellCommand.taskOutput.taskId)
    shellCommand.cleanup()
  } catch (error) {
    logForDebugging(`task output flush failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
