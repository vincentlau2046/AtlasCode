/**
 * engine/tools/agent 门面（§8.25 E-2 T-5b AgentTool 核心）。
 *
 * 落盘：AgentTool（一等 Tool）+ runAgent（复用 queryAgentLoop）+ spawn 深度门 +
 * 工具面解析 + 终态收集 + 兜底 general-purpose 定义。T-5c 补 loadAgentsDir /
 * builtInAgents / forkSubagent；T-5d 补 coordinator 提示词。
 */
export { AgentTool } from './AgentTool'
export { runAgent, type RunAgentArgs, type RunAgentResult } from './runAgent'
export {
  GENERAL_PURPOSE_AGENT,
  isBuiltInAgent,
  isCustomAgent,
  type AgentDefinition,
} from './agentDefinition'
export { getBuiltInAgents } from './builtInAgents'
export {
  parseAgentFromMarkdown,
  getActiveAgentsFromList,
  loadAgentDefinitions,
  type InjectedAgentFile,
} from './loadAgentsDir'
export {
  isForkSubagentEnabled,
  FORK_AGENT,
  buildForkedMessages,
  buildChildMessage,
  isInForkChild,
  buildWorktreeNotice,
  FORK_SUBAGENT_TYPE,
  FORK_BOILERPLATE_TAG,
  FORK_DIRECTIVE_PREFIX,
} from './forkSubagent'
export {
  computeChildSpawnDepth,
  filterToolsForAgent,
  resolveAgentTools,
  countToolUses,
  finalizeAgentTool,
  type AgentToolResult,
  type ResolvedAgentTools,
} from './agentToolUtils'
export { AGENT_TOOL_NAME, MAX_WORKER_SPAWN_DEPTH } from './constants'
export { getPrompt, formatAgentLine } from './prompt'
