/**
 * Auto-install logic for the official Anthropic marketplace.
 *
 * This module handles automatically installing the official marketplace
 * on startup for new users, with appropriate checks for:
 * - Enterprise policy restrictions
 * - Git availability
 * - Previous installation attempts
 */

import { join } from 'path'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { getGlobalConfig, saveGlobalConfig } from '../config.js'
import { logForDebugging } from '../debug.js'
import { isEnvTruthy } from '../envUtils.js'
import { toError } from '../errors.js'
import { logError } from '../log.js'
import { checkGitAvailable, markGitUnavailable } from './gitAvailability.js'
import { isSourceAllowedByPolicy } from './marketplaceHelpers.js'
import {
  addMarketplaceSource,
  getMarketplacesCacheDir,
  loadKnownMarketplacesConfig,
  saveKnownMarketplacesConfig,
} from './marketplaceManager.js'
import {
  OFFICIAL_MARKETPLACE_NAME,
  OFFICIAL_MARKETPLACE_SOURCE,
} from './officialMarketplace.js'
import { fetchOfficialMarketplaceFromGcs } from './officialMarketplaceGcs.js'

/**
 * Reason why the official marketplace was not installed
 */
export type OfficialMarketplaceSkipReason =
  | 'already_attempted'
  | 'already_installed'
  | 'policy_blocked'
  | 'git_unavailable'
  | 'gcs_unavailable'
  | 'unknown'

/**
 * Check if official marketplace auto-install is disabled via environment variable.
 */
export function isOfficialMarketplaceAutoInstallDisabled(): boolean {
  return isEnvTruthy(
    (process.env.ATLAS_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL),
  )
}

/**
 * Configuration for retry logic
 */
export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 10,
  INITIAL_DELAY_MS: 60 * 60 * 1000, // 1 hour
  BACKOFF_MULTIPLIER: 2,
  MAX_DELAY_MS: 7 * 24 * 60 * 60 * 1000, // 1 week
}

/**
 * Calculate next retry delay using exponential backoff
 */
function calculateNextRetryDelay(retryCount: number): number {
  const delay =
    RETRY_CONFIG.INITIAL_DELAY_MS *
    Math.pow(RETRY_CONFIG.BACKOFF_MULTIPLIER, retryCount)
  return Math.min(delay, RETRY_CONFIG.MAX_DELAY_MS)
}

/**
 * 2026-10-08 多 OS 优化：重试退避门默认 OFF（每次启动都重试，无 backoff 跳过）。
 * Windows 装好 git / 网络恢复后不必等 1h+ 退避窗；opt-in 旧行为 =
 * ATLAS_ENABLE_OFFICIAL_MKT_RETRY_BACKOFF=1。每次调用读 env（可运行时切换）。
 */
export function isRetryBackoffGateEnabled(): boolean {
  return isEnvTruthy(
    (process.env.ATLAS_ENABLE_OFFICIAL_MKT_RETRY_BACKOFF),
  )
}

/**
 * Determine if installation should be retried based on failure reason and retry state.
 *
 * Short-circuits (gate-independent):
 *   - never attempted → try
 *   - already installed → no
 *   - policy_blocked → no (enterprise policy won't flip on its own)
 * Gate-off default (2026-10-08): everything else retries on every startup.
 * Opt-in backoff gate (ATLAS_ENABLE_OFFICIAL_MKT_RETRY_BACKOFF): the legacy
 * max-attempts / next-retry-time / fail-reason whitelist below.
 */
export function shouldRetryInstallation(
  config: ReturnType<typeof getGlobalConfig>,
): boolean {
  // If never attempted, should try
  if (!config.officialMarketplaceAutoInstallAttempted) {
    return true
  }

  // If already installed successfully, don't retry
  if (config.officialMarketplaceAutoInstalled) {
    return false
  }

  // Permanent failure — enterprise policy; never auto-retry (gate-independent)
  if (config.officialMarketplaceAutoInstallFailReason === 'policy_blocked') {
    return false
  }

  // Default: backoff gate OFF → retry on every startup (no skip window).
  if (!isRetryBackoffGateEnabled()) {
    return true
  }

  // Legacy backoff gate (opt-in via env)
  const retryCount = config.officialMarketplaceAutoInstallRetryCount || 0
  const nextRetryTime = config.officialMarketplaceAutoInstallNextRetryTime
  const now = Date.now()

  // Check if we've exceeded max attempts
  if (retryCount >= RETRY_CONFIG.MAX_ATTEMPTS) {
    return false
  }

  // Check if enough time has passed for next retry
  if (nextRetryTime && now < nextRetryTime) {
    return false
  }

  // Retry for temporary failures (unknown), semi-permanent (git_unavailable),
  // and legacy state (undefined failReason from before retry logic existed)
  return (
    config.officialMarketplaceAutoInstallFailReason === 'unknown' ||
    config.officialMarketplaceAutoInstallFailReason === 'git_unavailable' ||
    config.officialMarketplaceAutoInstallFailReason === 'gcs_unavailable' ||
    config.officialMarketplaceAutoInstallFailReason === undefined
  )
}

