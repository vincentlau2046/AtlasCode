/* eslint-disable custom-rules/no-process-env-top-level -- W4 全量 lint 复原（§8.74.21）：模块加载期捕获常量（含刻意捕获语义站点），惰性读改写违行为零改动纪律（W-opt 波再议） */
/**
 * Filesystem-based git state reading — avoids spawning git subprocesses.
 *
 * Covers: resolving .git directories (including worktrees/submodules),
 * parsing HEAD, resolving refs via loose files and packed-refs,
 * and the GitHeadWatcher that caches branch/SHA with fs.watchFile.
 *
 * Correctness notes (verified against git source):
 *   - HEAD: `ref: refs/heads/<branch>\n` or raw SHA (refs/files-backend.c)
 *   - Packed-refs: `<sha> <refname>\n`, skip `#` and `^` lines (packed-backend.c)
 *   - .git file (worktree): `gitdir: <path>\n` with optional relative path (setup.c)
 *   - Shallow: mere existence of `<commonDir>/shallow` means shallow (shallow.c)
 */

import { unwatchFile, watchFile } from 'fs'
import { readdir, readFile, stat } from 'fs/promises'
import { join, resolve } from 'path'
import { waitForScrollIdle } from 'src/tui/bootstrapState.js'
import { registerCleanup } from '../cleanupRegistry.js'
import { getCwd } from '../cwd.js'
import { execFileNoThrow } from '../execFileNoThrow.js'
import { findGitRoot } from '../git.js'
import { parseGitConfigValue } from './gitConfigParser.js'

// K4-4 (0.1.83, upstream 300): reftable plumbing constants. Mirrors engine
// worktree/git.ts GIT_NO_PROMPT_ENV; the git executable is read from env on
// every call (no module-level capture — the file header's lazy-read
// discipline) so tests can inject ATLAS_GIT_EXE.
const GIT_NO_PROMPT_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: '',
}

function gitExePath(): string {
  return process.env.ATLAS_GIT_EXE ?? 'git'
}

// ---------------------------------------------------------------------------
// resolveGitDir — find the actual .git directory
// ---------------------------------------------------------------------------

const resolveGitDirCache = new Map<string, string | null>()

/** Clear cached git dir resolutions. Exported for testing only. */
export function clearResolveGitDirCache(): void {
  resolveGitDirCache.clear()
}

/**
 * Resolve the actual .git directory for a repo.
 * Handles worktrees/submodules where .git is a file containing `gitdir: <path>`.
 * Memoized per startPath.
 */
export async function resolveGitDir(
  startPath?: string,
): Promise<string | null> {
  const cwd = resolve(startPath ?? getCwd())
  const cached = resolveGitDirCache.get(cwd)
  if (cached !== undefined) {
    return cached
  }

  const root = findGitRoot(cwd)
  if (!root) {
    resolveGitDirCache.set(cwd, null)
    return null
  }

  const gitPath = join(root, '.git')
  try {
    const st = await stat(gitPath)
    if (st.isFile()) {
      // Worktree or submodule: .git is a file with `gitdir: <path>`
      // Git strips trailing \n and \r (setup.c read_gitfile_gently).
      const content = (await readFile(gitPath, 'utf-8')).trim()
      if (content.startsWith('gitdir:')) {
        const rawDir = content.slice('gitdir:'.length).trim()
        const resolved = resolve(root, rawDir)
        resolveGitDirCache.set(cwd, resolved)
        return resolved
      }
    }
    // Regular repo: .git is a directory
    resolveGitDirCache.set(cwd, gitPath)
    return gitPath
  } catch {
    resolveGitDirCache.set(cwd, null)
    return null
  }
}

// ---------------------------------------------------------------------------
// isSafeRefName — validate ref/branch names read from .git/
// ---------------------------------------------------------------------------

