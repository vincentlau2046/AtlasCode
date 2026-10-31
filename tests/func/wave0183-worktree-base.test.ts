/**
 * wave0183 K4-5 + K4-6（0.1.83 V3-4）— worktree 唯一基点与调用 checkout
 * 上下文真盘判别（f4 工单 §D；上游 300）
 *
 * 真盘归因（2026-10-31，git 2.53.0，探针 k45-probe / k45b-probe / dwim-check，Main lane）：
 *   - 解析序分歧（K4-5 根因类）：同一字符串在 rev-parse 与 `worktree add`
 *     下可解析到不同 commit——
 *     ① DWIM ref 碰撞：`refs/heads/origin/main`（C1）优先于
 *       `refs/remotes/origin/main`（C2）——fs 快径读后者得 baseSha=C2；
 *       ref 名传入 add 后二次解析不可靠，dwim-check 实测两种表现：
 *       裸 `worktree add <path> origin/main` → 静默实建 C1（k45b-probe
 *       观察到的劫持形态）；现码实际形态 `worktree add -B <branch> <path>
 *       origin/main` → `fatal: 歧义的对象名`（本测试 RED 的实际形态）。
 *       同一根因（ref 名非稳定 commit 身份），修法同：add 传
 *       `<baseSha>^{commit}` 钉死 object 语义。
 *     ② 类 SHA 碰撞：同名 40hex branch/tag 指另一 commit 时，`worktree add
 *       <裸sha>` 解析到 branch 指向的 commit（k45-probe：add <C1sha> → C2）；
 *       `<sha>^{commit}` 强制 object 语义（→ C1）。
 *   - bare canonical HEAD=A ≠ 调用 linked checkout HEAD=B + origin 缺席
 *     （K4-6 根因，k45b-probe 构造 2）：fetch 失败回落 `rev-parse HEAD`
 *     于 canonical root → A，而调用方基点应为 B。
 *   - canonical 解析验证：findCanonicalGitRoot(linked) → bare.git（双体，
 *     ticket §0.2「canonical helper 正确返回 bare.git 身份」同构造复现）；
 *     readWorktreeHeadSha(bare.git) → null（.git 目录形态不指针文件）。
 *
 * 判别口径（修前红 → 修后绿；ticket §D）：
 *   - RED：双 collision 构造下断言 返回 headCommit === 实际新 worktree HEAD
 *     === 选定 commit（现码 -B 形态直接 fatal throw → 红；修后恒等建 C2）；
 *     新分支身份 = worktree-<slug>。
 *   - RED：bare HEAD=A / linked HEAD=B → 新建于 B（现码 A → 红）。
 *   - 守卫（基线绿锁定不回归）：origin 默认分支优先 / PR FETCH_HEAD /
 *     已有 worktree 重开不重置提交 / source branch 不污染新 checkout 缓存。
 *
 * Git 2.56 专项证据缺口（工单 §1.C 硬项）：全部证据基于本机 git 2.53.0，
 * 只算共享根因证据；2.56+ 特异行为未覆盖、不冒称已证——处置由 e2e 写明。
 *
 * 双体：engine `src/engine/worktree/worktree.ts` 与 TUI
 * `src/tui/utils/worktree.ts` 同构逐字（getOrCreateWorktree 唯一差异
 * settings 取值）；RED 主案双体各测，守卫 engine 面覆盖 + TUI 逐字同构。
 * 单元面（sourceCheckout 透传/验证失败非静默/惰性捕获/建后恒等核验/
 * chdir 前捕获顺序）= tests/unit/wave0183-worktree-start-context.test.ts。
 */
import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createAgentWorktree,
  createWorktreeForSession,
  resetSettingsCache,
  resetWorktreeGitCaches,
} from '../../src/engine'
import { getBranch } from '../../src/engine/worktree/git.js'
import {
  createAgentWorktree as tuiCreateAgentWorktree,
} from '../../src/tui/utils/worktree.js'
// TUI 面 cwd 源 = bootstrap state cwd（pwd()=覆盖??getCwdState()，非
// process.cwd）——TUI 调用必须经 runWithCwdOverride 驱动，否则解析到
// 测试进程原 cwd 的 canonical 根（首版教训：真仓误建 worktree）
import { runWithCwdOverride } from '../../src/tui/utils/cwd.js'

// ── 门控：git 可用性（缺席整族 skip；环境记录 ≠ 判据通过）──────────────────
let gitAvailable = false
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' })
  gitAvailable = true
} catch {
  gitAvailable = false
}
const it = gitAvailable ? test : test.skip

// ── fixture 助手 ───────────────────────────────────────────────────────────
function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function commitFile(repo: string, name: string, content: string, msg: string): void {
  writeFileSync(join(repo, name), `${content}\n`)
  runGit(repo, ['add', name])
  runGit(repo, ['commit', '-q', '-m', msg])
}

