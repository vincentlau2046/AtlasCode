/**
 * engine/tools/team 子门面（S-E2 §8.62 team/collab 族子波，STR-1 显式名块
 * 纪律）。
 *
 * 覆盖：SendMessageTool 本体 + JSON schema 常量 + prompt 面 + Input/
 * Structured/Output duck 型 10 + TeamFileLoader 注入接缝（旧仓
 * tools/SendMessageTool 917L 本体 + prompt 49L + UI 30L + constants 1L
 * 裁剪随迁；UDS/bridge 面 5 站点族 §8.68 S-E2a 复活（remote 域门 face，
 * getSendMessagePrompt / schema to 描述 getter / checkPermissions /
 * validate / call 各站 env-live），in-process 名路由 +
 * backfillObservableInput + team-file + gracefulShutdown 面 → C 桶 ③
 * shell·swarm 波，UI JSX → TUI 波，见各文件头注 delta ①-⑩）
 * + C 桶 ③ S-E2d D 类 3 工具（Snip 族位裁定归本族，见 snipTool.ts 头注）
 * + TeamServices 注入接缝（TeamCreate/TeamDelete 消费 swarm team-file 面，
 * 组合根绑 swarm 门面真实现）。
 *
 * 纪律（tools/index.ts config/askUser 块先例）：逐名显式 re-export，无
 * `export *`；各文件头注 delta 登记不随门面重复（单一事实源 = 各模块头注）。
 *
 * 消费方：tools/ 门面 re-export 块（namespaced 导出面）+ 注册表 49 口径
 * 注册位（自门控 isEnabled = isAgentSwarmsEnabled，26/49；本体经
 * ToolRegistryDeps.baseTools 消费方注入）。
 */
export {
  SEND_MESSAGE_TOOL_INPUT_SCHEMA,
  SendMessageTool,
  setTeamFileLoader,
  resetTeamFileLoader,
  type SendMessageInput,
  type StructuredMessage,
  type MessageRouting,
  type MessageOutput,
  type BroadcastOutput,
  type RequestOutput,
  type ResponseOutput,
  type SendMessageToolOutput,
  type SendMessageToolUseContext,
  type TeamFile,
} from './sendMessageTool'
// §8.68 S-E2a：prompt 面 = DESCRIPTION + PROMPT（gate-off 锚点）+
// getSendMessagePrompt（门 face 每次访问重读 env-live）
export { DESCRIPTION, PROMPT, getSendMessagePrompt } from './sendMessagePrompt'

// ── C 桶 ③ shell·swarm 波 S-E2d（§8.66 补差侧）：D 类 3 工具（Snip
// 族位裁定归 team/ 子域）+ TeamServices 注入接缝。prompt 伴随件 4 文件
// DESCRIPTION/PROMPT 重名 → 族前缀别名重出（config/askUser/notebook 块
// DESCRIPTION 别名先例；sendMessagePrompt 单件保裸名 = 本族首占位）。──
export {
  SNIP_TOOL_INPUT_SCHEMA,
  SnipTool,
  type SnipInput,
  type SnipOutput,
} from './snipTool'
export {
  DESCRIPTION as SNIP_DESCRIPTION,
  PROMPT as SNIP_PROMPT,
} from './snipPrompt'
export {
  TEAM_CREATE_TOOL_INPUT_SCHEMA,
  TeamCreateTool,
  type TeamCreateInput,
  type TeamCreateOutput,
} from './teamCreateTool'
export {
  DESCRIPTION as TEAM_CREATE_DESCRIPTION,
  PROMPT as TEAM_CREATE_PROMPT,
} from './teamCreatePrompt'
export {
  TEAM_DELETE_TOOL_INPUT_SCHEMA,
  TeamDeleteTool,
  type TeamDeleteInput,
  type TeamDeleteOutput,
} from './teamDeleteTool'
export {
  DESCRIPTION as TEAM_DELETE_DESCRIPTION,
  PROMPT as TEAM_DELETE_PROMPT,
} from './teamDeletePrompt'
export {
  requireTeamServices,
  setTeamServices,
  resetTeamServices,
  createDefaultTeamContextStore,
  resetDefaultTeamContextStore,
  type TeamServices,
  type TeamServicesFile,
  type TeamMemberStateShape,
  type TeamContextShape,
} from './teamServices'