/**
 * Validate that a ref/branch name read from .git/ is safe to use in path
 * joins, as git positional arguments, and when interpolated into shell
 * commands (commit-push-pr skill interpolates the branch into shell).
 * An attacker who controls .git/HEAD or a loose ref file could otherwise
 * embed path traversal (`..`), argument injection (leading `-`), or shell
 * metacharacters — .git/HEAD is a plain text file that can be written
 * without git's own check-ref-format validation.
 *
 * Allowlist: ASCII alphanumerics, `/`, `.`, `_`, `+`, `-`, `@` only. This
 * covers all legitimate git branch names (e.g. `feature/foo`,
 * `release-1.2.3+build`, `dependabot/npm_and_yarn/@types/node-18.0.0`)
 * while rejecting everything that could be dangerous in shell context
 * (newlines, backticks, `$`, `;`, `|`, `&`, `(`, `)`, `<`, `>`, spaces,
 * tabs, quotes, backslash) and path traversal (`..`).
 */
export function isSafeRefName(name: string): boolean {
  if (!name || name.startsWith('-') || name.startsWith('/')) {
    return false
  }
  if (name.includes('..')) {
    return false
  }
  // Reject single-dot and empty path components (`.`, `foo/./bar`, `foo//bar`,
  // `foo/`). Git-check-ref-format rejects these, and `.` normalizes away in
  // path joins so a tampered HEAD of `refs/heads/.` would make us watch the
  // refs/heads directory itself instead of a branch file.
  if (name.split('/').some(c => c === '.' || c === '')) {
    return false
  }
  // K4-4 (0.1.83, upstream 300): reject components starting with '.' and
  // components ending in '.lock' (git check-ref-format rules). A reftable
  // repo's HEAD file is permanently `ref: refs/heads/.invalid` — git
  // deliberately picks an illegal ref name so the placeholder can never
  // collide with a real branch; without the leading-dot rejection the
  // placeholder leaked through as a "branch name". `.lock` is git's own
  // lock-file namespace and never belongs to a user ref.
  if (name.split('/').some(c => c.startsWith('.') || c.endsWith('.lock'))) {
    return false
  }
  // Allowlist-only: alphanumerics, /, ., _, +, -, @. Rejects all shell
  // metacharacters, whitespace, NUL, and non-ASCII. Git's forbidden @{
  // sequence is blocked because { is not in the allowlist.
  if (!/^[a-zA-Z0-9/._+@-]+$/.test(name)) {
    return false
  }
  return true
}

/**
 * Validate that a string is a git SHA: 40 hex chars (SHA-1) or 64 hex chars
 * (SHA-256). Git never writes abbreviated SHAs to HEAD or ref files, so we
 * only accept full-length hashes.
 *
 * An attacker who controls .git/HEAD when detached, or a loose ref file,
 * could otherwise return arbitrary content that flows into shell contexts.
 */
export function isValidGitSha(s: string): boolean {
  return /^[0-9a-f]{40}$/.test(s) || /^[0-9a-f]{64}$/.test(s)
}

// ---------------------------------------------------------------------------
// readGitHead — parse .git/HEAD
// ---------------------------------------------------------------------------

/**
 * Parse .git/HEAD to determine current branch or detached SHA.
 *
 * HEAD format (per git source, refs/files-backend.c):
 *   - `ref: refs/heads/<branch>\n`  — on a branch
 *   - `ref: <other-ref>\n`          — unusual symref (e.g. during bisect)
 *   - `<hex-sha>\n`                 — detached HEAD (e.g. during rebase)
 *
 * Git strips trailing whitespace via strbuf_rtrim; .trim() is equivalent.
 * Git allows any whitespace between "ref:" and the path; we handle
 * this by trimming after slicing past "ref:".
 */
export async function readGitHead(
  gitDir: string,
): Promise<
  { type: 'branch'; name: string } | { type: 'detached'; sha: string } | null
> {
  const head = await readGitHeadFromFiles(gitDir)
  if (head) {
    return head
  }
  // K4-4 (0.1.83, upstream 300): reftable storage — the HEAD file is
  // permanently the `.invalid` placeholder (the real symref lives in the
  // reftable binary table; it never changes even when detached), so the fs
  // read is always null (the placeholder is now structurally rejected by
  // the hardened isSafeRefName). Fall back to git plumbing with an explicit
  // --git-dir (never depends on process cwd, never decodes the binary
  // table ourselves). Mirrors engine worktree/git.ts readGitHead.
  if (await isReftableStorage(gitDir)) {
    return readGitHeadViaGit(gitDir)
  }
  return null
}

async function readGitHeadFromFiles(
  gitDir: string,
): Promise<
  { type: 'branch'; name: string } | { type: 'detached'; sha: string } | null
