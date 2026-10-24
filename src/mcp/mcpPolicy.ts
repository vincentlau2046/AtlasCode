/**
 * mcp 域 — 企业策略过滤（0.1.81 V3-2 K2 工单 #6/#7：策略先行——被封
 * server 报 failed/blocked 不接触连接生命周期）。
 *
 * 旧仓来源（tui/services/mcp/config.ts L340-507 isMcpServerDenied /
 * isMcpServerAllowedByPolicy / filterMcpServersByPolicy 语义保真转写）：
 *   - **deny 绝对优先** → allowlist undefined = 全放行 → [] = 全封 →
 *     hasCommandEntries 时 stdio 必须匹配 command 条目（否则回落 name 条目）
 *     → hasUrlEntries 时 remote 必须匹配 URL 条目（否则回落 name 条目）→
 *     无 config/未知型只查 name 条目。
 *   - 三型对象条目 = {serverName} / {serverCommand: string[]} / {serverUrl}
 *     （url 支持 `*` wildcard）。
 *
 * **engine 面超集裁定（Main，随工单补记）**：TUI 的 isMcpServer*Entry 守卫
 * 是 no-op any-stub（tui/utils/settings/types.ts L3-5，运行时恒 truthy 但
 * 纯字符串条目在字段访问甄别下匹配不到任何东西）；engine 面用**真守卫**
 * 且**额外接受纯字符串条目视为 name 条目**——对齐用户可见文档
 * `allowedMcpServers: ["name"]` 惯例。fail-closed 方向不放宽：denylist
 * 字符串条目 = 比 TUI 更严（TUI 恒不匹配）；allowlist 字符串条目 = 管理
 * 员明示意。TUI stub 不修（纯 type-safety 零运行时 delta，本波域外）。
 *
 * 依赖面：零（纯叶子——策略输入经 McpPolicyInput 结构注入或注入窗，
 * settings 提取面 getMcpPolicyFromSettings 接受 unknown，不 import engine；
 * 车道侧〔compose/print/handlers〕自行做 `getMcpPolicyInput() ??
 * getMcpPolicyFromSettings(getSettingsWithErrors().settings)` 解析）。
 */
import type { McpStdioServerConfig, ScopedMcpServerConfig } from './types'

// ── 策略输入型 + settings 提取 + 注入窗 ───────────────────────────────

/**
 * 企业策略输入（allowedMcpServers / deniedMcpServers 原始值；条目形见
 * 头注。unknown 透传 = engine settings 型面 z.any().optional() 同权，
 * 归一在 normalizePolicyEntries）。
 */
export type McpPolicyInput = {
  allowedMcpServers?: unknown
  deniedMcpServers?: unknown
}

/**
 * 从 settings 对象结构提取策略输入（settings.mcpServers 同僚键）。
 * 非结构输入（null / undefined / 非 object）→ {}（零限制，fail-soft）。
 * 零 engine import：调用方传 getSettingsWithErrors().settings（merged
 * settings 含 policySettings 支——managed-settings.json 的
 * allowedMcpServers/deniedMcpServers 进 merged 面）。
 */
export function getMcpPolicyFromSettings(settings: unknown): McpPolicyInput {
  if (typeof settings !== 'object' || settings === null) return {}
  const rec = settings as Record<string, unknown>
  return {
    ...(rec.allowedMcpServers !== undefined
      ? { allowedMcpServers: rec.allowedMcpServers }
      : {}),
    ...(rec.deniedMcpServers !== undefined
      ? { deniedMcpServers: rec.deniedMcpServers }
      : {}),
  }
}

// 注入窗（setMcpDiscoveryInput 先例同型：车道取 policy =
// getMcpPolicyInput() ?? getMcpPolicyFromSettings(settings)；测试经窗
// 注入免真 settings 读取，未注册 = null = 车道回落 settings 面）。
let policyInput: McpPolicyInput | null = null

