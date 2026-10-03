/**
 * Layer-3 refresh primitive: swap active plugin components in the running session.
 *
 * Three-layer model (see reconciler.ts for Layer-2):
 * - Layer 1: intent (settings)
 * - Layer 2: materialization (~/.atlas/plugins/) — reconcileMarketplaces()
 * - Layer 3: active components (AppState) — this file
 *
 * Called from:
 * - /reload-plugins command (interactive, user-initiated)
 * - print.ts refreshPluginState() (headless, auto before first query with SYNC_PLUGIN_INSTALL)
 * - performBackgroundPluginInstallations() (background, auto after new marketplace install)
 *
 * NOT called from:
 * - useManagePlugins needsRefresh effect — interactive mode shows a notification;
 *   user explicitly runs /reload-plugins (PR 5c). Residual needsRefresh setters:
 *   performStartupChecks (startup-stale signal) + PluginInstallationManager
 *   (background auto-update).
 * - /plugin menu — 2026-10-04 issule 工单 Task C 起改为轻量自动激活
 *   (refreshActivePluginsLightweight，本文件下方)，不再设 needsRefresh。
 */

import { getOriginalCwd } from 'src/bootstrap'
import type { Command } from '../../commands.js'
import { reinitializeLspServerManager } from '../../services/lsp/manager.js'
import type { AppState } from '../../state/AppState.js'
import type { AgentDefinitionsResult } from '../../tools/AgentTool/loadAgentsDir.js'
import { getAgentDefinitionsWithOverrides } from '../../tools/AgentTool/loadAgentsDir.js'
import type { PluginError } from '../../types/plugin.js'
import { logForDebugging } from '../debug.js'
import { errorMessage } from '../errors.js'
import { logError } from '../log.js'
import { clearAllCaches } from './cacheUtils.js'
import { getPluginCommands } from './loadPluginCommands.js'
import { loadPluginHooks } from './loadPluginHooks.js'
import { loadPluginLspServers } from './lspPluginIntegration.js'
import { loadPluginMcpServers } from './mcpPluginIntegration.js'
import { clearPluginCacheExclusions } from './orphanedPluginFilter.js'
import { loadAllPlugins } from './pluginLoader.js'

type SetAppState = (updater: (prev: AppState) => AppState) => void

export type RefreshActivePluginsResult = {
  enabled_count: number
  disabled_count: number
  command_count: number
  agent_count: number
  hook_count: number
  mcp_count: number
  /** LSP servers provided by enabled plugins. reinitializeLspServerManager()
   * is called unconditionally so the manager picks these up (no-op if
   * manager was never initialized). */
  lsp_count: number
  error_count: number
  /** The refreshed agent definitions, for callers (e.g. print.ts) that also
   * maintain a local mutable reference outside AppState. */
  agentDefinitions: AgentDefinitionsResult
  /** The refreshed plugin commands, same rationale as agentDefinitions. */
  pluginCommands: Command[]
}

/**
 * Refresh all active plugin components: commands, agents, hooks, MCP-reconnect
 * trigger, AppState plugin arrays. Clears ALL plugin caches (unlike the old
 * needsRefresh path which only cleared loadAllPlugins and returned stale data
 * from downstream memoized loaders).
 *
 * Consumes plugins.needsRefresh (sets to false).
 * Increments mcp.pluginReconnectKey so useManageMCPConnections effects re-run
 * and pick up new plugin MCP servers.
 *
 * LSP: if plugins now contribute LSP servers, reinitializeLspServerManager()
 * re-reads config. Servers are lazy-started so this is just config parsing.
 */
