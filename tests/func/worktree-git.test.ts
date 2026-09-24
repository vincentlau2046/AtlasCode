/**
 * worktree 域 func 真盘测试（E-7 S-7c，§8.48）：真 git 仓库下的 agent 隔离
 * worktree 面（createAgentWorktree / removeAgentWorktree /
 * cleanupStaleAgentWorktrees）+ git 执行层（findGitRoot / findCanonicalGitRoot /
 * getDefaultBranch / readWorktreeHeadSha）。
 *
 * 分层纪律：func 层真盘（mkdtemp 真 git 仓库：git init/commit/push 真子进程）+
 * process.chdir（createAgentWorktree / cleanupStaleAgentWorktrees / getDefaultBranch
 * 依 process.cwd() 解析，getCwd→process.cwd 解耦裁定）。
 *
 * 门控：git 不可用 → 整族 skip（test.skip），本机 git 2.43 可用。
 *
 * 探针锚点（§8.48 详案，突变须恰好 1 red）：
 *   P-T2 findCanonicalGitRoot backlink 安全校验 → '恶意 commondir 借 worktree 拒支'
 *   P-T3 cleanupStaleAgentWorktrees dirty fail-closed 守卫 → 'dirty worktree 不被清'
 */
import { describe, test, expect } from 'bun:test'
import { execFileSync } from 'child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join, normalize } from 'path'
import {
  createAgentWorktree,
  removeAgentWorktree,
  cleanupStaleAgentWorktrees,
  findGitRoot,
  findCanonicalGitRoot,
  getDefaultBranch,
  readWorktreeHeadSha,
  resetWorktreeGitCaches,
} from '../../src/engine'

// ── git 可用性门控（不可用 → 整族 skip）────────────────────────────────────
let gitAvailable = false
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' })
  gitAvailable = true
} catch {
  gitAvailable = false
}
const it = gitAvailable ? test : test.skip

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

type Repo = {
  root: string
  repoPath: string
  originPath: string
}

/**
 * 造一个带 remote 的真 git 仓库（init + commit + 强推 main + 本地 bare origin），
 * chdir 进 repoPath 执行 fn，恢复 cwd + 清理。带 remote 使 origin/<branch> 远端跟踪
 * ref 存在（getOrCreateWorktree 免 fetch 直接 resolveRef）且 unpushed 守卫可判。
 */
async function withRepo(
  fn: (repo: Repo) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'atlas-wt-func-'))
  const repoPath = join(root, 'repo')
  const originPath = join(root, 'origin.git')
  mkdirSync(repoPath)
  // origin.git 尚不存在 → cwd 用存在的 root，bare 路径作参数（git init --bare 会创建它）
  runGit(root, ['init', '--bare', originPath])
  // -b main 直接建 main 分支（getDefaultBranch 读 HEAD symref，确定性；免 rename 提示噪音）
  runGit(repoPath, ['init', '-b', 'main'])
  runGit(repoPath, ['config', 'user.email', 't@example.com'])
  runGit(repoPath, ['config', 'user.name', 't'])
  writeFileSync(join(repoPath, 'f.txt'), 'hello\n')
  runGit(repoPath, ['add', '.'])
  runGit(repoPath, ['commit', '-m', 'init'])
  runGit(repoPath, ['remote', 'add', 'origin', originPath])
  runGit(repoPath, ['push', 'origin', 'main'])

  const oldCwd = process.cwd()
  process.chdir(repoPath)
  resetWorktreeGitCaches()
  try {
    await fn({ root, repoPath, originPath })
  } finally {
    process.chdir(oldCwd)
    rmSync(root, { recursive: true, force: true })
  }
}

