/**
 * D3: GrowthBook 本地化适配层。
 *
 * 保留所有导出签名以保证 176 个消费端文件编译通过。
 * 不再依赖远程 GrowthBook SDK 或 Statsig。所有开关值优先读 settings.featureFlags，
 * 其次读环境变量覆盖（ATLAS_INTERNAL_FC_OVERRIDES），最后回退到默认值。
 * 远程 fetch/init 代码已删除。
 */

import { isEqual } from 'lodash-es'
import { isAtlasDev } from '../../utils/atlasDev.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { logForDebugging } from '../../utils/debug.js'
import { logError } from '../../utils/log.js'
import { createSignal } from '../../utils/signal.js'

// ---------------------------------------------------------------------------
// Types (preserved from original)
// ---------------------------------------------------------------------------

export type GrowthBookUserAttributes = {
  id: string
  sessionId: string
  deviceID: string
  platform: 'win32' | 'darwin' | 'linux'
  apiBaseUrlHost?: string
  organizationUUID?: string
  accountUUID?: string
  userType?: string
  subscriptionType?: string
  rateLimitTier?: string
  firstTokenTime?: number
  email?: string
  appVersion?: string
  github?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

type GrowthBookRefreshListener = () => void | Promise<void>

// Listeners (preserved for onGrowthBookRefresh compat)
const refreshed = createSignal()

function callSafe(listener: GrowthBookRefreshListener): void {
  try {
    void Promise.resolve(listener()).catch(e => { logError(e) })
  } catch (e) {
    logError(e)
  }
}

// ---------------------------------------------------------------------------
// Environment variable overrides (ATLAS_INTERNAL_FC_OVERRIDES)
// ---------------------------------------------------------------------------

let envOverrides: Record<string, unknown> | null = null
let envOverridesParsed = false

function getEnvOverrides(): Record<string, unknown> | null {
  if (!envOverridesParsed) {
    envOverridesParsed = true
    if (isAtlasDev()) {
      const raw = process.env.ATLAS_INTERNAL_FC_OVERRIDES
      if (raw) {
        try {
          envOverrides = JSON.parse(raw) as Record<string, unknown>
          logForDebugging(
            `GrowthBook: Using env var overrides for ${Object.keys(envOverrides!).length} features: ${Object.keys(envOverrides!).join(', ')}`,
          )
        } catch {
          logError(new Error(`GrowthBook: Failed to parse ATLAS_INTERNAL_FC_OVERRIDES: ${raw}`))
        }
      }
    }
  }
  return envOverrides
}

// ---------------------------------------------------------------------------
// Config-based overrides (saved to global config, ant-only)
// ---------------------------------------------------------------------------

function getConfigOverrides(): Record<string, unknown> | undefined {
  if (!isAtlasDev()) return undefined
  try {
    return getGlobalConfig().growthBookOverrides
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Exported public API (preserved signatures)
// ---------------------------------------------------------------------------

export function onGrowthBookRefresh(listener: GrowthBookRefreshListener): () => void {
  const unsubscribe = refreshed.subscribe(() => callSafe(listener))
  queueMicrotask(() => callSafe(listener))
  return () => { unsubscribe() }
}

export function hasGrowthBookEnvOverride(feature: string): boolean {
  const overrides = getEnvOverrides()
  return overrides !== null && feature in overrides
}

export function getAllGrowthBookFeatures(): Record<string, unknown> {
  return {}
}

export function getGrowthBookConfigOverrides(): Record<string, unknown> {
  return getConfigOverrides() ?? {}
}

export function setGrowthBookConfigOverride(feature: string, value: unknown): void {
  if (!isAtlasDev()) return
  try {
    saveGlobalConfig(c => {
      const current = c.growthBookOverrides ?? {}
      if (value === undefined) {
        if (!(feature in current)) return c
        const { [feature]: _, ...rest } = current
        if (Object.keys(rest).length === 0) {
          const { growthBookOverrides: __, ...configWithout } = c
          return configWithout
        }
        return { ...c, growthBookOverrides: rest }
      }
      if (isEqual(current[feature], value)) return c
      return { ...c, growthBookOverrides: { ...current, [feature]: value } }
    })
    refreshed.emit()
  } catch (e) {
    logError(e)
  }
}

export function clearGrowthBookConfigOverrides(): void {
  if (!isAtlasDev()) return
  try {
    saveGlobalConfig(c => {
      if (!c.growthBookOverrides || Object.keys(c.growthBookOverrides).length === 0) return c
      const { growthBookOverrides: _, ...rest } = c
      return rest
    })
    refreshed.emit()
  } catch (e) {
    logError(e)
  }
}

export function getApiBaseUrlHost(): string | undefined {
  const baseUrl = process.env.OPENAI_BASE_URL
  if (!baseUrl) return undefined
  try {
    return new URL(baseUrl).hostname
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Feature value / gate evaluation
// ---------------------------------------------------------------------------

function readLocalFeatureValue<T>(feature: string, defaultValue: T): T {
  // 1. Env var overrides (for eval harnesses)
  const overrides = getEnvOverrides()
  if (overrides && feature in overrides) return overrides[feature] as T

  // 2. Config overrides (ant-only, saved to disk)
  const configOverrides = getConfigOverrides()
  if (configOverrides && feature in configOverrides) return configOverrides[feature] as T

  // 3. Settings featureFlags (the primary local config)
  try {
    const config = getGlobalConfig()
    if (config.featureFlags && feature in config.featureFlags) {
      return config.featureFlags[feature] as T
    }
  } catch {
    // getGlobalConfig() throws before configReadingAllowed is set
  }

  return defaultValue
}

export const initializeGrowthBook = async (): Promise<null> => {
  return null
}

export async function getFeatureValue_DEPRECATED<T>(feature: string, defaultValue: T): Promise<T> {
  return readLocalFeatureValue(feature, defaultValue)
}

export function getFeatureValue_CACHED_MAY_BE_STALE<T>(feature: string, defaultValue: T): T {
  return readLocalFeatureValue(feature, defaultValue)
}

export function getFlagDualRead<T>(tenguKey: string, defaultValue: T): T {
  return readLocalFeatureValue(tenguKey, defaultValue)
}

export function checkGateDualRead(tenguGate: string): boolean {
  return readLocalFeatureValue(tenguGate, false)
}

export async function getDynamicConfigDualRead<T>(configName: string, defaultValue: T): Promise<T> {
  return readLocalFeatureValue(configName, defaultValue)
}

export function getFeatureValue_CACHED_WITH_REFRESH<T>(
  feature: string,
  defaultValue: T,
  // Legacy third param (refresh interval ms) kept so call sites stay valid —
  // local-only feature values have no remote refresh to schedule.
  _refreshMs?: number,
): T {
  return readLocalFeatureValue(feature, defaultValue)
}

export function checkStatsigFeatureGate_CACHED_MAY_BE_STALE(gate: string): boolean {
  return readLocalFeatureValue(gate, false)
}

export async function checkSecurityRestrictionGate(gate: string): Promise<boolean> {
  return readLocalFeatureValue(gate, false)
}

export async function checkGate_CACHED_OR_BLOCKING(gate: string): Promise<boolean> {
  return readLocalFeatureValue(gate, false)
}

export function refreshGrowthBookAfterAuthChange(): void {
  // No remote client to refresh with D3 — no-op
}

export function resetGrowthBook(): void {
  envOverrides = null
  envOverridesParsed = false
}

export async function refreshGrowthBookFeatures(): Promise<void> {
  // No remote features to refresh with D3 — no-op
}

export function setupPeriodicGrowthBookRefresh(): void {
  // No periodic refresh needed with D3 — no-op
}

export function stopPeriodicGrowthBookRefresh(): void {
  // No periodic refresh needed with D3 — no-op
}

export async function getDynamicConfig_BLOCKS_ON_INIT<T>(configName: string, defaultValue: T): Promise<T> {
  return readLocalFeatureValue(configName, defaultValue)
}

export function getDynamicConfig_CACHED_MAY_BE_STALE<T>(configName: string, defaultValue: T): T {
  return readLocalFeatureValue(configName, defaultValue)
}