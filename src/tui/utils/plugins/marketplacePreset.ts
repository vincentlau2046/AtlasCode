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
 *      `addMarketplaceSource` prevents a re-clone of the same source).
 *      EXCEPTION: a first-party **snapshot entry** (0.1.46 S3 fallback
 *      state, `isBuiltinSnapshotEntry`) does NOT short-circuit — the live
 *      source still gets a materialization attempt on this startup (git /
 *      network may have recovered since the fallback landed).
 *   3. enterprise policy allows the source
 *   4. git is available
 *   5. `addMarketplaceSource` (clone + registry write); a macOS xcrun-shim
 *      failure is treated as git_unavailable and poisons the availability
 *      memo for the rest of the session
 *
 * Zero-network fallback (0.1.46 三源波 S3, #301): on any live
 * materialization failure (git_unavailable / xcrun / unknown), the chain
 * falls back to materializing the bundled manifest snapshot
 * (marketplaceSnapshotFallback.ts) as a local directory source, so a fresh
 * install without git/network still sees the marketplace + plugin list in
 * `/plugin`. The result carries `fallback: 'builtin-snapshot'` so the
 * startup notification hooks keep 0.1.43 failure visibility (「源未就绪」
 * instead of a silent success).
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
import {
  installBuiltinSnapshotFallback,
  isBuiltinSnapshotEntry,
  removeBuiltinSnapshotDir,
} from './marketplaceSnapshotFallback.js'
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
  /**
   * 0.1.46 三源波 S3（#301）：live source 不可用、已回落内建 manifest 快照
   * 目录源（零网络）。`installed` 同为 true（/plugin 可见），但语义 =
   * 兜底态 —— 通知层据此保留 0.1.43 失败可见性（「源未就绪」提示），
   * 且下一次启动仍会尝试活物化（快照条目不短路 already_installed）。
   */
  fallback?: 'builtin-snapshot'
  /** The live-failure reason that triggered the snapshot fallback. */
  fallbackReason?: MarketplacePresetSkipReason
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
      const existing = knownMarketplaces[config.name]
      if (existing) {
        // 0.1.46 S3: a snapshot entry (previous fallback state) must NOT
        // short-circuit — the live source still gets a materialization
        // attempt on this startup (git/network may have recovered).
        if (isBuiltinSnapshotEntry(existing)) {
          logForDebugging(
            `${label} marketplace '${config.name}' is a built-in snapshot entry — attempting live materialization`,
          )
        } else {
          logForDebugging(
            `${label} marketplace '${config.name}' already installed, skipping`,
          )
          return {
            installed: false,
            skipped: true,
            reason: 'already_installed',
          }
        }
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
    const fallback = await trySnapshotFallback(config, 'git_unavailable')
    if (fallback) return fallback
    return { installed: false, skipped: true, reason: 'git_unavailable' }
  }

  // 5. clone + register
  try {
    logForDebugging(`Attempting to auto-install ${label} marketplace`)
    await addMarketplaceSource(config.source)
    logForDebugging(`Successfully auto-installed ${label} marketplace`)
    // Live clone landed — clean up any orphaned snapshot materialization
    // (best-effort; never fail the success path over it).
    if (config.name) {
      await removeBuiltinSnapshotDir(config.name)
    }
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
      const fallback = await trySnapshotFallback(config, 'git_unavailable')
      if (fallback) return fallback
      return { installed: false, skipped: true, reason: 'git_unavailable' }
    }

    logForDebugging(
      `Failed to auto-install ${label} marketplace: ${errorMessage}`,
      { level: 'error' },
    )
    logError(toError(error))
    const fallback = await trySnapshotFallback(config, 'unknown')
    if (fallback) return fallback
    return { installed: false, skipped: true, reason: 'unknown' }
  }
}

/**
 * 0.1.46 三源波 S3（#301）：live 物化失败后回落内建 manifest 快照目录源
 * （零网络兜底）。无 registry key（config.name 省略）或该 key 无 bundle
 * 快照时返回 null（调用方走原 skip 语义）。
 */
async function trySnapshotFallback(
  config: MarketplacePresetConfig,
  reason: MarketplacePresetSkipReason,
): Promise<MarketplacePresetCheckResult | null> {
  if (!config.name) return null
  const result = await installBuiltinSnapshotFallback(config.name)
  if (!result.ok) return null
  logForDebugging(
    `${config.displayName} marketplace: live source unavailable (${reason}) — using built-in snapshot catalog`,
  )
  return {
    installed: true,
    skipped: false,
    fallback: 'builtin-snapshot',
    fallbackReason: reason,
  }
}
