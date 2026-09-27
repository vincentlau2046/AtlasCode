/**
 * messaging 域 — 队友身份解析无状态核心（E-7 S-7e d1，§8.50）。
 *
 * 旧仓来源（a8af45b）：src/utils/teammate.ts 292L 无状态核心随迁
 * （re-export teammateContext 4 函数 + TeammateContext 型 / dynamicTeamContext
 * set/clear/get / getAgentId / getAgentName / getTeamName / isTeammate /
 * getTeammateColor / isPlanModeRequired / isTeamLead / getParentSessionId）。
 *
 * 裁面登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - 尾 3 AppState 参函数（hasActiveInProcessTeammates /
 *     hasWorkingInProcessTeammates / waitForTeammatesToBecomeIdle）：
 *     S-7e d1 裁除登记（依赖旧 state/AppState tasks 面 ∉ 新仓）→
 *     C 桶 ③ shell·swarm 波 S-E2b 补差落位（R6 裁定：旧 utils/teammate.ts
 *     L195-293 逐字算法体，参数面适配新仓 task 域 TaskAppState / SetAppState
 *     + isInProcessTeammateTask 守卫收窄——旧 `as Record<string, any>` 迭代
 *     改类型化迭代，零 any；本域 engine 允许 task，零 eslint 改动）。
 *     消费面 = headless/print 退出前等待 + runner shutdown 支（S-E2d
 *     inProcessRunner），当前零活消费者 = 惰性接缝登记。
 *   - 旧 `import type { AppState } from '../state/AppState.js'` 随尾 3 裁除。
 *   - isEnvTruthy：旧 utils/envUtils → 新仓 shared（C1 统一裁定布尔 env 单一
 *     事实源，shared/env.ts:50；import 面 delta 登记）。
 *
 * 算法体逐字（dynamicTeamContext 模块态 + ALStorage 优先级链零 delta）。
 */

// Re-export in-process teammate utilities from teammateContext.ts
export {
  createTeammateContext,
  getTeammateContext,
  isInProcessTeammate,
  runWithTeammateContext,
  type TeammateContext,
} from './teammateContext'

import { isEnvTruthy } from '../../shared'
import {
  isInProcessTeammateTask,
  type InProcessTeammateTaskState,
  type SetAppState,
  type TaskAppState,
} from '../../task'
import { getTeammateContext } from './teammateContext'

/**
 * Returns the parent session ID for this teammate.
 * For in-process teammates, this is the team lead's session ID.
 * Priority: AsyncLocalStorage (in-process) > dynamicTeamContext (tmux teammates).
 */
export function getParentSessionId(): string | undefined {
  const inProcessCtx = getTeammateContext()
  if (inProcessCtx) return inProcessCtx.parentSessionId
  return dynamicTeamContext?.parentSessionId
}

/**
 * Dynamic team context for runtime team joining.
 * When set, these values take precedence over environment variables.
 */
let dynamicTeamContext: {
  agentId: string
  agentName: string
  teamName: string
  color?: string
  planModeRequired: boolean
  parentSessionId?: string
} | null = null

/**
 * Set the dynamic team context (called when joining a team at runtime)
 */
export function setDynamicTeamContext(
  context: {
    agentId: string
    agentName: string
    teamName: string
    color?: string
    planModeRequired: boolean
    parentSessionId?: string
  } | null,
): void {
  dynamicTeamContext = context
}

/**
 * Clear the dynamic team context (called when leaving a team)
 */
export function clearDynamicTeamContext(): void {
  dynamicTeamContext = null
}

/**
 * Get the current dynamic team context (for inspection/debugging)
 */
export function getDynamicTeamContext(): typeof dynamicTeamContext {
  return dynamicTeamContext
}

/**
 * Returns the agent ID if this session is running as a teammate in a swarm,
 * or undefined if running as a standalone session.
 * Priority: AsyncLocalStorage (in-process) > dynamicTeamContext (tmux via CLI args).
 */
export function getAgentId(): string | undefined {
  const inProcessCtx = getTeammateContext()
  if (inProcessCtx) return inProcessCtx.agentId
  return dynamicTeamContext?.agentId
}

/**
 * Returns the agent name if this session is running as a teammate in a swarm.
 * Priority: AsyncLocalStorage (in-process) > dynamicTeamContext (tmux via CLI args).
 */
export function getAgentName(): string | undefined {
  const inProcessCtx = getTeammateContext()
  if (inProcessCtx) return inProcessCtx.agentName
  return dynamicTeamContext?.agentName
}

/**
 * Returns the team name if this session is part of a team.
 * Priority: AsyncLocalStorage (in-process) > dynamicTeamContext (tmux via CLI args) > passed teamContext.
 * Pass teamContext from AppState to support leaders who don't have dynamicTeamContext set.
 *
 * @param teamContext - Optional team context from AppState (for leaders)
 */
export function getTeamName(teamContext?: {
  teamName: string
}): string | undefined {
  const inProcessCtx = getTeammateContext()
  if (inProcessCtx) return inProcessCtx.teamName
  if (dynamicTeamContext?.teamName) return dynamicTeamContext.teamName
  return teamContext?.teamName
}

/**
 * Returns true if this session is running as a teammate in a swarm.
 * Priority: AsyncLocalStorage (in-process) > dynamicTeamContext (tmux via CLI args).
 * For tmux teammates, requires BOTH an agent ID AND a team name.
 */
