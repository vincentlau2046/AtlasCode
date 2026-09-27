/**
 * engine/tools/team — TeamDeleteTool 本体（C 桶 ③ shell·swarm 波 S-E2d；
 * §8.66 补差侧）。
 *
 * 旧仓来源（a8af45b）：src/tools/TeamDeleteTool/TeamDeleteTool.ts 133L +
 * prompt 16L + constants 1L 裁剪随迁（buildTool 成员面 → 新 shared Tool
 * 契约对象化，config/askUser/sendMessage face 先例）。
 *
 * 门控槽（49 口径 ⑮ agentSwarms materialize，§8.66.1.4）：自门控
 * isEnabled = isAgentSwarmsEnabled（与 TeamCreate 同槽）；组合根
 * deps.baseTools 注入（注册表机制不变）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 lazySchema z.strictObject({})（空输入 + 未知键拒）→ 新纯 JSON
 *    schema（strict + additionalProperties false 双字段，configTool L113
 *    先例）。
 *  ② 旧 call context getAppState/setAppState（appState.teamContext 读 +
 *    清 + inbox 清面）→ TeamServices 注入接缝（engine↛swarm L3 隔离；
 *    见 teamServices.ts 头注）；inbox 清面裁（新仓无 inbox 状态成员，
 *    TUI 波随 appState 接线点重裁定）。
 *  ③ 旧 def 缺成员 buildTool 缺省值 → 新契约必选成员显化（缺省值逐字）：
 *    isReadOnly = false（目录清理写面）/ isDestructive = false（buildTool
 *    缺省逐字——团队资源清理非文件破坏面）/ isConcurrencySafe = false
 *    （buildTool L787 缺省）/ userFacingName = ''（旧 def 逐字）/
 *    toAutoClassifierInput = ''（buildTool L795 缺省，空输入无分类器
 *    输入面）/ checkPermissions = { behavior: 'allow', updatedInput }
 *    （buildTool L790 缺省）。
 *  ④ 旧 def description()/prompt() 双面 → 新 description() 单面 = PROMPT
 *    （delta ⑧ 先例）；短描述面经 team/ 子门面 TEAM_DELETE_DESCRIPTION
 *    别名 re-export（web 族口径）。
 *  ⑤ 旧 UI.tsx renderToolUseMessage 常量面 'cleanup team: current' 逐字
 *    （_input 不消费）；renderToolResultMessage 旧成员 = 恒 null 抑制面
 *    （「Suppress cleanup result - the batched shutdown message covers
 *    this」注释逐字裁面）→ 新契约可选槽不实现（TUI 波，config delta ⑨
 *    先例：JSX 渲染面归 TUI）。
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
} from '../../../shared'
import { clearLeaderTeamName } from '../../tasks'
import { TEAM_LEAD_NAME, isAgentSwarmsEnabled } from '../../messaging'
import { jsonStringify } from '../../session/json'
import { TEAM_DELETE_TOOL_NAME } from '../toolNames'
import { requireTeamServices } from './teamServices'
import { PROMPT } from './teamDeletePrompt'

/** 输入面（旧 zod strictObject({}) 空对象转写，delta ①）。 */
export const TEAM_DELETE_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {},
  // delta ①：旧 z.strictObject({}) 双字段（configTool L113 先例）
  additionalProperties: false,
}

/** 输入 duck（旧 z.infer 转写 = 空对象）。 */
export type TeamDeleteInput = Record<string, never>

/** 输出面（旧 Output 型转写）。 */
export type TeamDeleteOutput = {
  success: boolean
  message: string
  team_name?: string
}

// Tool 契约非参数化（readTool face 先例）；mapToolResult 返回型收窄（web
// face 先例，落盘面 = jsonStringify 单面）。
type TeamDeleteToolFace = Tool & {
  mapToolResultToToolResultBlockParam(
    data: TeamDeleteOutput,
    toolUseID: string,
  ): ToolResultBlockParam
}

export const TeamDeleteTool: TeamDeleteToolFace = {
  name: TEAM_DELETE_TOOL_NAME,
  inputSchema: TEAM_DELETE_TOOL_INPUT_SCHEMA,
  inputJSONSchema: TEAM_DELETE_TOOL_INPUT_SCHEMA,
  // delta ①：旧 z.strictObject({}) 双字段
  strict: true,
  searchHint: 'disband a swarm team and clean up',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  // 门控槽（49 口径 ⑮ materialize）：旧 L33-35 逐字
  isEnabled: () => isAgentSwarmsEnabled(),
  isReadOnly: () => false,
  isDestructive: () => false,
  isConcurrencySafe: () => false,
  // 旧 userFacingName 逐字（返空串）
  userFacingName: () => '',

  // delta ③：旧 def 缺成员 buildTool 缺省面
  toAutoClassifierInput: () => '',

  async checkPermissions(input: unknown) {
    // delta ③：旧 buildTool 缺省面（defer 到通用权限系统）
    return { behavior: 'allow' as const, updatedInput: input }
  },

  async description(): Promise<string> {
    // delta ④：旧 prompt() 面 → PROMPT
    return PROMPT
  },

  mapToolResultToToolResultBlockParam(
    data: TeamDeleteOutput,
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
    _args: unknown,
    _context: unknown,
  ): Promise<ToolResult<TeamDeleteOutput>> {
    const services = requireTeamServices()
    // delta ②：旧 getAppState().teamContext → 接缝读面
    const teamName = services.getTeamContext()?.teamName

    if (teamName) {
      // Read team config to check for active members
      const teamFile = services.readTeamFile(teamName)
      if (teamFile) {
        // Filter out the team lead - only count non-lead members
        const nonLeadMembers = teamFile.members.filter(
          m => m.name !== TEAM_LEAD_NAME,
        )

        // Separate truly active members from idle/dead ones
        // Members with isActive === false are idle (finished their turn or crashed)
        const activeMembers = nonLeadMembers.filter(m => m.isActive !== false)

        if (activeMembers.length > 0) {
          const memberNames = activeMembers.map(m => m.name).join(', ')
          return {
            data: {
              success: false,
              message: `Cannot cleanup team with ${activeMembers.length} active member(s): ${memberNames}. Use requestShutdown to gracefully terminate teammates first.`,
              team_name: teamName,
            },
          }
        }
      }

      await services.cleanupTeamDirectories(teamName)
      // Already cleaned — don't try again on gracefulShutdown.
      services.unregisterTeamForSessionCleanup(teamName)

      // Clear color assignments so new teams start fresh
      services.clearTeammateColors()

      // Clear leader team name so getTaskListId() falls back to session ID
      clearLeaderTeamName()
    }

    // Clear team context from state（delta ②：旧 setAppState
    // { teamContext: undefined, inbox: { messages: [] } }，inbox 清面裁）
    services.setTeamContext(undefined)

    return {
      data: {
        success: true,
        message: teamName
          ? `Cleaned up directories and worktrees for team "${teamName}"`
          : 'No team name found, nothing to clean up',
        team_name: teamName,
      },
    }
  },

  // delta ⑤：旧 UI.tsx 常量面逐字（_input 不消费）
  renderToolUseMessage(): unknown {
    return 'cleanup team: current'
  },
}
