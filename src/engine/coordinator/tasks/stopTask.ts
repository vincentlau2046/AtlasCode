/**
 * stopTask — 停止运行中任务的共享逻辑（旧仓 src/tasks/stopTask.ts 100L
 * 逐字随迁，S-7a）
 *
 * 旧仓消费者：TaskStopTool（LLM 调用）+ SDK stop_task 控制请求。新仓
 * TaskStopTool 工具本体 / SDK 控制面待组合根接线，本面先落状态机核心。
 *
 * 裁剪登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - isLocalShellTask 抑制支的 emitTaskTerminatedSdk 调用裁除（SDK 事件
 *     队列未迁）——抑制旗标逻辑 + 注释保留：「抑制 XML 通知同时抑制
 *     print.ts 解析出的 task_notification SDK 事件，须直发 SDK 事件让
 *     消费者看到任务关闭」= SDK 波落位时的补发点。
 *   - AppState → task 域 TaskAppState（残余 ①）。
 */
import type { SetAppState, TaskAppState, TaskStateBase } from '../../../task'
import { isLocalShellTask } from './guards'
import { getTaskByType } from './registry'

export class StopTaskError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_found' | 'not_running' | 'unsupported_type',
  ) {
    super(message)
    this.name = 'StopTaskError'
  }
}

type StopTaskContext = {
  getAppState: () => TaskAppState
  setAppState: SetAppState
}

type StopTaskResult = {
  taskId: string
  taskType: string
  command: string | undefined
}

/**
 * Look up a task by ID, validate it is running, kill it, and mark it as notified.
 *
 * Throws {@link StopTaskError} when the task cannot be stopped (not found,
 * not running, or unsupported type). Callers can inspect `error.code` to
 * distinguish the failure reason.
 */
export async function stopTask(
  taskId: string,
  context: StopTaskContext,
): Promise<StopTaskResult> {
  const { getAppState, setAppState } = context
  const appState = getAppState()
  const task = appState.tasks?.[taskId] as TaskStateBase | undefined

  if (!task) {
    throw new StopTaskError(`No task found with ID: ${taskId}`, 'not_found')
  }

  if (task.status !== 'running') {
    throw new StopTaskError(
      `Task ${taskId} is not running (status: ${task.status})`,
      'not_running',
    )
  }

  const taskImpl = getTaskByType(task.type)
  if (!taskImpl) {
    throw new StopTaskError(`Unsupported task type: ${task.type}`, 'unsupported_type')
  }

  await taskImpl.kill(taskId, setAppState)

  // Bash: suppress the "exit code 137" notification (noise). Agent tasks: don't
  // suppress — the AbortError catch sends a notification carrying
  // extractPartialResult(agentMessages), which is the payload not noise.
  if (isLocalShellTask(task)) {
    // 原子置 notified=true → killTask 异步触发的 'killed' XML 通知被
    // enqueueShellNotification 的 notified 检查抑制（噪声抑制行为保留）。
    setAppState(prev => {
      const prevTask = prev.tasks[taskId]
      if (!prevTask || prevTask.notified) {
        return prev
      }
      return {
        ...prev,
        tasks: {
          ...prev.tasks,
          [taskId]: { ...prevTask, notified: true },
        },
      }
    })
    // Suppressing the XML notification also suppresses print.ts's parsed
    // task_notification SDK event — 旧仓 emitTaskTerminatedSdk 直发支裁除
    // （SDK 事件队列未迁；补发点随 SDK 波落位，头注登记）。
  }

  const command = isLocalShellTask(task) ? task.command : task.description

  return { taskId, taskType: task.type, command }
}
