/**
 * lsp 域 — LSP server 配置单一事实源（§8.67 D 波 S-E2c；旧仓
 * services/lsp/config.ts 79L 的插件唯一源 → 注入窗转写）。
 *
 * 旧仓 LSP server 只经插件域供给（loadAllPluginsCacheOnly → 逐插件
 * getPluginLspServers 并行 + 后插件胜出 Object.assign 合并 + 逐插件
 * 容错）。新仓 3-dep/域隔离面下插件域 LSP 集成（旧 lspPluginIntegration
 * 390L：manifest lspServers 解析 + scoped 键前缀 + zod LspServerConfigSchema
 * 校验 + 许可提示）= 插件域前向接缝（插件波注册源）→ 本文件承载
 * 配置注入窗：
 *
 *   - setLspServerSource(source) — 插件域/组合根注册供给面（source 返回
 *     已 scoped 的 server 配置 record；合并/容错语义随源侧承载，
 *     窗口侧保持薄）
 *   - getAllLspServers() — 未注册 = 空配置 = LSP 断连态（活面非空心：
 *     isLspConnected() → false → LSPTool.isEnabled() → 工具 disabled 态，
 *     非假绿）；已注册 = try 源 / catch 空（fail-soft 逐字：LSP 可选，
 *     永不 throw，错误 logError 留观测面）
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 loadAllPluginsCacheOnly + getPluginLspServers 插件域两调用 →
 *    前向接缝（插件域 LSP 集成波，本波 0 命中登记）；测试/组合根经
 *    setLspServerSource 内存面供给，零磁盘。
 *  ② 旧 PluginError 类型 + 逐插件 errors 日志面 → 随源侧裁（窗口不感知
 *    插件结构）。
 */

import { errorMessage, logError, logForDebugging, toError } from '../shared'
import type { ScopedLspServerConfig } from './types'

/**
 * LSP server 配置供给面：返回已 scoped（server 名键前缀）的配置 record。
 * 插件域 LSP 集成波注册实现；测试/组合根可注册内存源。
 */
export type LspServerSource = () => Promise<Record<string, ScopedLspServerConfig>>

let lspServerSource: LspServerSource | undefined

/**
 * 注册 LSP server 配置供给面（插件域 LSP 集成 / 组合根调用位）。
 * 重复注册 = 后者胜出（单供给面语义）。
 */
export function setLspServerSource(source: LspServerSource): void {
  lspServerSource = source
  logForDebugging('[LSP CONFIG] server source registered')
}

/** 测试面：清除供给面（回到未注册 = 断连态）。 */
export function clearLspServerSource(): void {
  lspServerSource = undefined
}

/**
 * Get all configured LSP servers.
 * LSP servers are only supported via plugins, not user/project settings.
 *
 * @returns Object containing servers configuration keyed by scoped server name
 */
export async function getAllLspServers(): Promise<{
  servers: Record<string, ScopedLspServerConfig>
}> {
  const allServers: Record<string, ScopedLspServerConfig> = {}

  // delta ①：供给面未注册 = 空配置（LSP 断连态，活面）
  if (!lspServerSource) {
    logForDebugging(
      '[LSP CONFIG] no server source registered; LSP disconnected',
    )
    return { servers: allServers }
  }

  try {
    const servers = await lspServerSource()
    // 源侧已承载合并/容错语义（delta ②）→ 窗口侧整体接管
    for (const [serverName, config] of Object.entries(servers)) {
      allServers[serverName] = config
    }
    logForDebugging(`Total LSP servers loaded: ${Object.keys(allServers).length}`)
  } catch (error) {
    // Log error for monitoring production issues.
    // LSP is optional, so we don't throw - but we need visibility
    // into why plugin loading fails to improve the feature.
    logError(toError(error))

    logForDebugging(`Error loading LSP servers: ${errorMessage(error)}`)
  }

  return {
    servers: allServers,
  }
}
