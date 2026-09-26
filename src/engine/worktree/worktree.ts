/**
 * worktree 域核心（E-7 S-7c，§8.48 + S-D2a §8.57 回填）：git worktree 的
 * agent 隔离面（createAgentWorktree / removeAgentWorktree /
 * cleanupStaleAgentWorktrees）+ 支撑核心（getOrCreateWorktree /
 * performPostCreationSetup / slug 校验）+ 交互会话绑定面（WorktreeSession /
 * createWorktreeForSession / keepWorktree / cleanupWorktree /
 * getCurrentWorktreeSession / restoreWorktreeSession /
 * generateTmuxSessionName，Enter/ExitWorktree 工具本体 S-D2b 消费）+ tmux 族。
 *
 * 旧仓 `src/utils/worktree.ts`(1451) 的**真子集**随迁。git 子进程 + .git
 * fs-plumbing 经 `./git`（本域自含 git 执行层）注入。
 *
 * 解耦裁定（H6 前向接缝 + 逐处登记，复审勿当遗漏重提）：
 *   - **worktree hooks 面整砍**（hasWorktreeCreateHook / executeWorktreeCreateHook /
 *     executeWorktreeRemoveHook，旧仓 hooks.ts）：新仓无 worktree 用户可配 VCS hook
 *     面 → createAgentWorktree/removeAgentWorktree 直走 git 路径。`removeAgentWorktree`
 *     的 `hookBased` 形参保留（消费方=工具本体波/E-wave-end 接线），为 true 时无 hook
 *     面可委派 → log warn + return false（登记）。
 *   - **交互会话绑定面已回填（S-D2a §8.57）**（WorktreeSession /
 *     currentWorktreeSession / createWorktreeForSession / keepWorktree /
 *     cleanupWorktree / getCurrentWorktreeSession / restoreWorktreeSession /
 *     generateTmuxSessionName），EnterWorktree/ExitWorktree 工具本体（S-D2b）消费。
 *     回填内部解耦逐处登记（复审勿当遗漏重提）：
 *       a. worktree hooks 面未落（E-7 裁定）→ createWorktreeForSession 的 hook 支裁
 *          （仅 git 路径，报错文案沿用 E-7 createAgentWorktree 的订正先例）；
 *          cleanupWorktree 的 hookBased 支随 removeAgentWorktree 先例 warn + 留置
 *          （type 的 hookBased 字段保 restore 旧持久化态兼容，新仓新会话恒非 hookBased）。
 *       b. saveCurrentProjectConfig 持久化面未落（CLI/持久化波）→ create/keep/cleanup
 *          三处保存点裁（登记）；restoreWorktreeSession 消费方（--resume 接线）随之
 *          归 CLI/bootstrap 波。
 *       c. getCwd() → process.cwd()（E-7 先例：已落路径 state cwd 与 process.cwd()
 *          恒 chdir/setCwd 同步；分叉接缝随 CLI/bootstrap 波，登记）。
 *       d. cleanupStaleAgentWorktrees 的 current-session skip 支 E-7 已裁——会话面
 *          回填后该支可接线，但 agent 临时 worktree 永不 current（E-7 裁定维持，
 *          暂不接线，登记）。
 *   - **tmux 族已回填（S-D2a §8.57）**（createTmuxSessionForWorktree /
 *     killTmuxSession / isTmuxAvailable / getTmuxInstallInstructions /
 *     parsePRReference），ExitWorktree remove 支 + generateTmuxSessionName 消费。
 *     旧 bare execFileNoThrow（useCwd → cwd=getCwd()）→ 新 execFileNoThrowWithCwd
 *     无显式 cwd（tmux 调用点不依赖 cwd：new-session 显式 -c；-V/kill-session 与
 *     cwd 无关；node execFile 缺省 cwd = process.cwd() ≈ 旧 state-cwd 缺省，登记）。
 *     execIntoTmuxWorktree 未回填（swarm 执行面，CLI/swarm 波，登记）。
 *   - **copyWorktreeIncludeFiles 整砍**：`ignore` npm 包唯一消费者，零外部消费者 +
 *     避免新依赖（新仓 deps 仅 openai+zod）。
 *   - **attribution hook 块整砍**（feature('COMMIT_ATTRIBUTION') + postCommitAttribution）：
 *     新仓 feature() 无 COMMIT_ATTRIBUTION 门 + postCommitAttribution 未落。
 *   - **hasWorktreeChanges 整砍**：旧仓零外部消费者（dead export）。
 *   - **getCwd → process.cwd**：bootstrap state cwd 未落（CLI/bootstrap 波）。
 *   - **settings.worktree 最小 typed cast**（getWorktreeSettings）：新仓 SettingsJson
 *     无 worktree 字段（§8.27 砍字段族，.passthrough() 兜底），读 sparsePaths/
 *     symlinkDirectories 两旋钮需显式 cast（登记）。
 *
 * 逐字保留（faithfulness 锚点）：
 *   - validateWorktreeSlug（`..`/`.`/绝对/`/` 段拒支 + 64 上限 + 逐段 allowlist）。
 *   - getOrCreateWorktree（fast-resume readWorktreeHeadSha + fetch + `worktree add -B`
 *     + sparse-checkout 回滚 + rev-parse baseSha）。
 *
 * 已知边角（登记，逐字旧仓非移植缺陷，消费方应预期）：fast-resume 时若 worktree
 * 目录仍在但其分支被带外 `git branch -D worktree-<slug>` 删除，readWorktreeHeadSha
 * 返 null（loose ref 消失）→ 落入新建支 → `git worktree add -B` 对已存在目录
 * fatal "already exists" → 抛出（审视 NOTE-1 登记）。
 *   - performPostCreationSetup 的 git/fs 核心（settings.local.json 拷贝 + core.hooksPath
 *     配置 + symlinkDirectories）。
 *   - cleanupStaleAgentWorktrees 的 EPHEMERAL_WORKTREE_PATTERNS + dirty/unpushed
 *     fail-closed 双守卫。
 *   - S-D2a §8.57 回填逐字锚点：WorktreeSession 字段面 / generateTmuxSessionName
 *     命名链（basename + [/.]→_）/ parsePRReference 双形态（GitHub URL + #N）/
 *     tmux 族 4 函数（-V / new-session -d -s -c / kill-session -t）/
 *     createWorktreeForSession 主链（validate → hook 裁后 git 路径 →
 *     performPostCreationSetup → 会话态装配）/ keepWorktree / cleanupWorktree
 *     （git worktree remove --force + sleep(100) + branch -D）。
 */
