/**
 * engine/config — hooks 配置面（§8.27 E-3 S-3c，旧仓 hooksConfigSnapshot.ts
 * 133L 裁剪版真核心 + 消费点 provider）
 *
 * 真核心（旧仓语义逐字）：
 *   - getHooksFromAllowedSources 门控链四态：
 *     ① policy disableAllHooks → {}
 *     ② policy allowManagedHooksOnly → 仅 policy hooks
 *     ③ 合并（非 managed）disableAllHooks → 仅 policy hooks（非 managed 不能
 *        禁用 managed）
 *     ④ 否则合并 hooks（向后兼容）
 *   - shouldAllowManagedHooksOnly / shouldDisableAllHooksIncludingManaged
 *   - snapshot 四函数（capture/update/get/reset；update 先 resetSettingsCache
 *     确保读盘——防外部编辑 settings.json 后 session 缓存陈旧）
 *   - createHooksConfigProvider：配置面 → hooks 域 HookConfigProvider
 *     （组合根 setHookConfigProvider 注入，§8.14 注入序 hooks 步）
 *
 * 语义裁定（对照旧仓，残留守登记防「以为已全」）：
 *   - isRestrictedToPluginOnly('hooks')（plugin-only 策略门）裁剪——plugin
 *     域未落（残留守）。
 *   - resetSdkInitState（旧仓 bootstrap 状态）裁剪——新仓 bootstrap 域不承载
 *     SDK init 状态（残留守）。
 *   - getSettings_DEPRECATED → getSettingsWithErrors().settings（S-3b 真核心，
 *     等价合并面）。
 *   - session hooks（旧仓 getAllHooks 的 appState 会话钩子存储）/ display 字符串 /
 *     isHookEqual / sortMatchersByPriority（/hooks UI 面）不随迁——UI 面残留守。
 *   - updateHooksConfigSnapshot 调用面（旧仓 /hooks 设置 UI 写回后刷新）无现
 *     调用点——登记组合根 / E-wave-end /hooks UI 面（H6：快照面被 provider
 *     消费，update 属 UI 写回面，不删除导出）。
 *   - 执行器契约过滤：新仓 hooks 域 runHooks 仅消费 command 变体（.command），
 *     prompt/agent/http 执行面归 E-5 hooks-runner → provider 过滤非 command
 *     变体（配置面数据契约仍保四类全量，hooksSchema.ts），过滤后空 matcher 剔除。
 *   - 畸形 matcher 加固（§8.30 T-1）：settings 面 hooks 经 z.any() 透传，
 *     用户配置缺 hooks 键/非数组时旧仓 matcher.hooks.filter 抛 TypeError
 *     崩钩子面（getMatchingHooks 无守卫）；provider 加 Array 守卫防用户
 *     配置崩 loop（加固登记，非逐字移植偏离）。
 */
// L3 域边界：hooks 域类型经域根门面 import（不深入域内文件，eslint
// boundaries/entry-point）
import type { HookConfigProvider, HookMatcher } from '../../hooks'
import type { CommandHookCommand, HooksSettings } from './hooksSchema'
import { resetSettingsCache } from './settingsCache'
import { getSettingsForSource, getSettingsWithErrors } from './settings'

let initialHooksConfig: HooksSettings | null = null

/**
 * 获取允许源的 hooks 配置（门控链四态，见头注）。
 * 旧仓经 settingsModule 对象 import（供 spyOn），新仓直 import（无 spy 面）。
 */
function getHooksFromAllowedSources(): HooksSettings {
  const policySettings = getSettingsForSource('policySettings')

  // If managed settings disables all hooks, return empty
  if (policySettings?.disableAllHooks === true) {
    return {}
  }

  // If allowManagedHooksOnly is set in managed settings, only use managed hooks
  if (policySettings?.allowManagedHooksOnly === true) {
    return (policySettings?.hooks as HooksSettings | undefined) ?? {}
  }

  const mergedSettings = getSettingsWithErrors().settings

  // If disableAllHooks is set in non-managed settings, only managed hooks run
  // (non-managed settings cannot disable managed hooks)
  if (mergedSettings.disableAllHooks === true) {
    return (policySettings?.hooks as HooksSettings | undefined) ?? {}
  }

  // Otherwise, use all hooks (merged from all sources) - backwards compatible
  return (mergedSettings.hooks as HooksSettings | undefined) ?? {}
}

