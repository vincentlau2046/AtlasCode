import * as React from 'react'
import type { Notification } from '../context/notifications.js'
import { setPluginLicenseResolver } from '../commands/plugin/pluginLicenseResolver.js'
import { Text } from '../ink.js'
import { logForDebugging } from '../utils/debug.js'
import { checkAndInstallAscendMarketplace } from '../plugins/ascend/marketplace/ascendMarketplaceStartupCheck.js'
import { ASCEND_OFFICIAL_DISPLAY_LABEL } from '../plugins/ascend/marketplace/ascendMarketplace.js'
import { ascendLicenseResolver } from '../plugins/ascend/marketplace/licenseInference.js'
import { useStartupNotification } from './notifs/useStartupNotification.js'

// Register the Ascend license resolver for the plugin details view. Runs once
// at module load (REPL imports this hook at startup, before any /plugin render).
// Idempotent: re-import does not double-register. The resolver declines for
// non-ascend marketplaces, so foreign plugins keep their default (no row).
setPluginLicenseResolver(ascendLicenseResolver)

/**
 * Hook that auto-installs the Ascend official marketplace on startup and
 * shows a notification on success (or transient failure).
 *
 * Silent on intentional/permanent skips (disabled / already_installed /
 * policy_blocked / git_unavailable) — those are not worth nagging about. Only
 * a transient clone failure ('unknown') surfaces a "will retry" notice,
 * mirroring the official marketplace hook.
 */
export function useAscendMarketplaceNotification(): void {
  useStartupNotification(async () => {
    const result = await checkAndInstallAscendMarketplace()
    const notifs: Notification[] = []

    if (result.installed) {
      logForDebugging('Showing Ascend marketplace installation success notification')
      notifs.push({
        key: 'ascend-marketplace-installed',
        jsx: (
          <Text color="success">
            ✓ {ASCEND_OFFICIAL_DISPLAY_LABEL} marketplace installed · /plugin to
            browse official plugins
          </Text>
        ),
        priority: 'immediate',
        timeoutMs: 7000,
      })
    } else if (result.skipped && result.reason === 'unknown') {
      logForDebugging('Showing Ascend marketplace installation failure notification')
      notifs.push({
        key: 'ascend-marketplace-install-failed',
        jsx: (
          <Text color="warning">
            Failed to install {ASCEND_OFFICIAL_DISPLAY_LABEL} marketplace · Will
            retry on next startup
          </Text>
        ),
        priority: 'immediate',
        timeoutMs: 8000,
      })
    }
    // Silent for: disabled, already_installed, policy_blocked, git_unavailable.
    return notifs
  })
}
