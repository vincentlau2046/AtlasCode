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
// 0.1.93 W-D-A round 6（f4 修 2）：终止态单源谓词（守卫读面）。
import { isInProcessTeammateActiveOrUnknown } from '../../../task'
import { TEAM_DELETE_TOOL_NAME } from '../toolNames'
import { requireTeamServices } from './teamServices'
// 0.1.100 W-D-B-1（段 D 批复形 @bbe99518）：durable 支（D-③ halfAttached
// 判据 + fail-visible 输出面，f4 硬要求② 禁 log-only 静默形）。
import { resolveTeamPersistenceMode } from './teamDurable'
import {
  errorMessage,
  getLeadInstanceId,
  readTeamFileV2,
} from '../../../shared'
import { getSessionContextPort } from '../../session/sessionContextPort'
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

/** 输出面（旧 Output 型转写 + 0.1.100 W-D-B-1 加性：durable 支 halfAttached
 * fail-visible 提示面——仅 halfAttached 成员在场时出现，D-③ 禁静默）。 */
export type TeamDeleteOutput = {
  success: boolean
  message: string
  team_name?: string
  half_attached_warning?: string
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
    // 0.1.93b RF-T1：branch-2 读面改走 sessionContextPort 后 context
    // （getAppState 窄视图）不再消费——参数保留（接口签名位），下划线口径。
    _context: unknown,
  ): Promise<ToolResult<TeamDeleteOutput>> {
    const services = requireTeamServices()
    // delta ②：旧 getAppState().teamContext → 接缝读面
    const teamContext = services.getTeamContext()
    const teamName = teamContext?.teamName

    // 0.1.100 W-D-B-1 durable 支（D-③）输出面载体（if 块外声明 = 成功
    // 返回面 spread 可达）。
    let half_attached_warning: string | undefined
    if (teamName) {
      // 0.1.100 W-D-B-1 durable 支（D-③）：halfAttached 判据前置。durable
      // 档下 v2 team file 的 leadInstanceId ≠ 本进程 instance（kill→resume）
      // = 全员 halfAttached——旧 lead 进程已死，shutdown_request 链不可达，
      // 按「不当活着」跳过 file 守卫（禁静默：成员名单进输出面）；同
      // instance = 本进程写面，file 守卫照常。v2 拒读（foreign/legacy）=
      // fail-visible 终止（禁半解析回落，演进策略判据）。
      let skipFileGuard = false
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
          const halfNames = v2File.members
            .filter(m => m.name !== TEAM_LEAD_NAME)
            .map(m => m.name)
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
      const teamFile = skipFileGuard ? null : services.readTeamFile(teamName)
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
              message: `Cannot cleanup team with ${activeMembers.length} active member(s): ${memberNames}. Send each active member a shutdown request via SendMessage first (message: {"type":"shutdown_request","request_id":"<id>","reason":"<why>"}), and wait for their shutdown approval and exit before retrying TeamDelete.`,
              team_name: teamName,
            },
          }
        }
      }

      // 0.1.93 W-D-A A7：active-member 守卫 teamContext 化（Form A 无 team
      // file，旧守卫跳过 = 孤儿循环破口——Review Focus 5）。组内 in-process
      // 成员以 task 态查表判定（taskId 锚 = registerSpawnedTeammate 注册
      // 面）；fail-closed：task 态未知（无 appState / 缺条目）= 视为活
      // ——graceful shutdown 优先（不发 kill，F3 态机语义）。mailbox 队列
      // 清面 = 下方 cleanupTeamDirectories 真 rm teams/<team>/（inboxes 含）。
      // Lead 条目不计入（TeamCreate 组态种子 teammates[leadAgentId] = lead，
      // 与上方 team-file 守卫 m.name !== TEAM_LEAD_NAME 同义镜像）。
      const teammateEntries = Object.entries(
        teamContext?.teammates ?? {},
      ).filter(([, member]) => member.name !== TEAM_LEAD_NAME)
      if (teammateEntries.length > 0) {
        // 0.1.93b RF-T1（f4 §11 批复 2026-11-09）：branch-2 读面单点改走
        // sessionContextPort——旧读面 context.getAppState().tasks 在 lead
        // lane 恒 undefined（工具 context getAppState = makeCtx TPC 窄视图
        // cli/print.ts，S-E3 有意设计无 tasks 字段）→
        // isInProcessTeammateActiveOrUnknown(undefined) fail-closed 恒判活
        // = 结构性恒拦（RED-F 终形；R-⑥ 收证腿 t8-reddf-r6 定谳：completed
        // apply 63s 前已生效仍拦）。port = appState.port 全店窗（drain
        // ladder `getAppState: () => sessionPort.get()` 同款先例 print.ts）；
        // port 缺席 = tasks undefined → 谓词维持 fail-closed 归活，守卫
        // 语义不放宽。判别格 = tests/unit/wave0193b-rft1-teamdelete-port-read.
        // test.ts（F1 修前红）。
        const tasks = getSessionContextPort()?.get().tasks as
          | Record<string, unknown>
          | undefined
        // 0.1.93 W-D-A round 6（f4 修 2）：守卫读面谓词单源（src/task/
        // inProcessTeammate，判读逐字 = 旧「status undefined || running」
        // fail-closed 形；终态词汇与 WaitForTeammates/runner 收尾块同源）。
        const alive = teammateEntries.filter(([, member]) =>
          isInProcessTeammateActiveOrUnknown(tasks?.[member.taskId ?? '']),
        )
        if (alive.length > 0) {
          const memberNames = alive.map(([, member]) => member.name).join(', ')
          return {
            data: {
              success: false,
              message: `Cannot cleanup team with ${alive.length} active member(s): ${memberNames}. Send each active member a shutdown request via SendMessage first (message: {"type":"shutdown_request","request_id":"<id>","reason":"<why>"}), and wait for their shutdown approval and exit before retrying TeamDelete.`,
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
        ...(half_attached_warning ? { half_attached_warning } : {}),
      },
    }
  },

  // delta ⑤：旧 UI.tsx 常量面逐字（_input 不消费）
  renderToolUseMessage(): unknown {
    return 'cleanup team: current'
  },
}