/** 独立 fixture（合成 repo）+ 进程 chdir + settings/cache 复位；finally 恢复。 */
async function withRepo(
  fn: (repo: string) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'atlas-w183-base-'))
  const origCwd = process.cwd()
  const origConfigDir = process.env.ATLAS_CONFIG_DIR
  try {
    const repo = join(root, 'repo')
    mkdirSync(repo)
    execFileSync('git', ['init', '-q', '-b', 'main', repo], { stdio: 'pipe' })
    runGit(repo, ['config', 'user.email', 't@example.com'])
    runGit(repo, ['config', 'user.name', 't'])
    commitFile(repo, 'f.txt', 'c1', 'c1')
    commitFile(repo, 'f.txt', 'c2', 'c2')
    process.chdir(repo)
    resetSettingsCache()
    resetWorktreeGitCaches()
    await fn(repo)
  } finally {
    process.chdir(origCwd)
    if (origConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
    else process.env.ATLAS_CONFIG_DIR = origConfigDir
    resetSettingsCache()
    rmSync(root, { recursive: true, force: true })
  }
}

/**
 * bare canonical + linked checkout fixture（K4-6 真盘构造，k45b-probe 复刻）：
 * bare.git HEAD=A（refs/heads/main=A），linked worktree（feature 分支）HEAD=B，
 * 无 origin remote（fetch 必败触发 'HEAD' 回落支）。fn 收 (bare, linked, A, B)。
 */
async function withBareLinked(
  fn: (bare: string, linked: string, a: string, b: string) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'atlas-w183-bare-'))
  const origCwd = process.cwd()
  const origConfigDir = process.env.ATLAS_CONFIG_DIR
  try {
    const bare = join(root, 'bare.git')
    const seed = join(root, 'seed')
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare], {
      stdio: 'pipe',
    })
    mkdirSync(seed)
    execFileSync('git', ['init', '-q', '-b', 'main', seed], { stdio: 'pipe' })
    runGit(seed, ['config', 'user.email', 't@example.com'])
    runGit(seed, ['config', 'user.name', 't'])
    commitFile(seed, 'f.txt', 'a', 'a')
    commitFile(seed, 'f.txt', 'b', 'b')
    runGit(seed, ['push', '-q', bare, 'main'])
    const a = runGit(bare, 'rev-parse HEAD~1'.split(' '))
    const b = runGit(bare, ['rev-parse', 'HEAD'])
    // bare HEAD → A（linked 建于 B）
    runGit(bare, ['update-ref', 'refs/heads/main', a])
    const linked = join(root, 'linked')
    runGit(bare, ['worktree', 'add', linked, '-b', 'feature', b])
    // 类 SHA 碰撞守卫：tag/branch 名 = <B> 指向 A（裸 SHA 会被劫持的形态）
    runGit(bare, ['tag', b, a])
    runGit(bare, ['branch', b, a])
    process.chdir(linked)
    resetSettingsCache()
    resetWorktreeGitCaches()
    await fn(bare, linked, a, b)
  } finally {
    process.chdir(origCwd)
    if (origConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
    else process.env.ATLAS_CONFIG_DIR = origConfigDir
    resetSettingsCache()
    rmSync(root, { recursive: true, force: true })
  }
}

/** 实际新 worktree HEAD（真 git 复核，不信任被测返回值）。 */
function actualHead(worktreePath: string): string {
  return runGit(worktreePath, ['rev-parse', 'HEAD'])
}

/** 新 worktree 分支身份（HEAD symref）。 */
function headBranch(worktreePath: string): string {
  return runGit(worktreePath, ['symbolic-ref', 'HEAD']).replace(
    'refs/heads/',
    '',
  )
}

// ── K4-5：唯一基点（DWIM ref 碰撞 + 类 SHA tag/branch 碰撞）────────────────
describe('K4-5 唯一基点（修前红：返回 headCommit ≠ 实建 HEAD）', () => {
  /**
   * 构造（k45b-probe 构造 1 + k45-probe 类 SHA 碰撞合并）：
   *   - refs/remotes/origin/main = C2（fs 快径读到的「选定基点」）
   *   - 本地 branch `origin/main` = C1（DWIM 序劫持 `worktree add origin/main`）
   *   - tag/branch 名 = <C2sha> 指 C1（类 SHA 碰撞：`worktree add <裸C2>` 劫持面）
   * 期望：新 worktree 实建 HEAD === headCommit === C2（不被二次解析改写）。
   */
  async function collidingRepo(repo: string): Promise<{ c1: string; c2: string }> {
    const c1 = runGit(repo, ['rev-parse', 'HEAD~1'])
    const c2 = runGit(repo, ['rev-parse', 'HEAD'])
    runGit(repo, ['update-ref', 'refs/remotes/origin/main', c2])
    runGit(repo, ['branch', 'origin/main', c1])
    runGit(repo, ['tag', c2, c1])
    runGit(repo, ['branch', c2, c1])
    return { c1, c2 }
  }

  it('engine：双碰撞下 实建 HEAD === headCommit === 选定 commit；新分支身份 = worktree-<slug>', async () => {
    await withRepo(async repo => {
      const { c2 } = await collidingRepo(repo)
      const r = await createAgentWorktree('base-coll')
      expect(r.headCommit).toBe(c2)
      expect(actualHead(r.worktreePath)).toBe(c2)
      expect(r.worktreeBranch).toBe('worktree-base-coll')
      expect(headBranch(r.worktreePath)).toBe('worktree-base-coll')
    })
  })

  it('TUI twin：同构造同判别（双体同构逐字）', async () => {
    await withRepo(async repo => {
      const { c2 } = await collidingRepo(repo)
      const r = await runWithCwdOverride(repo, () =>
        tuiCreateAgentWorktree('base-coll-tui'),
      )
      expect(r.headCommit).toBe(c2)
      expect(actualHead(r.worktreePath)).toBe(c2)
      expect(r.worktreeBranch).toBe('worktree-base-coll-tui')
    })
  })
})

