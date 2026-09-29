/* eslint-disable custom-rules/no-sync-fs -- W4 全量 lint 复原（§8.74.21）：legacy-debt 豁免（sync→async 改写违行为零改动纪律，W-opt 波再议） */
/**
 * worktree 域 — git 执行层（E-7 S-7c，§8.48）
 *
 * 旧仓 `src/utils/git.ts`(926) + `git/gitFilesystem.ts`(699) +
 * `execFileNoThrow.ts`(150) + `git/gitConfigParser.ts`(277) 的**最小真子集**
 * 随迁——只含 worktree 核心（getOrCreateWorktree / removeAgentWorktree /
 * cleanupStaleAgentWorktrees / performPostCreationSetup）实际调用的函数。
 * 新仓无 git 执行层（greenfield）；本文件是 worktree 域自含的 git plumbing。
 *
 * 解耦裁定（H6 前向接缝 + 逐处登记，复审勿当遗漏重提）：
 *   - **execa → node:child_process.execFile**：新仓 deps 仅 openai+zod（无 execa）；
 *     国内 Linux 目标平台，旧仓 execa 的 Windows .bat/.cmd shell 支不保留。
 *     `stdin:'ignore'`（execa 选项）→ node 等价 `child.stdin?.end()`（execFile 无
 *     stdin 选项；belt-and-suspenders 防交互提示阻塞，GIT_TERMINAL_PROMPT=0 已禁）。
 *     `stdin:'inherit'`/`'pipe'` 不转发（落回 execFile 默认 pipe stdio，仅 'ignore'
 *     有映射；现存调用点皆 'ignore'，登记非遗漏——审视 MINOR-2）。
 *     `execFileNoThrow`（no-cwd 变体）+ `execSyncWithDefaults_DEPRECATED` 整砍
 *     （tmux/legacy 消费，随 worktree 模块 tmux 族裁）。
 *   - **getCwd → process.cwd**：本层调用点恒显式传 cwd；resolveGitDir/getDefaultBranch
 *     缺省用 process.cwd（旧仓 bootstrap state cwd 未落，CLI/bootstrap 波）。
 *   - **logError 本最小子集无存活调用点**：旧仓唯一调用点在 execa 的 `.catch()`
 *     异常支（execFileNoThrow.ts:146，spawn 异常）；新仓 `child_process.execFile`
 *     用回调收拢 spawn 失败（error 参数统一走 code=1 resolve），异常支消失 → 无
 *     存活调用点，不引 logForDebugging（避免死 import + void 抑制行，审视 NOTE-3
 *     处置）；日后增调用点再归一化到 debug 面（scheduler 先例）。
 *   - **memoizeWithLRU（findGitRoot/resolveCanonicalRoot）→ 简单 Map 缓存**：LRU 上限/
 *     驱逐为性能糖，非核心行为（登记）。
 *   - **logForDiagnosticsNoPII（diagLogs）整砍**：可观测糖，新仓无 diagLogs。
 *   - **whichSync（gitExe 的 git 路径查找）→ `process.env.ATLAS_GIT_EXE ?? 'git'`**：
 *     国内 Linux git 恒在 PATH；env 覆写供测试/非常规安装（登记）。
 *   - **GitFileWatcher 缓存失效子系统（gitFilesystem L311+）整砍**：性能缓存非核心行为；
 *     `getDefaultBranch` + `readRawSymref` 经已随迁 fs 助手（resolveGitDir/getCommonDir/
 *     resolveRef）直接算，判定链**逐字**旧仓 computeDefaultBranch（origin/HEAD symref
 *     → 远端默认分支，否则 main/master 远端 ref 命中，否则 'main'）。
 *
 * 逐字保留（faithfulness 锚点）：
 *   - findGitRoot 上探 `.git` dir/file 逻辑（git.ts:27-107，NFC 归一 + root 补查）。
 *   - findCanonicalGitRoot 的 **SECURITY backlink 校验**（git.ts:123-180，恶意
 *     commondir/借 worktree 支不可裁——.git 文件 + commondir 攻击者可控，双校验：
 *     (1) worktreeGitDir 是 `<commonDir>/worktrees` 直接子 (2) `<worktreeGitDir>/gitdir`
 *     回指 `<gitRoot>/.git`）。
 *   - resolveRef/resolveRefInDir loose+packed+symref 链 + isSafeRefName/isValidGitSha
 *     安全守卫（.git 文件攻击者可控，防 shell 注入/路径穿越）。
 *   - parseGitConfigValue + parseConfigString 族（.git/config 解析，纯函数）。
 *   - getBranch（S-D2a §8.57 增）= 旧 computeBranch 判定链逐字（无缓存 idiom，见函数注）。
 */
