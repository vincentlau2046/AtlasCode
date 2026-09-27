/**
 * engine/tools/mcp 子门面（S-E2 §8.63 MCP+ToolSearch 族子波，STR-1 显式名
 * 块纪律）。
 *
 * 覆盖：ListMcpResourcesTool + ReadMcpResourceTool 两本体（2 对象 + JSON
 * schema 常量 2 + prompt 面 4（2 DESCRIPTION 短面 + 2 PROMPT）+ Input/
 * Output duck 型 4）+ mcpClientRegistry 注入接缝（3 函数 + duck 型 3；真
 * MCP client 接线〔连接生命周期 / 重连 / 缓存 / resources·prompt 拉取〕=
 * MCP client 波残留守登记）+ isOutputLineTruncated（旧 terminal.ts 逐字
 * 随迁）+ getBinaryBlobSavedMessage/formatFileSize 本地移植。
 *
 * 纪律（tools/index.ts config/askUser 块先例）：逐名显式 re-export，无
 * `export *`；各文件头注 delta 登记不随门面重复（单一事实源 = 各模块头注）。
 *
 * 消费方：tools/ 门面 re-export 块（namespaced 导出面）+ 注册表 49 口径
 * 注册位（2 无条件注册面，§8.63.1 口径 26/49 → 29/49；本体经
 * ToolRegistryDeps.baseTools 消费方注入）。
 */
export {
  getMcpClientRegistry,
  resetMcpClientRegistry,
  setMcpClientRegistry,
  type McpClientEntry,
  type McpClientRegistry,
  type McpResourceContent,
  type McpResourceItem,
} from './mcpClientRegistry'
export {
  LIST_MCP_RESOURCES_DESCRIPTION,
  LIST_MCP_RESOURCES_PROMPT,
  READ_MCP_RESOURCE_DESCRIPTION,
  READ_MCP_RESOURCE_PROMPT,
} from './mcpPrompt'
export {
  ListMcpResourcesTool,
  LIST_MCP_RESOURCES_TOOL_INPUT_SCHEMA,
  type ListMcpResourcesInput,
  type ListMcpResourcesOutput,
} from './listMcpResourcesTool'
export {
  getBinaryBlobSavedMessage,
  ReadMcpResourceTool,
  READ_MCP_RESOURCE_TOOL_INPUT_SCHEMA,
  type ReadMcpResourceInput,
  type ReadMcpResourceOutput,
  type ReadMcpResourceOutputContent,
} from './readMcpResourceTool'
export { isOutputLineTruncated } from './truncation'
