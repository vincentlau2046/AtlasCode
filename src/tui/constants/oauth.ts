// de-ANT: the ant-only local/staging OAuth config selection (gated on
// USER_TYPE === 'ant') and the FedStart ATLAS_CUSTOM_OAUTH_URL override
// (ALLOWED_OAUTH_BASE_URLS allowlist + OAUTH_FILE_SUFFIX) were removed. The
// CLI OAuth config is always the prod config here; USE_LOCAL_OAUTH /
// USE_STAGING_OAUTH are not read in this module.
//
// The refresh-token / API-key / roles / CLIENT_ID endpoints (TOKEN_URL /
// API_KEY_URL / ROLES_URL / CLIENT_ID) were removed with the 1P
// subscription chain (module ⑤) — this build authenticates via the
// OpenAI-protocol static key (OPENAI_AUTH_TOKEN / OPENAI_API_KEY), so only
// the 1P REST base, the MCP proxy, and the web origin remain. The OAuth scope
// constants (CLAUDE_AI_INFERENCE_SCOPE / USER_PROFILE_SCOPE) and the
// `anthropic-beta` header value (WIRE_OAUTH_BETA) now live in
// constants/wire.ts (WIRE frozen layer) — import them from there.

type OauthConfig = {
  // de-ant（0.1.73 C-2a 方案 A）：anthropic/claude URL 字面中性化（值 = undefined，
  // 消费点 env 显式化 OPENAI_BASE_URL / ATLAS_API_BASE_URL；env 缺 = 跳过/failed 提示）。
  // 域换前向缝登记（§8.74.28 ⑭，#200）：domain swap pending the gateway。
  BASE_API_URL: string | undefined
  CLAUDE_AI_ORIGIN: string | undefined
  MCP_PROXY_URL: string | undefined
  MCP_PROXY_PATH: string
}

// de-ANT: the browser authorize/success/redirect URL fields (and, with the
// subscription chain, TOKEN_URL / API_KEY_URL / ROLES_URL / CLIENT_ID) were
// removed. Only the 1P REST base + MCP proxy + web origin remain. Domain swap
// 前向缝登记（§8.74.28 ⑭，#200）：domain swap item (gateway).
const PROD_OAUTH_CONFIG: OauthConfig = {
  // de-ant（0.1.73 C-2a 方案 A）：三活 1P anthropic/claude URL 基址字面中性化
  // （BASE_API_URL / CLAUDE_AI_ORIGIN / MCP_PROXY_URL 现 undefined），消费点经 env
  // 显式化；MCP 远端车道（C-3e）+ sessionIngress（C-2b）= 登记不入境 0.1.74+（域换
  // 前向缝 ⑭ #200）。
  BASE_API_URL: undefined,
  CLAUDE_AI_ORIGIN: undefined,
  MCP_PROXY_URL: undefined,
  MCP_PROXY_PATH: '/v1/mcp/{server_id}',
}

/**
 * Client ID Metadata Document URL for MCP OAuth (CIMD / SEP-991).
 * When an MCP auth server advertises client_id_metadata_document_supported: true,
 * Atlas uses this URL as its client_id instead of Dynamic Client Registration.
 * de-ant（0.1.73 C-2a）：原 1P MCP OAuth CIMD client-metadata URL 字面中性化，
 * 值 = undefined（MCP OAuth 远端车道 C-3e，登记不入境 0.1.74+ 域换前向缝 ⑭ #200）。
 * Spec: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-00
 */
export const MCP_CLIENT_METADATA_URL: string | undefined = undefined

/**
 * Return the 1P-REST / OAuth endpoint config. The refresh-token / API-key /
 * roles / CLIENT_ID endpoints are gone (subscription chain removed, module ⑤);
 * this build authenticates via the OpenAI-protocol static key. Domain swap of
 * BASE_API_URL / CLAUDE_AI_ORIGIN：前向缝登记（§8.74.28 ⑭，#200）domain swap item (gateway).
 */
export function getOauthConfig(): OauthConfig {
  return PROD_OAUTH_CONFIG
}
