/**
 * messaging 域 — 队友身份解析无状态核心（E-7 S-7e d1，§8.50）。
 *
 * 旧仓来源（a8af45b）：src/utils/teammate.ts 292L 无状态核心随迁
 * （re-export teammateContext 4 函数 + TeammateContext 型 / dynamicTeamContext
 * set/clear/get / getAgentId / getAgentName / getTeamName / isTeammate /
 * getTeammateColor / isPlanModeRequired / isTeamLead / getParentSessionId）。
 *
 * 裁面登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - 尾 3 AppState 参函数裁除：hasActiveInProcessTeammates /
 *     hasWorkingInProcessTeammates / waitForTeammatesToBecomeIdle（in-process
 *     执行层状态读，依赖旧 state/AppState tasks 面 ∉ 新仓）→ 登记 shell/swarm
 *     波自持；执行时若引擎消费面浮现，重裁 duck 化（§8.50 范围裁定）。
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
