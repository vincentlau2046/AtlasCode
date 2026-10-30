/**
 * wave0183 K4-4（0.1.83 V3-4）— storage-aware refs 真盘判别（f4 工单 §1.A，上游 300）
 *
 * 红根因（c105e1d @ git 2.53，f4 §0.2 探针 + Main 复核）：
 *   - reftable 仓 HEAD 文件 = `ref: refs/heads/.invalid` 占位（detached 也不变），
 *     真实 HEAD symref 存于 reftable 二进制表；loose ref / packed-refs 均不存在。
 *   - 双体 readGitHead 直读 HEAD 文件 → 返回占位分支 '.invalid'（旧 isSafeRefName
 *     未拒首点分量，穿透为「分支名」）；resolveRef 仅 loose+packed → reftable 全
 *     null；readWorktreeHeadSha(合法 linked worktree) → null；engine getBranch →
 *     '.invalid'。
 *
 * 修后契约（工单 §1.A Interfaces）：
 *   - 成功只返合法 branch/SHA，失败 null，永不暴露 '.invalid' 占位值。
 *   - files 快路径恒等（本文件 files 矩阵 = 基线绿守卫，修前修后同绿）。
 *   - reftable：readGitHead/resolveRef/readWorktreeHeadSha/getBranch 与
 *     `git rev-parse`/`git symbolic-ref` 真值恒等（main/linked/detached/unborn/packed）。
 *   - 缓存判别：reftable 同路径 branch switch/新 commit（HEAD 占位文件不变）后
 *     getBranch/getHead 返新值——engine 无缓存逐次重算；TUI GitFileWatcher 须
 *     watch reftable 状态源（reftable 目录 mtime），不无限沿用启动值。
 *   - fail-closed：plumbing 失败（ATLAS_GIT_EXE 指不存在二进制）→ null，非占位。
 *
 * 门控：git 不可用 → 整族 skip；git 无 --ref-format=reftable → reftable 子族
 * skip（环境记录 ≠ 判据通过，工单 §3）。
 */
import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getBranch,
  readGitHead,
  readWorktreeHeadSha,
  resetWorktreeGitCaches,
  resolveRef,
} from '../../src/engine'
import {
  clearResolveGitDirCache,
  getCachedBranch,
  getCachedHead,
  getHeadForDir,
  readGitHead as tuiReadGitHead,
  readWorktreeHeadSha as tuiReadWorktreeHeadSha,
  resetGitFileWatcher,
  resolveRef as tuiResolveRef,
} from '../../src/tui/utils/git/gitFilesystem.js'
import { runWithCwdOverride } from '../../src/tui/utils/cwd.js'

// ── 门控：git 可用性 + reftable 能力探针 ────────────────────────────────────
let gitAvailable = false
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' })
  gitAvailable = true
} catch {
  gitAvailable = false
}
const it = gitAvailable ? test : test.skip

let reftableAvailable = false
try {
  const probe = mkdtempSync(join(tmpdir(), 'atlas-w183-rt-probe-'))
  execFileSync(
    'git',
    ['init', '-q', '--ref-format=reftable', '-b', 'main', join(probe, 'r')],
    { cwd: probe, stdio: 'pipe' },
  )
  reftableAvailable = true
  rmSync(probe, { recursive: true, force: true })
} catch {
  reftableAvailable = false
}
const rt = gitAvailable && reftableAvailable ? test : test.skip

// ── fixture 助手 ───────────────────────────────────────────────────────────
function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function commitFile(repo: string, name: string, content: string, msg: string): string {
  writeFileSync(join(repo, name), `${content}\n`)
  runGit(repo, ['add', name])
  runGit(repo, ['commit', '-q', '-m', msg])
  return runGit(repo, ['rev-parse', 'HEAD^{commit}'])
}

type Repo = { root: string; repoPath: string; gitDir: string; mainSha: string }

