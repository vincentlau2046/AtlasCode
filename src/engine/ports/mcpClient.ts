/**
 * Port: mcpClient（§8.25 E-2 T-5a，旧仓 services/mcp 10994L 的最小 port 面）
 *
 * 真核心 = 工具调用路由所需的最小连接面：
 *   - McpToolClient.callTool（MCP SDK Client.callTool 的注入接缝）
 *   - MCPServerConnection（只收 connected 形态——工具构建/路由只消费已连接服务器）
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - 连接生命周期（connectToServer/重连/缓存/资源·prompt 拉取，旧仓 client.ts 3209L +
 *     useManageMCPConnections 887L）→ 残留守（连接面归后续纵切，经本 port 注入；
 *     本版 tools 字段由连接层预取后填入，非引擎内动态 tools/list）。
 *   - 认证面（auth.ts 2370L + oauth/xaa）/ elicitation / vscode / xaaIdp → 残留守。
 *   - 旧仓 MCPServerConnection 五态 union（connected/failed/needs-auth/pending/disabled）
 *     → 残留守（状态管理归连接层；引擎只消费 connected 形态，未连接 = 不注册其工具）。
 */

/** MCP 工具调用结果（旧仓 mcpResult 裁剪：content + 可选结构化/meta 段）。 */
export interface McpToolResult {
  /** MCP content 块数组（text/image/...；形状与 ContentBlockParam[] 兼容）。 */
  content: unknown
  /** 结构化内容（MCP structuredContent 段，可选）。 */
  structuredContent?: Record<string, unknown>
  /** MCP _meta 段（外部服务器开放面，可选）。 */
  _meta?: Record<string, unknown>
}

/** 工具调用客户端（MCP SDK Client 的最小面；注入接缝，连接层实现）。 */
export interface McpToolClient {
  callTool(
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<McpToolResult>
}

/** MCP 工具描述符（旧仓 SerializedTool 裁剪：构建 Tool 所需字段）。 */
export interface McpToolDescriptor {
  name: string
  description?: string
  inputJSONSchema?: unknown
  /** 旧仓 annotations.readOnlyHint（并发安全/只读判定来源）。 */
  readOnlyHint?: boolean
  /** 旧仓 annotations.destructiveHint。 */
  destructiveHint?: boolean
}

/**
 * 已连接 MCP 服务器（connected 形态）。tools 由连接层预取（旧仓 fetchToolsForClient
 * 动态 tools/list → 残留守；本版连接层落时预取后填入）。
 */
export interface MCPServerConnection {
  /** 服务器原名（未归一化；路由比对经 normalizeNameForMCP 归一）。 */
  name: string
  client: McpToolClient
  tools?: ReadonlyArray<McpToolDescriptor>
}
