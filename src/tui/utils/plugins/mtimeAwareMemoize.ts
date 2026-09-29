/* eslint-disable custom-rules/no-sync-fs -- W4 全量 lint 复原（§8.74.21）：legacy-debt 豁免（sync→async 改写违行为零改动纪律，W-opt 波再议） */
import { statSync } from 'fs'

/**
 * lodash-compatible memoize that additionally invalidates its cache when the
 * mtime of a watched file changes.
 *
 * The plugin loaders (loadAllPlugins / loadAllPluginsCacheOnly) are
 * process-level memoizes with no cross-process invalidation: a plugin
 * installed in another terminal leaves a long-lived TUI process showing the
 * pre-install state (the /plugin Installed tab and /skills stay empty until
 * a restart or /reload-plugins). Watching the two plugin registries
 * (known_marketplaces.json + installed_plugins.json) gives cheap
 * cross-process staleness detection — two sync stat() calls per cached
 * invocation, nothing else.
 *
 * Semantics:
 * - Cache hit only when the watched files' mtimeMs match the snapshot taken
 *   when the value was computed; otherwise the value is recomputed.
 * - A file that existed at cache time but is now missing (ENOENT or any
 *   stat error) counts as "changed" (sentinel -1), so it invalidates too.
 * - `.cache` exposes the lodash Map-like surface the call sites use
 *   (clear/set/get/delete/has) so existing call sites (clearPluginCache,
 *   loadAllPlugins warming the cache-only memoize) need no changes. A
 *   `.cache.set()` value is stamped with the current snapshot — it still
 *   invalidates when a watched file changes (an in-process warm never
 *   outlives a registry write).
 *
 * The watcher set is global (not per cache key): a registry write is
 * process-global state, so any change invalidates every cached entry.
 *
 * @param fn - Function to memoize (keyed like lodash memoize: first arg,
 *   or a single slot for zero-arg functions)
 * @param watchFiles - Zero-arg thunks returning absolute file paths.
 *   Thunked (not precomputed) so ATLAS_CONFIG_DIR test overrides resolve
 *   at call time.
 * @param options.stat - Injectable stat for tests (unit layer: no real
 *   disk). Defaults to node:fs statSync, mapping errors to the -1 sentinel.
 */

type LodashMemoizedCache<T> = {
  get: (key: unknown) => T | undefined
  set: (key: unknown, value: T) => void
  has: (key: unknown) => boolean
  delete: (key: unknown) => void
  clear: () => void
}

export type MtimeAwareMemoized<F extends (...args: any[]) => any> = F & {
  cache: LodashMemoizedCache<ReturnType<F>>
}

// Keying matches lodash memoize exactly: the first argument, or `undefined`
// for zero-arg calls. That matters — existing call sites warm the cache
// with `.cache.set(undefined, …)`, which only hits if zero-arg calls key
// on `undefined` (not a private symbol).

function defaultReadMtime(path: string): number {
  try {
    return statSync(path).mtimeMs
  } catch {
    // ENOENT / EACCES / … — treat any unreadable file as "changed"
    return -1
  }
}

export function mtimeAwareMemoize<F extends (...args: any[]) => any>(
  fn: F,
  watchFiles: Array<() => string>,
  options?: { stat?: (path: string) => number },
): MtimeAwareMemoized<F> {
  const readMtime = options?.stat ?? defaultReadMtime
  const backing = new Map<unknown, { value: ReturnType<F>; snapshot: number[] }>()

  const snapshotNow = (): number[] => watchFiles.map(w => readMtime(w()))

  function sameSnapshot(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }

  const cache: LodashMemoizedCache<ReturnType<F>> = {
    get: key => backing.get(key)?.value,
    set: (key, value) => {
      backing.set(key, { value, snapshot: snapshotNow() })
    },
    has: key => backing.has(key),
    delete: key => {
      backing.delete(key)
    },
    clear: () => {
      backing.clear()
    },
  }

  const memoized = ((...args: Parameters<F>) => {
    // lodash keying: first arg, or `undefined` when called with no args
    const key: unknown = args[0]
    const entry = backing.get(key)
    if (entry) {
      if (sameSnapshot(entry.snapshot, snapshotNow())) {
        return entry.value
      }
      // A watched registry file changed since this value was computed —
      // drop it and recompute.
      backing.delete(key)
    }
    const value = fn(...args)
    backing.set(key, { value, snapshot: snapshotNow() })
    return value
  }) as F

  ;(memoized as unknown as { cache: LodashMemoizedCache<ReturnType<F>> }).cache =
    cache
  return memoized as MtimeAwareMemoized<F>
}
