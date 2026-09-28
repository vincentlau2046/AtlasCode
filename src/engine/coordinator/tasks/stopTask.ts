/**
 * stopTask — 停止运行中任务的共享逻辑（旧仓 src/tasks/stopTask.ts 100L
 * 逐字随迁，S-7a）
 *
 * 旧仓消费者：TaskStopTool（LLM 调用）+ SDK stop_task 控制请求。新仓
 * TaskStopTool 工具本体 / SDK 控制面待组合根接线，本面先落状态机核心。
 *
 * 裁剪登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - isLocalShellTask 抑制支的 emitTaskTerminatedSdk 已落（analytics 波
 *     §8.69）：抑制 XML 通知同时抑制 print.ts 解析出的 task_notification
 *     SDK 事件，故经 suppress 旗标（setAppState 回调内置位 + 下一行同步读）
 *     直发 SDK 事件让消费者看到任务关闭。
 *     ⚠ [§8.69 S-E3 A路 MAJOR-1 前向接缝] flag-capture 模式假设 setAppState
 *     同步 apply（updater 内 `suppressed = true` 于紧随行可见）：旧仓
 *     state/AppStateStore 同步直 apply → 成立。新仓 B13 state 域 = 异步串行
 *     （atlascode/state EngineState.set 微任务边界，f 延迟一个 microtask 才
 *     跑）→ 若任务域 setAppState 接 B13 AppState，`suppressed` 紧随行仍
 *     false，'stopped' bookend 静默丢失。接线波（TaskStopTool 组合根 /
 *     或任务域专用同步 store）须裁定：同步 store 或重构 flag 捕获（预读
 *     getAppState 条件 / 无条件 emit + 双发守卫另置）。详见 §8.69.2。
 *   - AppState → task 域 TaskAppState（残余 ①）。
 */
import type { SetAppState, TaskAppState, TaskStateBase } from '../../../task'
import { isLocalShellTask } from './guards'
import { getTaskByType } from './registry'
import { emitTaskTerminatedSdk } from './sdkEventQueue'

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
    let suppressed = false
    // 原子置 notified=true → killTask 异步触发的 'killed' XML 通知被
    // enqueueShellNotification 的 notified 检查抑制（噪声抑制行为保留）。
    setAppState(prev => {
      const prevTask = prev.tasks[taskId]
      if (!prevTask || prevTask.notified) {
        return prev
      }
      suppressed = true
      return {
        ...prev,
        tasks: {
          ...prev.tasks,
          [taskId]: { ...prevTask, notified: true },
        },
      }
    })
    // Suppressing the XML notification also suppresses print.ts's parsed
    // task_notification SDK event — emit it directly so SDK consumers see
    // the task close.
    if (suppressed) {
      emitTaskTerminatedSdk(taskId, 'stopped', {
        toolUseId: task.toolUseId,
        summary: task.description,
      })
    }
  }

  const command = isLocalShellTask(task) ? task.command : task.description

  return { taskId, taskType: task.type, command }
}
