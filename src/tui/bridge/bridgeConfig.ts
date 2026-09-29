/**
 * Shared bridge auth/URL resolution. Consolidates the ant-only
 * ATLAS_BRIDGE_* dev overrides that were previously copy-pasted across
 * a dozen files — inboundAttachments, bridgeMain,
 * initReplBridge, remoteBridgeCore, daemon workers, /rename,
 * /remote-control.
 *
 * Two layers: *Override() returns the ant-only env var (or undefined);
 * the non-Override versions fall through to the real OAuth store/config.
 * Callers that compose with a different auth source (e.g. daemon workers
 * using IPC auth) use the Override getters directly.
 */

import { isAtlasDev } from '../utils/atlasDev.js'
import { getOauthConfig } from '../constants/oauth.js'
import { getOAuthTokens } from '../utils/auth.js'

/** ATLAS_DEV-only dev override: ATLAS_BRIDGE_OAUTH_TOKEN, else undefined. */
export function getBridgeTokenOverride(): string | undefined {
  return (
    (isAtlasDev() && (process.env.ATLAS_BRIDGE_OAUTH_TOKEN)) ||
    undefined
  )
}

/** ATLAS_DEV-only dev override: ATLAS_BRIDGE_BASE_URL, else undefined. */
export function getBridgeBaseUrlOverride(): string | undefined {
  return (
    (isAtlasDev() && (process.env.ATLAS_BRIDGE_BASE_URL)) ||
    undefined
  )
}

/**
 * Access token for bridge API calls: dev override first, then the OAuth
 * keychain. Undefined means "not logged in".
 */
export function getBridgeAccessToken(): string | undefined {
  return getBridgeTokenOverride() ?? getOAuthTokens()?.accessToken
}

/**
 * Base URL for bridge API calls: dev override first, then the production
 * OAuth config. Always returns a URL.
 */
export function getBridgeBaseUrl(): string {
  return getBridgeBaseUrlOverride() ?? getOauthConfig().BASE_API_URL
}
