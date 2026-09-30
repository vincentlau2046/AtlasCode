// G-3（§8.74.28 R4 升格）：原 atlas.local 虚构域 → 真实产品 repo
// （attribution 行链接 + MCP server websiteUrl 两消费面共用）。
export const PRODUCT_URL = 'https://github.com/vincentlau2046/AtlasCode'

// Atlas Remote session URLs
export const CLAUDE_AI_BASE_URL = 'https://claude.ai'
export const CLAUDE_AI_STAGING_BASE_URL = 'https://claude-ai.staging.ant.dev'
export const CLAUDE_AI_LOCAL_BASE_URL = 'http://localhost:4000'

/**
 * Determine if we're in a staging environment for remote sessions.
 * Checks session ID format and ingress URL.
 */
export function isRemoteSessionStaging(
  sessionId?: string,
  ingressUrl?: string,
): boolean {
  return (
    sessionId?.includes('_staging_') === true ||
    ingressUrl?.includes('staging') === true
  )
}

/**
 * Determine if we're in a local-dev environment for remote sessions.
 * Checks session ID format (e.g. `session_local_...`) and ingress URL.
 */
export function isRemoteSessionLocal(
  sessionId?: string,
  ingressUrl?: string,
): boolean {
  return (
    sessionId?.includes('_local_') === true ||
    ingressUrl?.includes('localhost') === true
  )
}

/**
 * Get the base URL for Claude AI based on environment.
 */
export function getClaudeAiBaseUrl(
  sessionId?: string,
  ingressUrl?: string,
): string {
  if (isRemoteSessionLocal(sessionId, ingressUrl)) {
    return CLAUDE_AI_LOCAL_BASE_URL
  }
  if (isRemoteSessionStaging(sessionId, ingressUrl)) {
    return CLAUDE_AI_STAGING_BASE_URL
  }
  return CLAUDE_AI_BASE_URL
}

/**
 * Get the full session URL for a remote session.
 *
 * 前向缝登记（§8.74.29 1P 簇裁，#200）：原 cse_→session_ compat shim（bridge/sessionIdCompat
 * toCompatSessionId，atlas_bridge_repl_v2_cse_shim_enabled 门控）随 1P 簇裁除；
 * 现直接用原始 sessionId 构造 URL（shim 是 no-op 等价，对已是 session_* 形态的 ID 无行为变化）。
 */
export function getRemoteSessionUrl(
  sessionId: string,
  ingressUrl?: string,
): string {
  const baseUrl = getClaudeAiBaseUrl(sessionId, ingressUrl)
  return `${baseUrl}/code/${sessionId}`
}
