/**
 * de-ANT: 原 host === 'api.anthropic.com' 判定已废弃（国内网关不以
 * Anthropic wire 协议对外服务，该 host 在 OpenAI 协议下无意义）。
 * 现语义：未设置 OPENAI_BASE_URL = 走默认网关（true）；
 * 显式设置 = 用户自定义端点（vLLM 等，视为自定义端点，false）。
 * 前向缝登记（§8.74.28 ⑭，#201 判定重锚） 网关国内域名定案后，可在此按网关 host 精细判定。
 * 0.1.78 W-A (F-2 de-ANT)：isFirstPartyGatewayUrl → isDefaultGateway（纯改名去味，逻辑保持）。
 */
export function isDefaultGateway(): boolean {
  return !(process.env.OPENAI_BASE_URL)
}
