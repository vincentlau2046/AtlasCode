/**
 * engine/tools/team — TeamCreateTool 本体（C 桶 ③ shell·swarm 波 S-E2d；
 * §8.66 补差侧）。
 *
 * 旧仓来源（a8af45b）：src/tools/TeamCreateTool/TeamCreateTool.ts 229L +
 * prompt 113L + constants 1L 裁剪随迁（buildTool 成员面 → 新 shared Tool
 * 契约对象化，config/askUser/sendMessage face 先例）。
 *
 * 门控槽（49 口径 ⑮ agentSwarms materialize，§8.66.1.4）：自门控
 * isEnabled = isAgentSwarmsEnabled（messaging 域既存，⑯ TodoWrite 模式同型）；
 * 组合根 deps.baseTools 注入（注册表机制不变）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 lazySchema z.strictObject 3 字段 → 新纯 JSON schema（strict +
 *    additionalProperties false 双字段，configTool L113 先例）；Input/Output
 *    型 = z.infer 转写。
 *  ② 旧 call context getAppState/setAppState（appState.teamContext 读 +
 *    写 + inbox 清面）→ TeamServices 注入接缝（engine↛swarm L3 隔离；
 *    team 文件 9 面组合根绑 swarm 门面真实现；team 上下文态 = 接缝内存
 *    缺省 store，AppState 全量面归 TUI 波；见 teamServices.ts 头注）。
 *  ③ 主模型车道：旧 parseUserSpecifiedModel(appState.mainLoopModelForSession
 *    ?? mainLoopModel ?? getDefaultMainLoopModel()) 3 面新仓 0-hit
 *   （utils/model 车道未迁）→ getRoleModel('premium') = 主模型车道
 *    （modelprovider 门面单一事实源；leadModel 缺面 = undefined 逐字
 *    旧缺省语义）。
 *  ④ 旧 def 缺成员 buildTool 缺省值 → 新契约必选成员显化（缺省值逐字）：
 *    isReadOnly = false（团队文件 + task list 磁盘写面）/ isDestructive =
 *    false / isConcurrencySafe = false（buildTool L787 缺省，team file
 *    串行写面）/ userFacingName = ''（旧 def 逐字）/ checkPermissions =
 *    { behavior: 'allow', updatedInput }（buildTool L790 缺省，defer 到
 *    通用权限系统）/ toAutoClassifierInput = input.team_name（旧 def 逐字）。
 *  ⑤ 旧 def description()/prompt() 双面 → 新 description() 单面 = PROMPT
 *    （delta ⑧ 先例）；短描述面经 team/ 子门面 TEAM_CREATE_DESCRIPTION
 *    别名 re-export（web 族口径）。
 *  ⑥ 旧 UI.tsx renderToolUseMessage 字符串面 `create team: ${input.team_name}`
 *    → 新 `input ?? {}` 防御支（sendMessageTool delta ⑦ 先例）；
 *    renderToolResultMessage 旧成员缺 → 新契约可选槽不实现（TUI 波）。
 *  ⑦ gh-32730 session-end 清理登记 + ATLAS_AGENT_ID 3 点注释逐字保留
 *    （注释语义面适配：「stored in AppState.teamContext」→「stored in the
 *    team context state」，行为面逐字）。
 *
 * 消费方 = `team/` 子门面 + `tools/` 门面 re-export + 注册表 49 口径注册位
 *（自门控 isEnabled = isAgentSwarmsEnabled；本体经 ToolRegistryDeps.
 * baseTools 组合根注入，注册表机制不变）。
 */
import {
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
  type ValidationResult,
} from '../../../shared'
import { getCwd, getSessionId } from '../../../bootstrap'
import { getRoleModel } from '../../../modelprovider'
import { ensureTasksDir, resetTaskList, setLeaderTeamName } from '../../tasks'
import {
  TEAM_LEAD_NAME,
  formatAgentId,
  isAgentSwarmsEnabled,
} from '../../messaging'
import { jsonStringify } from '../../session/json'
import { generateWordSlug } from '../plan'
import { TEAM_CREATE_TOOL_NAME } from '../toolNames'
import {
  requireTeamServices,
  type TeamServicesFile,
} from './teamServices'
import { PROMPT } from './teamCreatePrompt'

/** 输入面（旧 zod strictObject 3 字段转写，delta ①）。 */
export const TEAM_CREATE_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    team_name: {
      type: 'string',
      description: 'Name for the new team to create.',
    },
    description: {
      type: 'string',
      description: 'Team description/purpose.',
    },
    agent_type: {
      type: 'string',
      description:
        'Type/role of the team lead (e.g., "researcher", "test-runner"). ' +
        'Used for team file and inter-agent coordination.',
    },
  },
  required: ['team_name'],
  // delta ①：旧 z.strictObject 双字段（configTool L113 先例）
  additionalProperties: false,
}

/** 输入 duck（旧 z.infer 转写）。 */
export type TeamCreateInput = {
  team_name: string
  description?: string
  agent_type?: string
}

/** 输出面（旧 Output 型转写）。 */
export type TeamCreateOutput = {
  team_name: string
  team_file_path: string
  lead_agent_id: string
}

// Tool 契约非参数化（readTool face 先例）；mapToolResult 返回型收窄（web
// face 先例，落盘面 = jsonStringify 单面）。
type TeamCreateToolFace = Tool & {
  mapToolResultToToolResultBlockParam(
    data: TeamCreateOutput,
    toolUseID: string,
  ): ToolResultBlockParam
}

/**
 * 生成唯一团队名：提供名不存在则用提供名，存在则生成 word slug
 *（旧仓 L73-79 逐字；读面经 TeamServices 接缝）。
 */
