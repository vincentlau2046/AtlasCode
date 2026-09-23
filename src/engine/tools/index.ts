/**
 * 基础工具 Read/Edit/Bash/Glob/Grep + AgentTool + 注册表 getAllBaseTools
 *
 * 实现波次: E-2 已落 AgentTool 核心（T-5b）+ MCP 构建（T-5a）+ 注册表机制
 *   getAllBaseTools(deps)（T-5e）；47 基础工具本体 = 残留守（各本体纵切经 deps 注入）。
 *
 * T-5a（§8.25 E-2）已落 MCP 工具构建面 → 在此 re-export；port 类型面
 *   （McpToolResult/McpToolClient/McpToolDescriptor/MCPServerConnection）归
 *   ports/mcpClient，经 engine 门面（engine/index.ts）单独 re-export。
 * T-5b（§8.25 E-2）已落 AgentTool 核心面 → 在此 re-export（agent/ 子门面）。
 * T-5d（§8.25 E-2）已落工具名常量 seed（toolNames：ASYNC/INTERNAL 集 + 单工具名）。
 * T-5e（§8.25 E-2）已落注册表机制 toolRegistry（getAllBaseTools(deps) deps 注入 +
 *   ASCEND 门控 + 按名去重）+ toolNames 全量常量集（4 工具名集 + 14 单工具名）。
 * E-4 S-4a（§8.31/§8.32）已落 LEGACY 工具名 alias 表 legacyToolNameAliases
 *   （4 项 legacy → 正规名，正规名引用 toolNames/agent 常量；模块加载注册
 *   进 permissions 域解析函数组，re-export 触发 side-effect import）。
 * E-4 S-4c1（§8.34 裁定 ⑤）已落 getToolsForDefaultPreset(deps)（机制面默认
 *   预设工具名，engine/permissions permissionSetup 传递依赖提前；本体残留守不变）。
 * E-4 S-4d（§8.36）已落 filterToolsByDenyRules + getTools（deny 规则工具面
 *   过滤，域 getDenyRuleForTool 消费；模式过滤支裁出见 toolRegistry 头注）。
 */
export {
  createMcpTools,
  findMcpServerConnection,
  buildMcpToolName,
  getMcpPrefix,
  mcpInfoFromString,
  normalizeNameForMCP,
} from './mcp'
export {
  getAllBaseTools,
  getToolsForDefaultPreset,
  filterToolsByDenyRules,
  getTools,
  isAscendToolsEnabled,
  TOOL_PRESETS,
  parseToolPreset,
  type ToolRegistryDeps,
  type ToolPreset,
} from './toolRegistry'
export {
  ASYNC_AGENT_ALLOWED_TOOLS,
  INTERNAL_WORKER_TOOLS,
  ALL_AGENT_DISALLOWED_TOOLS,
  CUSTOM_AGENT_DISALLOWED_TOOLS,
  IN_PROCESS_TEAMMATE_ALLOWED_TOOLS,
  COORDINATOR_MODE_ALLOWED_TOOLS,
  TASK_OUTPUT_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_V2_TOOL_NAME,
  ASK_USER_QUESTION_TOOL_NAME,
  TASK_CREATE_TOOL_NAME,
  TASK_GET_TOOL_NAME,
  TASK_LIST_TOOL_NAME,
  TASK_UPDATE_TOOL_NAME,
  CRON_CREATE_TOOL_NAME,
  CRON_DELETE_TOOL_NAME,
  CRON_LIST_TOOL_NAME,
  CONFIG_TOOL_NAME,
  WORKFLOW_TOOL_NAME,
  REPL_TOOL_NAME,
  BASH_TOOL_NAME,
  FILE_READ_TOOL_NAME,
  FILE_EDIT_TOOL_NAME,
  FILE_WRITE_TOOL_NAME,
  GREP_TOOL_NAME,
  GLOB_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  TODO_WRITE_TOOL_NAME,
  NOTEBOOK_EDIT_TOOL_NAME,
  SKILL_TOOL_NAME,
  SYNTHETIC_OUTPUT_TOOL_NAME,
  TOOL_SEARCH_TOOL_NAME,
  ENTER_WORKTREE_TOOL_NAME,
  EXIT_WORKTREE_TOOL_NAME,
  TEAM_CREATE_TOOL_NAME,
  TEAM_DELETE_TOOL_NAME,
  SEND_MESSAGE_TOOL_NAME,
  TASK_STOP_TOOL_NAME,
  SHELL_TOOL_NAMES,
} from './toolNames'
export { LEGACY_TOOL_NAME_ALIASES } from './legacyToolNameAliases'
export {
  AgentTool,
  runAgent,
  GENERAL_PURPOSE_AGENT,
  isBuiltInAgent,
  isCustomAgent,
  getBuiltInAgents,
  parseAgentFromMarkdown,
  getActiveAgentsFromList,
  loadAgentDefinitions,
  isForkSubagentEnabled,
  FORK_AGENT,
  buildForkedMessages,
  buildChildMessage,
  isInForkChild,
  buildWorktreeNotice,
  FORK_SUBAGENT_TYPE,
  FORK_BOILERPLATE_TAG,
  FORK_DIRECTIVE_PREFIX,
  computeChildSpawnDepth,
  filterToolsForAgent,
  resolveAgentTools,
  countToolUses,
  finalizeAgentTool,
  AGENT_TOOL_NAME,
  MAX_WORKER_SPAWN_DEPTH,
  getPrompt,
  formatAgentLine,
  type RunAgentArgs,
  type RunAgentResult,
  type AgentDefinition,
  type AgentToolResult,
  type ResolvedAgentTools,
  type InjectedAgentFile,
} from './agent'
