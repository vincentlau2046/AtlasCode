/* eslint-disable custom-rules/no-sync-fs -- W4 全量 lint 复原（§8.74.21）：legacy-debt 豁免（sync→async 改写违行为零改动纪律，W-opt 波再议） */
/**
 * AscendFreshnessPort — knowledge-source drift detection port.
 *
 * Detects whether a pinned knowledge source (cannbot-skills / msprobe /
 * cann-learning-hub) has drifted from its upstream HEAD. The skill's
 * getPromptForCommand appends a NON-BLOCKING drift reminder when a source has
 * drifted (the skill still works — freshness is a signal, not a validity proof,
 * same contract as `mocked: true`).
 *
 * Design: vault 23 §5bis (Port 模式, 仿 AscendMockPort).
 *
 * Reads ONLY `.freshness-cache.json` (JSON — no yaml import in production).
 * The cache is self-contained: each repo entry carries both `pinned_sha`
 * (copied from the manifest by the sync script) and `upstream_head` (from
 * `git ls-remote`). The manifest YAML is read only by scripts/sync-ascend-knowledge.ts.
 *
 * Path resolution (graceful skip — never throws):
 *   1. ATLAS_ASCEND_FRESHNESS_CACHE env (test override / explicit path)
 *   2. walk up from this module to the repo root (package.json marker) → .freshness-cache.json
 *   3. not found → 'unknown' (bundled CLI has no source tree; production assumes
 *      just-verified, same as the verify script's graceful skip).
 *
 * 7-day staleness: checked_at older than 7 days → 'unknown' (re-sync needed).
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'

/** Per-repo drift detail. */
export interface DriftDetail {
  status: 'fresh' | 'drifted' | 'unknown'
  /** manifest pinned_sha (from cache). */
  pinned?: string
  /** upstream HEAD (from `git ls-remote`, in cache). */
  upstream?: string
  /** ISO timestamp of the last sync. */
  lastChecked?: string
  /** why status is unknown (for the reminder text). */
  reason?: string
}

/** Port interface — isolate freshness-cache reads so tests can inject a fake. */
export interface AscendFreshnessPort {
  /** Coarse status — 'fresh' | 'drifted' | 'unknown'. */
  getDriftStatus(repo: string): 'fresh' | 'drifted' | 'unknown'
  /** Full detail (status + pinned/upstream/lastChecked/reason) for the reminder text. */
  getDriftDetail(repo: string): DriftDetail
}

const STALE_DAYS = 7
const MAX_WALK_UP = 15

/** Default adapter — lazy-reads .freshness-cache.json, memoized per instance. */
export class DefaultAscendFreshnessPort implements AscendFreshnessPort {
  // undefined = not yet read; null = read but missing/invalid (graceful skip).
  private cache: any | null | undefined = undefined

  /**
   * @param injectedCache test seam — inject a parsed cache object directly,
   * bypassing the file read (keeps unit tests hermetic, no disk I/O). Production
   * (factory.ts) constructs with no arg → file-read path.
   */
  constructor(private readonly injectedCache?: any) {}

  private resolveCachePath(): string | null {
    const env = process.env.ATLAS_ASCEND_FRESHNESS_CACHE
    if (env) return env
    let dir = dirname(new URL(import.meta.url).pathname)
    for (let i = 0; i < MAX_WALK_UP; i++) {
      if (existsSync(join(dir, 'package.json'))) return join(dir, '.freshness-cache.json')
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return null
  }

  private loadCache(): any | null {
    if (this.cache !== undefined) return this.cache
    if (this.injectedCache !== undefined) {
      this.cache = this.injectedCache
      return this.cache
    }
    const p = this.resolveCachePath()
    if (!p || !existsSync(p)) {
      this.cache = null
      return null
    }
    try {
      this.cache = JSON.parse(readFileSync(p, 'utf8'))
    } catch {
      this.cache = null
    }
    return this.cache
  }

  getDriftDetail(repo: string): DriftDetail {
    const cache = this.loadCache()
    if (!cache || !cache.repos) {
      return {
        status: 'unknown',
        reason: 'freshness cache unavailable (bundled CLI or dev path not found)',
      }
    }
    const entry: any = cache.repos[repo]
    if (!entry) {
      return { status: 'unknown', reason: `repo ${repo} not in freshness cache` }
    }
    const pinned: string | undefined = entry.pinned_sha
    const upstream: string | undefined = entry.upstream_head
    if (!pinned || !upstream) {
      return {
        status: 'unknown', pinned, upstream, lastChecked: entry.checked_at,
        reason: `missing pinned_sha or upstream_head for ${repo}`,
      }
    }
    // 7-day staleness — stale cache can't confirm freshness.
    const checkedAt = entry.checked_at ? new Date(entry.checked_at).getTime() : 0
    if (!checkedAt || (Date.now() - checkedAt) / 86_400_000 > STALE_DAYS) {
      return {
        status: 'unknown', pinned, upstream, lastChecked: entry.checked_at,
        reason: `cache stale (last checked ${entry.checked_at || 'n/a'}, >${STALE_DAYS}d)`,
      }
    }
    // Compare (support short vs full SHA prefix — pinned may be short, upstream full).
    if (upstream === pinned || upstream.startsWith(pinned) || pinned.startsWith(upstream)) {
      return { status: 'fresh', pinned, upstream, lastChecked: entry.checked_at }
    }
    return { status: 'drifted', pinned, upstream, lastChecked: entry.checked_at }
  }

  getDriftStatus(repo: string): 'fresh' | 'drifted' | 'unknown' {
    return this.getDriftDetail(repo).status
  }
}