> {
  try {
    const content = (await readFile(join(gitDir, 'HEAD'), 'utf-8')).trim()
    if (content.startsWith('ref:')) {
      const ref = content.slice('ref:'.length).trim()
      if (ref.startsWith('refs/heads/')) {
        const name = ref.slice('refs/heads/'.length)
        // Reject path traversal and argument injection from a tampered HEAD.
        if (!isSafeRefName(name)) {
          return null
        }
        return { type: 'branch', name }
      }
      // Unusual symref (not a local branch) — resolve to SHA
      if (!isSafeRefName(ref)) {
        return null
      }
      const sha = await resolveRef(gitDir, ref)
      return sha ? { type: 'detached', sha } : { type: 'detached', sha: '' }
    }
    // Raw SHA (detached HEAD). Validate: an attacker-controlled HEAD file
    // could contain shell metacharacters that flow into downstream shell
    // contexts.
    if (!isValidGitSha(content)) {
      return null
    }
    return { type: 'detached', sha: content }
  } catch {
    return null
  }
}

/**
 * Detect whether the repo's ref storage is reftable (K4-4): config
 * `[extensions] refstorage = reftable`. Check gitDir first (worktree gitdirs
 * have no config), then commonDir (the extensions config lives in the main
 * repo). Pure fs reads, no subprocess. Mirrors engine isReftableStorage.
 */
async function isReftableStorage(gitDir: string): Promise<boolean> {
  const dirs = [gitDir]
  const commonDir = await getCommonDir(gitDir)
  if (commonDir && commonDir !== gitDir) {
    dirs.push(commonDir)
  }
  for (const dir of dirs) {
    if (
      (await parseGitConfigValue(dir, 'extensions', null, 'refstorage')) ===
      'reftable'
    ) {
      return true
    }
  }
  return false
}

/**
 * reftable readGitHead (K4-4): `symbolic-ref -q HEAD` rc=0 → on a branch
 * (including unborn — git returns rc=0 with the real branch name for an
 * unborn HEAD, probe-verified); rc=1 → detached → `rev-parse --verify
 * --quiet HEAD` for the SHA. Plumbing failure (spawn failure / timeout /
 * illegal output) → null (fail-closed, never the placeholder value).
 * useCwd:false — the --git-dir flag makes process cwd irrelevant and avoids
 * re-entering getCwd() paths. Mirrors engine readGitHeadViaGit.
 */
async function readGitHeadViaGit(
  gitDir: string,
): Promise<
  { type: 'branch'; name: string } | { type: 'detached'; sha: string } | null
> {
  const sym = await execFileNoThrow(
    gitExePath(),
    ['--git-dir', gitDir, 'symbolic-ref', '-q', 'HEAD'],
    { stdin: 'ignore', useCwd: false, env: { ...process.env, ...GIT_NO_PROMPT_ENV } },
  )
  if (sym.code === 0) {
    const ref = sym.stdout.trim()
    if (ref.startsWith('refs/heads/')) {
      const name = ref.slice('refs/heads/'.length)
      return isSafeRefName(name) ? { type: 'branch', name } : null
    }
    // Unusual symref (not a local branch) — parity with the files path
    if (!isSafeRefName(ref)) {
      return null
    }
    const sha = await resolveRef(gitDir, ref)
    return sha ? { type: 'detached', sha } : { type: 'detached', sha: '' }
  }
  // rc=1 = detached HEAD; any other rc (including spawn failures folded to
  // a non-success code) is a real failure. The detached verdict is confirmed
  // by rev-parse — a spawn failure folds to failure in both steps → null.
  if (sym.code !== 1) {
    return null
  }
  const rev = await execFileNoThrow(
    gitExePath(),
    ['--git-dir', gitDir, 'rev-parse', '--verify', '--quiet', 'HEAD'],
    { stdin: 'ignore', useCwd: false, env: { ...process.env, ...GIT_NO_PROMPT_ENV } },
  )
  if (rev.code !== 0) {
    return null
  }
  const sha = rev.stdout.trim()
  return isValidGitSha(sha) ? { type: 'detached', sha } : null
}

// ---------------------------------------------------------------------------
// resolveRef — resolve loose/packed refs to SHAs
// ---------------------------------------------------------------------------

