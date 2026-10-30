/**
 * wave0183 K4-2（0.1.83 V3-4）— 退出检查 helper 真 Git 判别（f4 工单 §1.B）
 *
 * unit 面（wave0183-worktree-exit-safety.test.tsx）已锁注入矩阵（非零/无基线/
 * 非数字/抛错 → null）；本文件用真 Git 锁「真盘语义」：
 *   - 红场景正体：hook session 无基线 + **Git 干净但含本地 commit** ——
 *     `git status --porcelain` 空、`git rev-list --count <main>..HEAD` = 1，
 *     旧 dialog 把 rev-list 失败折成 0 commits → 静默删 worktree（丢提交）。
 *     修后 inspectWorktreeChanges(wt, undefined) = null（unknown 绝非 0/0）。
 *   - 可信基线 + 双检查成功：真计数（clean 0/0 / dirty / commits>0）。
 *   - cwd 无关性：进程 chdir 到非 repo 目录后结果不变（检查经 `-C wt` 绑定）。
 *   - fail-closed 真盘：非 repo 路径 / 基线 ref 不存在 → null。
 *
 * 门控：git 不可用 → 整族 skip（环境记录 ≠ 判据通过）。
 */
import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { inspectWorktreeChanges } from '../../src/tui/utils/worktreeChangeSummary.js'

// ── 门控：git 可用性探针 ────────────────────────────────────────────────────
let gitAvailable = false
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' })
  gitAvailable = true
} catch {
  gitAvailable = false
}
const it = gitAvailable ? test : test.skip

// ── fixture ────────────────────────────────────────────────────────────────
function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function commitFile(repo: string, name: string, content: string, msg: string): string {
  writeFileSync(join(repo, name), `${content}\n`)
  runGit(repo, ['add', name])
  runGit(repo, ['commit', '-q', '-m', msg])
  return runGit(repo, ['rev-parse', 'HEAD^{commit}'])
}

type Fixture = {
  root: string
  repo: string
  wt: string
  mainSha: string
}

async function withWorktree(fn: (f: Fixture) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'atlas-w183-exit-'))
  const repo = join(root, 'repo')
  const wt = join(root, 'wt')
  execFileSync('git', ['init', '-q', '-b', 'main', repo], { cwd: root, stdio: 'pipe' })
  runGit(repo, ['config', 'user.email', 't@example.com'])
  runGit(repo, ['config', 'user.name', 't'])
  const mainSha = commitFile(repo, 'f.txt', 'hello', 'c1')
  runGit(repo, ['worktree', 'add', '-q', '-b', 'feature', wt])
  const origCwd = process.cwd()
  try {
    await fn({ root, repo, wt, mainSha })
  } finally {
    process.chdir(origCwd)
    rmSync(root, { recursive: true, force: true })
  }
}

// ── 红场景正体：无基线 + 干净树 + 有本地 commit ─────────────────────────────
describe('K4-2 红场景正体（hook session 无基线）', () => {
  it('Git 干净但含本地 commit → null（unknown 绝非 0/0）', async () => {
    await withWorktree(async f => {
      // 场景自证：树干净、但 worktree 领先 main 1 个 commit
      commitFile(f.wt, 'g.txt', 'world', 'c2')
      expect(runGit(f.wt, ['status', '--porcelain'])).toBe('')
      expect(runGit(f.wt, ['rev-list', '--count', `${f.mainSha}..HEAD`])).toBe('1')
      // 无基线：无法证明干净 → null；旧 dialog 会折成 0/0 静默删除
      expect(await inspectWorktreeChanges(f.wt, undefined)).toBeNull()
    })
  })

  it('基线在场但 status 干净 + 0 commit → 真 {0,0}（clean 自动清理的信任前提）', async () => {
    await withWorktree(async f => {
      expect(await inspectWorktreeChanges(f.wt, f.mainSha)).toEqual({
        changedFiles: 0,
        commits: 0,
      })
    })
  })
})

// ── 可信基线真计数 ─────────────────────────────────────────────────────────
describe('K4-2 可信基线真计数', () => {
  it('本地 commit（树干净）→ {0,1}', async () => {
    await withWorktree(async f => {
      commitFile(f.wt, 'g.txt', 'world', 'c2')
      expect(await inspectWorktreeChanges(f.wt, f.mainSha)).toEqual({
        changedFiles: 0,
        commits: 1,
      })
    })
  })

  it('dirty（未提交修改）→ {1,0}；无基线仍 null', async () => {
    await withWorktree(async f => {
      writeFileSync(join(f.wt, 'f.txt'), 'modified\n')
      expect(await inspectWorktreeChanges(f.wt, f.mainSha)).toEqual({
        changedFiles: 1,
        commits: 0,
      })
      expect(await inspectWorktreeChanges(f.wt, undefined)).toBeNull()
    })
  })

  it('dirty + commits → {1,1}', async () => {
    await withWorktree(async f => {
      commitFile(f.wt, 'g.txt', 'world', 'c2')
      writeFileSync(join(f.wt, 'f.txt'), 'modified\n')
      expect(await inspectWorktreeChanges(f.wt, f.mainSha)).toEqual({
        changedFiles: 1,
        commits: 1,
      })
    })
  })
})

// ── cwd 无关性（检查绑定 worktreePath）─────────────────────────────────────
describe('K4-2 cwd 无关性', () => {
  it('进程 chdir 到非 repo 目录 → 结果不变', async () => {
    await withWorktree(async f => {
      commitFile(f.wt, 'g.txt', 'world', 'c2')
      const nonRepo = join(f.root, 'plain')
      mkdirSync(nonRepo)
      process.chdir(nonRepo)
      expect(await inspectWorktreeChanges(f.wt, f.mainSha)).toEqual({
        changedFiles: 0,
        commits: 1,
      })
      expect(await inspectWorktreeChanges(f.wt, undefined)).toBeNull()
    })
  })
})

// ── fail-closed 真盘 ───────────────────────────────────────────────────────
describe('K4-2 fail-closed 真盘', () => {
  it('非 repo 路径 → null', async () => {
    await withWorktree(async f => {
      const plain = join(f.root, 'plain2')
      mkdirSync(plain)
      expect(await inspectWorktreeChanges(plain, f.mainSha)).toBeNull()
      expect(await inspectWorktreeChanges(join(f.root, 'missing'), f.mainSha)).toBeNull()
    })
  })

  it('基线 ref 不存在（40hex 无此对象）→ rev-list 非零 → null', async () => {
    await withWorktree(async f => {
      expect(await inspectWorktreeChanges(f.wt, '0'.repeat(40))).toBeNull()
    })
  })
})
