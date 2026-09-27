/**
 * engine/tools/mcp — MCP client 状态注入接缝（S-E2 §8.63 MCP+ToolSearch 族
 * 子波）。
 *
 * 旧仓来源（a8af45b）：旧 `context.options.mcpClients`（services/mcp/
 * client.js 客户端状态数组 + ensureConnectedClient/fetchResourcesForClient
 * + SDK client.request resources/read）→ 新仓 0-hit（3-dep 纪律：无
 * @modelcontextprotocol/sdk）→ 本文件注入接缝（TeamFileLoader 接缝先例
 * §8.62 delta ⑤）：工具本体只读接缝；真 MCP client 接线（连接生命周期 /
 * 重连 / 缓存 / resources·prompt 拉取）= MCP client 波（残留守登记）经
 * setMcpClientRegistry 注入；ports/mcpClient.ts tools-only port 残留守
 * 头注不变。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 call `context.options.mcpClients` 读面 → 本接缝 getMcpClientRegistry()
 *    （call 2 参收窄后 context 不再承载 client 状态，S-C5 delta ⑧ / §8.62
 *    先例）。
 *  ② McpClientEntry.listResources / readResource 2 残留守方法面 = 旧
 *    ensureConnectedClient + fetchResourcesForClient（LRU 缓存 + reconnect
 *    re-fetch 面）+ SDK client.request({method:'resources/read'},
 *    ReadResourceResultSchema) 验证面裁（3-dep 纪律：seam 保证返回结构型，
 *    SDK schema 校验不随迁）。
 *  ③ reader 缺失面（capabilities.resources = true 而 readResource 未注入
 *    = seam 未接线）：ReadMcp 本体复用旧逐字面 `Server "X" does not support
 *    resources` throw（零新造文案）；ListMcp 本体 = pending 面同支（
 *    type !== 'connected' 或 listResources 缺 → 静默 []，一服务器不沉
 *    全果面不变）。
 *  ④ 默认 = 空 client 集（旧 options.mcpClients 缺省面）：ListMcp data [] +
 *    mapToolResult 空面逐字 / ReadMcp server-not-found 错误面逐字（
 *    Available servers 空列表面）。
 */

/** 资源条目（旧 MCP SDK ResourcesListItem 面 + server 字段由本体 attach，
 * delta ②：旧 attach 在 fetchResourcesForClient 内 → 新显式落本体，值语义
 * 不变）。 */
export type McpResourceItem = {
  uri: string
  name: string
  mimeType?: string
  description?: string
}

/** 资源读取内容项（旧 SDK TextResourceContents / BlobResourceContents 结构
 * union；blob = base64 字符串，delta ②）。 */
export type McpResourceContent = {
  uri: string
  mimeType?: string
  text?: string
  blob?: string
}

/** MCP client 条目（旧 mcpClients 数组元素 duck：连接态 + 资源能力 + 2 残
 * 留守接缝方法，delta ②）。 */
export type McpClientEntry = {
  name: string
  type: 'connected' | 'pending'
  capabilities?: { resources?: boolean }
  /** 残留守：旧 ensureConnectedClient + fetchResourcesForClient 面（MCP
   * client 波注入）。 */
  listResources?: () => Promise<McpResourceItem[]>
  /** 残留守：旧 SDK client.request({method:'resources/read'}) 面（MCP
   * client 波注入）。 */
  readResource?: (uri: string) => Promise<{ contents: McpResourceContent[] }>
}

export type McpClientRegistry = {
  clients: McpClientEntry[]
}

// delta ④：默认 = 空 client 集（旧 options.mcpClients 缺省面）
let registry: McpClientRegistry = { clients: [] }

export function setMcpClientRegistry(next: McpClientRegistry): void {
  registry = next
}

export function resetMcpClientRegistry(): void {
  registry = { clients: [] }
}

export function getMcpClientRegistry(): McpClientRegistry {
  return registry
}