/**
 * Resolve a git ref (e.g. `refs/heads/main`) to a commit SHA.
 * Checks loose ref files first, then falls back to packed-refs.
 * Follows symrefs (e.g. `ref: refs/remotes/origin/main`).
 *
 * For worktrees, refs live in the common gitdir (pointed to by the
 * `commondir` file), not the worktree-specific gitdir. We check the
 * worktree gitdir first, then fall back to the common dir.
 *
 * Packed-refs format (per packed-backend.c):
 *   - Header: `# pack-refs with: <traits>\n`
 *   - Entries: `<40-hex-sha> <refname>\n`
 *   - Peeled:  `^<40-hex-sha>\n` (after annotated tag entries)
 */
export async function resolveRef(
  gitDir: string,
  ref: string,
): Promise<string | null> {
  const result = await resolveRefInDir(gitDir, ref)
  if (result) {
    return result
  }

  // For worktrees: try the common gitdir where shared refs live
  const commonDir = await getCommonDir(gitDir)
  if (commonDir && commonDir !== gitDir) {
    const common = await resolveRefInDir(commonDir, ref)
    if (common) {
      return common
    }
  }

  // K4-4 (0.1.83, upstream 300): reftable storage — refs live in the binary
  // table, invisible to loose/packed reads → git plumbing fallback.
  // isSafeRefName first: the ref may come from attacker-controlled .git
  // file content and is passed as a positional argument after --verify
  // (reject leading `-`). Don't peel tags (files-path parity: return the
  // object the ref points at). Plumbing failure still → null. Mirrors
  // engine resolveRef.
  if ((await isReftableStorage(gitDir)) && isSafeRefName(ref)) {
    const rev = await execFileNoThrow(
      gitExePath(),
      ['--git-dir', gitDir, 'rev-parse', '--verify', '--quiet', ref],
      { stdin: 'ignore', useCwd: false, env: { ...process.env, ...GIT_NO_PROMPT_ENV } },
    )
    if (rev.code !== 0) {
      return null
    }
    const sha = rev.stdout.trim()
    return isValidGitSha(sha) ? sha : null
  }

  return null
}

async function resolveRefInDir(
  dir: string,
  ref: string,
): Promise<string | null> {
  // Try loose ref file
  try {
    const content = (await readFile(join(dir, ref), 'utf-8')).trim()
    if (content.startsWith('ref:')) {
      const target = content.slice('ref:'.length).trim()
      // Reject path traversal in a tampered symref chain.
      if (!isSafeRefName(target)) {
        return null
      }
      return resolveRef(dir, target)
    }
    // Loose ref content should be a raw SHA. Validate: an attacker-controlled
    // ref file could contain shell metacharacters.
    if (!isValidGitSha(content)) {
      return null
    }
    return content
  } catch {
    // Loose ref doesn't exist, try packed-refs
  }

  try {
    const packed = await readFile(join(dir, 'packed-refs'), 'utf-8')
    for (const line of packed.split('\n')) {
      if (line.startsWith('#') || line.startsWith('^')) {
        continue
      }
      const spaceIdx = line.indexOf(' ')
      if (spaceIdx === -1) {
        continue
      }
      if (line.slice(spaceIdx + 1) === ref) {
        const sha = line.slice(0, spaceIdx)
        return isValidGitSha(sha) ? sha : null
      }
    }
  } catch {
    // No packed-refs
  }

  return null
}

/**
 * Read the `commondir` file to find the shared git directory.
 * In a worktree, this points to the main repo's .git dir.
 * Returns null if no commondir file exists (regular repo).
 */
export async function getCommonDir(gitDir: string): Promise<string | null> {
  try {
    const content = (await readFile(join(gitDir, 'commondir'), 'utf-8')).trim()
    return resolve(gitDir, content)
  } catch {
    return null
  }
}

/**
 * Read a raw symref file and extract the branch name after a known prefix.
 * Returns null if the ref doesn't exist, isn't a symref, or doesn't match the prefix.
 * Checks loose file only — packed-refs doesn't store symrefs.
 */
export async function readRawSymref(
  gitDir: string,
  refPath: string,
  branchPrefix: string,
): Promise<string | null> {
  try {
    const content = (await readFile(join(gitDir, refPath), 'utf-8')).trim()
    if (content.startsWith('ref:')) {
      const target = content.slice('ref:'.length).trim()
      if (target.startsWith(branchPrefix)) {
        const name = target.slice(branchPrefix.length)
        // Reject path traversal and argument injection from a tampered symref.
        if (!isSafeRefName(name)) {
          return null
        }
        return name
      }
    }
  } catch {
    // Not a loose ref
  }
  return null
}

