import { z } from 'zod/v4'
import type { Tool } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'
import { lazySchema } from '../../../kernel/utils/lazySchema.js'
import { jsonStringify } from '../../../kernel/utils/slowOperations'
import { TEAM_LEAD_NAME } from '../../../kernel/utils/swarm/constants.js'
import {
  cleanupTeamDirectories,
  readTeamFile,
  unregisterTeamForSessionCleanup,
} from '../../utils/swarm/teamHelpers.js'
import { clearTeammateColors } from '../../utils/swarm/teammateLayoutManager.js'
import { clearLeaderTeamName } from '../../../kernel/utils/tasks.js'
import { TEAM_DELETE_TOOL_NAME } from '../../../kernel/tools/TeamDeleteTool/constants.js'
// 0.1.100 W-D-B-1（段 D 批复形 @bbe99518）：durable 支 halfAttached 判据
//（D-③；双副本同步纪律 = engine 车道 teamDeleteTool.ts 同形支）。
import { resolveTeamPersistenceMode } from 'src/engine'
import {
  errorMessage,
  getLeadInstanceId,
  readTeamFileV2,
} from 'src/shared'
import { getPrompt } from './prompt.js'
import { renderToolResultMessage, renderToolUseMessage } from './UI.js'

const inputSchema = lazySchema(() => z.strictObject({}))
type InputSchema = ReturnType<typeof inputSchema>

export type Output = {
  success: boolean
  message: string
  team_name?: string
  // 0.1.100 W-D-B-1 加性：durable 支 halfAttached fail-visible 提示面
  //（D-③ 禁静默；engine 车道 TeamDeleteOutput 同形）。
  half_attached_warning?: string
}

export type Input = z.infer<InputSchema>

export const TeamDeleteTool: Tool<InputSchema, Output> = buildTool({
  name: TEAM_DELETE_TOOL_NAME,
  searchHint: 'disband a swarm team and clean up',
  maxResultSizeChars: 100_000,
  shouldDefer: true,

  userFacingName() {
    return ''
  },

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  isEnabled() {
    return isAgentSwarmsEnabled()
  },

  async description() {
    return 'Clean up team and task directories when the swarm is complete'
  },

  async prompt() {
    return getPrompt()
  },

  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: [
        {
          type: 'text' as const,
          text: jsonStringify(data),
        },
      ],
    }
  },

  async call(_input, context) {
    const { setAppState, getAppState } = context
    const appState = getAppState()
    const teamName = appState.teamContext?.teamName
    // S3 判据①：组态 teammates 面显式收窄（tool context getAppState 宽型；
    // halfAttached = relink 回填内存态标记，AppStateStore 同形镜像）。
    const teammates = (appState.teamContext?.teammates ?? {}) as Record<
      string,
      { name: string; halfAttached?: boolean }
    >

    // 0.1.100 W-D-B-1 durable 支（D-③）输出面载体（if 块外声明 = 成功
    // 返回面 spread 可达；engine 车道同形）。
    let half_attached_warning: string | undefined
    if (teamName) {
      // 0.1.100 W-D-B-1 durable 支（D-③）：halfAttached 判据前置（与
      // engine 车道 teamDeleteTool.ts 同形；禁静默 = 名单进输出面）。
      let skipFileGuard = false
      // S3 判据①（relink 回填面；engine 车道同形）：组态 halfAttached 标记
      // 名单先取（文件面名单并集用）。
      const halfAttachedCtxNames = Object.entries(teammates)
        .filter(
          ([, member]) =>
            member.name !== TEAM_LEAD_NAME && member.halfAttached === true,
        )
        .map(([, member]) => member.name)
      if (resolveTeamPersistenceMode() === 'durable') {
        let v2File: Awaited<ReturnType<typeof readTeamFileV2>>
        try {
          v2File = await readTeamFileV2(teamName)
        } catch (e) {
          return {
            data: {
              success: false,
              message:
                `Cannot cleanup team "${teamName}": durable team file ` +
                `rejected (${errorMessage(e)}). Resolve the file manually ` +
                `(delete the team directory) and retry.`,
              team_name: teamName,
            },
          }
        }
        if (v2File && v2File.leadInstanceId !== getLeadInstanceId()) {
          const halfNames = [
            ...new Set([
              ...v2File.members
                .filter(m => m.name !== TEAM_LEAD_NAME)
                .map(m => m.name),
              ...halfAttachedCtxNames,
            ]),
          ]
          skipFileGuard = true
          half_attached_warning =
            `Durable team file was written by a previous lead instance ` +
            `(leadInstanceId mismatch) — ${halfNames.length} member(s) ` +
            `half-attached: ${halfNames.join(', ') || '(none)'}. Their ` +
            `processes may still be running; they were NOT treated as ` +
            `active blockers, and the team directories will be removed.` +
            (halfNames.length > 0
              ? ' Verify orphan processes (tmux/ps) if needed.'
              : '')
        }
      }

      // Read team config to check for active members
      const teamFile = skipFileGuard ? null : readTeamFile(teamName)
      if (teamFile) {
        // Filter out the team lead - only count non-lead members
        const nonLeadMembers = teamFile.members.filter(
          m => m.name !== TEAM_LEAD_NAME,
        )

        // 0.1.100 S3 D-③ 判据①：relink 回填的 halfAttached 内存标记条目跳过
        // 活判（不当活着；engine 车道同形）+ 名单已并入 half_attached_warning。
        // Separate truly active members from idle/dead ones
        // Members with isActive === false are idle (finished their turn or crashed)
        const halfAttachedNames = new Set(
          Object.entries(teammates)
            .filter(
              ([, member]) =>
                member.name !== TEAM_LEAD_NAME &&
                member.halfAttached === true,
            )
            .map(([, member]) => member.name),
        )
        const activeMembers = nonLeadMembers.filter(
          m => m.isActive !== false && !halfAttachedNames.has(m.name),
        )

        if (activeMembers.length > 0) {
          const memberNames = activeMembers.map(m => m.name).join(', ')
          return {
            data: {
              success: false,
              message: `Cannot cleanup team with ${activeMembers.length} active member(s): ${memberNames}. Send each active member a shutdown request via SendMessage first (message: {"type":"shutdown_request","request_id":"<id>","reason":"<why>"}), and wait for their shutdown approval and exit before retrying TeamDelete.`,
              team_name: teamName,
            },
          }
        }
      }

      await cleanupTeamDirectories(teamName)
      // Already cleaned — don't try again on gracefulShutdown.
      unregisterTeamForSessionCleanup(teamName)

      // Clear color assignments so new teams start fresh
      clearTeammateColors()

      // Clear leader team name so getTaskListId() falls back to session ID
      clearLeaderTeamName()

    }

    // Clear team context and inbox from app state
    setAppState(prev => ({
      ...prev,
      teamContext: undefined,
      inbox: {
        messages: [], // Clear any queued messages
      },
    }))

    return {
      data: {
        success: true,
        message: teamName
          ? `Cleaned up directories and worktrees for team "${teamName}"`
          : 'No team name found, nothing to clean up',
        team_name: teamName,
        ...(half_attached_warning ? { half_attached_warning } : {}),
      },
    }
  },

  renderToolUseMessage,
  renderToolResultMessage,
} satisfies ToolDef<InputSchema, Output>)
