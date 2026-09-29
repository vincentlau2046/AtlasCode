/**
 * Auto-install logic for the Ascend official marketplace.
 *
 * Thin overlay wrapper around the base-layer
 * {@link checkAndInstallMarketplacePreset} helper: the 5-step chain
 * (kill-switch → registry → policy → git → clone) lives in
 * `src/utils/plugins/marketplacePreset.ts`; this module keeps the domain
 * constants (gitcode source, frozen kill-switch env name) and the exported
 * result types the notification hook depends on.
 *
 * On success the marketplace appears in `/plugin`; on any failure the hook
 * stays silent and retries naturally on the next startup (the
 * `already_installed` check short-circuits once it lands, so there is no
 * repeated clone after success). The gitcode clone uses
 * `--recurse-submodules` so the cannbot submodule is pulled.
 */

import { isEnvTruthy } from '../../../utils/envUtils.js'
import {
  checkAndInstallMarketplacePreset,
  type MarketplacePresetCheckResult,
  type MarketplacePresetSkipReason,
} from '../../../utils/plugins/marketplacePreset.js'
import {
  AGENT_SKILLS_MARKETPLACE_NAME,
  ASCEND_MARKETPLACE_SOURCE,
} from './ascendMarketplace.js'

/**
 * Reason the Ascend marketplace was not installed (mirrors
 * {@link MarketplacePresetSkipReason}; kept as an alias so the overlay's
 * API surface stays stable).
 */
export type AscendMarketplaceSkipReason = MarketplacePresetSkipReason

/** Result of the auto-install check (mirrors the base-layer result type). */
export type AscendMarketplaceCheckResult = MarketplacePresetCheckResult

/**
 * Check if Ascend marketplace auto-install is disabled via environment
 * variable. Mirrors the official marketplace kill-switch.
 */
export function isAscendMarketplaceAutoInstallDisabled(): boolean {
  return isEnvTruthy(process.env.ATLAS_DISABLE_ASCEND_MARKETPLACE_AUTOINSTALL)
}

/**
 * Check and install the Ascend official marketplace on startup.
 *
 * Fire-and-forget: designed to be called from a startup hook. Stays silent on
 * every non-success path except a logged debug trace — the user only notices
 * the marketplace appearing in `/plugin` once it lands.
 */
export function checkAndInstallAscendMarketplace(): Promise<AscendMarketplaceCheckResult> {
  return checkAndInstallMarketplacePreset({
    name: AGENT_SKILLS_MARKETPLACE_NAME,
    source: ASCEND_MARKETPLACE_SOURCE,
    killSwitchEnv: 'ATLAS_DISABLE_ASCEND_MARKETPLACE_AUTOINSTALL',
    displayName: 'Ascend',
  })
}