// ---------------------------------------------------------------------------
// GitFileWatcher — watches git files and caches derived values.
// Lazily initialized on first cache access. Invalidates all cached
// values when any watched file changes.
//
// Watches:
//   .git/HEAD          — branch switches, detached HEAD
//   .git/config        — remote URL changes
//   .git/refs/heads/<branch> — new commits on the current branch
//   .git/reftable/     — reftable repos only (K4-4): branch switches + new
//                        commits (HEAD is a placeholder there and loose refs
//                        don't exist; the dir mtime bumps on every ref write)
//
// When HEAD changes (branch switch), the branch ref watcher is updated
// to track the new branch's ref file.
// ---------------------------------------------------------------------------

type CacheEntry<T> = {
  value: T
  dirty: boolean
  compute: () => Promise<T>
}

const WATCH_INTERVAL_MS = process.env.NODE_ENV === 'test' ? 10 : 1000

class GitFileWatcher {
  private gitDir: string | null = null
  private commonDir: string | null = null
  private initialized = false
  private initPromise: Promise<void> | null = null
  private watchedPaths: string[] = []
  private branchRefPath: string | null = null
  private cache = new Map<string, CacheEntry<unknown>>()

  async ensureStarted(): Promise<void> {
    if (this.initialized) {
      return
    }
    if (this.initPromise) {
      return this.initPromise
    }
    this.initPromise = this.start()
    return this.initPromise
  }

  private async start(): Promise<void> {
    this.gitDir = await resolveGitDir()
    this.initialized = true
    if (!this.gitDir) {
      return
    }

    // In a worktree, branch refs and the main config are shared and live in
    // commonDir, not the per-worktree gitDir. Resolve once so we don't
    // re-read the commondir file on every branch switch.
    this.commonDir = await getCommonDir(this.gitDir)

    // Watch .git/HEAD and .git/config
    this.watchPath(join(this.gitDir, 'HEAD'), () => {
      void this.onHeadChanged()
    })
    // Config (remote URLs) lives in commonDir for worktrees
    this.watchPath(join(this.commonDir ?? this.gitDir, 'config'), () => {
      this.invalidate()
    })

    // K4-4 (0.1.83, upstream 300): reftable storage — HEAD is a permanent
    // placeholder file and loose refs don't exist, so the watches above
    // never fire on branch switches or new commits. Watch the reftable
    // directory (in commonDir) instead: every ref write creates/rewrites a
    // table file, so the directory mtime changes (probe-verified; watchFile
    // works on directories).
    if (await isReftableStorage(this.gitDir)) {
      this.watchPath(join(this.commonDir ?? this.gitDir, 'reftable'), () => {
        this.invalidate()
      })
    }

    // Watch the current branch's ref file for commit changes
    await this.watchCurrentBranchRef()

    registerCleanup(async () => {
      this.stopWatching()
    })
  }

  private watchPath(path: string, callback: () => void): void {
    this.watchedPaths.push(path)
    watchFile(path, { interval: WATCH_INTERVAL_MS }, callback)
  }

  /**
   * Watch the loose ref file for the current branch.
   * Called on startup and whenever HEAD changes (branch switch).
   */
  private async watchCurrentBranchRef(): Promise<void> {
    if (!this.gitDir) {
      return
    }

    const head = await readGitHead(this.gitDir)
    // Branch refs live in commonDir for worktrees (gitDir for regular repos)
    const refsDir = this.commonDir ?? this.gitDir
    const refPath =
      head?.type === 'branch' ? join(refsDir, 'refs', 'heads', head.name) : null

    // Already watching this ref (or already not watching anything)
    if (refPath === this.branchRefPath) {
      return
    }

    // Stop watching old branch ref. Runs for branch→branch AND
    // branch→detached (checkout --detach, rebase, bisect).
    if (this.branchRefPath) {
      unwatchFile(this.branchRefPath)
      this.watchedPaths = this.watchedPaths.filter(
        p => p !== this.branchRefPath,
      )
    }

    this.branchRefPath = refPath

    if (!refPath) {
      return
    }

    // The ref file may not exist yet (new branch before first commit).
    // watchFile works on nonexistent files — it fires when the file appears.
    this.watchPath(refPath, () => {
      this.invalidate()
    })
  }