import { copyFile, mkdir, readdir, stat, symlink, utimes } from 'fs/promises'
import { basename, dirname, join } from 'path'
import {
  containsPathTraversal,
  errorMessage,
  getErrnoCode,
  getConfigDirName,
  getPlatform,
  logForDebugging,
} from '../../shared'
import {
  getInitialSettings,
  getRelativeSettingsFilePathForSource,
} from '../config'
import {
  execFileNoThrowWithCwd,
  findCanonicalGitRoot,
  findGitRoot,
  getDefaultBranch,
  getBranch,
  getCommonDir,
  gitExe,
  parseGitConfigValue,
  readWorktreeHeadSha,
  resolveGitDir,
  resolveRef,
} from './git'

const VALID_WORKTREE_SLUG_SEGMENT = /^[a-zA-Z0-9._-]+$/
const MAX_WORKTREE_SLUG_LENGTH = 64

/**
 * Validates a worktree slug to prevent path traversal and directory escape.
 *
 * The slug is joined into `getConfigDirName()/worktrees/<slug>` via path.join, which
 * normalizes `..` segments — so `../../../target` would escape the worktrees
 * directory. Similarly, an absolute path (leading `/` or `C:\`) would discard
 * the prefix entirely.
 *
 * Forward slashes are allowed for nesting (e.g. `asm/feature-foo`); each
 * segment is validated independently against the allowlist, so `.` / `..`
 * segments and drive-spec characters are still rejected.
 *
 * Throws synchronously — callers rely on this running before any side effects
 * (git commands, chdir).
 */
export function validateWorktreeSlug(slug: string): void {
  if (slug.length > MAX_WORKTREE_SLUG_LENGTH) {
    throw new Error(
      `Invalid worktree name: must be ${MAX_WORKTREE_SLUG_LENGTH} characters or fewer (got ${slug.length})`,
    )
  }
  // Leading or trailing `/` would make path.join produce an absolute path
  // or a dangling segment. Splitting and validating each segment rejects
  // both (empty segments fail the regex) while allowing `user/feature`.
  for (const segment of slug.split('/')) {
    if (segment === '.' || segment === '..') {
      throw new Error(
        `Invalid worktree name "${slug}": must not contain "." or ".." path segments`,
      )
    }
    if (!VALID_WORKTREE_SLUG_SEGMENT.test(segment)) {
      throw new Error(
        `Invalid worktree name "${slug}": each "/"-separated segment must be non-empty and contain only letters, digits, dots, underscores, and dashes`,
      )
    }
  }
}

