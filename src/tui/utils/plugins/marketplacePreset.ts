/**
 * Shared auto-install check for "preset" marketplaces — sources that
 * AtlasCode materializes on startup (Ascend official, OpenAI Codex, and the
 * Atlas self-built marketplace all converge here). The official
 * claude-plugins-official path keeps its own GCS-mirror + persisted
 * retry/backoff specialization and does NOT use this helper.
 *
 * The marketplace is a nice-to-have: on success it appears in `/plugin`; on
 * any failure the caller stays silent and retries naturally on the next
 * startup (the `already_installed` check short-circuits once it lands, so
 * there is no repeated clone after success).
 *
 * Checks, in order:
 *   1. env kill-switch (`config.killSwitchEnv`)
 *   2. already materialized under `config.name` in known_marketplaces
 *      (skipped when `name` is omitted — then source-idempotency inside
 *      `addMarketplaceSource` prevents a re-clone of the same source)
 *   3. enterprise policy allows the source
 *   4. git is available
 *   5. `addMarketplaceSource` (clone + registry write); a macOS xcrun-shim
 *      failure is treated as git_unavailable and poisons the availability
 *      memo for the rest of the session
 */

import { logForDebugging } from '../debug.js'
import { isEnvTruthy } from '../envUtils.js'
import { toError } from '../errors.js'
import { logError } from '../log.js'
import {
  checkGitAvailable,
  markGitUnavailable,
} from './gitAvailability.js'
import { isSourceAllowedByPolicy } from './marketplaceHelpers.js'
import {
  addMarketplaceSource,
  loadKnownMarketplacesConfig,
} from './marketplaceManager.js'
import type { MarketplaceSource } from './schemas.js'

/**
 * Reason why a preset marketplace was not installed.
 *
 * `disabled` — env kill-switch set (user opted out).
 * `already_installed` — present in known_marketplaces (success, no-op).
 * `policy_blocked` — enterprise policy does not allowlist the source host.
 * `git_unavailable` — git binary missing or non-functional (xcrun shim).
 * `unknown` — clone/registration threw (e.g. network, auth).
 */
export type MarketplacePresetSkipReason =
  | 'disabled'
  | 'already_installed'
  | 'policy_blocked'
  | 'git_unavailable'
  | 'unknown'

/** Result of a preset auto-install check. */
export interface MarketplacePresetCheckResult {
  /** Whether the marketplace was successfully installed this run. */
  installed: boolean
  /** Whether installation was skipped (and why). */
  skipped: boolean
  /** Reason for skipping, if applicable. */
  reason?: MarketplacePresetSkipReason
}

/** Configuration for one preset marketplace. */
export interface MarketplacePresetConfig {
  /**
   * Registry key (= the marketplace manifest's `name` field, the single
   * source of truth). When provided the check short-circuits on registry
   * presence; omit it only when the manifest name is unknown up front, in
   * which case re-runs are deduped by source-idempotency instead.
   */
  name?: string
  /** The marketplace source to install. */
  source: MarketplaceSource
  /**
   * Kill-switch env var NAME (e.g. `ATLAS_DISABLE_ASCEND_MARKETPLACE_AUTOINSTALL`).
   * Set truthy to opt out of auto-install for this preset.
   */
  killSwitchEnv: string
  /** Display label used in debug logs (e.g. `Atlas`). */
  displayName: string
}

/**
 * Check and install a preset marketplace on startup.
 *
 * Fire-and-forget: designed to be called from a startup hook. Stays silent on
 * every non-success path except a logged debug trace — the user only notices
 * the marketplace appearing in `/plugin` once it lands.
 */
export async function checkAndInstallMarketplacePreset(
  config: MarketplacePresetConfig,
): Promise<MarketplacePresetCheckResult> {
  const label = config.displayName

  // 1. env kill-switch
  if (isEnvTruthy(process.env[config.killSwitchEnv])) {
    logForDebugging(
      `${label} marketplace auto-install disabled via env var, skipping`,
    )
    return { installed: false, skipped: true, reason: 'disabled' }
  }

  // 2. already materialized (registry key = manifest name)
  if (config.name) {
    try {
      const knownMarketplaces = await loadKnownMarketplacesConfig()
      if (knownMarketplaces[config.name]) {
        logForDebugging(
          `${label} marketplace '${config.name}' already installed, skipping`,
        )
        return { installed: false, skipped: true, reason: 'already_installed' }
      }
    } catch (error) {
      // Reading known_marketplaces failed — treat as transient and fall
      // through to the install attempt rather than hard-failing.
      logForDebugging(
        `${label} marketplace: failed to read known_marketplaces (${toError(error).message}), attempting install`,
        { level: 'error' },
      )
    }
  }

  // 3. enterprise policy (checked before any network/filesystem work)
  if (!isSourceAllowedByPolicy(config.source)) {
    logForDebugging(
      `${label} marketplace blocked by enterprise policy, skipping`,
    )
    return { installed: false, skipped: true, reason: 'policy_blocked' }
  }

  // 4. git availability (git-backed sources need git; the xcrun-shim case is
  //    caught in step 5, where the clone actually fails)
  const gitAvailable = await checkGitAvailable()
  if (!gitAvailable) {
    logForDebugging(
      `Git not available, skipping ${label} marketplace auto-install`,
    )
    return { installed: false, skipped: true, reason: 'git_unavailable' }
  }

  // 5. clone + register
  try {
    logForDebugging(`Attempting to auto-install ${label} marketplace`)
    await addMarketplaceSource(config.source)
    logForDebugging(`Successfully auto-installed ${label} marketplace`)
    return { installed: true, skipped: false }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // macOS xcrun shim: `which git` passes but clone fails with
    // "xcrun: error: invalid active developer path". Poison the memoized
    // availability check so other git callers skip cleanly this session,
    // and treat as git_unavailable (mirrors the official marketplace).
    if (errorMessage.includes('xcrun: error:')) {
      markGitUnavailable()
      logForDebugging(
        `${label} marketplace auto-install: git is a non-functional macOS xcrun shim, treating as git_unavailable`,
      )
      return { installed: false, skipped: true, reason: 'git_unavailable' }
    }

    logForDebugging(
      `Failed to auto-install ${label} marketplace: ${errorMessage}`,
      { level: 'error' },
    )
    logError(toError(error))
    return { installed: false, skipped: true, reason: 'unknown' }
  }
}