// ── K4-6：调用 checkout 上下文（bare canonical HEAD=A ≠ linked HEAD=B）─────
describe('K4-6 调用 checkout 上下文（修前红：新建于 canonical HEAD=A）', () => {
  it('engine：bare HEAD=A / linked HEAD=B / 无 origin → 新建于 B，恒等返回', async () => {
    await withBareLinked(async (_bare, _linked, a, b) => {
      const r = await createAgentWorktree('src-ctx')
      expect(r.headCommit).toBe(b)
      expect(actualHead(r.worktreePath)).toBe(b)
      expect(r.headCommit).not.toBe(a)
    })
  })

  it('TUI twin：同构造同判别（双体同构逐字）', async () => {
    await withBareLinked(async (_bare, linked, _a, b) => {
      const r = await runWithCwdOverride(linked, () =>
        tuiCreateAgentWorktree('src-ctx-tui'),
      )
      expect(r.headCommit).toBe(b)
      expect(actualHead(r.worktreePath)).toBe(b)
    })
  })
})

// ── 守卫：既有满足锁定（基线绿 → 修后恒绿，不回归）────────────────────────
describe('K4-5/6 守卫（origin 优先 / PR / 重开 / 缓存）', () => {
  it('origin 默认分支优先：fs 快径命中（无碰撞）→ 新建 === origin sha === headCommit', async () => {
    await withRepo(async repo => {
      const c2 = runGit(repo, ['rev-parse', 'HEAD'])
      runGit(repo, ['update-ref', 'refs/remotes/origin/main', c2])
      const r = await createAgentWorktree('origin-fast')
      expect(r.headCommit).toBe(c2)
      expect(actualHead(r.worktreePath)).toBe(c2)
    })
  })

  it('PR FETCH_HEAD 支：pull/N/head 基点 → 新建 === PR sha === headCommit', async () => {
    await withRepo(async repo => {
      // 本地 bare remote + refs/pull/1/head（PR 面 file:// 等价构造）
      const remote = join(repo, '..', 'remote.git')
      execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote], {
        stdio: 'pipe',
      })
      runGit(repo, ['push', '-q', remote, 'main'])
      const prSha = runGit(repo, ['rev-parse', 'HEAD'])
      runGit(remote, ['update-ref', 'refs/pull/1/head', prSha])
      runGit(repo, ['remote', 'add', 'origin', remote])
      const s = await createWorktreeForSession('sess-pr', 'pr-base', undefined, {
        prNumber: 1,
      })
      expect(s.originalHeadCommit).toBe(prSha)
      expect(actualHead(s.worktreePath)).toBe(prSha)
      expect(s.worktreeBranch).toBe('worktree-pr-base')
    })
  })

  it('已有 worktree 重开不重置提交：fast-resume 返回现存 HEAD，不回落基点', async () => {
    await withRepo(async repo => {
      const r1 = await createAgentWorktree('resume-guard')
      // 在 worktree 里推进一个 commit（用户工作不丢）
      commitFile(r1.worktreePath, 'g.txt', 'work', 'work')
      const advanced = actualHead(r1.worktreePath)
      const r2 = await createAgentWorktree('resume-guard')
      expect(r2.headCommit).toBe(advanced)
      expect(actualHead(r2.worktreePath)).toBe(advanced)
    })
  })

  it('source branch 不污染新 checkout 缓存：chdir 后首次 getBranch = 新分支名', async () => {
    await withRepo(async repo => {
      // 创建前先读一次（把 source branch 落进 cwd 键控缓存）
      const before = await getBranch()
      expect(before).toBe('main')
      const r = await createAgentWorktree('cache-guard')
      process.chdir(r.worktreePath)
      expect(await getBranch()).toBe('worktree-cache-guard')
    })
  })
})
