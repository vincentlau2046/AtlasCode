/**
 * 任务状态机框架层（旧仓 src/utils/task/framework.ts 308L 逐字随迁，S-7a）
 *
 * 落位：engine/coordinator/tasks（E-7 纵切 tasks 追踪层）。旧仓全局
 * utils/task/ 拆入 engine 编排子模块（coordinator 组合根消费，engine 允许
 * import task/executor 域，eslint 边界合规）。
 *
 * 移植口径：
 *   - AppState → task 域 TaskAppState（残余 ①，engine 波接全量 AppState 时替换）
 *   - SetAppState → task 域导出（签名同形）
 *   - TaskState（旧仓 any 桩）→ 域内真联合 types.ts
 *
 * 裁剪登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - registerTask 尾部 enqueueSdkEvent(task_started) 已落（analytics 波
 *     §8.69，SDK 事件队列 sdkEventQueue.ts 共域）：新注册发 task_started，
 *     resume 防双发（isReplacement 早退）语义逐字保留；task 终态收尾
 *     bookend 由 stopTask / spawnInProcess / inProcessRunner 经
 *     emitTaskTerminatedSdk 补发（各文件 delta 头注）。
 *   - enqueueTaskNotification（私有 XML 构造器）→ 投递改走域内通知注入窗口
 *     notification.ts（messageQueueManager 全量队列随 S-7e messaging 波）。
 *   - enqueueTaskStatusNotification 内 escapeXml(outputPath) +
 *     escapeXml(description)（旧仓 raw 插值）= 有意加固：untrusted
 *     description 不再 raw 注入 XML。当前 generateTaskAttachments 恒不 push
 *     attachments（pollTasks 附件循环空转、构造器不可达）→ 零行为 delta，仅登记。
 *   - TaskAttachment 当前仅 status 面生成（running delta offset + terminal
 *     驱逐）；completed 附件支旧仓即不生成（per-type callback 自持通知，
 *     防 dual-delivery，注释保留）——附件消费面（UI/SDK）待组合根。
 */
import type {
  SetAppState,
  TaskAppState,
  TaskStatus,
  TaskType,
} from '../../../task'
import {
  getTaskOutputDelta,
  getTaskOutputPath,
  isTerminalTaskStatus,
} from '../../../task'
import { enqueueTaskNotification } from './notification'
import { enqueueSdkEvent } from './sdkEventQueue'
import type { LocalAgentTaskState } from './localAgentTask'
import type { TaskState } from './types'
import {
  escapeXml,
  OUTPUT_FILE_TAG,
  STATUS_TAG,
  SUMMARY_TAG,
  TASK_ID_TAG,
  TASK_NOTIFICATION_TAG,
  TASK_TYPE_TAG,
  TOOL_USE_ID_TAG,
} from './xml'

// Standard polling interval for all tasks
export const POLL_INTERVAL_MS = 1000

// Duration to display killed tasks before eviction
export const STOPPED_DISPLAY_MS = 3_000

// Grace period for terminal local_agent tasks in the coordinator panel
export const PANEL_GRACE_MS = 30_000

// Attachment type for task status updates
export type TaskAttachment = {
  type: 'task_status'
  taskId: string
  toolUseId?: string
  taskType: TaskType
  status: TaskStatus
  description: string
  deltaSummary: string | null // New output since last attachment
}

/**
 * Update a task's state in AppState.
 * Helper function for task implementations.
 * Generic to allow type-safe updates for specific task types.
 */