async function withRepo(
  opts: { reftable?: boolean; unborn?: boolean },
  fn: (repo: Repo) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'atlas-w183-'))
  const repoPath = join(root, 'repo')
  execFileSync(
    'git',
    [
      'init',
      '-q',
      ...(opts.reftable ? ['--ref-format=reftable'] : []),
      '-b',
      'main',
      repoPath,
    ],
    { cwd: root, stdio: 'pipe' },
  )
  runGit(repoPath, ['config', 'user.email', 't@example.com'])
  runGit(repoPath, ['config', 'user.name', 't'])
  const mainSha = opts.unborn ? '' : commitFile(repoPath, 'f.txt', 'hello', 'c1')
  const origCwd = process.cwd()
  try {
    await fn({ root, repoPath, gitDir: join(repoPath, '.git'), mainSha })
  } finally {
    process.chdir(origCwd)
    rmSync(root, { recursive: true, force: true })
    resetWorktreeGitCaches()
    resetGitFileWatcher()
    clearResolveGitDirCache()
  }
}

/** 轮询至谓词命中或超时；超时返最后值让断言报实际值（不吞真实状态）。 */
async function pollUntil<T>(
  fn: () => Promise<T>,
  pred: (v: T) => boolean,
  timeoutMs: number,
): Promise<T> {
  const start = Date.now()
  for (;;) {
    const v = await fn()
    if (pred(v)) return v
    if (Date.now() - start > timeoutMs) return v
    await new Promise(r => setTimeout(r, 15))
  }
}

// ── 双体参数化（engine worktree/git.ts + tui utils/git/gitFilesystem.ts）────
type GitHead =
  | { type: 'branch'; name: string }
  | { type: 'detached'; sha: string }
  | null
type Refs = {
  readGitHead: (gitDir: string) => Promise<GitHead>
  resolveRef: (gitDir: string, ref: string) => Promise<string | null>
  readWorktreeHeadSha: (wtPath: string) => Promise<string | null>
}
const twins: Array<[string, Refs]> = [
  [
    'engine',
    { readGitHead, resolveRef, readWorktreeHeadSha },
  ],
  [
    'tui',
    {
      readGitHead: tuiReadGitHead,
      resolveRef: tuiResolveRef,
      readWorktreeHeadSha: tuiReadWorktreeHeadSha,
    },
  ],
]

// ── files storage：快路径基线绿守卫（修前修后同绿）──────────────────────────
for (const [twin, refs] of twins) {
  describe(`files storage 快路径（${twin} 体）`, () => {
    it('main 在分支：readGitHead/resolveRef 真值恒等', async () => {
      await withRepo({}, async repo => {
        expect(await refs.readGitHead(repo.gitDir)).toEqual({
          type: 'branch',
          name: 'main',
        })
        expect(await refs.resolveRef(repo.gitDir, 'refs/heads/main')).toBe(
          repo.mainSha,
        )
      })
    })

    it('linked worktree（feature）：读 worktree 真值，不冒认主仓', async () => {
      await withRepo({}, async repo => {
        runGit(repo.repoPath, [
          'worktree',
          'add',
          '-q',
          '-b',
          'feature',
          join(repo.root, 'wt'),
        ])
        const wtSha = runGit(join(repo.root, 'wt'), ['rev-parse', 'HEAD^{commit}'])
        expect(await refs.readWorktreeHeadSha(join(repo.root, 'wt'))).toBe(wtSha)
      })
    })

    it('unborn linked worktree（--orphan fresh）：分支名真实、SHA null', async () => {
      await withRepo({}, async repo => {
        runGit(repo.repoPath, [
          'worktree',
          'add',
          '-q',
          '--orphan',
          '-b',
          'fresh',
          join(repo.root, 'fresh-wt'),
        ])
        const wtGitDir = readFileSync(join(repo.root, 'fresh-wt', '.git'), 'utf-8')
          .trim()
          .slice('gitdir: '.length)
        expect(await refs.readGitHead(wtGitDir)).toEqual({
          type: 'branch',
          name: 'fresh',
        })
        expect(
          await refs.readWorktreeHeadSha(join(repo.root, 'fresh-wt')),
        ).toBeNull()
      })
    })

    it('detached HEAD：detached SHA', async () => {
      await withRepo({}, async repo => {
        runGit(repo.repoPath, ['checkout', '-q', '--detach', 'HEAD'])
        expect(await refs.readGitHead(repo.gitDir)).toEqual({
          type: 'detached',
          sha: repo.mainSha,
        })
      })
    })

    it('unborn HEAD（主仓无提交）：分支名真实、ref 未解析', async () => {
      await withRepo({ unborn: true }, async repo => {
        expect(await refs.readGitHead(repo.gitDir)).toEqual({
          type: 'branch',
          name: 'main',
        })
        expect(await refs.resolveRef(repo.gitDir, 'refs/heads/main')).toBeNull()
      })
    })

    it('packed refs：pack-refs 后 resolveRef 仍解析', async () => {
      await withRepo({}, async repo => {
        runGit(repo.repoPath, ['pack-refs', '--all'])
        expect(await refs.resolveRef(repo.gitDir, 'refs/heads/main')).toBe(
          repo.mainSha,
        )
        expect(await refs.readGitHead(repo.gitDir)).toEqual({
          type: 'branch',
          name: 'main',
        })
      })
    })

    it('负例：路径不存在 / 无 .git 普通目录 → null（不上探冒认）', async () => {
      await withRepo({}, async repo => {
        mkdirSync(join(repo.repoPath, 'plain'), { recursive: true })
        expect(await refs.readWorktreeHeadSha(join(repo.root, 'missing'))).toBeNull()
        expect(
          await refs.readWorktreeHeadSha(join(repo.repoPath, 'plain')),
        ).toBeNull()
      })
    })
  })
}

