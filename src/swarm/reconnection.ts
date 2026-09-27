/**
 * Swarm Reconnection（team context 初始化）（C 桶 ③ shell·swarm 波 S-E2b，
 * §8.66）。
 *
 * 源 = 旧仓 a8af45b src/utils/swarm/reconnection.ts（119L）。
 * 处理 teammate 的 swarm context 初始化：
 * - Fresh spawns: 从 CLI args 初始化（main 入口经 dynamicTeamContext 置位）
 * - Resumed sessions: 从 transcript 存储的 teamName/agentName 初始化
 *
 * import 面重映射：
 *   - getDynamicTeamContext → engine 域根门面（messaging/teammate）
 *   - getTeamFilePath/readTeamFile → 域内 teamHelpers
 *   - logForDebugging/logError → shared 域门面
 *   - AppState['teamContext'] → 域内本地 TeamContextShape（登记见下）
 *
 * 裁面登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - AppState['teamContext']（旧 state/AppStateStore.ts:313-332）→ 本地
 *     TeamContextShape 逐字段镜像 + TeamMemberState 嵌套 record 值形；
 *     AppState 全量面（console/tasks/… 50+ 字段）不随迁 = TUI 波。
 *   - initializeTeammateContextFromSession 的 setAppState 参 = 最小 duck
 *     SetTeamContextState（仅 teamContext 字段）；调用端（TUI REPL / S-E2d
 *     hub）持全量 AppState setter 时经组合根窄化适配（updater 逆变，
 *     `{ ...prev, teamContext: updater(prev).teamContext }` 包装），接线点
 *     = TUI 波/S-E2d 登记。
 */
import {
  logError,
  logForDebugging,
} from '../shared'
import { getDynamicTeamContext } from '../engine'
import { getTeamFilePath, readTeamFile } from './teamHelpers'

/** 旧 teamContext.teammates record 值形（AppStateStore.ts:323-331 逐字段）。 */
export type TeamMemberState = {
  name: string
  agentType?: string
  color?: string
  tmuxSessionName: string
  tmuxPaneId: string
  cwd: string
  worktreePath?: string
  spawnedAt: number
}

/** 旧 AppState['teamContext'] 本地镜像（AppStateStore.ts:313-332 逐字段）。 */
export type TeamContextShape = {
  teamName: string
  teamFilePath: string
  leadAgentId: string
  // Self-identity for swarm members (separate processes in tmux panes)
  // Note: This is different from toolUseContext.agentId which is for in-process subagents
  selfAgentId?: string // Swarm member's own ID (same as leadAgentId for leaders)
  selfAgentName?: string // Swarm member's name ('team-lead' for leaders)
  isLeader?: boolean // True if this swarm member is the team leader
  selfAgentColor?: string // Assigned color for UI (used by dynamically joined sessions)
  teammates: Record<string, TeamMemberState>
}

/** 最小 AppState 窄面（仅 teamContext 字段；全量面 = TUI 波）。 */
export type TeamContextState = {
  teamContext?: TeamContextShape
}

export type SetTeamContextState = (
  updater: (prev: TeamContextState) => TeamContextState,
) => void

/**
 * Computes the initial teamContext for AppState.
 *
 * This is called synchronously in main to compute the teamContext
 * BEFORE the first render, eliminating the need for useEffect workarounds.
 *
 * @returns The teamContext object to include in initialState, or undefined if not a teammate
 */
export function computeInitialTeamContext(): TeamContextShape | undefined {
  // dynamicTeamContext is set in the main entry from CLI args
  const context = getDynamicTeamContext()

  if (!context?.teamName || !context?.agentName) {
    logForDebugging(
      '[Reconnection] computeInitialTeamContext: No teammate context set (not a teammate)',
    )
    return undefined
  }

  const { teamName, agentId, agentName } = context

  // Read team file to get lead agent ID
  const teamFile = readTeamFile(teamName)
  if (!teamFile) {
    logError(
      new Error(
        `[computeInitialTeamContext] Could not read team file for ${teamName}`,
      ),
    )
    return undefined
  }

  const teamFilePath = getTeamFilePath(teamName)

  const isLeader = !agentId

  logForDebugging(
    `[Reconnection] Computed initial team context for ${isLeader ? 'leader' : `teammate ${agentName}`} in team ${teamName}`,
  )

  return {
    teamName,
    teamFilePath,
    leadAgentId: teamFile.leadAgentId,
    selfAgentId: agentId,
    selfAgentName: agentName,
    isLeader,
    teammates: {},
  }
}

/**
 * Initialize teammate context from a resumed session.
 *
 * This is called when resuming a session that has teamName/agentName stored
 * in the transcript. It sets up teamContext in AppState so that heartbeat
 * and other swarm features work correctly.
 */
export function initializeTeammateContextFromSession(
  setAppState: SetTeamContextState,
  teamName: string,
  agentName: string,
): void {
  // Read team file to get lead agent ID
  const teamFile = readTeamFile(teamName)
  if (!teamFile) {
    logError(
      new Error(
        `[initializeTeammateContextFromSession] Could not read team file for ${teamName} (agent: ${agentName})`,
      ),
    )
    return
  }

  // Find the member in the team file to get their agentId
  const member = teamFile.members.find(m => m.name === agentName)
  if (!member) {
    logForDebugging(
      `[Reconnection] Member ${agentName} not found in team ${teamName} - may have been removed`,
    )
  }
  const agentId = member?.agentId

  const teamFilePath = getTeamFilePath(teamName)

  // Set teamContext in AppState
  setAppState(prev => ({
    ...prev,
    teamContext: {
      teamName,
      teamFilePath,
      leadAgentId: teamFile.leadAgentId,
      selfAgentId: agentId,
      selfAgentName: agentName,
      isLeader: false,
      teammates: {},
    },
  }))

  logForDebugging(
    `[Reconnection] Initialized agent context from session for ${agentName} in team ${teamName}`,
  )
}