export function isTeammate(): boolean {
  // In-process teammates run within the same process
  const inProcessCtx = getTeammateContext()
  if (inProcessCtx) return true
  // Tmux teammates require both agent ID and team name
  return !!(dynamicTeamContext?.agentId && dynamicTeamContext?.teamName)
}

/**
 * Returns the teammate's assigned color,
 * or undefined if not running as a teammate or no color assigned.
 * Priority: AsyncLocalStorage (in-process) > dynamicTeamContext (tmux teammates).
 */
export function getTeammateColor(): string | undefined {
  const inProcessCtx = getTeammateContext()
  if (inProcessCtx) return inProcessCtx.color
  return dynamicTeamContext?.color
}

/**
 * Returns true if this teammate session requires plan mode before implementation.
 * When enabled, the teammate must enter plan mode and get approval before writing code.
 * Priority: AsyncLocalStorage > dynamicTeamContext > env var.
 */
export function isPlanModeRequired(): boolean {
  const inProcessCtx = getTeammateContext()
  if (inProcessCtx) return inProcessCtx.planModeRequired
  if (dynamicTeamContext !== null) {
    return dynamicTeamContext.planModeRequired
  }
  return isEnvTruthy((process.env.ATLAS_PLAN_MODE_REQUIRED))
}

/**
 * Check if this session is a team lead.
 *
 * A session is considered a team lead if:
 * 1. A team context exists with a leadAgentId, AND
 * 2. Either:
 *    - Our ATLAS_AGENT_ID matches the leadAgentId, OR
 *    - We have no ATLAS_AGENT_ID set (backwards compat: the original
 *      session that created the team before agent IDs were standardized)
 *
 * @param teamContext - The team context from AppState, if any
 * @returns true if this session is the team lead
 */
export function isTeamLead(
  teamContext:
    | {
        leadAgentId: string
      }
    | undefined,
): boolean {
  if (!teamContext?.leadAgentId) {
    return false
  }

  // Use getAgentId() for AsyncLocalStorage support (in-process teammates)
  const myAgentId = getAgentId()
  const leadAgentId = teamContext.leadAgentId

  // If my agent ID matches the lead agent ID, I'm the lead
  if (myAgentId === leadAgentId) {
    return true
  }

  // Backwards compat: if no agent ID is set and we have a team context,
  // this is the original session that created the team (the lead)
  if (!myAgentId) {
    return true
  }

  return false
}

/**
 * Checks if there are any active in-process teammates running.
 * Used by headless/print mode to determine if we should wait for teammates
 * before exiting.（S-E2b 尾 3 补差 R6；旧 L203-211 逐字，类型化迭代 delta。）
 */
export function hasActiveInProcessTeammates(appState: TaskAppState): boolean {
  // Check for running in-process teammate tasks
  for (const task of Object.values(appState.tasks)) {
    if (isInProcessTeammateTask(task) && task.status === 'running') {
      return true
    }
  }
  return false
}

/**
 * Checks if there are in-process teammates still actively working on tasks.
 * Returns true if any teammate is running but NOT idle (still processing).
 * Used to determine if we should wait before sending shutdown prompts.
 *（S-E2b 尾 3 补差 R6；旧 L218-229 逐字。）
 */
export function hasWorkingInProcessTeammates(
  appState: TaskAppState,
): boolean {
  for (const task of Object.values(appState.tasks)) {
    if (
      isInProcessTeammateTask(task) &&
      task.status === 'running' &&
      !task.isIdle
    ) {
      return true
    }
  }
  return false
}

/**
 * Returns a promise that resolves when all working in-process teammates
 * become idle. Registers callbacks on each working teammate's task — they
 * call these when idle. Returns immediately if no teammates are working.
 *（S-E2b 尾 3 补差 R6；旧 L236-293 逐字，setAppState = task 域 SetAppState。）
 */
export function waitForTeammatesToBecomeIdle(
  setAppState: SetAppState,
  appState: TaskAppState,
): Promise<void> {
  const workingTaskIds: string[] = []

  for (const [taskId, task] of Object.entries(appState.tasks)) {
    if (
      isInProcessTeammateTask(task) &&
      task.status === 'running' &&
      !task.isIdle
    ) {
      workingTaskIds.push(taskId)
    }
  }

  if (workingTaskIds.length === 0) {
    return Promise.resolve()
  }

  // Create a promise that resolves when all working teammates become idle
  return new Promise<void>(resolve => {
    let remaining = workingTaskIds.length

    const onIdle = (): void => {
      remaining--
      if (remaining === 0) {
        resolve()
      }
    }

    // Register callback on each working teammate.
    // Check current isIdle state to handle race where teammate became idle
    // between our initial snapshot and this callback registration.
    setAppState(prev => {
      const newTasks = { ...prev.tasks }
      for (const taskId of workingTaskIds) {
        const task = newTasks[taskId]
        if (task && isInProcessTeammateTask(task)) {
          // If task is already idle, call onIdle immediately
          if (task.isIdle) {
            onIdle()
          } else {
            // 类型化中间变量：fresh object literal 对 TaskStateBase 槽位触发
            // 过量属性检查（onIdleCallbacks ∉ TaskStateBase）→ 经窄型变量赋值
            const updated: InProcessTeammateTaskState = {
              ...task,
              onIdleCallbacks: [...(task.onIdleCallbacks ?? []), onIdle],
            }
            newTasks[taskId] = updated
          }
        }
      }
      return { ...prev, tasks: newTasks }
    })
  })
}