// ── reftable storage：K4-4 红→绿主面 ────────────────────────────────────────
for (const [twin, refs] of twins) {
  describe(`reftable storage（${twin} 体）`, () => {
    rt('占位锚点：HEAD 文件为 .invalid 占位（根因证据，修后仍真）', async () => {
      await withRepo({ reftable: true }, async repo => {
        const headFile = readFileSync(join(repo.gitDir, 'HEAD'), 'utf-8')
        expect(headFile).toContain('refs/heads/.invalid')
      })
    })

    rt('main 在分支：真 branch/SHA，不暴露占位（基线红：.invalid/null）', async () => {
      await withRepo({ reftable: true }, async repo => {
        expect(await refs.readGitHead(repo.gitDir)).toEqual({
          type: 'branch',
          name: 'main',
        })
        expect(await refs.resolveRef(repo.gitDir, 'refs/heads/main')).toBe(
          repo.mainSha,
        )
      })
    })

    rt('linked worktree（feature）：真值恒等（基线红：null/.invalid）', async () => {
      await withRepo({ reftable: true }, async repo => {
        runGit(repo.repoPath, [
          'worktree',
          'add',
          '-q',
          '-b',
          'feature',
          join(repo.root, 'wt'),
        ])
        const wtSha = runGit(join(repo.root, 'wt'), ['rev-parse', 'HEAD^{commit}'])
        expect(await refs.readWorktreeHeadSha(join(repo.root, 'wt'))).toBe(wtSha)
        const wtGitDir = readFileSync(join(repo.root, 'wt', '.git'), 'utf-8')
          .trim()
          .slice('gitdir: '.length)
        expect(await refs.readGitHead(wtGitDir)).toEqual({
          type: 'branch',
          name: 'feature',
        })
      })
    })

    rt('detached HEAD：真 SHA（基线红：.invalid 占位分支）', async () => {
      await withRepo({ reftable: true }, async repo => {
        runGit(repo.repoPath, ['checkout', '-q', '--detach', 'HEAD'])
        expect(await refs.readGitHead(repo.gitDir)).toEqual({
          type: 'detached',
          sha: repo.mainSha,
        })
      })
    })

    rt('unborn HEAD（主仓无提交）：分支名真实、ref 未解析（基线红：.invalid）', async () => {
      await withRepo({ reftable: true, unborn: true }, async repo => {
        expect(await refs.readGitHead(repo.gitDir)).toEqual({
          type: 'branch',
          name: 'main',
        })
        expect(await refs.resolveRef(repo.gitDir, 'refs/heads/main')).toBeNull()
      })
    })

    rt('packed refs：reftable pack-refs --all 后 resolveRef 仍解析', async () => {
      await withRepo({ reftable: true }, async repo => {
        runGit(repo.repoPath, ['pack-refs', '--all'])
        expect(await refs.resolveRef(repo.gitDir, 'refs/heads/main')).toBe(
          repo.mainSha,
        )
        expect(await refs.readGitHead(repo.gitDir)).toEqual({
          type: 'branch',
          name: 'main',
        })
      })
    })

    rt('负例：路径不存在 / 无 .git 普通目录 → null（不上探冒认）', async () => {
      await withRepo({ reftable: true }, async repo => {
        mkdirSync(join(repo.repoPath, 'plain'), { recursive: true })
        expect(await refs.readWorktreeHeadSha(join(repo.root, 'missing'))).toBeNull()
        expect(
          await refs.readWorktreeHeadSha(join(repo.repoPath, 'plain')),
        ).toBeNull()
      })
    })
  })
}