// Helper function to create directories recursively
async function mkdirRecursive(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

/**
 * Symlinks directories from the main repository to avoid duplication.
 * This prevents disk bloat from duplicating node_modules and other large directories.
 *
 * @param repoRootPath - Path to the main repository root
 * @param worktreePath - Path to the worktree directory
 * @param dirsToSymlink - Array of directory names to symlink (e.g., ['node_modules'])
 */
async function symlinkDirectories(
  repoRootPath: string,
  worktreePath: string,
  dirsToSymlink: string[],
): Promise<void> {
  for (const dir of dirsToSymlink) {
    // Validate directory doesn't escape repository boundaries
    if (containsPathTraversal(dir)) {
      logForDebugging(
        `Skipping symlink for "${dir}": path traversal detected`,
        { level: 'warn' },
      )
      continue
    }

    const sourcePath = join(repoRootPath, dir)
    const destPath = join(worktreePath, dir)

    try {
      await symlink(sourcePath, destPath, 'dir')
      logForDebugging(
        `Symlinked ${dir} from main repository to worktree to avoid disk bloat`,
      )
    } catch (error) {
      const code = getErrnoCode(error)
      // ENOENT: source doesn't exist yet (expected - skip silently)
      // EEXIST: destination already exists (expected - skip silently)
      if (code !== 'ENOENT' && code !== 'EEXIST') {
        // Unexpected error (e.g., permission denied, unsupported platform)
        logForDebugging(
          `Failed to symlink ${dir} (${code ?? 'unknown'}): ${errorMessage(error)}`,
          { level: 'warn' },
        )
      }
    }
  }
}

/**
 * 读 settings.worktree 旋钮。新仓 SettingsJson 无 worktree 字段（§8.27 砍字段族，
 * .passthrough() 兜底）→ 最小 typed cast 读 sparsePaths / symlinkDirectories 两旋钮
 * （解耦裁定，见文件头注）。
 */
function getWorktreeSettings(): {
  sparsePaths?: string[]
  symlinkDirectories?: string[]
} {
  return (
    getInitialSettings() as unknown as {
      worktree?: { sparsePaths?: string[]; symlinkDirectories?: string[] }
    }
  ).worktree ?? {}
}

// Env vars to prevent git/SSH from prompting for credentials (which hangs the CLI).
// GIT_TERMINAL_PROMPT=0 prevents git from opening /dev/tty for credential prompts.
// GIT_ASKPASS='' disables askpass GUI programs.
// stdin: 'ignore' closes stdin so interactive prompts can't block.
const GIT_NO_PROMPT_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: '',
}

function worktreesDir(repoRoot: string): string {
  return join(repoRoot, getConfigDirName(), 'worktrees')
}

// Flatten nested slugs (`user/feature` → `user+feature`) for both the branch
// name and the directory path. Nesting in either location is unsafe:
//   - git refs: `worktree-user` (file) vs `worktree-user/feature` (needs dir)
//     is a D/F conflict that git rejects.
//   - directory: `getConfigDirName()/worktrees/user/feature/` lives inside the `user`
//     worktree; `git worktree remove` on the parent deletes children with
//     uncommitted work.
// `+` is valid in git branch names and filesystem paths but NOT in the
// slug-segment allowlist ([a-zA-Z0-9._-]), so the mapping is injective.
function flattenSlug(slug: string): string {
  return slug.replaceAll('/', '+')
}

export function worktreeBranchName(slug: string): string {
  return `worktree-${flattenSlug(slug)}`
}

function worktreePathFor(repoRoot: string, slug: string): string {
  return join(worktreesDir(repoRoot), flattenSlug(slug))
}

// ── 交互会话绑定面（S-D2a §8.57 回填；解耦登记 a-d 见文件头注）──────────────
/**
 * 当前会话的 worktree 态（旧仓 WorktreeSession 字段面逐字）。
 * hookBased 仅在 restore 旧持久化会话时为 true（新仓无 hooks 面，新会话恒
 * 非 hookBased；type 面保 restore 兼容，见头注登记 a）。
 */
export type WorktreeSession = {
  originalCwd: string
  worktreePath: string
  worktreeName: string
  worktreeBranch?: string
  originalBranch?: string
  originalHeadCommit?: string
  sessionId: string
  tmuxSessionName?: string
  hookBased?: boolean
  /** How long worktree creation took (unset when resuming an existing worktree). */
  creationDurationMs?: number
  /** True if git sparse-checkout was applied via settings.worktree.sparsePaths. */
  usedSparsePaths?: boolean
}

let currentWorktreeSession: WorktreeSession | null = null

export function getCurrentWorktreeSession(): WorktreeSession | null {
  return currentWorktreeSession
}

/**
 * Restore the worktree session on --resume. The caller must have already
 * verified the directory exists (via process.chdir) and set the bootstrap
 * state (cwd, originalCwd).
 */
export function restoreWorktreeSession(session: WorktreeSession | null): void {
  currentWorktreeSession = session
}

export function generateTmuxSessionName(
  repoPath: string,
  branch: string,
): string {
  const repoName = basename(repoPath)
  const combined = `${repoName}_${branch}`
  return combined.replace(/[/.]/g, '_')
}

type WorktreeCreateResult =
  | {
      worktreePath: string
      worktreeBranch: string
      headCommit: string
      existed: true
    }
  | {
      worktreePath: string
      worktreeBranch: string
      headCommit: string
      baseBranch: string
      existed: false
    }

/**
 * Creates a new git worktree for the given slug, or resumes it if it already exists.
 * Named worktrees reuse the same path across invocations, so the existence check
 * prevents unconditionally running `git fetch` (which can hang waiting for credentials)
 * on every resume.
 */