  private async onHeadChanged(): Promise<void> {
    // HEAD changed — could be a branch switch or detach.
    // Defer file I/O (readGitHead, watchFile setup) until scroll settles so
    // watchFile callbacks that land mid-scroll don't compete for the event
    // loop. invalidate() is cheap (just marks dirty) so do it first — the
    // cache correctly serves stale-marked values until the watcher updates.
    this.invalidate()
    await waitForScrollIdle()
    await this.watchCurrentBranchRef()
  }

  private invalidate(): void {
    for (const entry of this.cache.values()) {
      entry.dirty = true
    }
  }

  private stopWatching(): void {
    for (const path of this.watchedPaths) {
      unwatchFile(path)
    }
    this.watchedPaths = []
    this.branchRefPath = null
  }

  /**
   * Get a cached value by key. On first call for a key, computes and caches it.
   * Subsequent calls return the cached value until a watched file changes,
   * which marks the entry dirty. The next get() re-computes from disk.
   *
   * Race condition handling: dirty is cleared BEFORE the async compute starts.
   * If a file change arrives during compute, it re-sets dirty, so the next
   * get() will re-read again rather than serving a stale value.
   */
  async get<T>(key: string, compute: () => Promise<T>): Promise<T> {
    await this.ensureStarted()
    const existing = this.cache.get(key)
    if (existing && !existing.dirty) {
      return existing.value as T
    }
    // Clear dirty before compute — if the file changes again during the
    // async read, invalidate() will re-set dirty and we'll re-read on
    // the next get() call.
    if (existing) {
      existing.dirty = false
    }
    const value = await compute()
    // Only update the cached value if no new invalidation arrived during compute
    const entry = this.cache.get(key)
    if (entry && !entry.dirty) {
      entry.value = value
    }
    if (!entry) {
      this.cache.set(key, { value, dirty: false, compute })
    }
    return value
  }

  /** Reset all state. Stops file watchers. For testing only. */
  reset(): void {
    this.stopWatching()
    this.cache.clear()
    this.initialized = false
    this.initPromise = null
    this.gitDir = null
    this.commonDir = null
  }
}

const gitWatcher = new GitFileWatcher()

async function computeBranch(): Promise<string> {
  const gitDir = await resolveGitDir()
  if (!gitDir) {
    return 'HEAD'
  }
  const head = await readGitHead(gitDir)
  if (!head) {
    return 'HEAD'
  }
  return head.type === 'branch' ? head.name : 'HEAD'
}

async function computeHead(): Promise<string> {
  const gitDir = await resolveGitDir()
  if (!gitDir) {
    return ''
  }
  const head = await readGitHead(gitDir)
  if (!head) {
    return ''
  }
  if (head.type === 'branch') {
    return (await resolveRef(gitDir, `refs/heads/${head.name}`)) ?? ''
  }
  return head.sha
}

async function computeRemoteUrl(): Promise<string | null> {
  const gitDir = await resolveGitDir()
  if (!gitDir) {
    return null
  }
  const url = await parseGitConfigValue(gitDir, 'remote', 'origin', 'url')
  if (url) {
    return url
  }
  // In worktrees, the config with remote URLs is in the common dir
  const commonDir = await getCommonDir(gitDir)
  if (commonDir && commonDir !== gitDir) {
    return parseGitConfigValue(commonDir, 'remote', 'origin', 'url')
  }
  return null
}

async function computeDefaultBranch(): Promise<string> {
  const gitDir = await resolveGitDir()
  if (!gitDir) {
    return 'main'
  }
  // refs/remotes/ lives in commonDir, not the per-worktree gitDir
  const commonDir = (await getCommonDir(gitDir)) ?? gitDir
  const branchFromSymref = await readRawSymref(
    commonDir,
    'refs/remotes/origin/HEAD',
    'refs/remotes/origin/',
  )
  if (branchFromSymref) {
    return branchFromSymref
  }
  for (const candidate of ['main', 'master']) {
    const sha = await resolveRef(commonDir, `refs/remotes/origin/${candidate}`)
    if (sha) {
      return candidate
    }
  }
  return 'main'
}

