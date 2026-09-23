/**
 * mcpRuleNames — MCP 名归一 / 解析 / 权限规则名匹配纯函数（E-4 S-4b，§8.33）
 *
 * 旧仓来源（a8af45b）: src/services/mcp/mcpStringUtils.ts + normalization.ts
 * 纯字符串函数组逐字移植（零深依赖，旧仓头注同口径「no heavy dependencies」）。
 *
 * 落位裁定（§8.33 矛盾 ②）：L3 域边界 = permissions 纯叶域不 import engine，
 * 而 engine/tools/mcp.ts 头注已登记「旧仓 mcpStringUtils getToolNameForPermissionCheck
 * → 残留守（E-4 权限层）」= 本文件落点（engine 侧不持此函数）。域内本地定义
 * （S1 独占 shared / S2 域内本地先例 + TODO PR to shared）；engine 侧 mcp.ts
 * 已有自己的归一化副本（两份纯函数，L3 边界不破，合并归 TODO PR 不本波）。
 *
 * 消费面（本切片实挂，非 H6 死接缝）：
 *   - ruleMatching.ts toolMatchesRule（getToolNameForPermissionCheck +
 *     mcpInfoFromString：mcp__server 前缀拒该 server 全部工具 /
 *     mcp__server__* 通配 / MCP 工具全名防 builtin 同名规则误伤）
 * TODO PR to shared：本组与 engine/tools/mcp.ts 归一化副本合并入 shared 单一事实源。
 */

// Claude.ai server 名以此前缀开头（旧仓 normalization.ts 逐字常量）。
const CLAUDEAI_SERVER_PREFIX = 'claude.ai '

/**
 * 归一服务器名到 API 兼容 ^[a-zA-Z0-9_-]{1,64}$（非法字符含点/空格 → 下划线）。
 * claude.ai server（名以 "claude.ai " 开头）另折叠连续下划线并去首尾下划线，
 * 防干扰 MCP 工具名的 __ 分隔符（旧仓逐字）。
 */
export function normalizeNameForMCP(name: string): string {
  let normalized = name.replace(/[^a-zA-Z0-9_-]/g, '_')
  if (name.startsWith(CLAUDEAI_SERVER_PREFIX)) {
    normalized = normalized.replace(/_+/g, '_').replace(/^_|_$/g, '')
  }
  return normalized
}

/**
 * 从 "mcp__serverName__toolName" 串解析 MCP server/tool 信息。
 * 已知限制（旧仓逐字）：server 名含 "__" 时解析不准
 * （"mcp__my__server__tool" → server="my", tool="server__tool"）——
 * server 名实际极少含双下划线。
 */
export function mcpInfoFromString(
  toolString: string,
): { serverName: string; toolName: string | undefined } | null {
  const parts = toolString.split('__')
  const [mcpPart, serverName, ...toolNameParts] = parts
  if (mcpPart !== 'mcp' || !serverName) {
    return null
  }
  // 保留工具名内双下划线：server 名后全段 join
  const toolName = toolNameParts.length > 0 ? toolNameParts.join('__') : undefined
  return { serverName, toolName }
}

/** 某 server 的 MCP 工具名全名前缀。 */
export function getMcpPrefix(serverName: string): string {
  return `mcp__${normalizeNameForMCP(serverName)}__`
}

/** 由 server/tool 名构造全名（mcpInfoFromString 的逆操作，旧仓逐字）。 */
export function buildMcpToolName(
  serverName: string,
  toolName: string,
): string {
  return `${getMcpPrefix(serverName)}${normalizeNameForMCP(toolName)}`
}

/**
 * 权限规则匹配用的工具名（旧仓逐字）：MCP 工具用全名 mcp__server__tool，
 * 使 deny 规则 targeting builtin（如 "Write"）不误伤同名 MCP 替代；
 * 非 MCP 工具回落 tool.name。
 */
export function getToolNameForPermissionCheck(tool: {
  name: string
  mcpInfo?: { serverName: string; toolName: string }
}): string {
  return tool.mcpInfo
    ? buildMcpToolName(tool.mcpInfo.serverName, tool.mcpInfo.toolName)
    : tool.name
}