/**
 * Result of the auto-install check
 */
export type OfficialMarketplaceCheckResult = {
  /** Whether the marketplace was successfully installed */
  installed: boolean
  /** Whether the installation was skipped (and why) */
  skipped: boolean
  /** Reason for skipping, if applicable */
  reason?: OfficialMarketplaceSkipReason
  /** Whether saving retry metadata to config failed */
  configSaveFailed?: boolean
}

/**
 * Check and install the official marketplace on startup.
 *
 * This function is designed to be called as a fire-and-forget operation
 * during startup. It will:
 * 1. Check if installation was already attempted
 * 2. Check if marketplace is already installed
 * 3. Check enterprise policy restrictions
 * 4. Check git availability
 * 5. Attempt installation
 * 6. Record the result in GlobalConfig
 *
 * @returns Result indicating whether installation succeeded or was skipped
 */
export async function checkAndInstallOfficialMarketplace(): Promise<OfficialMarketplaceCheckResult> {
  const config = getGlobalConfig()

  // Check if we should retry installation
  if (!shouldRetryInstallation(config)) {
    const reason: OfficialMarketplaceSkipReason =
      config.officialMarketplaceAutoInstallFailReason ?? 'already_attempted'
    logForDebugging(`Official marketplace auto-install skipped: ${reason}`)
    return {
      installed: false,
      skipped: true,
      reason,
    }
  }

  try {
    // Check if auto-install is disabled via env var
    if (isOfficialMarketplaceAutoInstallDisabled()) {
      logForDebugging(
        'Official marketplace auto-install disabled via env var, skipping',
      )
      saveGlobalConfig(current => ({
        ...current,
        officialMarketplaceAutoInstallAttempted: true,
        officialMarketplaceAutoInstalled: false,
        officialMarketplaceAutoInstallFailReason: 'policy_blocked',
      }))
      return { installed: false, skipped: true, reason: 'policy_blocked' }
    }

    // Check if marketplace is already installed
    const knownMarketplaces = await loadKnownMarketplacesConfig()
    if (knownMarketplaces[OFFICIAL_MARKETPLACE_NAME]) {
      logForDebugging(
        `Official marketplace '${OFFICIAL_MARKETPLACE_NAME}' already installed, skipping`,
      )
      // Mark as attempted so we don't check again
      saveGlobalConfig(current => ({
        ...current,
        officialMarketplaceAutoInstallAttempted: true,
        officialMarketplaceAutoInstalled: true,
      }))
      return { installed: false, skipped: true, reason: 'already_installed' }
    }

    // Check enterprise policy restrictions
    if (!isSourceAllowedByPolicy(OFFICIAL_MARKETPLACE_SOURCE)) {
      logForDebugging(
        'Official marketplace blocked by enterprise policy, skipping',
      )
      saveGlobalConfig(current => ({
        ...current,
        officialMarketplaceAutoInstallAttempted: true,
        officialMarketplaceAutoInstalled: false,
        officialMarketplaceAutoInstallFailReason: 'policy_blocked',
      }))
      return { installed: false, skipped: true, reason: 'policy_blocked' }
    }

    // inc-5046: try GCS mirror first — doesn't need git, doesn't hit GitHub.
    // Backend (anthropic#317037) publishes a marketplace zip to the same
    // bucket as the native binary. If GCS succeeds, register the marketplace
    // with source:'github' (still true — GCS is a mirror) and skip git
    // entirely.
    const cacheDir = getMarketplacesCacheDir()
    const installLocation = join(cacheDir, OFFICIAL_MARKETPLACE_NAME)
    const gcsSha = await fetchOfficialMarketplaceFromGcs(
      installLocation,
      cacheDir,
    )
    if (gcsSha !== null) {
      const known = await loadKnownMarketplacesConfig()
      known[OFFICIAL_MARKETPLACE_NAME] = {
        source: OFFICIAL_MARKETPLACE_SOURCE,
        installLocation,
        lastUpdated: new Date().toISOString(),
      }
      await saveKnownMarketplacesConfig(known)

      saveGlobalConfig(current => ({
        ...current,
        officialMarketplaceAutoInstallAttempted: true,
        officialMarketplaceAutoInstalled: true,
        officialMarketplaceAutoInstallFailReason: undefined,
        officialMarketplaceAutoInstallRetryCount: undefined,
        officialMarketplaceAutoInstallLastAttemptTime: undefined,
        officialMarketplaceAutoInstallNextRetryTime: undefined,
      }))
      return { installed: true, skipped: false }
    }
    // GCS failed (404 until backend writes, or network). Fall through to git
    // ONLY if the kill-switch allows — same gate as refreshMarketplace().
    if (
      !getFeatureValue_CACHED_MAY_BE_STALE(
        'atlas_plugin_official_mkt_git_fallback',
        true,
      )
    ) {
      logForDebugging(
        'Official marketplace GCS failed; git fallback disabled by flag — skipping install',
      )
      // Same retry-with-backoff metadata as git_unavailable below — transient
      // GCS failures should retry with exponential backoff, not give up.
      const retryCount =
        (config.officialMarketplaceAutoInstallRetryCount || 0) + 1
      const now = Date.now()
      const nextRetryTime = now + calculateNextRetryDelay(retryCount)
      saveGlobalConfig(current => ({
        ...current,
        officialMarketplaceAutoInstallAttempted: true,
        officialMarketplaceAutoInstalled: false,
        officialMarketplaceAutoInstallFailReason: 'gcs_unavailable',
        officialMarketplaceAutoInstallRetryCount: retryCount,
        officialMarketplaceAutoInstallLastAttemptTime: now,
        officialMarketplaceAutoInstallNextRetryTime: nextRetryTime,
      }))
      return { installed: false, skipped: true, reason: 'gcs_unavailable' }
    }

    // Check git availability
    const gitAvailable = await checkGitAvailable()
    if (!gitAvailable) {
      logForDebugging(
        'Git not available, skipping official marketplace auto-install',
      )
      const retryCount =
        (config.officialMarketplaceAutoInstallRetryCount || 0) + 1
      const now = Date.now()
      const nextRetryDelay = calculateNextRetryDelay(retryCount)
      const nextRetryTime = now + nextRetryDelay

      let configSaveFailed = false
      try {
        saveGlobalConfig(current => ({
          ...current,
          officialMarketplaceAutoInstallAttempted: true,
          officialMarketplaceAutoInstalled: false,
          officialMarketplaceAutoInstallFailReason: 'git_unavailable',
          officialMarketplaceAutoInstallRetryCount: retryCount,
          officialMarketplaceAutoInstallLastAttemptTime: now,
          officialMarketplaceAutoInstallNextRetryTime: nextRetryTime,
        }))
      } catch (saveError) {
        configSaveFailed = true
        // Log the error properly so it gets tracked
        const configError = toError(saveError)
        logError(configError)

        logForDebugging(
          `Failed to save marketplace auto-install git_unavailable state: ${saveError}`,
          { level: 'error' },
        )
      }
      return {
        installed: false,
        skipped: true,
        reason: 'git_unavailable',
        configSaveFailed,
      }
    }

    // Attempt installation
    logForDebugging('Attempting to auto-install official marketplace')
    await addMarketplaceSource(OFFICIAL_MARKETPLACE_SOURCE)

    // Success
    logForDebugging('Successfully auto-installed official marketplace')
    const previousRetryCount =
      config.officialMarketplaceAutoInstallRetryCount || 0
    saveGlobalConfig(current => ({
      ...current,
      officialMarketplaceAutoInstallAttempted: true,
      officialMarketplaceAutoInstalled: true,
      // Clear retry metadata on success
      officialMarketplaceAutoInstallFailReason: undefined,
      officialMarketplaceAutoInstallRetryCount: undefined,
      officialMarketplaceAutoInstallLastAttemptTime: undefined,
      officialMarketplaceAutoInstallNextRetryTime: undefined,
    }))
    return { installed: true, skipped: false }
  } catch (error) {
    // Handle installation failure
    const errorMessage = error instanceof Error ? error.message : String(error)

    // On macOS, /usr/bin/git is an xcrun shim that always exists on PATH, so
    // checkGitAvailable() (which only does `which git`) passes even without
    // Xcode CLT installed. The shim then fails at clone time with
    // "xcrun: error: invalid active developer path (...)". Poison the memoized
    // availability check so other git callers in this session skip cleanly,
    // then return silently without recording any attempt state — next startup
    // tries fresh (no backoff machinery for what is effectively "git absent").
    if (errorMessage.includes('xcrun: error:')) {
      markGitUnavailable()
      logForDebugging(
        'Official marketplace auto-install: git is a non-functional macOS xcrun shim, treating as git_unavailable',
      )
      return {
        installed: false,
        skipped: true,
        reason: 'git_unavailable',
      }
    }

    logForDebugging(
      `Failed to auto-install official marketplace: ${errorMessage}`,
      { level: 'error' },
    )
    logError(toError(error))

    const retryCount =
      (config.officialMarketplaceAutoInstallRetryCount || 0) + 1
    const now = Date.now()
    const nextRetryDelay = calculateNextRetryDelay(retryCount)
    const nextRetryTime = now + nextRetryDelay

    let configSaveFailed = false
    try {
      saveGlobalConfig(current => ({
        ...current,
        officialMarketplaceAutoInstallAttempted: true,
        officialMarketplaceAutoInstalled: false,
        officialMarketplaceAutoInstallFailReason: 'unknown',
        officialMarketplaceAutoInstallRetryCount: retryCount,
        officialMarketplaceAutoInstallLastAttemptTime: now,
        officialMarketplaceAutoInstallNextRetryTime: nextRetryTime,
      }))
    } catch (saveError) {
      configSaveFailed = true
      // Log the error properly so it gets tracked
      const configError = toError(saveError)
      logError(configError)

      logForDebugging(
        `Failed to save marketplace auto-install failure state: ${saveError}`,
        { level: 'error' },
      )

      // Still return the failure result even if config save failed
      // This ensures we report the installation failure correctly
    }

    return {
      installed: false,
      skipped: true,
      reason: 'unknown',
      configSaveFailed,
    }
  }
}