/** 注册策略输入（测试 fake 注入；重复注册 = 后者胜出）。 */
export function setMcpPolicyInput(input: McpPolicyInput | null): void {
  policyInput = input
}

/** 取策略输入（未注册 = null）。 */
export function getMcpPolicyInput(): McpPolicyInput | null {
  return policyInput
}

/** 测试面：清注入窗。 */
export function resetMcpPolicyInput(): void {
  policyInput = null
}

// ── 条目归一（真守卫 + 纯字符串超集）─────────────────────────────────

type PolicyEntry =
  | { kind: 'name'; value: string }
  | { kind: 'command'; value: string[] }
  | { kind: 'url'; value: string }

/**
 * 条目归一：纯字符串 → name 条目（engine 超集裁定，见头注）；
 * {serverName: string} → name；{serverCommand: string[]} → command；
 * {serverUrl: string} → url；其余（非数组输入 / 非法条目）静默丢弃
 * （fail-soft，TUI 守卫面同权不抛）。
 */
function normalizePolicyEntries(raw: unknown): PolicyEntry[] {
  if (!Array.isArray(raw)) return []
  const out: PolicyEntry[] = []
  for (const entry of raw) {
    if (typeof entry === 'string') {
      out.push({ kind: 'name', value: entry })
      continue
    }
    if (typeof entry !== 'object' || entry === null) continue
    const rec = entry as Record<string, unknown>
    if (typeof rec.serverName === 'string') {
      out.push({ kind: 'name', value: rec.serverName })
    } else if (
      Array.isArray(rec.serverCommand) &&
      rec.serverCommand.every(c => typeof c === 'string')
    ) {
      out.push({ kind: 'command', value: rec.serverCommand as string[] })
    } else if (typeof rec.serverUrl === 'string') {
      out.push({ kind: 'url', value: rec.serverUrl })
    }
  }
  return out
}

// ── 匹配 helper（TUI config.ts L136-161 / L319-331 逐字转写）─────────

/** stdio command 数组（非 stdio → null）。 */
function getServerCommandArray(config: ScopedMcpServerConfig): string[] | null {
  // Non-stdio servers don't have commands
  const t = (config as { type?: string }).type
  if (t !== undefined && t !== 'stdio') {
    return null
  }
  const stdioConfig = config as McpStdioServerConfig
  return [stdioConfig.command, ...(stdioConfig.args ?? [])]
}

/** command 数组精确等值。 */
function commandArraysMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  return a.every((val, idx) => val === b[idx])
}

/** remote URL（stdio 无 → null）。 */
function getServerUrl(config: ScopedMcpServerConfig): string | null {
  return 'url' in config ? config.url : null
}

/** URL pattern `*` wildcard → RegExp（TUI urlPatternToRegex 逐字）。 */
function urlPatternToRegex(pattern: string): RegExp {
  // Escape regex special characters except *
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  // Replace * with regex equivalent (match any characters)
  const regexStr = escaped.replace(/\*/g, '.*')
  return new RegExp(`^${regexStr}$`)
}

function urlMatchesPattern(url: string, pattern: string): boolean {
  return urlPatternToRegex(pattern).test(url)
}

// ── 判定（TUI isMcpServerDenied / isMcpServerAllowedByPolicy 转写）────

function isDeniedByEntries(
  serverName: string,
  config: ScopedMcpServerConfig,
  entries: PolicyEntry[],
): boolean {
  // name 条目判定（含纯字符串超集）
  for (const entry of entries) {
    if (entry.kind === 'name' && entry.value === serverName) return true
  }
  // command 条目判定（stdio only）
  const serverCommand = getServerCommandArray(config)
  if (serverCommand) {
    for (const entry of entries) {
      if (
        entry.kind === 'command' &&
        commandArraysMatch(entry.value, serverCommand)
      ) {
        return true
      }
    }
  }
  // url 条目判定（remote only）
  const serverUrl = getServerUrl(config)
  if (serverUrl) {
    for (const entry of entries) {
      if (entry.kind === 'url' && urlMatchesPattern(serverUrl, entry.value)) {
        return true
      }
    }
  }
  return false
}