import { execFile } from 'child_process'
import { readFileSync, realpathSync, statSync } from 'fs'
import { readFile, stat } from 'fs/promises'
import { basename, dirname, join, resolve, sep } from 'path'

// ── git 子进程执行（execa → node:child_process；见文件头注）─────────────────
const MS_IN_SECOND = 1000
const SECONDS_IN_MINUTE = 60

type ExecFileWithCwdOptions = {
  abortSignal?: AbortSignal
  timeout?: number
  preserveOutputOnError?: boolean
  maxBuffer?: number
  cwd?: string
  env?: NodeJS.ProcessEnv
  stdin?: 'ignore' | 'inherit' | 'pipe'
}

function getErrorMessage(code: number, signal?: string): string {
  if (signal) return signal
  return String(code)
}

/**
 * execFile, but always resolves (never throws)——旧仓 execFileNoThrow.ts 逐字核心，
 * execa → node:child_process.execFile（见文件头注）。非零退出码/被信号杀死皆 resolve，
 * 绝不 reject（worktree 各 git 步骤靠 code 判成败，不靠 try/catch）。
 */
export function execFileNoThrowWithCwd(
  file: string,
  args: string[],
  {
    abortSignal,
    timeout: finalTimeout = 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
    preserveOutputOnError: finalPreserveOutput = true,
    cwd: finalCwd,
    env: finalEnv,
    maxBuffer = 1_000_000,
    stdin: finalStdin,
  }: ExecFileWithCwdOptions = {
    timeout: 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
    preserveOutputOnError: true,
    maxBuffer: 1_000_000,
  },
): Promise<{ stdout: string; stderr: string; code: number; error?: string }> {
  return new Promise(resolve => {
    const child = execFile(
      file,
      args,
      {
        timeout: finalTimeout,
        cwd: finalCwd,
        env: finalEnv,
        maxBuffer,
        signal: abortSignal,
      },
      (error, stdout, stderr) => {
        if (error) {
          const err = error as { code?: number; signal?: string }
          const code = typeof err.code === 'number' ? err.code : 1
          if (finalPreserveOutput) {
            void resolve({
              stdout: stdout ?? '',
              stderr: stderr ?? '',
              code,
              error: getErrorMessage(code, err.signal),
            })
          } else {
            void resolve({ stdout: '', stderr: '', code })
          }
          return
        }
        void resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          code: 0,
        })
      },
    )
    // execa `stdin:'ignore'` → node 等价：关闭子进程 stdin（防交互提示阻塞；
    // GIT_TERMINAL_PROMPT=0 已禁提示，此为 belt-and-suspenders）。
    if (finalStdin === 'ignore') {
      child.stdin?.end()
    }
  })
}

// ── gitExe（whichSync 糖整砍 → env 覆写 + 缺省 'git'；见文件头注）────────────
let _gitExe: string | null = null
/** git 可执行路径。旧仓 whichSync('git') || 'git'；新仓 env 覆写 + 缺省 'git'。 */
export function gitExe(): string {
  if (_gitExe === null) {
    _gitExe = process.env.ATLAS_GIT_EXE ?? 'git'
  }
  return _gitExe
}

