import { feature } from 'src/shared'
import { initAutoDream } from '../services/autoDream/autoDream.js'
import { initMagicDocs } from '../services/MagicDocs/magicDocs.js'
import { initSkillImprovement } from './hooks/skillImprovement.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const extractMemoriesModule = feature('EXTRACT_MEMORIES')
  ? (require('../services/extractMemories/extractMemories.js') as typeof import('../services/extractMemories/extractMemories.js'))
  : null
const registerProtocolModule = feature('LODESTONE')
  ? (require('./deepLink/registerProtocol.js') as typeof import('./deepLink/registerProtocol.js'))
  : null

/* eslint-enable @typescript-eslint/no-require-imports */

import { getIsInteractive } from 'src/bootstrap'
import { getLastInteractionTime } from 'src/tui/bootstrapState.js'
import { cleanupOldMessageFilesInBackground } from './cleanup.js'
import { cleanupOldVersions } from './nativeInstaller/index.js'
import { autoUpdateMarketplacesAndPluginsInBackground } from './plugins/pluginAutoupdate.js'

// 24 hours in milliseconds
const RECURRING_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000

// 10 minutes after start.
const DELAY_VERY_SLOW_OPERATIONS_THAT_HAPPEN_EVERY_SESSION = 10 * 60 * 1000

export function startBackgroundHousekeeping(): void {
  void initMagicDocs()
  void initSkillImprovement()
  if (feature('EXTRACT_MEMORIES')) {
    extractMemoriesModule!.initExtractMemories()
  }
  initAutoDream()
  void autoUpdateMarketplacesAndPluginsInBackground()
  if (feature('LODESTONE') && getIsInteractive()) {
    void registerProtocolModule!.ensureDeepLinkProtocolRegistered()
  }

  let needsCleanup = true
  async function runVerySlowOps(): Promise<void> {
    // If the user did something in the last minute, don't make them wait for these slow operations to run.
    if (
      getIsInteractive() &&
      getLastInteractionTime() > Date.now() - 1000 * 60
    ) {
      setTimeout(
        runVerySlowOps,
        DELAY_VERY_SLOW_OPERATIONS_THAT_HAPPEN_EVERY_SESSION,
      ).unref()
      return
    }

    if (needsCleanup) {
      needsCleanup = false
      await cleanupOldMessageFilesInBackground()
    }

    // If the user did something in the last minute, don't make them wait for these slow operations to run.
    if (
      getIsInteractive() &&
      getLastInteractionTime() > Date.now() - 1000 * 60
    ) {
      setTimeout(
        runVerySlowOps,
        DELAY_VERY_SLOW_OPERATIONS_THAT_HAPPEN_EVERY_SESSION,
      ).unref()
      return
    }

    await cleanupOldVersions()
  }

  setTimeout(
    runVerySlowOps,
    DELAY_VERY_SLOW_OPERATIONS_THAT_HAPPEN_EVERY_SESSION,
  ).unref()

  // de-ANT: the ant-only recurring npm-cache / old-version cleanup timer was removed.
}