function isAllowedByEntries(
  serverName: string,
  config: ScopedMcpServerConfig,
  entries: PolicyEntry[],
): boolean {
  const hasCommandEntries = entries.some(e => e.kind === 'command')
  const hasUrlEntries = entries.some(e => e.kind === 'url')

  const serverCommand = getServerCommandArray(config)
  const serverUrl = getServerUrl(config)

  if (serverCommand) {
    // stdio server：有 command 条目则必须匹配之，否则回落 name 条目
    if (hasCommandEntries) {
      return entries.some(
        e =>
          e.kind === 'command' && commandArraysMatch(e.value, serverCommand),
      )
    }
    return entries.some(e => e.kind === 'name' && e.value === serverName)
  }
  if (serverUrl) {
    // remote server：有 url 条目则必须匹配之，否则回落 name 条目
    if (hasUrlEntries) {
      return entries.some(
        e => e.kind === 'url' && urlMatchesPattern(serverUrl, e.value),
      )
    }
    return entries.some(e => e.kind === 'name' && e.value === serverName)
  }
  // 未知型：只查 name 条目
  return entries.some(e => e.kind === 'name' && e.value === serverName)
}

/**
 * 单 server 策略判定（车道消费面：checkMcpServerHealth 等）。
 * policy 缺省回落注入窗（getMcpPolicyInput；未注册 = 零限制）。
 * 返回 { blocked, reason? }：reason 供 markBlocked error 文案。
 */
export function checkMcpServerPolicy(
  serverName: string,
  config: ScopedMcpServerConfig,
  policy?: McpPolicyInput | null,
): { blocked: boolean; reason?: string } {
  const p = policy ?? getMcpPolicyInput() ?? {}
  // denylist 绝对优先
  const denied = normalizePolicyEntries(p.deniedMcpServers)
  if (isDeniedByEntries(serverName, config, denied)) {
    return { blocked: true, reason: 'denied by policy (deniedMcpServers)' }
  }
  // allowlist undefined / 非数组 = 全放行（TUI `!settings.allowedMcpServers`
  // 语义）；[] = 全封
  if (!Array.isArray(p.allowedMcpServers)) return { blocked: false }
  if (p.allowedMcpServers.length === 0) {
    return {
      blocked: true,
      reason:
        'not in allowedMcpServers allowlist (empty allowlist blocks all servers)',
    }
  }
  const allowed = normalizePolicyEntries(p.allowedMcpServers)
  if (isAllowedByEntries(serverName, config, allowed)) {
    return { blocked: false }
  }
  return { blocked: true, reason: 'not in allowedMcpServers allowlist' }
}

/**
 * 批量过滤（车道消费面：initMcpConnections / connectMcpStartup）。
 * policy 缺省回落注入窗。blocked 携带 reason（markBlocked error 文案面）。
 * TUI 版的 sdk 型豁免不随迁——engine 4 型面无 sdk 型（G-3 ⑩ 裁型后）。
 */
export function filterMcpServersByPolicy(
  configs: Record<string, ScopedMcpServerConfig>,
  policy?: McpPolicyInput | null,
): {
  allowed: Record<string, ScopedMcpServerConfig>
  blocked: Array<{ name: string; reason: string }>
} {
  const allowed: Record<string, ScopedMcpServerConfig> = {}
  const blocked: Array<{ name: string; reason: string }> = []
  for (const [name, config] of Object.entries(configs)) {
    const verdict = checkMcpServerPolicy(name, config, policy)
    if (verdict.blocked) {
      blocked.push({ name, reason: verdict.reason ?? 'blocked by policy' })
    } else {
      allowed[name] = config
    }
  }
  return { allowed, blocked }
}
