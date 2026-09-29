/**
 * tui/sandboxCompat — UI 闭包 sandbox 兼容面（§8.72 TUI 壳波 Slice B）
 *
 * = 新 sandbox 域门面全量 re-export + 旧仓 `core/sandbox/compat.ts` 的
 * 3 个兼容导出（C-7 逐字搬，import 适配）：
 *   - getSandboxManager()        懒单例访问器（经 tui/factory 组合根）
 *   - shouldAllowManagedSandboxDomainsOnly()  策略面读 settings
 *   - addToExcludedCommands()    本地 settings 沙箱排除命令写回
 * 新域门面（createSandboxManager/事件总线/后端/类型）单一事实源不变；
 * 本模块仅补旧仓 compat 单例层，与新域去重归 E-wave-end 审计。
 */

export * from 'src/sandbox'

import type { SandboxManager } from 'src/sandbox'
import { getCoreDependencies } from './factory'
import { getSettingsForSource, updateSettingsForSource } from './utils/settings/settings'

// Local tool-name constant (same as in createSandboxManager.ts)
const BASH_TOOL_NAME = 'Bash'

// ============================================================================
// SandboxManager 单例（旧仓 compat.ts 逐字）
// ============================================================================

// Lazy singleton accessor: deferring getCoreDependencies() to call time
// breaks the factory → executor → Shell → compat → factory import
// cycle (a module-top-level eager call hit a TDZ on '_coreDeps' whenever the
// factory module body had not finished evaluating yet). X6 (2026-09-13):
// renamed from the legacy `SandboxManager` const + Proxy shim to a plain
// accessor function — matches the getCoreDependencies() convention and
// removes the Proxy indirection entirely.
export function getSandboxManager(): SandboxManager {
  return getCoreDependencies().sandbox
}

// ============================================================================
// shouldAllowManagedSandboxDomainsOnly（旧仓 compat.ts 逐字）
// ============================================================================

export function shouldAllowManagedSandboxDomainsOnly(): boolean {
  return (
    getSettingsForSource('policySettings')?.sandbox?.network
      ?.allowManagedDomainsOnly === true
  )
}

// ============================================================================
// addToExcludedCommands（旧仓 compat.ts 逐字）
// ============================================================================

function permissionRuleExtractPrefix(permissionRule: string): string | null {
  const match = permissionRule.match(/^(.+):\*$/)
  return match?.[1] ?? null
}

export function addToExcludedCommands(
  command: string,
  permissionUpdates?: Array<{
    type: string
    rules: Array<{ toolName: string; ruleContent?: string }>
  }>,
): string {
  const existingSettings = getSettingsForSource('localSettings')
  const existingExcludedCommands =
    existingSettings?.sandbox?.excludedCommands || []

  let commandPattern: string = command

  if (permissionUpdates) {
    const bashSuggestions = permissionUpdates.filter(
      update =>
        update.type === 'addRules' &&
        update.rules.some(rule => rule.toolName === BASH_TOOL_NAME),
    )

    if (bashSuggestions.length > 0 && bashSuggestions[0]!.type === 'addRules') {
      const firstBashRule = bashSuggestions[0]!.rules.find(
        rule => rule.toolName === BASH_TOOL_NAME,
      )
      if (firstBashRule?.ruleContent) {
        const prefix = permissionRuleExtractPrefix(firstBashRule.ruleContent)
        if (prefix) {
          commandPattern = `${prefix}:*`
        }
      }
    }
  }

  if (existingExcludedCommands.includes(commandPattern)) {
    return commandPattern
  }

  updateSettingsForSource('localSettings', {
    sandbox: {
      ...existingSettings?.sandbox,
      excludedCommands: [...existingExcludedCommands, commandPattern],
    },
  })

  return commandPattern
}

// ============================================================================
// 类型 re-export（旧仓 compat.ts 尾块：SandboxAskCallback 等消费面）
// ============================================================================

export type {
  SandboxAskCallback,
  SandboxDependencyCheck,
  NetworkHostPattern,
  SandboxViolationEvent,
} from 'src/sandbox'
