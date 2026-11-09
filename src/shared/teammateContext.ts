/**
 * TeammateContext - Runtime context for in-process teammates
 *
 * This module provides AsyncLocalStorage-based context for in-process teammates,
 * enabling concurrent teammate execution without global state conflicts.
 *
 * 单源（0.1.93 round 8 RED-E 修形）：本模块曾是三物理副本（src/swarm /
 * src/engine/messaging / src/tui/utils，各 101/103/96L，代码体 md5 全等
 * 93f79b76、纯头注漂移）——bundle 内 swarm/inProcessRunner 写 swarm 副本
 * ALS、成员工具经 engine 门面读 engine 副本 → 身份失联（sender 恒回落
 * team-lead + shutdown ack 触发段 agentId '' 恒失配）。三副本直删二留一，
 * 唯一落点 = src/shared（engine/swarm/tui 三域共同可达，既有 import 先例：
 * engine/messaging · swarm/inProcessRunner · tui/tools 均 import shared）。
 *
 * 源 = 旧仓 a8af45b src/utils/teammateContext.ts（96L）逐字迁移（S-E2a 叶子
 * 层；纯模块，唯一依赖 node 内置 async_hooks，零跨域 import）。
 * 消费面 = swarm/inProcessRunner（RED-E 分裂写手）+ swarm/spawnInProcess +
 * swarm/backends + engine/messaging/teammate（身份 helper 优先级链第 1 站）
 * + TUI twin（tui/utils/swarm/* · tui/utils/teammate · attachments ·
 * tasks · useSwarmBanner）。re-export 门面（swarm/index · engine/messaging/
 * teammate · tui/utils/teammate）原样保留。
 *
 * Relationship with other teammate identity mechanisms:
 * - Env vars (ATLAS_AGENT_ID): Process-based teammates spawned via tmux
 * - dynamicTeamContext (teammate.ts): Process-based teammates joining at runtime
 * - TeammateContext (this file): In-process teammates via AsyncLocalStorage
 *
 * The helper functions in teammate.ts check AsyncLocalStorage first, then
 * dynamicTeamContext, then env vars.
 */

import { AsyncLocalStorage } from 'async_hooks'

/**
 * Runtime context for in-process teammates.
 * Stored in AsyncLocalStorage for concurrent access.
 */
export type TeammateContext = {
  /** Full agent ID, e.g., "researcher@my-team" */
  agentId: string
  /** Display name, e.g., "researcher" */
  agentName: string
  /** Team name this teammate belongs to */
  teamName: string
  /** UI color assigned to this teammate */
  color?: string
  /** Whether teammate must enter plan mode before implementing */
  planModeRequired: boolean
  /** Leader's session ID (for transcript correlation) */
  parentSessionId: string
  /** Discriminator - always true for in-process teammates */
  isInProcess: true
  /** Abort controller for lifecycle management (linked to parent) */
  abortController: AbortController
}

const teammateContextStorage = new AsyncLocalStorage<TeammateContext>()

/**
 * Get the current in-process teammate context, if running as one.
 * Returns undefined if not running within an in-process teammate context.
 */
export function getTeammateContext(): TeammateContext | undefined {
  return teammateContextStorage.getStore()
}

/**
 * Run a function with teammate context set.
 * Used when spawning an in-process teammate to establish its execution context.
 *
 * @param context - The teammate context to set
 * @param fn - The function to run with the context
 * @returns The return value of fn
 */
export function runWithTeammateContext<T>(
  context: TeammateContext,
  fn: () => T,
): T {
  return teammateContextStorage.run(context, fn)
}

/**
 * Check if current execution is within an in-process teammate.
 * This is faster than getTeammateContext() !== undefined for simple checks.
 */
export function isInProcessTeammate(): boolean {
  return teammateContextStorage.getStore() !== undefined
}

/**
 * Create a TeammateContext from spawn configuration.
 * The abortController is passed in by the caller. For in-process teammates,
 * this is typically an independent controller (not linked to parent) so teammates
 * continue running when the leader's query is interrupted.
 *
 * @param config - Configuration for the teammate context
 * @returns A complete TeammateContext with isInProcess: true
 */
export function createTeammateContext(config: {
  agentId: string
  agentName: string
  teamName: string
  color?: string
  planModeRequired: boolean
  parentSessionId: string
  abortController: AbortController
}): TeammateContext {
  return {
    ...config,
    isInProcess: true,
  }
}
