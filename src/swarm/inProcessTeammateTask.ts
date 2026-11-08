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
  type TeammateMessageEntry,
  isInProcessTeammateTask,
  appendCappedMessage,
} from '../task'
import { logForDebugging } from '../shared'
import {
  createShutdownRequestMessage,
  createUserMessage,
  jsonStringify,
  updateTaskState,
  writeToMailbox,
} from '../engine'
import { killInProcessTeammate } from './spawnInProcess'
import { TEAM_LEAD_NAME } from './constants'

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
  // S-E2d：参面随存面（task.messages = TeammateMessageEntry 两生产端
  // 并集 = TUI 端 shared Message 全形 + S-E2d 端 InDomainUserMessage 窄形，
  // task/inProcessTeammate.ts 头注）；engine createUserMessage 产物直接
  // 可赋值，调用点零 cast
  message: TeammateMessageEntry,
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

/**
 * 0.1.93 W-D-A f4 gate 打回修复②（2026-11-08 裁定）+ RED #3 升级阶梯改形
 *（2026-11-08 f4 打回单）：旧 15s 超时「放弃不 kill 不抛」= fail-open——
 * 超时放弃即孤儿豁免，⑤ hard 判据「无孤儿循环」下不可豁免，该设计面废除。
 *
 * 对全部 running 的 in-process teammate 四段升级阶梯（F3 graceful 语义优先，
 * 超时后 hard 收尾 = F3 态机 stopped/evicted 语义，不冲突）：
 *   stage1 graceful request——mailbox shutdown request + shutdownRequested
 *     标志（镜像 InProcessBackend.terminate，from = TEAM_LEAD_NAME，不发 kill）
 *   stage2 bounded wait——有界轮询等成员走 graceful 退出（runner 轮末
 *     completed 收尾）；超时 = 进入下一级，不再是放弃返回
 *   stage3 forced abort——对仍 running 且持有 abortController 的成员
 *     abort()（F3 外部终止语义；runner 'aborted' 支 → 循环退出 → completed
 *     收尾），再给有界等待窗
 *   stage4 hard kill——仍 running → killInProcessTeammate（status killed +
 *     abort + cleanup 注销，F3 evicted 语义）：成员状态必达终态，⑤
 *     「无孤儿循环」fail-closed 收口
 *
 * 返回计数语义：requested = 发 shutdown request 数；drained = graceful /
 * forced-abort 后观测到终态的成员数（hard-terminated 不计入）；forced =
 * stage3 abort 数；hardTerminated = stage4 hard kill 成功数。
 *
 * 消费点 = print.ts headless 尾部（drainPendingBackgroundAgents 之后、
 * SessionEnd hooks 之前；错误退出支同接线——⑤ 残留覆盖全部 headless 退出
 * 路径）；零 running teammate 零开销直返。appState 访问经 SessionContextPort
 * 注入（组合根 compose.ts setSessionContextPort 接线；swarm 域不直依赖
 * engine port——依赖方向边界）。
 */
export const TEAMMATE_GRACEFUL_SHUTDOWN_TIMEOUT_MS = 15_000
export const TEAMMATE_FORCED_SHUTDOWN_TIMEOUT_MS = 5_000
const TEAMMATE_GRACEFUL_SHUTDOWN_POLL_MS = 250

export type InProcessTeammateDrainResult = {
  requested: number
  drained: number
  forced: number
  hardTerminated: number
}

export async function gracefulShutdownInProcessTeammates(deps: {
  getAppState: () => { tasks?: Record<string, TaskStateBase> }
  setAppState: SetAppState
  timeoutMs?: number
  forcedTimeoutMs?: number
}): Promise<InProcessTeammateDrainResult> {
  const running = getAllInProcessTeammateTasks(
    deps.getAppState().tasks ?? {},
  ).filter(t => t.status === 'running')
  if (running.length === 0) {
    return { requested: 0, drained: 0, forced: 0, hardTerminated: 0 }
  }
  const toRequest = running.filter(t => !t.shutdownRequested)
  const requestIdBase = Date.now()
  for (const teammate of toRequest) {
    const shutdownRequest = createShutdownRequestMessage({
      requestId: `shutdown-${teammate.identity.agentId}-session-end-${requestIdBase}`,
      from: TEAM_LEAD_NAME,
      reason: 'session end (headless terminal state)',
    })
    await writeToMailbox(
      teammate.identity.agentName,
      {
        from: TEAM_LEAD_NAME,
        text: jsonStringify(shutdownRequest),
        timestamp: new Date().toISOString(),
      },
      teammate.identity.teamName,
    )
    requestTeammateShutdown(teammate.id, deps.setAppState)
  }

  const freshTasks = () =>
    getAllInProcessTeammateTasks(deps.getAppState().tasks ?? {})
  const countStillRunning = () =>
    freshTasks().filter(
      t => t.status === 'running' && running.some(prev => prev.id === t.id),
    ).length
  const waitForDrain = async (timeoutMs: number): Promise<void> => {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      if (countStillRunning() === 0 || Date.now() >= deadline) return
      await new Promise(resolve =>
        setTimeout(resolve, TEAMMATE_GRACEFUL_SHUTDOWN_POLL_MS),
      )
    }
  }

  // stage2: bounded graceful wait（超时 = 升级，不再放弃返回）
  await waitForDrain(deps.timeoutMs ?? TEAMMATE_GRACEFUL_SHUTDOWN_TIMEOUT_MS)
  let drained = running.length - countStillRunning()
  if (drained === running.length) {
    return { requested: toRequest.length, drained, forced: 0, hardTerminated: 0 }
  }

  // stage3: forced abort（F3 外部终止语义——runner 'aborted' 支退出循环）
  let forced = 0
  for (const prev of running) {
    const now = freshTasks().find(t => t.id === prev.id)
    if (now?.status === 'running' && now.abortController) {
      now.abortController.abort()
      forced++
    }
  }
  if (forced > 0) {
    await waitForDrain(
      deps.forcedTimeoutMs ?? TEAMMATE_FORCED_SHUTDOWN_TIMEOUT_MS,
    )
    drained = running.length - countStillRunning()
    if (drained === running.length) {
      return { requested: toRequest.length, drained, forced, hardTerminated: 0 }
    }
  }

  // stage4: hard kill（F3 evicted 语义——状态必达终态，fail-closed 收口）
  let hardTerminated = 0
  for (const prev of running) {
    const now = freshTasks().find(t => t.id === prev.id)
    if (
      now?.status === 'running' &&
      killInProcessTeammate(now.id, deps.setAppState)
    ) {
      hardTerminated++
    }
  }
  return { requested: toRequest.length, drained, forced, hardTerminated }
}
