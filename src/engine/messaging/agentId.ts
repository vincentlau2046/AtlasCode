/**
 * messaging 域 — 确定性 Agent ID 面（E-7 S-7e d1，§8.50）。
 *
 * 旧仓来源（a8af45b）：src/utils/agentId.ts 99L 逐字随迁（formatAgentId /
 * parseAgentId / generateRequestId / parseRequestId 四函数全量，算法体零
 * delta）。swarm/teammate 消息路由的 ID 格式单一事实源。
 *
 * 探针锚点（§8.50 d1，突变须恰好 1 red）：
 *   P-M3 parseAgentId 字段映射支（agentName/teamName slice 对调）→
 *    unit 层 'P-M3 parseAgentId round-trip：字段映射' 恰 1 红。
 */

/**
 * Formats an agent ID in the format `agentName@teamName`.
 */
export function formatAgentId(agentName: string, teamName: string): string {
  return `${agentName}@${teamName}`
}

/**
 * Parses an agent ID into its components.
 * Returns null if the ID doesn't contain the @ separator.
 */
export function parseAgentId(
  agentId: string,
): { agentName: string; teamName: string } | null {
  const atIndex = agentId.indexOf('@')
  if (atIndex === -1) {
    return null
  }
  return {
    agentName: agentId.slice(0, atIndex),
    teamName: agentId.slice(atIndex + 1),
  }
}

/**
 * Formats a request ID in the format `{requestType}-{timestamp}@{agentId}`.
 */
export function generateRequestId(
  requestType: string,
  agentId: string,
): string {
  const timestamp = Date.now()
  return `${requestType}-${timestamp}@${agentId}`
}

/**
 * Parses a request ID into its components.
 * Returns null if the request ID doesn't match the expected format.
 */
export function parseRequestId(
  requestId: string,
): { requestType: string; timestamp: number; agentId: string } | null {
  const atIndex = requestId.indexOf('@')
  if (atIndex === -1) {
    return null
  }

  const prefix = requestId.slice(0, atIndex)
  const agentId = requestId.slice(atIndex + 1)

  const lastDashIndex = prefix.lastIndexOf('-')
  if (lastDashIndex === -1) {
    return null
  }

  const requestType = prefix.slice(0, lastDashIndex)
  const timestampStr = prefix.slice(lastDashIndex + 1)
  const timestamp = parseInt(timestampStr, 10)

  if (isNaN(timestamp)) {
    return null
  }

  return { requestType, timestamp, agentId }
}