// ── findGitRoot（上探 .git dir/file；git.ts:27-107 逐字，LRU→Map 缓存登记）──
const GIT_ROOT_NOT_FOUND = Symbol('git-root-not-found')
const findGitRootCache = new Map<
  string,
  string | typeof GIT_ROOT_NOT_FOUND
>()

function findGitRootImpl(
  startPath: string,
): string | typeof GIT_ROOT_NOT_FOUND {
  if (typeof startPath !== 'string') startPath = String(startPath || '/tmp')
  let current = resolve(startPath)
  const root = current.substring(0, current.indexOf(sep) + 1) || sep

  while (current !== root) {
    try {
      const gitPath = join(current, '.git')
      const s = statSync(gitPath)
      // .git 可为目录（regular repo）或文件（worktree/submodule）
      if (s.isDirectory() || s.isFile()) {
        return current.normalize('NFC')
      }
    } catch {
      // .git 不存在于本层，继续上探
    }
    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }

  // 根目录也查一次
  try {
    const s = statSync(join(root, '.git'))
    if (s.isDirectory() || s.isFile()) {
      return root.normalize('NFC')
    }
  } catch {
    // .git 不存在于根
  }

  return GIT_ROOT_NOT_FOUND
}

/**
 * 沿目录树向上找 git 根（.git 目录或文件）。返回含 .git 的目录，未找到返回 null。
 * 旧仓 memoizeWithLRU(50)；新仓简单 Map 缓存（LRU 上限/驱逐为性能糖，登记）。
 */
export function findGitRoot(startPath: string): string | null {
  const cached = findGitRootCache.get(startPath)
  if (cached !== undefined) {
    return cached === GIT_ROOT_NOT_FOUND ? null : cached
  }
  const result = findGitRootImpl(startPath)
  findGitRootCache.set(startPath, result)
  return result === GIT_ROOT_NOT_FOUND ? null : result
}

// ── findCanonicalGitRoot（.git file→commondir→main root；SECURITY backlink 逐字）
const canonicalRootCache = new Map<string, string>()

function resolveCanonicalRoot(gitRoot: string): string {
  try {
    // worktree 中 .git 是文件：`gitdir: <path>`；regular repo 中 .git 是目录
    //（readFileSync 对目录抛 EISDIR → catch 回落 gitRoot）。
    const gitContent = readFileSync(join(gitRoot, '.git'), 'utf-8').trim()
    if (!gitContent.startsWith('gitdir:')) {
      return gitRoot
    }
    const worktreeGitDir = resolve(
      gitRoot,
      gitContent.slice('gitdir:'.length).trim(),
    )
    // commondir 指向共享 .git 目录（相对 worktree gitdir）。submodule 无 commondir
    //（readFileSync 抛 ENOENT）→ 回落 gitRoot（submodule 是独立 repo，正确）。
    const commonDir = resolve(
      worktreeGitDir,
      readFileSync(join(worktreeGitDir, 'commondir'), 'utf-8').trim(),
    )
    // SECURITY（逐字，不可裁）：.git 文件与 commondir 在 clone/download 的 repo 中
    // 攻击者可控。双校验（缺任一即回落 gitRoot）：
    //   (1) worktreeGitDir 是 <commonDir>/worktrees 的直接子 → 保证我们读的 commondir
    //       文件在解析出的 common 目录内，而非攻击者 repo 内
    //   (2) <worktreeGitDir>/gitdir 回指 <gitRoot>/.git → 保证攻击者无法借用受害者
    //       已存在的 worktree 条目
    if (resolve(dirname(worktreeGitDir)) !== join(commonDir, 'worktrees')) {
      return gitRoot
    }
    // git 用 strbuf_realpath() 写 gitdir（symlink 已解析），但 findGitRoot 只做了
    // 词法解析。realpath gitRoot 使经 symlink 访问的合法 worktree（如 macOS
    // /tmp→/private/tmp）不被误拒。realpath 目录再 join '.git'——realpath .git 文件
    // 本身会跟随 symlinked .git，让攻击者借受害者 backlink。
    const backlink = realpathSync(
      readFileSync(join(worktreeGitDir, 'gitdir'), 'utf-8').trim(),
    )
    if (backlink !== join(realpathSync(gitRoot), '.git')) {
      return gitRoot
    }
    // bare-repo worktree：common 目录不在任何工作目录内。用 common 目录本身作稳定
    // 身份（anthropics/claude-code#27994）。
    if (basename(commonDir) !== '.git') {
      return commonDir.normalize('NFC')
    }
    return dirname(commonDir).normalize('NFC')
  } catch {
    return gitRoot
  }
}

