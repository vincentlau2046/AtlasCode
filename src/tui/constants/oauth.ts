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
// the 1P REST base and the web origin remain (the 1P MCP proxy was removed
// with the hosted-connector lane in 0.1.74 C-3e; remote MCP is generic
// config-driven sse/http/ws). The OAuth scope constants
// (CLAUDE_AI_INFERENCE_SCOPE / USER_PROFILE_SCOPE) and the
// `anthropic-beta` header value (WIRE_OAUTH_BETA) now live in
// constants/wire.ts (WIRE frozen layer) — import them from there.

type OauthConfig = {
  // de-ant（0.1.73 C-2a 方案 A）：anthropic/claude URL 字面中性化（值 = undefined，
  // 消费点 env 显式化 OPENAI_BASE_URL / ATLAS_API_BASE_URL；env 缺 = 跳过/failed 提示）。
  // 域换前向缝登记（§8.74.28 ⑭，#200）：domain swap pending the gateway。
  //
  // 0.1.74（C-3e 销项）：MCP 代理基址/路径字段与 CIMD 元数据 URL 常量已删 —— 1P
  // hosted-connector 代理车道随 token 车道清零（0.1.72）+ 基址中性化（0.1.73）双死而
  // 裁。MCP 远端连接 = 通用配置驱动的 sse/http/ws（url + headers + per-server oauth），
  // 与任何 gateway 解耦。
  BASE_API_URL: string | undefined
  CLAUDE_AI_ORIGIN: string | undefined
}

// de-ANT: the browser authorize/success/redirect URL fields (and, with the
// subscription chain, TOKEN_URL / API_KEY_URL / ROLES_URL / CLIENT_ID) were
// removed. Only the 1P REST base + web origin remain. Domain swap
// 前向缝登记（§8.74.28 ⑭，#200）：domain swap item (gateway).
const PROD_OAUTH_CONFIG: OauthConfig = {
  // de-ant（0.1.73 C-2a 方案 A）：1P 基址字面中性化（BASE_API_URL / CLAUDE_AI_ORIGIN
  // 现 undefined），消费点经 env 显式化；MCP 远端车道 0.1.74 已通用化销项（C-3e），
  // sessionIngress（C-2b）仍登记不入境 0.1.74+（域换前向缝 ⑭ #200）。
  BASE_API_URL: undefined,
  CLAUDE_AI_ORIGIN: undefined,
}

/**
 * Return the 1P-REST / OAuth endpoint config. The refresh-token / API-key /
 * roles / CLIENT_ID endpoints are gone (subscription chain removed, module ⑤);
 * this build authenticates via the OpenAI-protocol static key. Domain swap of
 * BASE_API_URL / CLAUDE_AI_ORIGIN：前向缝登记（§8.74.28 ⑭，#200）domain swap item (gateway).
 */
export function getOauthConfig(): OauthConfig {
  return PROD_OAUTH_CONFIG
}
