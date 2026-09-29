/**
 * Constants + auto-install entry point for the Atlas self-built marketplace
 * (`atlas-plugins`) — where Atlas's own skills live. Official third-party
 * skills stay in their official repo (agent-skills, read-only); self-built
 * skills are published to this repo via `plugin marketplace publish`.
 *
 * Repo: github.com/vincentlau2046-sudo/atlas-plugins (public — customers
 * clone it anonymously at startup; a private repo would break preinstall).
 * The marketplace manifest declares `name: "atlas-plugins"` with plugins at
 * string-relative sources, both covered by the existing base-layer probes
 * (native `atlas-plugin` dir in getPluginManifestDirs, PluginSourceSchema
 * RelativePath) — no schema or probe changes needed.
 *
 * Uses the `github` source form: the base-layer github branch has a native
 * SSH/HTTPS heuristic (same pattern as the claude-plugins-official preset),
 * and the cache path is `vincentlau2046-sudo-atlas-plugins`.
 */

import type { MarketplaceSource } from './schemas.js'
import {
  checkAndInstallMarketplacePreset,
  type MarketplacePresetCheckResult,
} from './marketplacePreset.js'

/** Source configuration for the Atlas self-built marketplace (GitHub). */
export const ATLAS_MARKETPLACE_SOURCE = {
  source: 'github',
  repo: 'vincentlau2046-sudo/atlas-plugins',
} as const satisfies MarketplaceSource

/**
 * Registry key for the Atlas marketplace.
 *
 * Equals the marketplace manifest's `name` field (`atlas-plugins`) — the key
 * `addMarketplaceSource` writes into known_marketplaces.json, so every
 * internal lookup must use this manifest name (single source of truth).
 */
export const ATLAS_MARKETPLACE_NAME = 'atlas-plugins'

/** Customer-facing display label for notifications (brand, not the key). */
export const ATLAS_MARKETPLACE_DISPLAY_LABEL = 'Atlas'

/** Env kill-switch: set to 1/true to opt out of startup auto-install. */
export const ATLAS_MARKETPLACE_KILL_SWITCH_ENV =
  'ATLAS_DISABLE_ATLAS_MARKETPLACE_AUTOINSTALL'

/**
 * Check and install the Atlas marketplace on startup.
 *
 * Fire-and-forget: designed to be called from a startup hook. Stays silent on
 * every non-success path except a logged debug trace — retries naturally on
 * the next startup (the `already_installed` check short-circuits once it
 * lands).
 */
export function checkAndInstallAtlasMarketplace(): Promise<MarketplacePresetCheckResult> {
  return checkAndInstallMarketplacePreset({
    name: ATLAS_MARKETPLACE_NAME,
    source: ATLAS_MARKETPLACE_SOURCE,
    killSwitchEnv: ATLAS_MARKETPLACE_KILL_SWITCH_ENV,
    displayName: ATLAS_MARKETPLACE_DISPLAY_LABEL,
  })
}