/**
 * 找 canonical git 根，解析穿过 worktree。
 *
 * 与 findGitRoot（返回 worktree 目录，即 .git 文件所在）不同，本函数返回主仓库
 * 工作目录——同一 repo 的所有 worktree 映射到同一项目身份。项目级状态（auto-memory /
 * project config / agent memory）应使用本函数使 worktree 与主仓共享状态。
 *
 * 旧仓 memoizeWithLRU(50)；新仓简单 Map 缓存（登记）。
 */
export function findCanonicalGitRoot(startPath: string): string | null {
  const root = findGitRoot(startPath)
  if (!root) {
    return null
  }
  const cached = canonicalRootCache.get(root)
  if (cached !== undefined) {
    return cached
  }
  const resolved = resolveCanonicalRoot(root)
  canonicalRootCache.set(root, resolved)
  return resolved
}

// ── resolveGitDir（.git 目录 or worktree .git file→gitdir；gitFilesystem:40-76 逐字）
const resolveGitDirCache = new Map<string, string | null>()

/**
 * 解析目录的 git 目录（.git 目录，或 worktree/submodule 的 .git 文件指向的 gitdir）。
 * startPath 缺省 = process.cwd()（旧仓 getCwd()）。
 */
export async function resolveGitDir(
  startPath?: string,
): Promise<string | null> {
  const cwd = resolve(startPath ?? process.cwd())
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
      // worktree/submodule：.git 是含 `gitdir: <path>` 的文件。
      // git 剥尾 \n 与 \r（setup.c read_gitfile_gently）。
      const content = (await readFile(gitPath, 'utf-8')).trim()
      if (content.startsWith('gitdir:')) {
        const rawDir = content.slice('gitdir:'.length).trim()
        const resolved = resolve(root, rawDir)
        resolveGitDirCache.set(cwd, resolved)
        return resolved
      }
    }
    // regular repo：.git 是目录
    resolveGitDirCache.set(cwd, gitPath)
    return gitPath
  } catch {
    resolveGitDirCache.set(cwd, null)
    return null
  }
}

// ── isSafeRefName / isValidGitSha（gitFilesystem:98-131 逐字，安全守卫）──────
/**
 * 校验从 .git/ 读出的 ref/branch 名可安全用于路径 join、git 位置参数、shell 插值。
 * 攻击者可在 .git/HEAD 或 loose ref 文件（免 git check-ref-format 校验）植入路径
 * 穿越（`..`）、参数注入（前导 `-`）、shell 元字符。Allowlist 只含合法 git 分支名
 * 字符（含 `dependabot/npm_and_yarn/@types/node-18.0.0` 形态），拒一切 shell 危险字符。
 */
export function isSafeRefName(name: string): boolean {
  if (!name || name.startsWith('-') || name.startsWith('/')) {
    return false
  }
  if (name.includes('..')) {
    return false
  }
  // 拒单点/空 path 分量（`.`, `foo/./bar`, `foo//bar`, `foo/`）。
  if (name.split('/').some(c => c === '.' || c === '')) {
    return false
  }
  // Allowlist-only：字母数字 / . _ + - @。拒 shell 元字符/空白/NUL/非 ASCII；
  // git 禁的 `@{` 因 `{` 不在 allowlist 而拒。
  if (!/^[a-zA-Z0-9/._+@-]+$/.test(name)) {
    return false
  }
  return true
}