export function updateTaskState<T extends TaskState>(
  taskId: string,
  setAppState: SetAppState,
  updater: (task: T) => T,
): void {
  setAppState(prev => {
    const task = (prev.tasks?.[taskId] as T | undefined)
    if (!task) {
      return prev
    }
    const updated = updater(task)
    if (updated === task) {
      // Updater returned the same reference (early-return no-op). Skip the
      // spread so s.tasks subscribers don't re-render on unchanged state.
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

/**
 * Register a new task in AppState.
 */
export function registerTask(task: TaskState, setAppState: SetAppState): void {
  let isReplacement = false
  setAppState(prev => {
    const existing = prev.tasks[task.id]
    isReplacement = existing !== undefined
    // Carry forward UI-held state on re-register (resumeAgentBackground
    // replaces the task; user's retain shouldn't reset). startTime keeps
    // the panel sort stable; messages + diskLoaded preserve the viewed
    // transcript across the replace (the user's just-appended prompt lives
    // in messages and isn't on disk yet).
    // 'retain' in 窄化对 交叉类型 union 会丢字段（TS in-narrowing 行为）→
    // cast 到 LocalAgentTaskState（union 中唯一带 retain 的成员）。
    const merged =
      existing && 'retain' in existing
        ? {
            ...task,
            retain: (existing as LocalAgentTaskState).retain,
            startTime: existing.startTime,
            messages: (existing as LocalAgentTaskState).messages,
            diskLoaded: (existing as LocalAgentTaskState).diskLoaded,
            pendingMessages: (existing as LocalAgentTaskState).pendingMessages,
          }
        : task
    return { ...prev, tasks: { ...prev.tasks, [task.id]: merged } }
  })

  // Replacement (resume) — not a new start. Skip to avoid double-emit.
  if (isReplacement) return

  enqueueSdkEvent({
    type: 'system',
    subtype: 'task_started',
    task_id: task.id,
    tool_use_id: task.toolUseId,
    description: task.description,
    task_type: task.type,
    workflow_name:
      'workflowName' in task
        ? (task.workflowName as string | undefined)
        : undefined,
    prompt: 'prompt' in task ? (task.prompt as string) : undefined,
  })
}

/**
 * Eagerly evict a terminal task from AppState.
 * The task must be in a terminal state (completed/failed/killed) with notified=true.
 * This allows memory to be freed without waiting for the next query loop iteration.
 * The lazy GC in generateTaskAttachments() remains as a safety net.
 */
export function evictTerminalTask(
  taskId: string,
  setAppState: SetAppState,
): void {
  setAppState(prev => {
    const task = prev.tasks?.[taskId]
    if (!task) return prev
    if (!isTerminalTaskStatus(task.status)) return prev
    if (!task.notified) return prev
    // Panel grace period — blocks eviction until deadline passes.
    // 'retain' in task narrows to LocalAgentTaskState (the only type with
    // that field); evictAfter is optional so 'evictAfter' in task would
    // miss tasks that haven't had it set yet.
    if (
      'retain' in task &&
      ((task as LocalAgentTaskState).evictAfter ?? Infinity) > Date.now()
    ) {
      return prev
    }
    const { [taskId]: _evicted, ...remainingTasks } = prev.tasks
    return { ...prev, tasks: remainingTasks }
  })
}

/**
 * Get all running tasks.
 */
export function getRunningTasks(state: TaskAppState): TaskState[] {
  const tasks = state.tasks ?? {}
  return (Object.values(tasks) as TaskState[]).filter(
    task => task.status === 'running',
  )
}

/**
 * Generate attachments for tasks with new output or status changes.
 * Called by the framework to create push notifications.
 */
export async function generateTaskAttachments(state: TaskAppState): Promise<{
  attachments: TaskAttachment[]
  // Only the offset patch — NOT the full task. The task may transition to
  // completed during getTaskOutputDelta's async disk read, and spreading the
  // full stale snapshot would clobber that transition (zombifying the task).
  updatedTaskOffsets: Record<string, number>
  evictedTaskIds: string[]
}> {
  const attachments: TaskAttachment[] = []
  const updatedTaskOffsets: Record<string, number> = {}
  const evictedTaskIds: string[] = []
  const tasks = state.tasks ?? {}

  for (const taskState of Object.values(tasks) as TaskState[]) {
    if (taskState.notified) {
      switch (taskState.status) {
        case 'completed':
        case 'failed':
        case 'killed':
          // Evict terminal tasks — they've been consumed and can be GC'd
          evictedTaskIds.push(taskState.id)
          continue
        case 'pending':
          // Keep in map — hasn't run yet, but parent already knows about it
          continue
        case 'running':
          // Fall through to running logic below
          break
      }
    }

    if (taskState.status === 'running') {
      const delta = await getTaskOutputDelta(
        taskState.id,
        taskState.outputOffset,
      )
      if (delta.content) {
        updatedTaskOffsets[taskState.id] = delta.newOffset
      }
    }

    // Completed tasks are NOT notified here — each task type handles its own
    // completion notification via enqueuePendingNotification(). Generating
    // attachments here would race with those per-type callbacks, causing
    // dual delivery (one inline attachment + one separate API turn).
  }

  return { attachments, updatedTaskOffsets, evictedTaskIds }
}

/**
 * Apply the outputOffset patches and evictions from generateTaskAttachments.
 * Merges patches against FRESH prev.tasks (not the stale pre-await snapshot),
 * so concurrent status transitions aren't clobbered.
 */
export function applyTaskOffsetsAndEvictions(
  setAppState: SetAppState,
  updatedTaskOffsets: Record<string, number>,
  evictedTaskIds: string[],
): void {
  const offsetIds = Object.keys(updatedTaskOffsets)
  if (offsetIds.length === 0 && evictedTaskIds.length === 0) {
    return
  }
  setAppState(prev => {
    let changed = false
    const newTasks = { ...prev.tasks }
    for (const id of offsetIds) {
      const fresh = newTasks[id]
      // Re-check status on fresh state — task may have completed during the
      // await. If it's no longer running, the offset update is moot.
      if (fresh?.status === 'running') {
        newTasks[id] = { ...fresh, outputOffset: updatedTaskOffsets[id]! }
        changed = true
      }
    }
    for (const id of evictedTaskIds) {
      const fresh = newTasks[id]
      // Re-check terminal+notified on fresh state (TOCTOU: resume may have
      // replaced the task during the generateTaskAttachments await)
      if (!fresh || !isTerminalTaskStatus(fresh.status) || !fresh.notified) {
        continue
      }
      if (
        'retain' in fresh &&
        ((fresh as LocalAgentTaskState).evictAfter ?? Infinity) > Date.now()
      ) {
        continue
      }
      delete newTasks[id]
      changed = true
    }
    return changed ? { ...prev, tasks: newTasks } : prev
  })
}

/**
 * Poll all running tasks and check for updates.
 * This is the main polling loop called by the framework.
 */
export async function pollTasks(
  getAppState: () => TaskAppState,
  setAppState: SetAppState,
): Promise<void> {
  const state = getAppState()
  const { attachments, updatedTaskOffsets, evictedTaskIds } =
    await generateTaskAttachments(state)

  applyTaskOffsetsAndEvictions(setAppState, updatedTaskOffsets, evictedTaskIds)

  // Send notifications for completed tasks
  for (const attachment of attachments) {
    enqueueTaskStatusNotification(attachment)
  }
}

/**
 * Enqueue a task notification to the message queue.
 * （私有 XML 构造器；投递走 notification.ts 注入窗口。）
 */
function enqueueTaskStatusNotification(attachment: TaskAttachment): void {
  const statusText = getStatusText(attachment.status)

  const outputPath = getTaskOutputPath(attachment.taskId)
  const toolUseIdLine = attachment.toolUseId
    ? `\n<${TOOL_USE_ID_TAG}>${attachment.toolUseId}</${TOOL_USE_ID_TAG}>`
    : ''
  const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${attachment.taskId}</${TASK_ID_TAG}>${toolUseIdLine}
<${TASK_TYPE_TAG}>${attachment.taskType}</${TASK_TYPE_TAG}>
<${OUTPUT_FILE_TAG}>${escapeXml(outputPath)}</${OUTPUT_FILE_TAG}>
<${STATUS_TAG}>${attachment.status}</${STATUS_TAG}>
<${SUMMARY_TAG}>Task "${escapeXml(attachment.description)}" ${statusText}</${SUMMARY_TAG}>
</${TASK_NOTIFICATION_TAG}>`

  enqueueTaskNotification({
    value: message,
    mode: 'task-notification',
  })
}

/**
 * Get human-readable status text.
 */
function getStatusText(status: TaskStatus): string {
  switch (status) {
    case 'completed':
      return 'completed successfully'
    case 'failed':
      return 'failed'
    case 'killed':
      return 'was stopped'
    case 'running':
      return 'is running'
    case 'pending':
      return 'is pending'
  }
}
