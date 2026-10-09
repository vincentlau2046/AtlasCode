import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { logError } from '../utils/log.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'
/**
 * Migration: Move user-set autoUpdates preference to settings.json env var
 * Only migrates if user explicitly disabled auto-updates (not for protection)
 * This preserves user intent while allowing native installations to auto-update
 *
 * W-opt 可信波 S5（#299）可信清册观察项 (a)：单向迁移——显式 autoUpdates=false 写入
 * settings.env.DISABLE_AUTOUPDATER 后迁移删 ~/.atlas.json autoUpdates 键，无反向恢复
 * 路径（恢复 = 手动 settings 操作，登记观察项，零行为变化）。
 */
export function migrateAutoUpdatesToSettings(): void {
  const globalConfig = getGlobalConfig()

  // Only migrate if autoUpdates was explicitly set to false by user preference
  // (not automatically for native protection)
  if (
    globalConfig.autoUpdates !== false ||
    globalConfig.autoUpdatesProtectedForNative === true
  ) {
    return
  }

  try {
    const userSettings = getSettingsForSource('userSettings') || {}

    // Always set DISABLE_AUTOUPDATER to preserve user intent
    // We need to overwrite even if it exists, to ensure the migration is complete
    updateSettingsForSource('userSettings', {
      ...userSettings,
      env: {
        ...userSettings.env,
        DISABLE_AUTOUPDATER: '1',
      },
    })

    const autoUpdatesPayload = {
      was_user_preference: true,
      already_had_env_var: !!userSettings.env?.DISABLE_AUTOUPDATER,
    }
    // de-Anthropic: the atlas_ twin is now emitted centrally by logEvent

    // explicitly set, so this takes effect immediately
    process.env.DISABLE_AUTOUPDATER = '1'

    // Remove autoUpdates from global config after successful migration
    saveGlobalConfig(current => {
      const {
        autoUpdates: _,
        autoUpdatesProtectedForNative: __,
        ...updatedConfig
      } = current
      return updatedConfig
    })
  } catch (error) {
    logError(new Error(`Failed to migrate auto-updates: ${error}`))
    // de-Anthropic: the atlas_ twin is now emitted centrally by logEvent
  }
}