export async function refreshActivePlugins(
  setAppState: SetAppState,
): Promise<RefreshActivePluginsResult> {
  logForDebugging('refreshActivePlugins: clearing all plugin caches')
  clearAllCaches()
  // Orphan exclusions are session-frozen by default, but /reload-plugins is
  // an explicit "disk changed, re-read it" signal — recompute them too.
  clearPluginCacheExclusions()

  // Sequence the full load before cache-only consumers. Before #23693 all
  // three shared loadAllPlugins()'s memoize promise so Promise.all was a
  // no-op race. After #23693 getPluginCommands/getAgentDefinitions call
  // loadAllPluginsCacheOnly (separate memoize) — racing them means they
  // read installed_plugins.json before loadAllPlugins() has cloned+cached
  // the plugin, returning plugin-cache-miss. loadAllPlugins warms the
  // cache-only memoize on completion, so the awaits below are ~free.
  const pluginResult = await loadAllPlugins()
  const [pluginCommands, agentDefinitions] = await Promise.all([
    getPluginCommands(),
    getAgentDefinitionsWithOverrides(getOriginalCwd()),
  ])

  const { enabled, disabled, errors } = pluginResult

  // Populate mcpServers/lspServers on each enabled plugin. These are lazy
  // cache slots NOT filled by loadAllPlugins() — they're written later by
  // extractMcpServersFromPlugins/getPluginLspServers, which races with this.
  // Loading here gives accurate metrics AND warms the cache slots so the MCP
  // connection manager (triggered by pluginReconnectKey bump) sees the servers
  // without re-parsing manifests. Errors are pushed to the shared errors array.
  const [mcpCounts, lspCounts] = await Promise.all([
    Promise.all(
      enabled.map(async p => {
        if (p.mcpServers) return Object.keys(p.mcpServers).length
        const servers = await loadPluginMcpServers(p, errors)
        if (servers) p.mcpServers = servers
        return servers ? Object.keys(servers).length : 0
      }),
    ),
    Promise.all(
      enabled.map(async p => {
        if (p.lspServers) return Object.keys(p.lspServers).length
        const servers = await loadPluginLspServers(p, errors)
        if (servers) p.lspServers = servers
        return servers ? Object.keys(servers).length : 0
      }),
    ),
  ])
  const mcp_count = mcpCounts.reduce((sum, n) => sum + n, 0)
  const lsp_count = lspCounts.reduce((sum, n) => sum + n, 0)

  setAppState(prev => ({
    ...prev,
    plugins: {
      ...prev.plugins,
      enabled,
      disabled,
      commands: pluginCommands,
      errors: mergePluginErrors(prev.plugins.errors, errors),
      needsRefresh: false,
    },
    agentDefinitions,
    mcp: {
      ...prev.mcp,
      pluginReconnectKey: prev.mcp.pluginReconnectKey + 1,
    },
  }))

  // Re-initialize LSP manager so newly-loaded plugin LSP servers are picked
  // up. No-op if LSP was never initialized (headless subcommand path).
  // Unconditional so removing the last LSP plugin also clears stale config.
  // Fixes issue #15521: LSP manager previously read a stale memoized
  // loadAllPlugins() result from before marketplaces were reconciled.
  reinitializeLspServerManager()

  // clearAllCaches() prunes removed-plugin hooks; this does the FULL swap
  // (adds hooks from newly-enabled plugins too). Catching here so
  // hook_load_failed can feed error_count; a failure doesn't lose the
  // plugin/command/agent data above (hooks go to STATE.registeredHooks, not
  // AppState).
  let hook_load_failed = false
  try {
    await loadPluginHooks()
  } catch (e) {
    hook_load_failed = true
    logError(e)
    logForDebugging(
      `refreshActivePlugins: loadPluginHooks failed: ${errorMessage(e)}`,
    )
  }

  const hook_count = enabled.reduce((sum, p) => {
    if (!p.hooksConfig) return sum
    return (
      sum +
      Object.values(p.hooksConfig as Record<string, any>).reduce(
        (s, matchers) =>
          s + (matchers?.reduce((h, m) => h + m.hooks.length, 0) ?? 0),
        0,
      )
    )
  }, 0)

  logForDebugging(
    `refreshActivePlugins: ${enabled.length} enabled, ${pluginCommands.length} commands, ${agentDefinitions.allAgents.length} agents, ${hook_count} hooks, ${mcp_count} MCP, ${lsp_count} LSP`,
  )

  return {
    enabled_count: enabled.length,
    disabled_count: disabled.length,
    command_count: pluginCommands.length,
    agent_count: agentDefinitions.allAgents.length,
    hook_count,
    mcp_count,
    lsp_count,
    error_count: errors.length + (hook_load_failed ? 1 : 0),
    agentDefinitions,
    pluginCommands,
  }
}

