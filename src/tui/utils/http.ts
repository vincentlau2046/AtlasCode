/**
 * HTTP utility constants and helpers
 */

import axios from 'axios'
import {
  getAtlasApiKey,
  getOAuthTokens,
} from './auth.js'
import { getDefaultUserAgent } from './userAgent.js'
import { getWorkload } from './workloadContext.js'

// G-3（§8.74.28 R4）：品牌串裁定 = AtlasCode + 版本 + repo（repo = AtlasCode
// repo 链接）。旧 `atlas/` 前缀 + 1P 日志过滤契约（1P 遥测 879 点已随死代码
// pass 裁除，过滤面不复存在）→ 真实源换血。
export function getUserAgent(): string {
  const agentSdkVersion = process.env.ATLAS_AGENT_SDK_VERSION
    ? `, agent-sdk/${process.env.ATLAS_AGENT_SDK_VERSION}`
    : ''
  // SDK consumers can identify their app/library via ATLAS_AGENT_SDK_CLIENT_APP
  // e.g., "my-app/1.0.0" or "my-library/2.1"
  const clientApp = process.env.ATLAS_AGENT_SDK_CLIENT_APP
    ? `, client-app/${process.env.ATLAS_AGENT_SDK_CLIENT_APP}`
    : ''
  // Turn-/process-scoped workload tag for cron-initiated requests. 1P-only
  // observability — proxies strip HTTP headers; QoS routing uses cc_workload
  // in the billing-header attribution block instead (see constants/system.ts).
  // getAnthropicClient (client.ts:98) calls this per-request inside withRetry,
  // so the read picks up the same setWorkload() value as getAttributionHeader.
  const workload = getWorkload()
  const workloadSuffix = workload ? `, workload/${workload}` : ''
  // de-ANT: USER_TYPE 透传静态化（Atlas 构建 USER_TYPE 恒未设置，UA 串此前为 "(undefined, ...)"）。
  // G-3（§8.74.28 R4）：品牌串 = AtlasCode + 版本 + repo（+客户端后缀）。
  return `AtlasCode/${MACRO.VERSION} (atlascode, ${(process.env.ATLAS_ENTRYPOINT) ?? 'cli'}${agentSdkVersion}${clientApp}${workloadSuffix}, +https://github.com/vincentlau2046/AtlasCode)`
}

export function getMCPUserAgent(): string {
  const parts: string[] = []
  if ((process.env.ATLAS_ENTRYPOINT)) {
    parts.push((process.env.ATLAS_ENTRYPOINT))
  }
  if (process.env.ATLAS_AGENT_SDK_VERSION) {
    parts.push(`agent-sdk/${process.env.ATLAS_AGENT_SDK_VERSION}`)
  }
  if (process.env.ATLAS_AGENT_SDK_CLIENT_APP) {
    parts.push(`client-app/${process.env.ATLAS_AGENT_SDK_CLIENT_APP}`)
  }
  const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : ''
  // G-3（§8.74.28 R4）：品牌串 = AtlasCode + 版本 + repo。
  return `AtlasCode/${MACRO.VERSION}${suffix} (+https://github.com/vincentlau2046/AtlasCode)`
}

// User-Agent for WebFetch requests to arbitrary sites. `Atlas-User` is
// AtlasCode's publicly documented agent for user-initiated fetches (what site
// operators match in robots.txt); the trailing repo link identifies the
// product (operators can look the agent up at the AtlasCode repo).
// G-3（§8.74.28 R4）：原 support.atlas.ai 虚构域后缀 → 真实 repo 链接。
export function getWebFetchUserAgent(): string {
  return `Atlas-User (${getDefaultUserAgent()}; +https://github.com/vincentlau2046/AtlasCode)`
}

export type AuthHeaders = {
  headers: Record<string, string>
  error?: string
}

/**
 * Get authentication headers for API requests
 * Returns either OAuth headers for Max/Pro users or API key headers for regular users
 */
export function getAuthHeaders(): AuthHeaders {
  // de-ANT: claude.ai subscriber OAuth-header branch removed (isAtlasAISubscriber always false).
  // TODO: this will fail if the API key is being set to an LLM Gateway key
  // should we try to query keychain / credentials for a valid Anthropic key?
  const apiKey = getAtlasApiKey()
  if (!apiKey) {
    return {
      headers: {},
      error: 'No API key available',
    }
  }
  return {
    headers: {
      'x-api-key': apiKey,
    },
  }
}

/**
 * Wrapper that handles OAuth 401 errors by force-refreshing the token and
 * retrying once. Addresses clock drift scenarios where the local expiration
 * check disagrees with the server.
 *
 * The request closure is called again on retry, so it should re-read auth
 * (e.g., via getAuthHeaders()) to pick up the refreshed token.
 *
 * Note: bridgeApi.ts has its own DI-injected version — historically
 * handleOAuth401Error transitively pulled in config.ts (~1300 modules);
 * that function was removed with the claude.ai subscription chain (D1).
 *
 * @param opts.also403Revoked - Also retry on 403 with "OAuth token has been
 *   revoked" body (some endpoints signal revocation this way instead of 401).
 */
export async function withOAuth401Retry<T>(
  request: () => Promise<T>,
  opts?: { also403Revoked?: boolean },
): Promise<T> {
  try {
    return await request()
  } catch (err) {
    if (!axios.isAxiosError(err)) throw err
    const status = err.response?.status
    const isAuthError =
      status === 401 ||
      (opts?.also403Revoked &&
        status === 403 &&
        typeof err.response?.data === 'string' &&
        err.response.data.includes('OAuth token has been revoked'))
    if (!isAuthError) throw err
    const failedAccessToken = getOAuthTokens()?.accessToken
    if (!failedAccessToken) throw err
    // de-ANT: OAuth 401 token-refresh removed; retry once with current token.
    return await request()
  }
}
