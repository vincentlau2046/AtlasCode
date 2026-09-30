// de-ANT: the ant-only local/staging OAuth config selection (gated on
// USER_TYPE === 'ant') and the FedStart ATLAS_CUSTOM_OAUTH_URL override
// (ALLOWED_OAUTH_BASE_URLS allowlist + OAUTH_FILE_SUFFIX) were removed. The
// CLI OAuth config is always the prod config here; USE_LOCAL_OAUTH /
// USE_STAGING_OAUTH are not read in this module.
//
// The refresh-token / API-key / roles / CLIENT_ID endpoints (TOKEN_URL /
// API_KEY_URL / ROLES_URL / CLIENT_ID) were removed with the claude.ai
// subscription chain (module ⑤) — this build authenticates via the
// OpenAI-protocol static key (OPENAI_AUTH_TOKEN / OPENAI_API_KEY), so only
// the 1P REST base, the MCP proxy, and the web origin remain. The OAuth scope
// constants (CLAUDE_AI_INFERENCE_SCOPE / USER_PROFILE_SCOPE) and the
// `anthropic-beta` header value (WIRE_OAUTH_BETA) now live in
// constants/wire.ts (WIRE frozen layer) — import them from there.

type OauthConfig = {
  BASE_API_URL: string
  /**
   * The claude.ai web origin. Retained for live consumers (MCP connectors,
   * remote-setup deep links).
   * 前向缝登记（§8.74.28 ⑭，#200）：domain swap pending the IFF gateway。
   */
  CLAUDE_AI_ORIGIN: string
  MCP_PROXY_URL: string
  MCP_PROXY_PATH: string
}

// de-ANT: the browser authorize/success/redirect URL fields (and, with the
// subscription chain, TOKEN_URL / API_KEY_URL / ROLES_URL / CLIENT_ID) were
// removed. Only the 1P REST base + MCP proxy + web origin remain. Domain swap
// 前向缝登记（§8.74.28 ⑭，#200）：domain swap item (IFF gateway).
const PROD_OAUTH_CONFIG: OauthConfig = {
  BASE_API_URL: 'https://api.anthropic.com',
  CLAUDE_AI_ORIGIN: 'https://claude.ai',
  MCP_PROXY_URL: 'https://mcp-proxy.anthropic.com',
  MCP_PROXY_PATH: '/v1/mcp/{server_id}',
}

/**
 * Client ID Metadata Document URL for MCP OAuth (CIMD / SEP-991).
 * When an MCP auth server advertises client_id_metadata_document_supported: true,
 * Atlas uses this URL as its client_id instead of Dynamic Client Registration.
 * The URL must point to a JSON document hosted by Anthropic.
 * See: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-00
 */
export const MCP_CLIENT_METADATA_URL =
  'https://claude.ai/oauth/claude-code-client-metadata'

/**
 * Return the 1P-REST / OAuth endpoint config. The refresh-token / API-key /
 * roles / CLIENT_ID endpoints are gone (subscription chain removed, module ⑤);
 * this build authenticates via the OpenAI-protocol static key. Domain swap of
 * BASE_API_URL / CLAUDE_AI_ORIGIN：前向缝登记（§8.74.28 ⑭，#200）domain swap item (IFF gateway).
 */
export function getOauthConfig(): OauthConfig {
  return PROD_OAUTH_CONFIG
}