// ── git 执行层只读面（findGitRoot / findCanonicalGitRoot / getDefaultBranch）
describe('git 执行层只读面（真仓）', () => {
  it('findGitRoot / findCanonicalGitRoot（regular repo → 自身）', async () => {
    await withRepo(async ({ repoPath }) => {
      const root = findGitRoot(repoPath)
      expect(root).toBe(normalize(repoPath))
      // regular repo 的 .git 是目录（非 worktree .git 文件）→ canonical 恒自身
      expect(findCanonicalGitRoot(repoPath)).toBe(normalize(repoPath))
    })
  })

  it('getDefaultBranch → main（origin ref 回落，免子进程）', async () => {
    await withRepo(async () => {
      // git init 仓无 origin/HEAD loose symref → main/master 远端 ref 回落命中
      expect(await getDefaultBranch()).toBe('main')
    })
  })

  it('getDefaultBranch clone + checkout -b feature → main（origin/HEAD symref，远端默认分支非本地分支）', async () => {
    // 审视 MAJOR-1 回归探针：初版误用本地 HEAD（返 feature）；旧仓 computeDefaultBranch
    // 经 origin/HEAD loose symref 返远端默认分支 main。git clone 写
    // refs/remotes/origin/HEAD → refs/remotes/origin/main（loose 文件）。
    const root = mkdtempSync(join(tmpdir(), 'atlas-wt-defbranch-'))
    try {
      const seed = join(root, 'seed')
      const origin = join(root, 'origin.git')
      mkdirSync(seed)
      runGit(root, ['init', '--bare', origin])
      runGit(seed, ['init', '-b', 'main'])
      runGit(seed, ['config', 'user.email', 't@example.com'])
      runGit(seed, ['config', 'user.name', 't'])
      writeFileSync(join(seed, 'f.txt'), 'hello\n')
      runGit(seed, ['add', '.'])
      runGit(seed, ['commit', '-m', 'init'])
      runGit(seed, ['remote', 'add', 'origin', origin])
      runGit(seed, ['push', 'origin', 'main'])
      const clone = join(root, 'clone')
      runGit(root, ['clone', origin, clone])
      runGit(clone, ['checkout', '-b', 'feature'])
      const oldCwd = process.cwd()
      process.chdir(clone)
      resetWorktreeGitCaches()
      try {
        expect(await getDefaultBranch()).toBe('main')
      } finally {
        process.chdir(oldCwd)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('findCanonicalGitRoot（从 worktree 内 → 主仓 canonical root）', async () => {
    await withRepo(async ({ repoPath }) => {
      const { worktreePath } = await createAgentWorktree('canon-probe')
      // worktree 内 .git 是文件 → 解析 commondir 回主仓
      expect(findCanonicalGitRoot(worktreePath)).toBe(normalize(repoPath))
      expect(await removeAgentWorktree(worktreePath, 'worktree-canon-probe', repoPath)).toBe(true)
    })
  })
})

// ── agent worktree 生命周期（create / resume / remove 真盘往返）──────────────
describe('agent worktree 生命周期（真盘）', () => {
  it('createAgentWorktree 新建（worktree 目录 + 分支 + 落在 .atlas/worktrees）', async () => {
    await withRepo(async ({ repoPath }) => {
      const r = await createAgentWorktree('agent-a1234567')
      expect(r.worktreePath).toContain('worktrees')
      expect(existsSync(join(r.worktreePath!, 'f.txt'))).toBe(true)
      expect(r.worktreeBranch).toBe('worktree-agent-a1234567')
      expect(r.gitRoot).toBe(normalize(repoPath))
      // 真 git 已登记该 worktree
      expect(runGit(repoPath, ['worktree', 'list'])).toContain(
        r.worktreePath!,
      )
      expect(await removeAgentWorktree(r.worktreePath!, r.worktreeBranch, repoPath)).toBe(true)
      expect(existsSync(r.worktreePath!)).toBe(false)
    })
  })

  it('二次 create 同 slug → fast-resume 幂等（readWorktreeHeadSha，免子进程）', async () => {
    await withRepo(async ({ repoPath }) => {
      const a = await createAgentWorktree('resume-slug')
      const headA = await readWorktreeHeadSha(a.worktreePath!)
      expect(headA).toMatch(/^[0-9a-f]{40}$/)
      const b = await createAgentWorktree('resume-slug')
      expect(b.worktreePath).toBe(a.worktreePath)
      expect(b.headCommit).toBe(a.headCommit)
      expect(await readWorktreeHeadSha(b.worktreePath!)).toBe(headA)
      expect(await removeAgentWorktree(a.worktreePath!, a.worktreeBranch, repoPath)).toBe(true)
    })
  })

  it('removeAgentWorktree 删目录 + 删临时分支', async () => {
    await withRepo(async ({ repoPath }) => {
      const a = await createAgentWorktree('rm-slug')
      const removed = await removeAgentWorktree(
        a.worktreePath!,
        a.worktreeBranch,
        repoPath,
      )
      expect(removed).toBe(true)
      expect(existsSync(a.worktreePath!)).toBe(false)
      // 临时分支已删（branch -D 成功 → 不再列出）
      expect(runGit(repoPath, ['branch', '--list', 'worktree-rm-slug'])).toBe('')
    })
  })

  it('removeAgentWorktree hookBased=true → 无 hook 面，log + return false（H6 前向接缝）', async () => {
    await withRepo(async () => {
      const removed = await removeAgentWorktree('/nonexistent', undefined, '/x', true)
      expect(removed).toBe(false)
    })
  })
})

// ── cleanupStaleAgentWorktrees（fail-closed 双守卫）─────────────────────────
describe('cleanupStaleAgentWorktrees', () => {
  it('clean + pushed + stale → 清除（返回 1）', async () => {
    await withRepo(async ({ repoPath }) => {
      const a = await createAgentWorktree('agent-a1234567')
      // 未来 cutoff → 当前 mtime 恒 stale；clean（无 tracked 改动）+ 已 push（无 unpushed）
      const cutoff = new Date(Date.now() + 3_600_000)
      const removed = await cleanupStaleAgentWorktrees(cutoff)
      expect(removed).toBe(1)
      expect(existsSync(a.worktreePath!)).toBe(false)
      void repoPath
    })
  })

  it('dirty worktree（tracked 改动）→ fail-closed 不清（P-T3 探针锚点）', async () => {
    await withRepo(async ({ repoPath }) => {
      // slug 须匹配 EPHEMERAL 模式（agent-a + 7 hex）才进入 dirty 守卫分支；
      // ab12cd3 = 7 hex。若用非 ephemeral slug（如 8 hex）则被模式守卫先跳过，
      // P-T3 突变（删 dirty 守卫）不红 → 探针失效。
      const a = await createAgentWorktree('agent-aab12cd3')
      // 改动 worktree 内 tracked 文件 → git status -uno 非空 → dirty 守卫 skip
      writeFileSync(join(a.worktreePath!, 'f.txt'), 'modified\n')
      const cutoff = new Date(Date.now() + 3_600_000)
      const removed = await cleanupStaleAgentWorktrees(cutoff)
      expect(removed).toBe(0)
      // worktree 仍在（未被误清）
      expect(existsSync(a.worktreePath!)).toBe(true)
      // 收尾：还原改动 + 删
      writeFileSync(join(a.worktreePath!, 'f.txt'), 'hello\n')
      expect(
        await removeAgentWorktree(a.worktreePath!, a.worktreeBranch, repoPath),
      ).toBe(true)
    })
  })

  it('非 ephemeral slug（用户命名）→ 永不清（EPHEMERAL 模式守卫）', async () => {
    await withRepo(async ({ repoPath }) => {
      const a = await createAgentWorktree('my-feature')
      const cutoff = new Date(Date.now() + 3_600_000)
      const removed = await cleanupStaleAgentWorktrees(cutoff)
      expect(removed).toBe(0)
      expect(existsSync(a.worktreePath!)).toBe(true)
      expect(await removeAgentWorktree(a.worktreePath!, a.worktreeBranch, repoPath)).toBe(true)
    })
  })
})

// ── findCanonicalGitRoot 安全守卫（恶意 commondir 借 worktree 拒支）──────────
describe('findCanonicalGitRoot 安全守卫', () => {
  it('合法 worktree（双校验通过）→ 解析到主仓', async () => {
    await withRepo(async ({ repoPath }) => {
      const { worktreePath } = await createAgentWorktree('safe-probe')
      expect(findCanonicalGitRoot(worktreePath)).toBe(normalize(repoPath))
      void repoPath
    })
  })

  it('恶意 backlink（gitdir 指向别家 victim）→ 拒支回落自身（P-T2 探针锚点）', () => {
    // 构造：fakeWt/.git → gitdir: attacker/worktrees/x；commondir 使 check(1) 通过
    // （commonDir=attacker），但 gitdir backlink 指向 victim/.git（非 fakeWt/.git）
    // → check(2) 失败 → 回落 gitRoot（fakeWt）。若删 backlink 校验则误解析到 attacker。
    const base = mkdtempSync(join(tmpdir(), 'atlas-wt-sec-'))
    try {
      const fakeWt = join(base, 'fakeWt')
      const victimGit = join(base, 'victim', '.git')
      const worktreeGitDir = join(base, 'attacker', 'worktrees', 'x')
      mkdirSync(fakeWt)
      mkdirSync(victimGit, { recursive: true })
      mkdirSync(worktreeGitDir, { recursive: true })
      // check(1) 通过：dirname(worktreeGitDir)=attacker/worktrees = join(attacker,worktrees)
      writeFileSync(join(worktreeGitDir, 'commondir'), '../..')
      // check(2) 失败：backlink 指向 victim/.git（非 fakeWt/.git）
      writeFileSync(join(worktreeGitDir, 'gitdir'), victimGit)
      writeFileSync(join(fakeWt, '.git'), `gitdir: ${worktreeGitDir}`)

      resetWorktreeGitCaches()
      expect(findGitRoot(fakeWt)).toBe(normalize(fakeWt))
      // 拒支 → 回落 fakeWt（而非攻击者 attacker commonDir）
      expect(findCanonicalGitRoot(fakeWt)).toBe(normalize(fakeWt))
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})
