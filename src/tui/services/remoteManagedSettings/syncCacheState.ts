import type { SettingsJson } from '../../utils/settings/types.js'

/**
 * Synchronous cache for remote managed settings.
 *
 * The remote settings fetcher populates this cache; consumers read it
 * synchronously via getRemoteManagedSettingsSyncFromCache.
 */
let cachedRemoteSettings: SettingsJson | null = null

export function setRemoteManagedSettingsSyncCache(settings: SettingsJson | null): void {
  cachedRemoteSettings = settings
}

export function getRemoteManagedSettingsSyncFromCache(): SettingsJson | null {
  return cachedRemoteSettings
}

export function clearRemoteManagedSettingsSyncCache(): void {
  cachedRemoteSettings = null
}
