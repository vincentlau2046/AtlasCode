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

/**
 * 归一服务器名到 API 兼容 ^[a-zA-Z0-9_-]{1,64}$（非法字符含点/空格 → 下划线），
 * 再折叠连续下划线并去首尾下划线，防干扰 MCP 工具名的 __ 分隔符。
 * 0.1.78 W-A (F-2 de-ANT)：通用守卫——折叠 + 去首尾对**全部** server 名生效
 * （原仅 vendor 前缀条件支，用户裁定「功能不丢更中性」）。
 */
export function normalizeNameForMCP(name: string): string {
  // 0.1.79 W-C (#20)：折叠后空串 guard——全非法字符名（'...' 等）折叠+去首尾后
  // 会得 ''（0.1.78 A3-2 引入），回落折叠前值（'___'，与 0.1.78 前旧行为逐字一致），
  // 防 MCP 工具名 `mcp______tool` 分隔符被清成 `mcp__tool` 错位解析。
  const folded = name.replace(/[^a-zA-Z0-9_-]/g, '_')
  const normalized = folded.replace(/_+/g, '_').replace(/^_|_$/g, '')
  return normalized === '' ? folded : normalized
}

/**
 * 权限规则匹配用折半比对名（0.1.81 K2 #4/#9）：非法字符 → 下划线 + 连续
 * 下划线折叠，**不剥首尾下划线**（与 normalizeNameForMCP 的差异）。
 *
 * 动机：normalizeNameForMCP 会剥首尾下划线，导致 server 'a_' 折叠成 'a'
 * 与规则 `mcp__a` 误命中（#9 收窄根因）；而规则串里含原始 `__` 的 server
 * 名（`mcp__my__server`）经 mcpInfoFromString 首 `__` 切分会错位（#4）。
 * 权限匹配改为对**两侧原始串**做本折半（保 `__` 边界可辨）后直接比对，
 * 不再依赖「先归一再造名」链。
 */
export function foldMcpNameForCompare(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_')
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