async function getOrCreateWorktree(
  repoRoot: string,
  slug: string,
  options?: { prNumber?: number },
): Promise<WorktreeCreateResult> {
  const worktreePath = worktreePathFor(repoRoot, slug)
  const worktreeBranch = worktreeBranchName(slug)

  // Fast resume path: if the worktree already exists skip fetch and creation.
  // Read the .git pointer file directly (no subprocess, no upward walk) — a
  // subprocess `rev-parse HEAD` burns ~15ms on spawn overhead even for a 2ms
  // task, and the await yield lets background spawnSyncs pile on (seen at 55ms).
  const existingHead = await readWorktreeHeadSha(worktreePath)
  if (existingHead) {
    return {
      worktreePath,
      worktreeBranch,
      headCommit: existingHead,
      existed: true,
    }
  }

  // New worktree: fetch base branch then add
  await mkdir(worktreesDir(repoRoot), { recursive: true })

  const fetchEnv = { ...process.env, ...GIT_NO_PROMPT_ENV }

  let baseBranch: string
  let baseSha: string | null = null
  if (options?.prNumber) {
    const { code: prFetchCode, stderr: prFetchStderr } =
      await execFileNoThrowWithCwd(
        gitExe(),
        ['fetch', 'origin', `pull/${options.prNumber}/head`],
        { cwd: repoRoot, stdin: 'ignore', env: fetchEnv },
      )
    if (prFetchCode !== 0) {
      throw new Error(
        `Failed to fetch PR #${options.prNumber}: ${prFetchStderr.trim() || 'PR may not exist or the repository may not have a remote named "origin"'}`,
      )
    }
    baseBranch = 'FETCH_HEAD'
  } else {
    // If origin/<branch> already exists locally, skip fetch. In large repos
    // (210k files, 16M objects) fetch burns ~6-8s on a local commit-graph
    // scan before even hitting the network. A slightly stale base is fine —
    // the user can pull in the worktree if they want latest.
    // resolveRef reads the loose/packed ref directly; when it succeeds we
    // already have the SHA, so the later rev-parse is skipped entirely.
    const [defaultBranch, gitDir] = await Promise.all([
      getDefaultBranch(),
      resolveGitDir(repoRoot),
    ])
    const originRef = `origin/${defaultBranch}`
    const originSha = gitDir
      ? await resolveRef(gitDir, `refs/remotes/origin/${defaultBranch}`)
      : null
    if (originSha) {
      baseBranch = originRef
      baseSha = originSha
    } else {
      const { code: fetchCode } = await execFileNoThrowWithCwd(
        gitExe(),
        ['fetch', 'origin', defaultBranch],
        { cwd: repoRoot, stdin: 'ignore', env: fetchEnv },
      )
      baseBranch = fetchCode === 0 ? originRef : 'HEAD'
    }
  }

  // For the fetch/PR-fetch paths we still need the SHA — the fs-only resolveRef
  // above only covers the "origin/<branch> already exists locally" case.
  if (!baseSha) {
    const { stdout, code: shaCode } = await execFileNoThrowWithCwd(
      gitExe(),
      ['rev-parse', baseBranch],
      { cwd: repoRoot },
    )
    if (shaCode !== 0) {
      throw new Error(
        `Failed to resolve base branch "${baseBranch}": git rev-parse failed`,
      )
    }
    baseSha = stdout.trim()
  }

  const sparsePaths = getWorktreeSettings().sparsePaths
  const addArgs = ['worktree', 'add']
  if (sparsePaths?.length) {
    addArgs.push('--no-checkout')
  }
  // -B (not -b): reset any orphan branch left behind by a removed worktree dir.
  // Saves a `git branch -D` subprocess (~15ms spawn) on every create.
  addArgs.push('-B', worktreeBranch, worktreePath, baseBranch)

  const { code: createCode, stderr: createStderr } =
    await execFileNoThrowWithCwd(gitExe(), addArgs, { cwd: repoRoot })
  if (createCode !== 0) {
    throw new Error(`Failed to create worktree: ${createStderr}`)
  }

  if (sparsePaths?.length) {
    // If sparse-checkout or checkout fail after --no-checkout, the worktree
    // is registered and HEAD is set but the working tree is empty. Next run's
    // fast-resume (rev-parse HEAD) would succeed and present a broken worktree
    // as "resumed". Tear it down before propagating the error.
    const tearDown = async (msg: string): Promise<never> => {
      await execFileNoThrowWithCwd(
        gitExe(),
        ['worktree', 'remove', '--force', worktreePath],
        { cwd: repoRoot },
      )
      throw new Error(msg)
    }
    const { code: sparseCode, stderr: sparseErr } =
      await execFileNoThrowWithCwd(
        gitExe(),
        ['sparse-checkout', 'set', '--cone', '--', ...sparsePaths],
        { cwd: worktreePath },
      )
    if (sparseCode !== 0) {
      await tearDown(`Failed to configure sparse-checkout: ${sparseErr}`)
    }
    const { code: coCode, stderr: coErr } = await execFileNoThrowWithCwd(
      gitExe(),
      ['checkout', 'HEAD'],
      { cwd: worktreePath },
    )
    if (coCode !== 0) {
      await tearDown(`Failed to checkout sparse worktree: ${coErr}`)
    }
  }

  return {
    worktreePath,
    worktreeBranch,
    headCommit: baseSha,
    baseBranch,
    existed: false,
  }
}

/**
 * Post-creation setup for a newly created worktree.
 * Propagates settings.local.json, configures git hooks, and symlinks directories.
 *
 * 已裁（H6，见文件头注）：copyWorktreeIncludeFiles（.worktreeinclude 拷贝）+
 * attribution hook 块（feature('COMMIT_ATTRIBUTION') + postCommitAttribution）。
 */