export type RefreshActivePluginsLightweightResult = {
  enabled_count: number
  disabled_count: number
  command_count: number
  agent_count: number
  error_count: number
  /** The refreshed agent definitions (same rationale as the full refresh). */
  agentDefinitions: AgentDefinitionsResult
  /** The refreshed plugin commands (same rationale as the full refresh). */
  pluginCommands: Command[]
}

/**
 * Lightweight Layer-3 activation: swap the plugin DATA PLANE in AppState
 * (enabled/disabled/commands/errors + agentDefinitions + needsRefresh:false)
 * WITHOUT the full-refresh side effects:
 * - no mcp.pluginReconnectKey bump (new plugin MCP servers don't connect)
 * - no reinitializeLspServerManager() (plugin LSP servers not picked up)
 * - no loadPluginHooks() (new plugin hooks not registered)
 * - no MCP/LSP manifest warmup (loadPluginMcpServers/loadPluginLspServers)
 *
 * 2026-10-04 issule 工单 Task C：interactive /plugin 菜单（install /
 * enable / disable / uninstall / marketplace 增删）完成后自动激活——新装
 * 插件的 skills/commands/agents 立即可用，无需 /reload-plugins。
 * 前向缝（登记）：新插件的 hooks / MCP servers / LSP servers 三个面
 * 仍是全量 /reload-plugins（或下次启动）域——轻量面只覆盖「装完即用」
 * 主流程的数据面（AppState.plugins.commands + agentDefinitions + 发现
 * 缓存清除，skill/命令面经 clearAllCaches → getSkillToolCommands 重读）。
 * 残留 needsRefresh 路径（启动陈旧 / 后台自动更新）仍走全量刷新通知。
 */
export async function refreshActivePluginsLightweight(
  setAppState: SetAppState,
): Promise<RefreshActivePluginsLightweightResult> {
  logForDebugging(
    'refreshActivePluginsLightweight: clearing all plugin caches',
  )
  clearAllCaches()
  // 与全量刷新同语义：disk-changed 信号，重算 orphan exclusions。
  clearPluginCacheExclusions()

  // 序列同全量版：先 loadAllPlugins 暖 cache-only memoize，再并行读
  // commands/agents（loadAllPlugins 完成后 await ~free）。
  const pluginResult = await loadAllPlugins()
  const [pluginCommands, agentDefinitions] = await Promise.all([
    getPluginCommands(),
    getAgentDefinitionsWithOverrides(getOriginalCwd()),
  ])

  const { enabled, disabled, errors } = pluginResult

  // 只换数据面，不动 mcp.pluginReconnectKey（MCP 面留全量刷新域）。
  setAppState(prev => ({
    ...prev,
    plugins: {
      ...prev.plugins,
      enabled,
      disabled,
      commands: pluginCommands,
      errors: mergePluginErrors(prev.plugins.errors, errors),
      needsRefresh: false,
    },
    agentDefinitions,
  }))

  logForDebugging(
    `refreshActivePluginsLightweight: ${enabled.length} enabled, ${pluginCommands.length} commands, ${agentDefinitions.allAgents.length} agents`,
  )

  return {
    enabled_count: enabled.length,
    disabled_count: disabled.length,
    command_count: pluginCommands.length,
    agent_count: agentDefinitions.allAgents.length,
    error_count: errors.length,
    agentDefinitions,
    pluginCommands,
  }
}

/**
 * Merge fresh plugin-load errors with existing errors, preserving LSP and
 * plugin-component errors that were recorded by other systems and
 * deduplicating. Same logic as refreshPlugins()/updatePluginState(), extracted
 * so refresh.ts doesn't leave those errors stranded.
 */
function mergePluginErrors(
  existing: PluginError[],
  fresh: PluginError[],
): PluginError[] {
  const preserved = existing.filter(
    e => e.source === 'lsp-manager' || e.source.startsWith('plugin:'),
  )
  const freshKeys = new Set(fresh.map(errorKey))
  const deduped = preserved.filter(e => !freshKeys.has(errorKey(e)))
  return [...deduped, ...fresh]
}

function errorKey(e: PluginError): string {
  return e.type === 'generic-error'
    ? `generic-error:${e.source}:${e.error}`
    : `${e.type}:${e.source}`
}