/**
 * 校验 git SHA：40 hex（SHA-1）或 64 hex（SHA-256）。git 从不把缩写 SHA 写进 HEAD/ref
 * 文件，故只接受全长。
 */
export function isValidGitSha(s: string): boolean {
  return /^[0-9a-f]{40}$/.test(s) || /^[0-9a-f]{64}$/.test(s)
}

// ── readGitHead（.git/HEAD 解析；gitFilesystem:149-183 逐字）─────────────────
/**
 * 解析 .git/HEAD 判定当前分支或 detached SHA。
 *   - `ref: refs/heads/<branch>\n` — 在分支上
 *   - `ref: <other-ref>\n`         — 异常 symref（如 bisect）
 *   - `<hex-sha>\n`                — detached HEAD（如 rebase）
 */
export async function readGitHead(
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
        if (!isSafeRefName(name)) {
          return null
        }
        return { type: 'branch', name }
      }
      // 异常 symref（非本地分支）—— 解析为 SHA
      if (!isSafeRefName(ref)) {
        return null
      }
      const sha = await resolveRef(gitDir, ref)
      return sha ? { type: 'detached', sha } : { type: 'detached', sha: '' }
    }
    // 原始 SHA（detached HEAD）。校验防攻击者 HEAD 注入 shell 元字符。
    if (!isValidGitSha(content)) {
      return null
    }
    return { type: 'detached', sha: content }
  } catch {
    return null
  }
}

// ── resolveRef / getCommonDir（gitFilesystem:203-280 逐字）──────────────────
/**
 * 解析 git ref（如 `refs/heads/main`）到 commit SHA。先查 loose ref 文件，再回落
 * packed-refs。跟随 symref（如 `ref: refs/remotes/origin/main`）。
 * worktree 的 ref 在 common gitdir（commondir 文件指向），先查 worktree gitdir 再
 * 回落 common dir。
 */
export async function resolveRef(
  gitDir: string,
  ref: string,
): Promise<string | null> {
  const result = await resolveRefInDir(gitDir, ref)
  if (result) {
    return result
  }

  // worktree：试 common gitdir（共享 ref 所在）
  const commonDir = await getCommonDir(gitDir)
  if (commonDir && commonDir !== gitDir) {
    return resolveRefInDir(commonDir, ref)
  }

  return null
}

async function resolveRefInDir(
  dir: string,
  ref: string,
): Promise<string | null> {
  // 先试 loose ref 文件
  try {
    const content = (await readFile(join(dir, ref), 'utf-8')).trim()
    if (content.startsWith('ref:')) {
      const target = content.slice('ref:'.length).trim()
      // 拒 tampered symref 链中的路径穿越
      if (!isSafeRefName(target)) {
        return null
      }
      return resolveRef(dir, target)
    }
    // loose ref 内容应是原始 SHA。校验防攻击者 ref 文件含 shell 元字符
    if (!isValidGitSha(content)) {
      return null
    }
    return content
  } catch {
    // loose ref 不存在，试 packed-refs
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
    // 无 packed-refs
  }

  return null
}

/**
 * 读 `commondir` 文件找共享 git 目录。worktree 指向主仓 .git 目录。无 commondir 文件
 *（regular repo）返回 null。
 */
export async function getCommonDir(gitDir: string): Promise<string | null> {
  try {
    const content = (await readFile(join(gitDir, 'commondir'), 'utf-8')).trim()
    return resolve(gitDir, content)
  } catch {
    return null
  }
}

