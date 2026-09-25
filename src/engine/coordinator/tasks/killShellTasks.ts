/**
 * LocalShellTask 纯 kill 助手（旧仓 src/tasks/LocalShellTask/killShellTasks.ts
 * 76L 随迁，S-7a）
 *
 * 裁剪登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - 【S-E3 A13 核销（§8.52）】killShellTasksForAgent 尾部
 *     `dequeueAllMatching(cmd => cmd.agentId === agentId)` 已恢复（S-7a 裁出
 *     因队列面未落；S-7e d2 messaging 波 queueManager 落地后本波对照真队列
 *     复核谓词面：dequeueAllMatching 谓词签名 + QueuedCommand.agentId
 *     （queueTypes.ts:133 旧仓逐字「Undefined = main thread」）+ messaging 域
 *     零 coordinator import 零环）。enqueue 侧 agentId 接线 = shell/swarm 波
 *     前向接缝（S-E2 MINOR-1 同源裁定：本波 drain 侧预接线，当前零 producer
 *     谓词 = 惰性接缝非 stub）。
 *   - logError → logForDebugging（shared/debug 无 logError，域内日志统一
 *     debug 口）。
 *   - 旧仓分离理由（runAgent.ts kill agent-scoped bash 不拖 React）在新仓无
 *     .tsx 面 → 文件保留仅为域内分层（localShellTask 消费 killTask）。
 */
import { errorMessage, logForDebugging } from '../../../shared'
import { dequeueAllMatching } from '../../messaging'
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
  // Purge any queued notifications addressed to this agent — its query loop
  // has exited and won't drain them. killTask fires 'killed' notifications
  // asynchronously; drop the ones already queued and any that land later sit
  // harmlessly (no consumer matches a dead agentId).（旧仓逐字；S-E3 A13
  // 恢复——队列面 S-7e d2 已落，谓词面核销见头注。）
  dequeueAllMatching(cmd => cmd.agentId === agentId)
}