// ── engine getBranch（process.cwd 探针位）──────────────────────────────────
describe('getBranch（engine 体）', () => {
  it('files 基线绿守卫：main→feature 切换返新值', async () => {
    await withRepo({}, async repo => {
      process.chdir(repo.repoPath)
      expect(await getBranch()).toBe('main')
      runGit(repo.repoPath, ['checkout', '-q', '-b', 'feature'])
      expect(await getBranch()).toBe('feature')
    })
  })

  rt('reftable 真分支（基线红：.invalid）', async () => {
    await withRepo({ reftable: true }, async repo => {
      process.chdir(repo.repoPath)
      expect(await getBranch()).toBe('main')
    })
  })

  rt('reftable branch switch / 新 commit：同路径返新值（缓存判别，基线红）', async () => {
    await withRepo({ reftable: true }, async repo => {
      process.chdir(repo.repoPath)
      expect(await getBranch()).toBe('main')
      runGit(repo.repoPath, ['checkout', '-q', '-b', 'feature'])
      expect(await getBranch()).toBe('feature')
      const sha = commitFile(repo.repoPath, 'g.txt', 'world', 'c2')
      expect(await resolveRef(repo.gitDir, 'refs/heads/feature')).toBe(sha)
      expect(await getBranch()).toBe('feature')
    })
  })
})

// ── TUI 缓存失效（GitFileWatcher reftable 状态源 watch）────────────────────
describe('TUI 缓存面（getCachedBranch/getCachedHead/getHeadForDir）', () => {
  rt('reftable 真值 + switch/commit 后返新值（基线红：.invalid 恒不失效）', async () => {
    await withRepo({ reftable: true }, async repo => {
      const firstBranch = await runWithCwdOverride(repo.repoPath, () =>
        getCachedBranch(),
      )
      expect(firstBranch).toBe('main')
      const firstHead = await runWithCwdOverride(repo.repoPath, () =>
        getCachedHead(),
      )
      expect(firstHead).toBe(repo.mainSha)

      runGit(repo.repoPath, ['checkout', '-q', '-b', 'feature'])
      // HEAD 占位文件不变 → 失效只能来自 reftable 状态源 watch（目录 mtime）
      const switched = await pollUntil(
        () => runWithCwdOverride(repo.repoPath, () => getCachedBranch()),
        v => v === 'feature',
        3000,
      )
      expect(switched).toBe('feature')

      const sha = commitFile(repo.repoPath, 'g.txt', 'world', 'c2')
      const newHead = await pollUntil(
        () => runWithCwdOverride(repo.repoPath, () => getCachedHead()),
        v => v === sha,
        3000,
      )
      expect(newHead).toBe(sha)
    })
  })

  rt('getHeadForDir 真值（基线红：null）', async () => {
    await withRepo({ reftable: true }, async repo => {
      expect(await getHeadForDir(repo.repoPath)).toBe(repo.mainSha)
    })
  })
})

// ── fail-closed：plumbing 失败 → null，不折成占位 ───────────────────────────
describe('reftable plumbing fail-closed', () => {
  rt('ATLAS_GIT_EXE 不可用：readGitHead → null 非 .invalid（基线红：占位穿透）', async () => {
    await withRepo({ reftable: true }, async repo => {
      const orig = process.env.ATLAS_GIT_EXE
      process.env.ATLAS_GIT_EXE = '/nonexistent/atlas-test-git'
      resetWorktreeGitCaches()
      try {
        for (const [, refs] of twins) {
          expect(await refs.readGitHead(repo.gitDir)).toBeNull()
        }
      } finally {
        if (orig === undefined) {
          delete process.env.ATLAS_GIT_EXE
        } else {
          process.env.ATLAS_GIT_EXE = orig
        }
        resetWorktreeGitCaches()
      }
    })
  })
})
