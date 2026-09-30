/**
 * mcp 域门面（STR-1 门面收口：域外只许 import 本文件；tests→src 同）。
 *
 * §8.68 remote 波 S-E2b（R2 裁定）：旧仓 services/mcp 3209L client.ts 波
 * 落面 = 6 文件域（types / mcpJsonRpc / mcpConfig / mcpConnectionManager /
 * mcpFetch / 本门面）。消费面：
 *   - 组合根 S-E2d（atlascode compose.ts）：manager 构造 + setMcpClientRegistry
 *     供给 + ToolSearch delta ⑤ getPendingServerNames 回填 + mcpTools 供给
 *   - engine/tools/mcp.ts createMcpTools（既有）：McpToolDescriptor 映射侧
 *     （L3 顶域 ↛ engine，映射在组合根 / engine 侧完成）
 *   - tests：unit（NDJSON 分帧 / 9 子串面 / 2 源发现 / LRU 失效 / 4 态 union /
 *     前向接缝登记面）+ func（fake stdio server 真 spawn 零模型面）
 */

// ── 型面 + schema 面（types.ts）─────────────────────────────────────
export type {
  ConfigScope,
  Transport,
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpHTTPServerConfig,
  McpWebSocketServerConfig,
  McpServerConfig,
  ScopedMcpServerConfig,
  McpJsonConfig,
  McpServerCapabilities,
  McpServerResource,
  McpServerTool,
  McpServerPrompt,
  ConnectedMcpServer,
  FailedMcpServer,
  PendingMcpServer,
  DisabledMcpServer,
  McpServerConnection,
} from './types'
export {
  ConfigScopeSchema,
  TransportSchema,
  McpStdioServerConfigSchema,
  McpSSEServerConfigSchema,
  McpHTTPServerConfigSchema,
  McpWebSocketServerConfigSchema,
  McpServerConfigSchema,
  McpJsonConfigSchema,
} from './types'

// ── JSON-RPC 2.0 stdio 客户端（mcpJsonRpc.ts）──────────────────────
export type { McpJsonRpcClient } from './mcpJsonRpc'
export {
  McpJsonRpcError,
  createMcpJsonRpcClient,
  spawnMcpStdioClient,
} from './mcpJsonRpc'

// ── 最小 2 源发现（mcpConfig.ts）────────────────────────────────────
export type { McpDiscoveryInput } from './mcpConfig'
export {
  loadProjectMcpJson,
  parseMcpServerConfig,
  parseMcpJsonConfig,
  buildMcpServerConfigs,
  // S-E2d（§8.68 组合根 ⑭）：发现输入注入窗（LSP setLspServerSource 先例同型）
  setMcpDiscoveryInput,
  getMcpDiscoveryInput,
} from './mcpConfig'

// ── 连接生命周期（mcpConnectionManager.ts）─────────────────────────
export type { McpConnectionManager } from './mcpConnectionManager'
export {
  createMcpConnectionManager,
  isTerminalConnectionError,
  getMcpConnectionManager,
  resetMcpConnectionManager,
} from './mcpConnectionManager'

// ── 3 供应商 + LRU + sanitize（mcpFetch.ts）────────────────────────
export type {
  McpToolDescriptor,
  McpServerResourceEntry,
  McpPromptCommand,
} from './mcpFetch'
export {
  fetchToolsForClient,
  fetchResourcesForClient,
  fetchCommandsForClient,
  getConnectedMcpServer,
  invalidateMcpFetchCache,
  resetMcpFetchCaches,
  partiallySanitizeUnicode,
  recursivelySanitizeUnicode,
} from './mcpFetch'
