/**
 * Worktree mode is now unconditionally enabled for all users.
 *
 * Previously gated by GrowthBook flag 'atlas_worktree_mode', but the
 * CACHED_MAY_BE_STALE pattern returns the default (false) on first launch
 * before the cache is populated, silently swallowing --worktree.
 * See upstream issue 27044（原仓注释溯源，旧仓链接失效已裁，G-3 §8.74.28 R4）.
 */
export function isWorktreeModeEnabled(): boolean {
  return true
}