async function performPostCreationSetup(
  repoRoot: string,
  worktreePath: string,
): Promise<void> {
  // Copy settings.local.json to the worktree's getConfigDirName() directory
  // This propagates local settings (which may contain secrets) to the worktree
  const localSettingsRelativePath =
    getRelativeSettingsFilePathForSource('localSettings')
  const sourceSettingsLocal = join(repoRoot, localSettingsRelativePath)
  try {
    const destSettingsLocal = join(worktreePath, localSettingsRelativePath)
    await mkdirRecursive(dirname(destSettingsLocal))
    await copyFile(sourceSettingsLocal, destSettingsLocal)
    logForDebugging(
      `Copied settings.local.json to worktree: ${destSettingsLocal}`,
    )
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    if (code !== 'ENOENT') {
      logForDebugging(
        `Failed to copy settings.local.json: ${(e as Error).message}`,
        { level: 'warn' },
      )
    }
  }

  // Configure the worktree to use hooks from the main repository
  // This solves issues with .husky and other git hooks that use relative paths
  const huskyPath = join(repoRoot, '.husky')
  const gitHooksPath = join(repoRoot, '.git', 'hooks')
  let hooksPath: string | null = null
  for (const candidatePath of [huskyPath, gitHooksPath]) {
    try {
      const s = await stat(candidatePath)
      if (s.isDirectory()) {
        hooksPath = candidatePath
        break
      }
    } catch {
      // Path doesn't exist or can't be accessed
    }
  }
  if (hooksPath) {
    // `git config` (no --worktree flag) writes to the main repo's .git/config,
    // shared by all worktrees. Once set, every subsequent worktree create is a
    // no-op — skip the subprocess (~14ms spawn) when the value already matches.
    const gitDir = await resolveGitDir(repoRoot)
    const configDir = gitDir ? ((await getCommonDir(gitDir)) ?? gitDir) : null
    const existing = configDir
      ? await parseGitConfigValue(configDir, 'core', null, 'hooksPath')
      : null
    if (existing !== hooksPath) {
      const { code: configCode, stderr: configError } =
        await execFileNoThrowWithCwd(
          gitExe(),
          ['config', 'core.hooksPath', hooksPath],
          { cwd: worktreePath },
        )
      if (configCode === 0) {
        logForDebugging(
          `Configured worktree to use hooks from main repository: ${hooksPath}`,
        )
      } else {
        logForDebugging(`Failed to configure hooks path: ${configError}`, {
          level: 'error',
        })
      }
    }
  }

  // Symlink directories to avoid disk bloat (opt-in via settings)
  const dirsToSymlink = getWorktreeSettings().symlinkDirectories ?? []
  if (dirsToSymlink.length > 0) {
    await symlinkDirectories(repoRoot, worktreePath, dirsToSymlink)
  }
}

// ── S-D2a §8.57 回填：tmux 族 + 会话三入口（解耦登记见文件头注）────────────
/**
 * Parses a PR reference from a string.
 * Accepts GitHub-style PR URLs (e.g., https://github.com/owner/repo/pull/123,
 * or GHE equivalents like https://ghe.example.com/owner/repo/pull/123)
 * or `#N` format (e.g., #123).
 * Returns the PR number or null if the string is not a recognized PR reference.
 */
