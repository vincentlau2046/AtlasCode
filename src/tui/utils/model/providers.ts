/**
 * de-ANT: 原 host === 'api.anthropic.com' 判定已废弃（国内 IFF 网关不以
 * Anthropic wire 协议对外服务，该 host 在 OpenAI 协议下无意义）。
 * 现语义：未设置 OPENAI_BASE_URL = 走默认一方 IFF 网关（true）；
 * 显式设置 = 用户自定义端点（vLLM 等，视为非一方，false）。
 * [ATLAS-HOLD] IFF 网关国内域名定案后，可在此按网关 host 精细判定。
 */
export function isFirstPartyGatewayUrl(): boolean {
  return !(process.env.OPENAI_BASE_URL)
}
