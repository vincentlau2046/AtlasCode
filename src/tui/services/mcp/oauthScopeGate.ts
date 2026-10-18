// 0.1.76 (归整切片②): per-server oauth 块级 scope-gating 门控面。
//
// 信任单元 = per-server `oauth` 块整体（McpOAuthConfigSchema：clientId /
// callbackPort / authServerMetadataUrl / clientMetadataUrl / xaa）——单字段门控
// = 半门控假安全（0.1.74 4th-review 裁拒：劈裂同一配置块内 oauth 信任单元）。
// 本面只做整块门控：门控时全字段同缺席（不劈裂守卫 = 构造性成立），无 oauth
// 块 / trusted scope / allowlist 在场 = 零扰动恒等。
//
// scope 裁定（f4 2026-10-18 工单 §0 定案）：
//   untrusted = `project`（repo .mcp.json 提交值，repo 作者可控）+ 插件提供
//     （代码 scope `dynamic` 且 pluginSource 在场 = 插件溯源在场）；
//   trusted = `user` / `local`（操作者机器级配置）+ `enterprise`（managed）+
//     操作者面（--mcp-config = dynamic 无 pluginSource，属操作者面）→ 恒通过
//     （既有行为零变更恒等锚）。
//
// allowlist = 操作者 env `ATLAS_MCP_OAUTH_TRUSTED_SERVERS`（逗号分隔 server
// 名，trim + case-insensitive，对齐 0.1.74 CWE-178 Windows env 语义先例）。
// **settings 源不可种**：settings.env 合并经 managedEnv.ts 的
// withoutMcpOauthTrustedServersVars 剥离该 env（对齐 0.1.74
// withoutMcpOauthCimdVars 剥离纪律）——repo 可种的 settings 值不进 allowlist，
// 仅真 env（shell/CI）计数。
//
// 与 0.1.74 正交：allowlist 门控先于 CIMD env getter 优先级链生效——untrusted
// 块未 allowlist = getter 链整链不消费 oauth 块（合并面已剥离整块）。

import type {
  ConfigScope,
  McpHTTPServerConfig,
  McpSSEServerConfig,
  ScopedMcpServerConfig,
} from './types.js'

/**
 * 操作者 allowlist env 名（部署/操作者控制面；settings 源不计数）。
 */
export const MCP_OAUTH_TRUSTED_SERVERS_ENV = 'ATLAS_MCP_OAUTH_TRUSTED_SERVERS'

/**
 * 解析操作者 allowlist env 值：逗号分隔 server 名，trim + 丢空 + 小写归一
 * （case-insensitive，对齐 CWE-178）。纯函数（不读 process.env），单测直接
 * 钉解析面。
 */
export function parseMcpOauthTrustedServersEnv(
  raw: string | undefined | null,
): Set<string> {
  if (raw === undefined || raw === null) {
    return new Set()
  }
  const names = new Set<string>()
  for (const part of raw.split(',')) {
    const name = part.trim().toLowerCase()
    if (name !== '') {
      names.add(name)
    }
  }
  return names
}

/**
 * 操作者 allowlist，仅读真 env（部署/操作者控制面）。settings 源种值不计数：
 * settings.env 合并在 managedEnv.ts 剥离该 env 名，repo 种值到不了这里。
 */
export function getMcpOauthTrustedServers(): Set<string> {
  return parseMcpOauthTrustedServersEnv(
    process.env[MCP_OAUTH_TRUSTED_SERVERS_ENV],
  )
}

/**
 * untrusted scope 判定：repo 提交值（project）或插件提供（dynamic +
 * pluginSource 在场）。`dynamic` 无 pluginSource = 操作者 --mcp-config 面
 * （操作者输入，非 repo/插件种值）→ trusted，零变更。
 */
export function isMcpOauthUntrustedScope(
  scope: ConfigScope | undefined,
  pluginSource?: string,
): boolean {
  if (scope === 'project') {
    return true
  }
  return scope === 'dynamic' && pluginSource !== undefined
}

/**
 * 块级门控谓词：untrusted scope 且 server 名不在操作者 allowlist → 该
 * server 的 oauth 块整体门控（视为缺席）。trusted scope / allowlist 在场
 * 恒通过。allowlist 匹配 case-insensitive（env 值解析时已小写归一）。
 */
export function isMcpOauthBlockGated(
  serverName: string,
  scope: ConfigScope | undefined,
  pluginSource?: string,
  allowlist: Set<string> = getMcpOauthTrustedServers(),
): boolean {
  if (!isMcpOauthUntrustedScope(scope, pluginSource)) {
    return false
  }
  return !allowlist.has(serverName.toLowerCase())
}

/**
 * 合并面门控应用：untrusted scope 且门控中的 server，oauth 块整体剥离
 * （全字段同缺席——不劈裂守卫构造性成立）+ `oauthGated` 标记（供显示面
 * 显形门控态）。trusted / allowlist 在场 / 无 oauth 块 / 非 sse-http 型
 * server 原样返回（零扰动恒等锚）。
 */
export function applyMcpOauthScopeGate(
  serverName: string,
  server: ScopedMcpServerConfig,
): ScopedMcpServerConfig {
  if (server.type !== 'sse' && server.type !== 'http') {
    return server
  }
  const remote = server as McpSSEServerConfig | McpHTTPServerConfig
  if (remote.oauth === undefined) {
    return server
  }
  if (!isMcpOauthBlockGated(serverName, server.scope, server.pluginSource)) {
    return server
  }
  const { oauth: _gatedOAuth, ...rest } = remote
  void _gatedOAuth
  return { ...rest, oauthGated: true } as ScopedMcpServerConfig
}

/**
 * 显示面门控态谓词：合并面已剥离（oauthGated 标记在场）或原始（未经合并面）
 * 配置仍带会被门控剥离的 oauth 块 → 门控态。显示面（McpAuthTool OAuth 行 /
 * TUI 状态行 / /mcp CLI 行）用它显形「untrusted scope oauth 块须操作者
 * allowlist」；trusted 面恒 false（显示零变更）。
 */
export function isMcpOauthDisplayGated(
  serverName: string,
  config: {
    scope?: ConfigScope
    pluginSource?: string
    oauth?: unknown
    oauthGated?: boolean
  },
): boolean {
  if (config.oauthGated === true) {
    return true
  }
  if (config.oauth === undefined || config.oauth === null) {
    return false
  }
  return isMcpOauthBlockGated(
    serverName,
    config.scope,
    config.pluginSource,
  )
}

/**
 * 门控可行动错误文案（server 仅 oauth 可鉴 = 连接/流失败附操作者指引；
 * trusted 面 / allowlist 在场永不见此文案）。
 */
export function mcpOauthGatedMessage(serverName: string): string {
  return (
    `MCP server "${serverName}" 的 oauth 块为 untrusted scope（project/plugin 来源），` +
    `操作者 allowlist 后启用：将 server 名加入 env ${MCP_OAUTH_TRUSTED_SERVERS_ENV}（逗号分隔）后重启。` +
    `当前该 oauth 块整体视为缺席，不发起 OAuth 流。`
  )
}