function generateUniqueTeamName(providedName: string): string {
  const services = requireTeamServices()
  if (!services.readTeamFile(providedName)) {
    return providedName
  }
  return generateWordSlug()
}

export const TeamCreateTool: TeamCreateToolFace = {
  name: TEAM_CREATE_TOOL_NAME,
  inputSchema: TEAM_CREATE_TOOL_INPUT_SCHEMA,
  inputJSONSchema: TEAM_CREATE_TOOL_INPUT_SCHEMA,
  // delta ①：旧 z.strictObject 双字段
  strict: true,
  searchHint: 'create a multi-agent swarm team',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  // 门控槽（49 口径 ⑮ materialize）：旧 L55-57 逐字
  isEnabled: () => isAgentSwarmsEnabled(),
  isReadOnly: () => false,
  isDestructive: () => false,
  isConcurrencySafe: () => false,
  // 旧 userFacingName 逐字（返空串）
  userFacingName: () => '',

  toAutoClassifierInput(input: unknown) {
    // 旧 def 逐字
    return (input as TeamCreateInput).team_name
  },

  async checkPermissions(input: unknown) {
    // delta ④：旧 buildTool 缺省面（defer 到通用权限系统）
    return { behavior: 'allow' as const, updatedInput: input }
  },

  async validateInput(
    input: unknown,
    _context: unknown,
  ): Promise<ValidationResult> {
    const i = input as TeamCreateInput
    // 旧 def 逐字（errorCode 9 = 旧仓输入错误码面）
    if (!i.team_name || i.team_name.trim().length === 0) {
      return {
        result: false,
        message: 'team_name is required for TeamCreate',
        errorCode: 9,
      }
    }
    return { result: true }
  },

  async description(): Promise<string> {
    // delta ⑤：旧 prompt() 面 → PROMPT
    return PROMPT
  },

  mapToolResultToToolResultBlockParam(
    data: TeamCreateOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    // 旧 def 逐字
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

  async call(
    args: unknown,
    _context: unknown,
  ): Promise<ToolResult<TeamCreateOutput>> {
    const input = args as TeamCreateInput
    const services = requireTeamServices()

    // Check if already in a team - restrict to one team per leader
    // delta ②：旧 getAppState().teamContext → 接缝读面
    const existingTeam = services.getTeamContext()?.teamName
    if (existingTeam) {
      throw new Error(
        `Already leading team "${existingTeam}". A leader can only manage one team at a time. Use TeamDelete to end the current team before creating a new one.`,
      )
    }

    // If team already exists, generate a unique name instead of failing
    const finalTeamName = generateUniqueTeamName(input.team_name)

    // Generate a deterministic agent ID for the team lead
    const leadAgentId = formatAgentId(TEAM_LEAD_NAME, finalTeamName)
    const leadAgentType = input.agent_type || TEAM_LEAD_NAME
    // delta ③：主模型车道 3 面 0-hit → getRoleModel('premium')
    const leadModel = getRoleModel('premium')

    const teamFilePath = services.getTeamFilePath(finalTeamName)

    const teamFile: TeamServicesFile = {
      name: finalTeamName,
      description: input.description,
      createdAt: Date.now(),
      leadAgentId,
      leadSessionId: getSessionId(), // Store actual session ID for team discovery
      members: [
        {
          agentId: leadAgentId,
          name: TEAM_LEAD_NAME,
          agentType: leadAgentType,
          model: leadModel,
          joinedAt: Date.now(),
          tmuxPaneId: '',
          cwd: getCwd(),
          subscriptions: [],
        },
      ],
    }

    await services.writeTeamFileAsync(finalTeamName, teamFile)
    // Track for session-end cleanup — teams were left on disk forever
    // unless explicitly TeamDelete'd (gh-32730).
    services.registerTeamForSessionCleanup(finalTeamName)

    // Reset and create the corresponding task list directory
    // (Team = Project = TaskList). This ensures task numbering starts
    // fresh at 1 for each new swarm.
    const taskListId = services.sanitizeName(finalTeamName)
    await resetTaskList(taskListId)
    await ensureTasksDir(taskListId)

    // Register the team name so getTaskListId() returns it for the leader.
    // Without this, the leader falls through to getSessionId() and writes
    // tasks to a different directory than tmux/iTerm2 teammates expect.
    setLeaderTeamName(taskListId)

    // Update team context state（delta ②：旧 setAppState teamContext 面）
    services.setTeamContext({
      teamName: finalTeamName,
      teamFilePath,
      leadAgentId,
      teammates: {
        [leadAgentId]: {
          name: TEAM_LEAD_NAME,
          agentType: leadAgentType,
          color: services.assignTeammateColor(leadAgentId),
          tmuxSessionName: '',
          tmuxPaneId: '',
          cwd: getCwd(),
          spawnedAt: Date.now(),
        },
      },
    })

    // Note: We intentionally don't set ATLAS_AGENT_ID for the team lead because:
    // 1. The lead is not a "teammate" - isTeammate() should return false for them
    // 2. Their ID is deterministic (team-lead@teamName) and can be derived when needed
    // 3. Setting it would cause isTeammate() to return true, breaking inbox polling
    // Team name is stored in the team context state, not process.env

    return {
      data: {
        team_name: finalTeamName,
        team_file_path: teamFilePath,
        lead_agent_id: leadAgentId,
      },
    }
  },

  renderToolUseMessage(input: unknown) {
    // delta ⑥：旧 UI.tsx 字符串面 + `input ?? {}` 防御支
    const { team_name } = (input ?? {}) as Partial<TeamCreateInput>
    return `create team: ${team_name}`
  },
}
