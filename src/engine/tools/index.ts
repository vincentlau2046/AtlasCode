/**
 * 基础工具 Read/Edit/Bash/Glob/Grep + AgentTool + 注册表 getAllBaseTools
 *
 * 实现波次: C 波（基础工具 + AgentTool 本体）；注册表机制 getAllBaseTools 归
 *   E-2 T-5e（§8.25）。
 * 状态: A 波骨架占位（基础工具/注册表待后续纵切）。
 *
 * T-5a（§8.25 E-2）已落 MCP 工具构建面 → 在此 re-export；port 类型面
 *   （McpToolResult/McpToolClient/McpToolDescriptor/MCPServerConnection）归
 *   ports/mcpClient，经 engine 门面（engine/index.ts）单独 re-export。
 * T-5b（§8.25 E-2）已落 AgentTool 核心面 → 在此 re-export（agent/ 子门面）。
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
  AgentTool,
  runAgent,
  GENERAL_PURPOSE_AGENT,
  isBuiltInAgent,
  computeChildSpawnDepth,
  filterToolsForAgent,
  resolveAgentTools,
  countToolUses,
  finalizeAgentTool,
  AGENT_TOOL_NAME,
  MAX_WORKER_SPAWN_DEPTH,
  getPrompt,
  type RunAgentArgs,
  type RunAgentResult,
  type AgentDefinition,
  type AgentToolResult,
  type ResolvedAgentTools,
} from './agent'