export function getCachedBranch(): Promise<string> {
  return gitWatcher.get('branch', computeBranch)
}

export function getCachedHead(): Promise<string> {
  return gitWatcher.get('head', computeHead)
}

export function getCachedRemoteUrl(): Promise<string | null> {
  return gitWatcher.get('remoteUrl', computeRemoteUrl)
}

export function getCachedDefaultBranch(): Promise<string> {
  return gitWatcher.get('defaultBranch', computeDefaultBranch)
}

/** Reset the git file watcher state. For testing only. */
export function resetGitFileWatcher(): void {
  gitWatcher.reset()
}

/**
 * Read the HEAD SHA for an arbitrary directory (not using the watcher).
 * Used by plugins that need the HEAD of a specific repo, not the CWD repo.
 */
export async function getHeadForDir(cwd: string): Promise<string | null> {
  const gitDir = await resolveGitDir(cwd)
  if (!gitDir) {
    return null
  }
  const head = await readGitHead(gitDir)
  if (!head) {
    return null
  }
  if (head.type === 'branch') {
    return resolveRef(gitDir, `refs/heads/${head.name}`)
  }
  return head.sha
}

/**
 * Read the HEAD SHA for a git worktree directory (not the main repo).
 *
 * Unlike `getHeadForDir`, this reads `<worktreePath>/.git` directly as a
 * `gitdir:` pointer file, with no upward walk. `getHeadForDir` walks upward
 * via `findGitRoot` and would find the parent repo's `.git` when the
 * worktree path doesn't exist — misreporting the parent HEAD as the worktree's.
 *
 * Returns null if the worktree doesn't exist (`.git` pointer ENOENT) or is
 * malformed. Caller can treat null as "not a valid worktree".
 */
export async function readWorktreeHeadSha(
  worktreePath: string,
): Promise<string | null> {
  let gitDir: string
  try {
    const ptr = (await readFile(join(worktreePath, '.git'), 'utf-8')).trim()
    if (!ptr.startsWith('gitdir:')) {
      return null
    }
    gitDir = resolve(worktreePath, ptr.slice('gitdir:'.length).trim())
  } catch {
    return null
  }
  const head = await readGitHead(gitDir)
  if (!head) {
    return null
  }
  if (head.type === 'branch') {
    return resolveRef(gitDir, `refs/heads/${head.name}`)
  }
  return head.sha
}

/**
 * Read the remote origin URL for an arbitrary directory via .git/config.
 */
export async function getRemoteUrlForDir(cwd: string): Promise<string | null> {
  const gitDir = await resolveGitDir(cwd)
  if (!gitDir) {
    return null
  }
  const url = await parseGitConfigValue(gitDir, 'remote', 'origin', 'url')
  if (url) {
    return url
  }
  // In worktrees, the config with remote URLs is in the common dir
  const commonDir = await getCommonDir(gitDir)
  if (commonDir && commonDir !== gitDir) {
    return parseGitConfigValue(commonDir, 'remote', 'origin', 'url')
  }
  return null
}

/**
 * Check if we're in a shallow clone by looking for <commonDir>/shallow.
 * Per git's shallow.c, mere existence of the file means shallow.
 * The shallow file lives in commonDir, not the per-worktree gitDir.
 */
export async function isShallowClone(): Promise<boolean> {
  const gitDir = await resolveGitDir()
  if (!gitDir) {
    return false
  }
  const commonDir = (await getCommonDir(gitDir)) ?? gitDir
  try {
    await stat(join(commonDir, 'shallow'))
    return true
  } catch {
    return false
  }
}

/**
 * Count worktrees by reading <commonDir>/worktrees/ directory.
 * The worktrees/ directory lives in commonDir, not the per-worktree gitDir.
 * The main worktree is not listed there, so add 1.
 */
export async function getWorktreeCountFromFs(): Promise<number> {
  try {
    const gitDir = await resolveGitDir()
    if (!gitDir) {
      return 0
    }
    const commonDir = (await getCommonDir(gitDir)) ?? gitDir
    const entries = await readdir(join(commonDir, 'worktrees'))
    return entries.length + 1
  } catch {
    // No worktrees directory means only the main worktree
    return 1
  }
}
