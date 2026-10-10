/**
 * AD-08（CC 2.1.113 TOP #12）：sandbox.network.deniedDomains 主机网络判定
 * 纯原语（denied-优先语义，工单 §1.2 改法 3）。
 *
 * 定位：getNetworkRestrictionConfig 消费端（seccomp/proxy 规则构建面，真
 * runtime 包 B6-func/D 波随 runtime 落地）的指定判定原语——host 规则构建
 * 须经本原语判定，不得自行做通配匹配（单一判定事实源）。
 *
 * 语义：
 * - denied 命中 → 'deny'（**denied 优先**：即使 allowedDomains 通配也命中，
 *   denied 命中即拒——对齐 allowManagedDomainsOnly 文档面「Denied domains
 *   are still respected from all sources」）；
 * - allowed 命中（无 denied 命中）→ 'allow'；
 * - 均未命中（或无 allowedDomains 列表）→ 'passthrough'（无域名级限制，
 *   归后端隔离面决定）。
 *
 * 零回归：deniedDomains 缺省/空数组 → 判定纯由 allowedDomains 驱动
 * （与接线前行为逐字恒等）。
 *
 * 域名匹配对齐 engine web matchDomain（host === domain 或子域感知）+
 * WebFetch(domain:*.suffix) 通配约定（前缀 `*.` 归一为后缀子域匹配）。
 */

/** host 命中域名模式（子域感知；`*.suffix` 通配形归一为 suffix 匹配）。 */
export function domainPatternMatches(
  host: string,
  pattern: string,
): boolean {
  const h = host.toLowerCase()
  let d = pattern.toLowerCase()
  // *.suffix 通配形 = 子域感知（WebFetch(domain:*.google.com) 约定）
  if (d.startsWith('*.')) d = d.slice(2)
  return h === d || h.endsWith(`.${d}`)
}

/** 主机网络判定结果（denied 优先）。 */
export type SandboxHostNetworkDecision = 'deny' | 'allow' | 'passthrough'

/**
 * 主机网络判定（denied 优先）：deniedDomains 命中即拒（即使 allowedDomains
 * 通配也命中）；否则 allowedDomains 命中放行；均未命中 passthrough。
 */
export function decideHostNetwork(
  host: string,
  network: {
    allowedDomains: string[]
    deniedDomains: string[]
  },
): SandboxHostNetworkDecision {
  // AD-08：denied 优先——命中即拒（允许面不能覆盖拒绝面）
  if (network.deniedDomains?.some(d => domainPatternMatches(host, d))) {
    return 'deny'
  }
  if (
    network.allowedDomains?.length &&
    network.allowedDomains.some(d => domainPatternMatches(host, d))
  ) {
    return 'allow'
  }
  return 'passthrough'
}
