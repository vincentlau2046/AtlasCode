/**
 * InProcessTeammateTask - 管理 in-process teammate 生命周期（C 桶 ③
 * shell·swarm 波 S-E2b，§8.66）。
 *
 * 源 = 旧仓 a8af45b src/tasks/InProcessTeammateTask/InProcessTeammateTask.tsx
 *（125L 真码段；旧 .tsx 零 JSX——Task 对象 + 6 框架函数纯逻辑，.tsx 外壳
 * 系 React 编译产物残留 → 本文件 .ts 逐字迁移）。
 *
 * 与 LocalAgentTask（后台 agent）不同，in-process teammate：
 * 1. 同 Node.js 进程运行，AsyncLocalStorage 隔离
 * 2. 团队感知身份（agentName@teamName）
 * 3. 支持 plan mode 审批流
 * 4. 可 idle（待活）或 active（处理中）
 *
 * import 面重映射：
 *   - isTerminalTaskStatus/SetAppState/Task/TaskStateBase → task 域门面
 *     （旧 Task.js 同族面）
 *   - InProcessTeammateTaskState/isInProcessTeammateTask/appendCappedMessage
 *     → task 域门面（task/inProcessTeammate 4 消费端反推真形，本波落）
 *   - updateTaskState → engine 域根门面（coordinator tasks 框架）
 *   - createUserMessage → engine 域根门面（S-E2b 扩 root 登记见 engine/index.ts）
 *   - killInProcessTeammate → 域内 spawnInProcess
 * Delta ① 旧 findTeammateTaskByAgentId 的 `(task as any).identity` 强转随
 * isInProcessTeammateTask 守卫收窄删除（零 any）。
 */
import {
  isTerminalTaskStatus,
  type SetAppState,
  type Task,
  type TaskStateBase,
} from '../task'
import {
  type InProcessTeammateTaskState,
  isInProcessTeammateTask,
  appendCappedMessage,
} from '../task'
import type { Message } from '../shared'
import { logForDebugging } from '../shared'
import { createUserMessage, updateTaskState } from '../engine'
import { killInProcessTeammate } from './spawnInProcess'

/**
 * InProcessTeammateTask - Handles in-process teammate execution.
 */
export const InProcessTeammateTask: Task = {
  name: 'InProcessTeammateTask',
  type: 'in_process_teammate',
  async kill(taskId, setAppState) {
    killInProcessTeammate(taskId, setAppState)
  },
}

/**
 * Request shutdown for a teammate.
 */
export function requestTeammateShutdown(
  taskId: string,
  setAppState: SetAppState,
): void {
  updateTaskState<InProcessTeammateTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running' || task.shutdownRequested) {
      return task
    }
    return {
      ...task,
      shutdownRequested: true,
    }
  })
}

/**
 * Append a message to a teammate's conversation history.
 * Used for zoomed view to show the teammate's conversation.
 */
export function appendTeammateMessage(
  taskId: string,
  message: Message,
  setAppState: SetAppState,
): void {
  updateTaskState<InProcessTeammateTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') {
      return task
    }
    return {
      ...task,
      messages: appendCappedMessage(task.messages, message),
    }
  })
}

/**
 * Inject a user message to a teammate's pending queue.
 * Used when viewing a teammate's transcript to send typed messages to them.
 * Also adds the message to task.messages so it appears immediately in the transcript.
 */
export function injectUserMessageToTeammate(
  taskId: string,
  message: string,
  setAppState: SetAppState,
): void {
  updateTaskState<InProcessTeammateTaskState>(taskId, setAppState, task => {
    // Allow message injection when teammate is running or idle (waiting for input)
    // Only reject if teammate is in a terminal state
    if (isTerminalTaskStatus(task.status)) {
      logForDebugging(
        `Dropping message for teammate task ${taskId}: task status is "${task.status}"`,
      )
      return task
    }
    return {
      ...task,
      pendingUserMessages: [...task.pendingUserMessages, message],
      messages: appendCappedMessage(
        task.messages,
        createUserMessage({ content: message }),
      ),
    }
  })
}

/**
 * Get teammate task by agent ID from AppState.
 * Prefers running tasks over killed/completed ones in case multiple tasks
 * with the same agentId exist.
 * Returns undefined if not found.
 */
export function findTeammateTaskByAgentId(
  agentId: string,
  tasks: Record<string, TaskStateBase>,
): InProcessTeammateTaskState | undefined {
  let fallback: InProcessTeammateTaskState | undefined
  for (const task of Object.values(tasks)) {
    if (isInProcessTeammateTask(task) && task.identity.agentId === agentId) {
      // Prefer running tasks in case old killed tasks still exist in AppState
      // alongside new running ones with the same agentId
      if (task.status === 'running') {
        return task
      }
      // Keep first match as fallback in case no running task exists
      if (!fallback) {
        fallback = task
      }
    }
  }
  return fallback
}

/**
 * Get all in-process teammate tasks from AppState.
 */
export function getAllInProcessTeammateTasks(
  tasks: Record<string, TaskStateBase>,
): InProcessTeammateTaskState[] {
  return Object.values(tasks).filter(isInProcessTeammateTask)
}

/**
 * Get running in-process teammates sorted alphabetically by agentName.
 * Shared between TeammateSpinnerTree display, PromptInput footer selector,
 * and useBackgroundTaskNavigation — selectedIPAgentIndex maps into this
 * array, so all three must agree on sort order.（消费面 = TUI 波；
 * 本波零活消费者 = 惰性接缝登记。）
 */
export function getRunningTeammatesSorted(
  tasks: Record<string, TaskStateBase>,
): InProcessTeammateTaskState[] {
  return getAllInProcessTeammateTasks(tasks)
    .filter(t => t.status === 'running')
    .sort((a, b) => a.identity.agentName.localeCompare(b.identity.agentName))
}
