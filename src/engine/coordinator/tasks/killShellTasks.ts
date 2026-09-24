/**
 * LocalShellTask 纯 kill 助手（旧仓 src/tasks/LocalShellTask/killShellTasks.ts
 * 76L 随迁，S-7a）
 *
 * 裁剪登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - killShellTasksForAgent 尾部 dequeueAllMatching(cmd => cmd.agentId ===
 *     agentId) 裁出：消息队列（messageQueueManager）归 S-7e messaging 波，
 *     本层保留 kill 循环本体；「已入队通知随 agent 退出无消费者、无害滞留」
 *     语义随队列面落时复核。
 *   - logError → logForDebugging（shared/debug 无 logError，域内日志统一
 *     debug 口）。
 *   - 旧仓分离理由（runAgent.ts kill agent-scoped bash 不拖 React）在新仓无
 *     .tsx 面 → 文件保留仅为域内分层（localShellTask 消费 killTask）。
 */
import { errorMessage, logForDebugging } from '../../../shared'
import { evictTaskOutput, type SetAppState, type TaskAppState } from '../../../task'
import { isLocalShellTask, type LocalShellTaskState } from './guards'
import { updateTaskState } from './framework'

export function killTask(taskId: string, setAppState: SetAppState): void {
  updateTaskState<LocalShellTaskState>(taskId, setAppState, task => {
    // 泛型 T 被擦除后运行态入参可能是任意任务态（updateTaskState 内部 cast）
    // → isLocalShellTask 运行时 guard 保留旧仓 any 支语义。
    if (task.status !== 'running' || !isLocalShellTask(task)) {
      return task
    }

    try {
      logForDebugging(`LocalShellTask ${taskId} kill requested`)
      task.shellCommand?.kill()
      task.shellCommand?.cleanup()
    } catch (error) {
      logForDebugging(`LocalShellTask ${taskId} kill failed: ${errorMessage(error)}`)
    }

    task.unregisterCleanup?.()
    if (task.cleanupTimeoutId) {
      clearTimeout(task.cleanupTimeoutId)
    }

    return {
      ...task,
      status: 'killed',
      notified: true,
      shellCommand: null,
      unregisterCleanup: undefined,
      cleanupTimeoutId: undefined,
      endTime: Date.now(),
    }
  })
  void evictTaskOutput(taskId)
}

/**
 * Kill all running bash tasks spawned by a given agent.
 * Called from runAgent.ts finally block so background processes don't outlive
 * the agent that started them (prevents 10-day fake-logs.sh zombies).
 */
export function killShellTasksForAgent(
  agentId: string,
  getAppState: () => TaskAppState,
  setAppState: SetAppState,
): void {
  const tasks = getAppState().tasks ?? {}
  for (const [taskId, task] of Object.entries(tasks)) {
    if (
      isLocalShellTask(task) &&
      task.agentId === agentId &&
      task.status === 'running'
    ) {
      logForDebugging(
        `killShellTasksForAgent: killing orphaned shell task ${taskId} (agent ${agentId} exiting)`,
      )
      killTask(taskId, setAppState)
    }
  }
  // 已入队通知的清理（dequeueAllMatching）随 S-7e messaging 波消息队列落位
  // （头注登记）——killTask 异步触发的 'killed' 通知对已退出的 agentId 无
  // 匹配消费者，队列面落时复核滞留语义。
}
