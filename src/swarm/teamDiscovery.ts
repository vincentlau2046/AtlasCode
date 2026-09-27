/**
 * Team Discovery - Utilities for discovering teams and teammate status
 *（C 桶 ③ shell·swarm 波 S-E2b，§8.66）。
 *
 * 源 = 旧仓 a8af45b src/utils/teamDiscovery.ts（81L 逐字）。
 * import 面重映射：isPaneBackend/PaneBackendType → 域内 backends/types
 *（R3 重建面）/ readTeamFile → 域内 teamHelpers。
 * Delta ① 字面量 'team-lead' → constants.TEAM_LEAD_NAME（同值 8 处单一事实源，
 * 旧字面量为 TUI 面未引入常量的历史残留）。
 * 消费面 = Teams UI footer（TUI 波）；本波零活消费者 = 惰性接缝登记。
 */

import { isPaneBackend, type PaneBackendType } from './backends/types'
import { readTeamFile } from './teamHelpers'
import { TEAM_LEAD_NAME } from './constants'

export type TeamSummary = {
  name: string
  memberCount: number
  runningCount: number
  idleCount: number
}

export type TeammateStatus = {
  name: string
  agentId: string
  agentType?: string
  model?: string
  prompt?: string
  status: 'running' | 'idle' | 'unknown'
  color?: string
  idleSince?: string // ISO timestamp from idle notification
  tmuxPaneId: string
  cwd: string
  worktreePath?: string
  isHidden?: boolean // Whether the pane is currently hidden from the swarm view
  backendType?: PaneBackendType // The backend type used for this teammate
  mode?: string // Current permission mode for this teammate
}

/**
 * Get detailed teammate statuses for a team
 * Reads isActive from config to determine status
 */
export function getTeammateStatuses(teamName: string): TeammateStatus[] {
  const teamFile = readTeamFile(teamName)
  if (!teamFile) {
    return []
  }

  const hiddenPaneIds = new Set(teamFile.hiddenPaneIds ?? [])
  const statuses: TeammateStatus[] = []

  for (const member of teamFile.members) {
    // Exclude team-lead from the list
    if (member.name === TEAM_LEAD_NAME) {
      continue
    }

    // Read isActive from config, defaulting to true (active) if undefined
    const isActive = member.isActive !== false
    const status: 'running' | 'idle' = isActive ? 'running' : 'idle'

    statuses.push({
      name: member.name,
      agentId: member.agentId,
      agentType: member.agentType,
      model: member.model,
      prompt: member.prompt,
      status,
      color: member.color,
      tmuxPaneId: member.tmuxPaneId,
      cwd: member.cwd,
      worktreePath: member.worktreePath,
      isHidden: hiddenPaneIds.has(member.tmuxPaneId),
      backendType:
        member.backendType && isPaneBackend(member.backendType)
          ? member.backendType
          : undefined,
      mode: member.mode,
    })
  }

  return statuses
}

// Note: For time formatting, use formatRelativeTimeAgo from '../utils/format.js'
//（format 面 = TUI 波，登记）
