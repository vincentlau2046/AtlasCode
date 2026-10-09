/**
 * Telemetry for plugin/marketplace fetches that hit the network.
 *
 * Added for inc-5046 (GitHub complained about claude-plugins-official load).
 * Before this, fetch operations only had logForDebugging — no way to measure
 * actual network volume. This surfaces what's hitting GitHub vs GCS vs
 * user-hosted so we can see the GCS migration take effect and catch future
 * hot-path regressions before GitHub emails us again.
 *
 * Volume: these fire at startup (install-counts 24h-TTL)
 * and on explicit user action (install/update). NOT per-interaction. Similar
 * envelope to atlas_binary_download_*.
 *
 * W-opt 可信波 S5（#299）可信清册观察项：KNOWN_PUBLIC_HOSTS = 遥测分类 host
 * 桶白名单（仅对 fetch 来源主机名分类，非下载/数据出境通道；遥测 sink 已
 * 移除，无传输面）。'storage.googleapis.com' 条目 = GCS 遗留桶分类项，
 * 在 S2「GCS 1P 下载体裁除」范围外（S2 裁 = nativeInstaller 下载体，非
 * 分类白名单）→ 登记观察项，零行为变化（e2e gate-045 相邻观察项 1 裁入）。
 */

import { OFFICIAL_MARKETPLACE_NAME } from './officialMarketplace.js'

export type PluginFetchSource =
  | 'install_counts'
  | 'marketplace_clone'
  | 'marketplace_pull'
  | 'marketplace_url'
  | 'plugin_clone'
  | 'mcpb'

export type PluginFetchOutcome = 'success' | 'failure' | 'cache_hit'

// Allowlist of public hosts we report by name. Anything else (enterprise
// git, self-hosted, internal) is bucketed as 'other' — we don't want
// internal hostnames (git.mycorp.internal) landing in telemetry. Bounded
// cardinality also keeps the dashboard host-breakdown tractable.
const KNOWN_PUBLIC_HOSTS = new Set([
  'github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'gist.githubusercontent.com',
  'gitlab.com',
  'bitbucket.org',
  'codeberg.org',
  'dev.azure.com',
  'ssh.dev.azure.com',
  'storage.googleapis.com', // GCS legacy distribution bucket (classification entry only)
])

/**
 * Extract hostname from a URL or git spec and bucket to the allowlist.
 * Handles `https://host/...`, `git@host:path`, `ssh://host/...`.
 * Returns a known public host, 'other' (parseable but not allowlisted —
 * don't leak private hostnames), or 'unknown' (unparseable / local path).
 */
function extractHost(urlOrSpec: string): string {
  let host: string
  const scpMatch = /^[^@/]+@([^:/]+):/.exec(urlOrSpec)
  if (scpMatch) {
    host = scpMatch[1]!
  } else {
    try {
      host = new URL(urlOrSpec).hostname
    } catch {
      return 'unknown'
    }
  }
  const normalized = host.toLowerCase()
  return KNOWN_PUBLIC_HOSTS.has(normalized) ? normalized : 'other'
}

/**
 * True if the URL/spec points at anthropics/claude-plugins-official — the
 * repo GitHub complained about. Lets the dashboard separate "our problem"
 * traffic from user-configured marketplaces.
 */
function isOfficialRepo(urlOrSpec: string): boolean {
  return urlOrSpec.includes(`anthropics/${OFFICIAL_MARKETPLACE_NAME}`)
}

export function logPluginFetch(
  source: PluginFetchSource,
  urlOrSpec: string | undefined,
  outcome: PluginFetchOutcome,
  durationMs: number,
  errorKind?: string,
): void {
  // String values are bounded enums / hostname-only — no code, no paths,
  // no raw error messages. Same privacy envelope as atlas_web_fetch_host.
}

/**
 * Classify an error into a stable bucket for the error_kind field. Keeps
 * cardinality bounded — raw error messages would explode dashboard grouping.
 *
 * Handles both axios Error objects (Node.js error codes like ENOTFOUND) and
 * git stderr strings (human phrases like "Could not resolve host"). DNS
 * checked BEFORE timeout because gitClone's error enhancement at
 * marketplaceManager.ts:~950 rewrites DNS failures to include the word
 * "timeout" — ordering the other way would misclassify git DNS as timeout.
 */
export function classifyFetchError(error: unknown): string {
  const msg = String((error as { message?: unknown })?.message ?? error)
  if (
    /ENOTFOUND|ECONNREFUSED|EAI_AGAIN|Could not resolve host|Connection refused/i.test(
      msg,
    )
  ) {
    return 'dns_or_refused'
  }
  if (/ETIMEDOUT|timed out|timeout/i.test(msg)) return 'timeout'
  if (
    /ECONNRESET|socket hang up|Connection reset by peer|remote end hung up/i.test(
      msg,
    )
  ) {
    return 'conn_reset'
  }
  if (/403|401|authentication|permission denied/i.test(msg)) return 'auth'
  if (/404|not found|repository not found/i.test(msg)) return 'not_found'
  if (/certificate|SSL|TLS|unable to get local issuer/i.test(msg)) return 'tls'
  // Schema validation throws "Invalid response format" (install_counts) —
  // distinguish from true unknowns so the dashboard can
  // see "server sent garbage" separately.
  if (/Invalid response format|Invalid marketplace schema/i.test(msg)) {
    return 'invalid_schema'
  }
  return 'other'
}