export function parsePRReference(input: string): number | null {
  // GitHub-style PR URL: https://<host>/owner/repo/pull/123 (with optional trailing slash, query, hash)
  // The /pull/N path shape is specific to GitHub — GitLab uses /-/merge_requests/N,
  // Bitbucket uses /pull-requests/N — so matching any host here is safe.
  const urlMatch = input.match(
    /^https?:\/\/[^/]+\/[^/]+\/[^/]+\/pull\/(\d+)\/?(?:[?#].*)?$/i,
  )
  if (urlMatch?.[1]) {
    return parseInt(urlMatch[1], 10)
  }

  // #N format
  const hashMatch = input.match(/^#(\d+)$/)
  if (hashMatch?.[1]) {
    return parseInt(hashMatch[1], 10)
  }

  return null
}

// 本地 sleep（旧仓 utils/sleep.js；新仓 sessionMemory/taskOutputTool 同族 idiom）。
const sleep = (ms: number): Promise<void> =>
  new Promise(r => setTimeout(r, ms))

export async function isTmuxAvailable(): Promise<boolean> {
  // S-D2a 登记：旧 bare execFileNoThrow（useCwd）→ 无显式 cwd 变体（见头注）。
  const { code } = await execFileNoThrowWithCwd('tmux', ['-V'])
  return code === 0
}

export function getTmuxInstallInstructions(): string {
  const platform = getPlatform()
  switch (platform) {
    case 'macos':
      return 'Install tmux with: brew install tmux'
    case 'linux':
    case 'wsl':
      return 'Install tmux with: sudo apt install tmux (Debian/Ubuntu) or sudo dnf install tmux (Fedora/RHEL)'
    case 'windows':
      return 'tmux is not natively available on Windows. Consider using WSL or Cygwin.'
    default:
      return 'Install tmux using your system package manager.'
  }
}

export async function createTmuxSessionForWorktree(
  sessionName: string,
  worktreePath: string,
): Promise<{ created: boolean; error?: string }> {
  const { code, stderr } = await execFileNoThrowWithCwd('tmux', [
    'new-session',
    '-d',
    '-s',
    sessionName,
    '-c',
    worktreePath,
  ])

  if (code !== 0) {
    return { created: false, error: stderr }
  }

  return { created: true }
}

export async function killTmuxSession(sessionName: string): Promise<boolean> {
  const { code } = await execFileNoThrowWithCwd('tmux', [
    'kill-session',
    '-t',
    sessionName,
  ])
  return code === 0
}

/**
 * Create (or resume) a worktree for the interactive session and record it as
 * the current session worktree. EnterWorktree 工具本体（S-D2b）入口。
 *
 * S-D2a 解耦登记（见文件头注 a-d）：hook 支裁（仅 git 路径）/
 * saveCurrentProjectConfig 保存点裁 / getCwd() → process.cwd()。
 */
export async function createWorktreeForSession(
  sessionId: string,
  slug: string,
  tmuxSessionName?: string,
  options?: { prNumber?: number },
): Promise<WorktreeSession> {
  // Must run before the hook branch below — hooks receive the raw slug as an
  // argument, and the git branch builds a path from it via path.join.
  validateWorktreeSlug(slug)

  // S-D2a 登记 c：旧 getCwd()（state cwd）→ process.cwd()。
  const originalCwd = process.cwd()

  // H6 前向接缝（登记 a）：worktree hooks 面（用户可配 VCS WorktreeCreate hook）
  // 未落 → 无 hook 分支，直接 git 路径（旧仓 hasWorktreeCreateHook 分支裁，
  // E-7 S-7c createAgentWorktree 同裁定）。
  const gitRoot = findGitRoot(process.cwd())
  if (!gitRoot) {
    throw new Error(
      'Cannot create a worktree: not in a git repository. ' +
        'Worktree isolation requires a git repository (new repo has no WorktreeCreate ' +
        'hook 面; that forward seam lands with the CLI/bootstrap wave).',
    )
  }

  const originalBranch = await getBranch()

  const createStart = Date.now()
  const { worktreePath, worktreeBranch, headCommit, existed } =
    await getOrCreateWorktree(gitRoot, slug, options)

  let creationDurationMs: number | undefined
  if (existed) {
    logForDebugging(`Resuming existing worktree at: ${worktreePath}`)
  } else {
    logForDebugging(
      `Created worktree at: ${worktreePath} on branch: ${worktreeBranch}`,
    )
    await performPostCreationSetup(gitRoot, worktreePath)
    creationDurationMs = Date.now() - createStart
  }

  currentWorktreeSession = {
    originalCwd,
    worktreePath,
    worktreeName: slug,
    worktreeBranch,
    originalBranch,
    originalHeadCommit: headCommit,
    sessionId,
    tmuxSessionName,
    creationDurationMs,
    // S-D2a 登记：新仓 SettingsJson 无 worktree 字段 → 本地 cast idiom 读旋钮。
    usedSparsePaths: (getWorktreeSettings().sparsePaths?.length ?? 0) > 0,
  }

  // S-D2a 登记 b：saveCurrentProjectConfig 持久化面未落（CLI/持久化波）→ 保存点裁。
  return currentWorktreeSession
}

export async function keepWorktree(): Promise<void> {
  if (!currentWorktreeSession) {
    return
  }

  try {
    const { worktreePath, originalCwd, worktreeBranch } = currentWorktreeSession

    // Change back to original directory first
    process.chdir(originalCwd)

    // Clear the session but keep the worktree intact
    currentWorktreeSession = null

    // S-D2a 登记 b：saveCurrentProjectConfig 保存点裁。

    logForDebugging(
      `Linked worktree preserved at: ${worktreePath}${worktreeBranch ? ` on branch: ${worktreeBranch}` : ''}`,
    )
    logForDebugging(
      `You can continue working there by running: cd ${worktreePath}`,
    )
  } catch (error) {
    logForDebugging(`Error keeping worktree: ${error}`, {
      level: 'error',
    })
  }
}

export async function cleanupWorktree(): Promise<void> {
  if (!currentWorktreeSession) {
    return
  }

  try {
    const { worktreePath, originalCwd, worktreeBranch, hookBased } =
      currentWorktreeSession

    // Change back to original directory first
    process.chdir(originalCwd)

    if (hookBased) {
      // S-D2a 登记 a：WorktreeRemove hook 面未落（E-7 S-7c 裁定；
      // removeAgentWorktree 先例）→ warn + 留置（worktree 留在原地）。
      logForDebugging(
        `Hook-based worktree cleanup requested but no WorktreeRemove hook 面 in new repo; worktree left at: ${worktreePath}`,
        { level: 'warn' },
      )
    } else {
      // Git-based worktree: use git worktree remove.
      // Explicit cwd: the chdir above may already have failed or landed
      // elsewhere (e.g. originalCwd deleted out-of-band, S-D2a 登记 c 语境——
      // state cwd 分叉未落），so pass originalCwd explicitly instead of
      // relying on the process cwd default.
      const { code: removeCode, stderr: removeError } =
        await execFileNoThrowWithCwd(
          gitExe(),
          ['worktree', 'remove', '--force', worktreePath],
          { cwd: originalCwd },
        )

      if (removeCode !== 0) {
        logForDebugging(`Failed to remove linked worktree: ${removeError}`, {
          level: 'error',
        })
      } else {
        logForDebugging(`Removed linked worktree at: ${worktreePath}`)
      }
    }

    // Clear the session
    currentWorktreeSession = null

    // S-D2a 登记 b：saveCurrentProjectConfig 保存点裁。

    // Delete the temporary worktree branch (git-based only)
    if (!hookBased && worktreeBranch) {
      // Wait a bit to ensure git has released all locks
      await sleep(100)

      const { code: deleteBranchCode, stderr: deleteBranchError } =
        await execFileNoThrowWithCwd(
          gitExe(),
          ['branch', '-D', worktreeBranch],
          { cwd: originalCwd },
        )

      if (deleteBranchCode !== 0) {
        logForDebugging(
          `Could not delete worktree branch: ${deleteBranchError}`,
          { level: 'error' },
        )
      } else {
        logForDebugging(`Deleted worktree branch: ${worktreeBranch}`)
      }
    }

    logForDebugging('Linked worktree cleaned up completely')
  } catch (error) {
    logForDebugging(`Error cleaning up worktree: ${error}`, {
      level: 'error',
    })
  }
}

/**
 * Create a lightweight worktree for a subagent.
 * Reuses getOrCreateWorktree/performPostCreationSetup but does NOT touch
 * global session state (currentWorktreeSession, process.chdir, project config).
 *
 * H6 前向接缝（见文件头注）：新仓无 worktree hooks 面 → 直走 git 路径。
 * findCanonicalGitRoot（非 findGitRoot）使 agent worktree 恒落主仓
 * getConfigDirName()/worktrees/（即便从 session worktree 内 spawn），否则嵌套在
 * <worktree>/getConfigDirName()/worktrees/ 而周期清理（扫 canonical root）找不到。
 */
export async function createAgentWorktree(slug: string): Promise<{
  worktreePath: string
  worktreeBranch?: string
  headCommit?: string
  gitRoot?: string
  hookBased?: boolean
}> {
  validateWorktreeSlug(slug)

  // H6 前向接缝：worktree hooks 面（用户可配 VCS WorktreeCreate/Remove hook）未落 →
  // 无 hook 分支，直接 git 路径（旧仓 hasWorktreeCreateHook 分支裁）。
  const gitRoot = findCanonicalGitRoot(process.cwd())
  if (!gitRoot) {
    throw new Error(
      'Cannot create agent worktree: not in a git repository. ' +
        'Worktree isolation requires a git repository (new repo has no WorktreeCreate ' +
        'hook 面; that forward seam lands with the tool-body / E-wave-end wave).',
    )
  }

  const { worktreePath, worktreeBranch, headCommit, existed } =
    await getOrCreateWorktree(gitRoot, slug)

  if (!existed) {
    logForDebugging(
      `Created agent worktree at: ${worktreePath} on branch: ${worktreeBranch}`,
    )
    await performPostCreationSetup(gitRoot, worktreePath)
  } else {
    // Bump mtime so the periodic stale-worktree cleanup doesn't consider this
    // worktree stale — the fast-resume path is read-only and leaves the original
    // creation-time mtime intact, which can be past the 30-day cutoff.
    const now = new Date()
    await utimes(worktreePath, now, now)
    logForDebugging(`Resuming existing agent worktree at: ${worktreePath}`)
  }

  return { worktreePath, worktreeBranch, headCommit, gitRoot }
}

/**
 * Remove a worktree created by createAgentWorktree.
 * For git-based worktrees, removes the worktree directory and deletes the temporary branch.
 * Must be called with the main repo's git root (for git worktrees), not the worktree path,
 * since the worktree directory is deleted during this operation.
 *
 * H6 前向接缝（见文件头注）：`hookBased=true` 时旧仓委派 executeWorktreeRemoveHook；
 * 新仓无 hook 面 → log warn + return false（worktree 留在原地，消费方接线波处置）。
 */
export async function removeAgentWorktree(
  worktreePath: string,
  worktreeBranch?: string,
  gitRoot?: string,
  hookBased?: boolean,
): Promise<boolean> {
  if (hookBased) {
    // H6 前向接缝：无 WorktreeRemove hook 面可委派。
    logForDebugging(
      `hookBased agent worktree removal requested but no WorktreeRemove hook 面 in new repo; worktree left at: ${worktreePath}`,
      { level: 'warn' },
    )
    return false
  }

  if (!gitRoot) {
    logForDebugging('Cannot remove agent worktree: no git root provided', {
      level: 'error',
    })
    return false
  }

  // Run from the main repo root, not the worktree (which we're about to delete)
  const { code: removeCode, stderr: removeError } =
    await execFileNoThrowWithCwd(
      gitExe(),
      ['worktree', 'remove', '--force', worktreePath],
      { cwd: gitRoot },
    )

  if (removeCode !== 0) {
    logForDebugging(`Failed to remove agent worktree: ${removeError}`, {
      level: 'error',
    })
    return false
  }
  logForDebugging(`Removed agent worktree at: ${worktreePath}`)

  if (!worktreeBranch) {
    return true
  }

  // Delete the temporary worktree branch from the main repo
  const { code: deleteBranchCode, stderr: deleteBranchError } =
    await execFileNoThrowWithCwd(gitExe(), ['branch', '-D', worktreeBranch], {
      cwd: gitRoot,
    })

  if (deleteBranchCode !== 0) {
    logForDebugging(
      `Could not delete agent worktree branch: ${deleteBranchError}`,
      { level: 'error' },
    )
  }
  return true
}

/**
 * Slug patterns for throwaway worktrees created by AgentTool (`agent-a<7hex>`,
 * from earlyAgentId.slice(0,8)), WorkflowTool (`wf_<runId>-<idx>` where runId
 * is randomUUID().slice(0,12) = 8 hex + `-` + 3 hex), and bridgeMain
 * (`bridge-<safeFilenameId>`). These leak when the parent process is killed
 * (Ctrl+C, ESC, crash) before their in-process cleanup runs. Exact-shape
 * patterns avoid sweeping user-named EnterWorktree slugs like `wf-myfeature`.
 */
const EPHEMERAL_WORKTREE_PATTERNS = [
  /^agent-a[0-9a-f]{7}$/,
  /^wf_[0-9a-f]{8}-[0-9a-f]{3}-\d+$/,
  // Legacy wf-<idx> slugs from before workflowRunId disambiguation — kept so
  // the 30-day sweep still cleans up worktrees leaked by older builds.
  /^wf-\d+$/,
  // Real bridge slugs are `bridge-${safeFilenameId(sessionId)}`.
  /^bridge-[A-Za-z0-9_]+(-[A-Za-z0-9_]+)*$/,
  // Template job worktrees: job-<templateName>-<8hex>. Prefix distinguishes
  // from user-named EnterWorktree slugs that happen to end in 8 hex.
  /^job-[a-zA-Z0-9._-]{1,55}-[0-9a-f]{8}$/,
]

/**
 * Remove stale agent/workflow worktrees older than cutoffDate.
 *
 * Safety:
 * - Only touches slugs matching ephemeral patterns (never user-named worktrees)
 * - Fail-closed: skips if git status fails or shows tracked changes
 *   (-uno: untracked files in a 30-day-old crashed agent worktree are build
 *   artifacts; skipping the untracked scan is 5-10× faster on large repos)
 * - Fail-closed: skips if any commits aren't reachable from a remote
 *
 * H6 前向接缝（见文件头注）：current-session skip 支裁（engine 叶无交互会话态；
 * agent 临时 worktree 永不 current）。
 *
 * `git worktree remove --force` handles both the directory and git's internal
 * worktree tracking. If git doesn't recognize the path as a worktree (orphaned
 * dir), it's left in place — a later readdir finding it stale again is harmless.
 */
export async function cleanupStaleAgentWorktrees(
  cutoffDate: Date,
): Promise<number> {
  const gitRoot = findCanonicalGitRoot(process.cwd())
  if (!gitRoot) {
    return 0
  }

  const dir = worktreesDir(gitRoot)
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return 0
  }

  const cutoffMs = cutoffDate.getTime()
  let removed = 0

  for (const slug of entries) {
    if (!EPHEMERAL_WORKTREE_PATTERNS.some(p => p.test(slug))) {
      continue
    }

    const worktreePath = join(dir, slug)

    let mtimeMs: number
    try {
      mtimeMs = (await stat(worktreePath)).mtimeMs
    } catch {
      continue
    }
    if (mtimeMs >= cutoffMs) {
      continue
    }

    // Both checks must succeed with empty output. Non-zero exit (corrupted
    // worktree, git not recognizing it, etc.) means skip — we don't know
    // what's in there.
    const [status, unpushed] = await Promise.all([
      execFileNoThrowWithCwd(
        gitExe(),
        ['--no-optional-locks', 'status', '--porcelain', '-uno'],
        { cwd: worktreePath },
      ),
      execFileNoThrowWithCwd(
        gitExe(),
        ['rev-list', '--max-count=1', 'HEAD', '--not', '--remotes'],
        { cwd: worktreePath },
      ),
    ])
    if (status.code !== 0 || status.stdout.trim().length > 0) {
      continue
    }
    if (unpushed.code !== 0 || unpushed.stdout.trim().length > 0) {
      continue
    }

    if (
      await removeAgentWorktree(worktreePath, worktreeBranchName(slug), gitRoot)
    ) {
      removed++
    }
  }

  if (removed > 0) {
    await execFileNoThrowWithCwd(gitExe(), ['worktree', 'prune'], {
      cwd: gitRoot,
    })
    logForDebugging(
      `cleanupStaleAgentWorktrees: removed ${removed} stale worktree(s)`,
    )
  }
  return removed
}