// ── readWorktreeHeadSha（gitFilesystem:619-640 逐字，快途 resume 无子进程）────
/**
 * 读 worktree 的 HEAD SHA（直接读 .git 指针文件，无子进程、无上探）。
 * worktree 不存在（.git 指针 ENOENT）或畸形返回 null。
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

// ── readRawSymref（旧仓 gitFilesystem.ts:287 逐字，loose symref 只读）────────
/**
 * 读 loose symref 文件（如 `refs/remotes/origin/HEAD`），返回剥掉 branchPrefix
 * 后指向的分支名。逐字旧仓：只读 loose ref 文件（不查 packed-refs——`git clone`
 * 把 origin/HEAD symref 写成 loose 文件）；篡改 symref 经 isSafeRefName 拒
 * 路径穿越 / 参数注入（.git 文件攻击者可控）。
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

// ── getBranch（S-D2a §8.57：旧仓 computeBranch 逐字 fs 判定链）─────────────
/**
 * 当前分支名（旧仓 computeBranch 逐字，gitFilesystem:500-510：resolveGitDir →
 * readGitHead → branch 名；无 gitDir / HEAD 不可解析 / detached 一律 'HEAD'）。
 * 旧 GitFileWatcher 缓存整砍（E-7 先例）→ 无缓存逐次重算（同 getDefaultBranch
 * 无缓存 idiom，登记）。消费方 = createWorktreeForSession 的 originalBranch 探针位。
 */
export async function getBranch(): Promise<string> {
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

// ── getDefaultBranch（旧仓 computeDefaultBranch 逐字，GitFileWatcher 整砍）──
/**
 * 仓库默认分支名 = 远端默认分支（非当前本地分支）。旧仓经 GitFileWatcher fs 缓存
 * getCachedDefaultBranch（整砍，见文件头注）；新仓用已随迁 fs 助手直接算，判定链
 * 逐字旧仓 computeDefaultBranch：origin/HEAD symref（`git clone` 写 loose 文件）
 * → 该分支名，否则 main/master 远端 ref 命中者，否则 'main'。缺省以 process.cwd()
 * 为基准。
 *
 * 审视订正（E-7 S-7c 独立审视 MAJOR-1）：初版误用本地 HEAD symref（当前本地分支名）
 * 替代旧仓 origin/HEAD 步骤——clone + `checkout -b feature` 态下旧仓返 main、初版返
 * feature（语义漂移，头注"语义等价"失实）。现补 readRawSymref origin/HEAD 步骤，
 * 与旧仓逐字一致。
 */
export async function getDefaultBranch(): Promise<string> {
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

// ── parseGitConfigValue（gitConfigParser.ts 逐字，纯 .git/config 解析）──────
/**
 * 从 .git/config 解析单个值（git 的 config.c 校验过：section/key 大小写不敏感，
 * subsection 大小写敏感 + 反斜杠转义，值可选引号/内联注释/转义）。未找到返回 null。
 */
export async function parseGitConfigValue(
  gitDir: string,
  section: string,
  subsection: string | null,
  key: string,
): Promise<string | null> {
  let config: string
  try {
    config = await readFile(join(gitDir, 'config'), 'utf-8')
  } catch {
    return null
  }
  return parseConfigString(config, section, subsection, key)
}

/** 从内存 config 串解析值（导出供测试）。 */
export function parseConfigString(
  config: string,
  section: string,
  subsection: string | null,
  key: string,
): string | null {
  const lines = config.split('\n')
  const sectionLower = section.toLowerCase()
  const keyLower = key.toLowerCase()

  let inSection = false
  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.length === 0 || trimmed[0] === '#' || trimmed[0] === ';') {
      continue
    }

    if (trimmed[0] === '[') {
      inSection = matchesSectionHeader(trimmed, sectionLower, subsection)
      continue
    }

    if (!inSection) {
      continue
    }

    const parsed = parseKeyValue(trimmed)
    if (parsed && parsed.key.toLowerCase() === keyLower) {
      return parsed.value
    }
  }

  return null
}