/**
 * Check if only managed hooks should run.
 * policy allowManagedHooksOnly，或 合并 disableAllHooks（非 managed 源设置）
 * ——后者语义上等价 managed-only（非 managed 钩子被禁，managed 仍跑）。
 */
export function shouldAllowManagedHooksOnly(): boolean {
  const policySettings = getSettingsForSource('policySettings')
  if (policySettings?.allowManagedHooksOnly === true) {
    return true
  }
  if (
    getSettingsWithErrors().settings.disableAllHooks === true &&
    policySettings?.disableAllHooks !== true
  ) {
    return true
  }
  return false
}

/**
 * Check if all hooks (including managed) should be disabled.
 * 仅当 managed/policy settings disableAllHooks: true 时成立——非 managed 源
 * 的 disableAllHooks 不能禁 managed hooks。
 */
export function shouldDisableAllHooksIncludingManaged(): boolean {
  return (
    getSettingsForSource('policySettings')?.disableAllHooks === true
  )
}

/**
 * Capture a snapshot of the current hooks configuration.
 * 应用启动时调用一次（compose.ts 接线）；尊重 allowManagedHooksOnly 门控链。
 */
export function captureHooksConfigSnapshot(): void {
  initialHooksConfig = getHooksFromAllowedSources()
}

/**
 * Update the hooks configuration snapshot（settings 经 UI/写回面变更后刷新）。
 * 先 resetSettingsCache 确保读盘（旧仓语义逐字，见头注）。
 */
export function updateHooksConfigSnapshot(): void {
  resetSettingsCache()
  initialHooksConfig = getHooksFromAllowedSources()
}

/**
 * Get the current hooks configuration from snapshot.
 * 无快照时惰性 capture（首次读即启动语义）。
 */
export function getHooksConfigFromSnapshot(): HooksSettings {
  if (initialHooksConfig === null) {
    captureHooksConfigSnapshot()
  }
  return initialHooksConfig
}

/** Reset the hooks configuration snapshot（测试复位；SDK init 状态裁剪见头注）。 */
export function resetHooksConfigSnapshot(): void {
  initialHooksConfig = null
}

/**
 * 构建 hooks 域配置源（组合根 setHookConfigProvider 注入，S-3c 消费点接线）。
 *
 * 执行器契约过滤（见头注）：保留 command 变体（runHooks 消费 .command）；
 * prompt/agent/http 执行面归 E-5。过滤后空 hooks 的 matcher 剔除。
 */
export function createHooksConfigProvider(): HookConfigProvider {
  return {
    getHookMatchersForEvent(event) {
      const matchers = getHooksConfigFromSnapshot()[event] ?? []
      const result: HookMatcher[] = []
      for (const matcher of matchers) {
        // 畸形配置加固（§8.30 T-1）：hooks 字段 z.any() 透传（S-3a 裁定），
        // 用户配置缺 hooks 键/非数组时旧仓同风险崩溃（matcher.hooks.filter
        // 抛 TypeError 经 getMatchingHooks 无守卫传播崩 loop）；本版 Array
        // 守卫防用户配置崩钩子面（加固登记，非逐字移植偏离）
        const hooks = (Array.isArray(matcher.hooks) ? matcher.hooks : []).filter(
          (hook): hook is CommandHookCommand =>
            hook.type === 'command' && typeof hook.command === 'string',
        )
        if (hooks.length === 0) continue
        result.push({ ...matcher, hooks })
      }
      return result
    },
  }
}
