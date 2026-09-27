/**
 * engine/tools/team 子门面（S-E2 §8.62 team/collab 族子波，STR-1 显式名块
 * 纪律）。
 *
 * 覆盖：SendMessageTool 本体 + JSON schema 常量 + prompt 面 + Input/
 * Structured/Output duck 型 9 + TeamFileLoader 注入接缝（旧仓
 * tools/SendMessageTool 917L 本体 + prompt 49L + UI 30L + constants 1L
 * 裁剪随迁；UDS/bridge 面 4 站点 → remote 波，in-process 名路由 +
 * backfillObservableInput + team-file + gracefulShutdown 面 → C 桶 ③
 * shell·swarm 波，UI JSX → TUI 波，见各文件头注 delta ①-⑩）。
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
export { DESCRIPTION, PROMPT } from './sendMessagePrompt'