function parseKeyValue(line: string): { key: string; value: string } | null {
  let i = 0
  while (i < line.length && isKeyChar(line[i]!)) {
    i++
  }
  if (i === 0) {
    return null
  }
  const key = line.slice(0, i)

  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
    i++
  }

  if (i >= line.length || line[i] !== '=') {
    // 无值布尔 key——本层用不到
    return null
  }
  i++ // 跳 '='

  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
    i++
  }

  const value = parseValue(line, i)
  return { key, value }
}

function parseValue(line: string, start: number): string {
  let result = ''
  let inQuote = false
  let i = start

  while (i < line.length) {
    const ch = line[i]!

    if (!inQuote && (ch === '#' || ch === ';')) {
      break
    }

    if (ch === '"') {
      inQuote = !inQuote
      i++
      continue
    }

    if (ch === '\\' && i + 1 < line.length) {
      const next = line[i + 1]!
      if (inQuote) {
        switch (next) {
          case 'n':
            result += '\n'
            break
          case 't':
            result += '\t'
            break
          case 'b':
            result += '\b'
            break
          case '"':
            result += '"'
            break
          case '\\':
            result += '\\'
            break
          default:
            // git 对未知转义静默丢反斜杠
            result += next
            break
        }
        i += 2
        continue
      }
      // 引号外：行尾反斜杠 = 续行（我们按 \n 分割不处理多行，但处理 \\）
      if (next === '\\') {
        result += '\\'
        i += 2
        continue
      }
      // 其余引号外反斜杠按字面
    }

    result += ch
    i++
  }

  if (!inQuote) {
    result = trimTrailingWhitespace(result)
  }

  return result
}

function trimTrailingWhitespace(s: string): string {
  let end = s.length
  while (end > 0 && (s[end - 1] === ' ' || s[end - 1] === '\t')) {
    end--
  }
  return s.slice(0, end)
}

/**
 * 校验形如 `[remote "origin"]` 的 config 行是否匹配给定 section/subsection。
 * section 大小写不敏感；subsection 大小写敏感。
 */
function matchesSectionHeader(
  line: string,
  sectionLower: string,
  subsection: string | null,
): boolean {
  let i = 1

  while (
    i < line.length &&
    line[i] !== ']' &&
    line[i] !== ' ' &&
    line[i] !== '\t' &&
    line[i] !== '"'
  ) {
    i++
  }
  const foundSection = line.slice(1, i).toLowerCase()

  if (foundSection !== sectionLower) {
    return false
  }

  if (subsection === null) {
    // 简单 section：须以 ']' 收尾
    return i < line.length && line[i] === ']'
  }

  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
    i++
  }

  if (i >= line.length || line[i] !== '"') {
    return false
  }
  i++ // 跳过开引号

  let foundSubsection = ''
  while (i < line.length && line[i] !== '"') {
    if (line[i] === '\\' && i + 1 < line.length) {
      const next = line[i + 1]!
      if (next === '\\' || next === '"') {
        foundSubsection += next
        i += 2
        continue
      }
      // git 对 subsection 其他转义丢反斜杠
      foundSubsection += next
      i += 2
      continue
    }
    foundSubsection += line[i]
    i++
  }

  if (i >= line.length || line[i] !== '"') {
    return false
  }
  i++ // 跳过闭引号

  if (i >= line.length || line[i] !== ']') {
    return false
  }

  return foundSubsection === subsection
}

function isKeyChar(ch: string): boolean {
  return (
    (ch >= 'a' && ch <= 'z') ||
    (ch >= 'A' && ch <= 'Z') ||
    (ch >= '0' && ch <= '9') ||
    ch === '-'
  )
}

// 供测试/诊断复位（跨 repo func 测试分区隔离，通常无需；保留显式钩子）。
export function resetWorktreeGitCaches(): void {
  findGitRootCache.clear()
  canonicalRootCache.clear()
  resolveGitDirCache.clear()
  _gitExe = null
}
