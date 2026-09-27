/**
 * engine/tools/mcp — ListMcp/ReadMcp prompt 面（旧仓 prompt.ts ×2 逐字随
 * 迁，§8.63 S-E2；前导换行模板逐字 = house 先例 §8.62 delta ⑧）。
 *
 * 短 DESCRIPTION 面经 mcp/ 子门面 + tools/ 门面别名 re-export（web 族口径
 * 先例）；本体 description() 单面 = 长 PROMPT（旧 def description() 短面 /
 * prompt() 长面双面临合，delta ⑧ 先例）。
 */
export const LIST_MCP_RESOURCES_DESCRIPTION = `
Lists available resources from configured MCP servers.
Each resource object includes a 'server' field indicating which server it's from.

Usage examples:
- List all resources from all servers: \`listMcpResources\`
- List resources from a specific server: \`listMcpResources({ server: "myserver" })\`
`

// 注：第 2 行行尾旧 prompt.ts 逐字含 1 个尾随空格（`... 'server' field `，
// S-E1 逐字符核验；新仓 eslint 无 trailing-space 规则，逐字保留）
export const LIST_MCP_RESOURCES_PROMPT = `
List available resources from configured MCP servers.
Each returned resource will include all standard MCP resource fields plus a 'server' field 
indicating which server the resource belongs to.

Parameters:
- server (optional): The name of a specific MCP server to get resources from. If not provided,
  resources from all servers will be returned.
`

export const READ_MCP_RESOURCE_DESCRIPTION = `
Reads a specific resource from an MCP server.
- server: The name of the MCP server to read from
- uri: The URI of the resource to read

Usage examples:
- Read a resource from a server: \`readMcpResource({ server: "myserver", uri: "my-resource-uri" })\`
`

export const READ_MCP_RESOURCE_PROMPT = `
Reads a specific resource from an MCP server, identified by server name and resource URI.

Parameters:
- server (required): The name of the MCP server from which to read the resource
- uri (required): The URI of the resource to read
`
