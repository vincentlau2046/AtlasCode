/**
 * wave0183 K4-3（0.1.83 V3-4）— /diff transient 冲突识别真盘
 * （f4 工单 §1.C，上游 300；files/reftable 双 storage）
 *
 * 红根因（c105e1d，isInTransientGitState 仅 access 4 个伪 ref 文件）：
 * reftable 后端把伪 ref 写进 reftable 表不落 .git/ 文件——本机 Git 2.53.0
 * 真盘已复现（探针 2026-10-31）：cherry-pick/revert 冲突态 `.git/` 无
 * CHERRY_PICK_HEAD/REVERT_HEAD 文件，但 `git rev-parse --verify` exit 0
 * 命中 → 文件通道恒 miss → 漏判 → fetchGitDiff 把 incoming conflict 当
 * 用户编辑展示（stats/hunks 泄冲突内容）。
 *
 * 修后契约（工单 §1.C）：
 *   - rev-parse --verify --quiet 通道补 storage-aware 识别：exit 0 = 伪 ref
 *     在场；exit 1 = 合法不存在；其余 = unknown（与合法缺失可区分）。
 *   - 未知不伪装「无冲突」（unknown 也不放行展示）。
 *   - 正常用户 diff/untracked、detached/unborn 不退化；冲突解决（--quit）
 *     后恢复展示——识别不粘死。
 *   - 不把「识别冲突」改成展示冲突 patch（识别 = 跳过展示，语义不变）。
 *
 * 门控：git 不可用 → 整族 skip（环境记录 ≠ 判据通过）。
 */
import { describe, expect, test } from 'bun:test'
import { execFileSync, spawnSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fetchGitDiff, fetchGitDiffHunks } from '../../src/tui/utils/gitDiff.js'
import { runWithCwdOverride } from '../../src/tui/utils/cwd.js'

// ── 门控：git 可用性 + reftable 支持探针 ────────────────────────────────────
function gitVersionOk(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
function reftableSupported(): boolean {
  const root = mkdtempSync(join(tmpdir(), 'atlas-w183-rt-probe-'))
  try {
    const r = spawnSync('git', ['init', '-q', '--ref-format=reftable', 'p'], {
      cwd: root,
      encoding: 'utf8',
    })
    return r.status === 0
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const gitOk = gitVersionOk()
const rtOk = gitOk && reftableSupported()
const it = gitOk ? test : test.skip
const itRt = rtOk ? test : test.skip

// ── fixture ────────────────────────────────────────────────────────────────
type RefFormat = 'files' | 'reftable'

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function runGitAllowFail(cwd: string, args: string[]): number {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return r.status ?? 1
}

function commitFile(repo: string, name: string, content: string, msg: string): void {
  writeFileSync(join(repo, name), `${content}\n`)
  runGit(repo, ['add', name])
  runGit(repo, ['commit', '-q', '-m', msg])
}

function initRepo(root: string, name: string, refFormat: RefFormat): string {
  const repo = join(root, name)
  const args = ['init', '-q', '-b', 'main']
  if (refFormat === 'reftable') args.push('--ref-format=reftable')
  args.push(repo)
  execFileSync('git', args, { stdio: 'pipe' })
  runGit(repo, ['config', 'user.email', 't@example.com'])
  runGit(repo, ['config', 'user.name', 't'])
  return repo
}

/** 独立 fixture repo + 进程 chdir + cwd 覆盖；finally 恢复。 */
async function withRepo(
  refFormat: RefFormat,
  fn: (repo: string) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'atlas-w183-diff-'))
  const origCwd = process.cwd()
  try {
    const repo = initRepo(root, 'repo', refFormat)
    process.chdir(repo)
    await runWithCwdOverride(repo, () => fn(repo))
  } finally {
    process.chdir(origCwd)
    rmSync(root, { recursive: true, force: true })
  }
}

/** cherry-pick 冲突序列：c1(a) → c2(b) → reset~1 → c3(c) → cherry-pick c2。 */
function makeCherryPickConflict(repo: string): void {
  commitFile(repo, 'f.txt', 'a', 'c1')
  commitFile(repo, 'f.txt', 'b', 'c2')
  runGit(repo, ['reset', '-q', '--hard', 'HEAD~1'])
  commitFile(repo, 'f.txt', 'c', 'c3')
  runGitAllowFail(repo, ['cherry-pick', 'HEAD~1'])
}

/** revert 冲突序列：c1(a) → c2(b) → c3(c) → revert c2。 */
function makeRevertConflict(repo: string): void {
  commitFile(repo, 'f.txt', 'a', 'c1')
  commitFile(repo, 'f.txt', 'b', 'c2')
  commitFile(repo, 'f.txt', 'c', 'c3')
  runGitAllowFail(repo, ['revert', '--no-edit', 'HEAD~1'])
}

/** merge 冲突序列：main c1(a)+c2(e)；side 自 c1 改 d；merge side。 */
function makeMergeConflict(repo: string): void {
  commitFile(repo, 'f.txt', 'a', 'c1')
  runGit(repo, ['checkout', '-q', '-b', 'side'])
  commitFile(repo, 'f.txt', 'd', 's1')
  runGit(repo, ['checkout', '-q', 'main'])
  commitFile(repo, 'f.txt', 'e', 'c2')
  runGitAllowFail(repo, ['merge', 'side'])
}

// ── 冲突识别（红主面：reftable 漏判；files 守卫防回归）─────────────────────
describe('K4-3 transient 冲突识别（cherry-pick）', () => {
  itRt(
    'RED 主案：reftable cherry-pick 冲突 → stats/hunks 均不放行（伪 ref 无文件、rev-parse 命中）',
    async () => {
      await withRepo('reftable', async repo => {
        makeCherryPickConflict(repo)
        // 场景自证：无 CHERRY_PICK_HEAD 文件（reftable 伪 ref 进表），
        // 但 rev-parse --verify 命中 → 修前文件通道漏判正体
        expect(spawnSync('test', ['-e', join(repo, '.git', 'CHERRY_PICK_HEAD')]).status).not.toBe(0)
        expect(
          spawnSync('git', ['rev-parse', '--verify', '--quiet', 'CHERRY_PICK_HEAD'], {
            cwd: repo,
          }).status,
        ).toBe(0)
        expect(await fetchGitDiff()).toBeNull()
        expect((await fetchGitDiffHunks()).size).toBe(0)
      })
    },
  )

  it('守卫：files cherry-pick 冲突（伪 ref 文件在场）→ 仍不放行', async () => {
    await withRepo('files', async repo => {
      makeCherryPickConflict(repo)
      expect(await fetchGitDiff()).toBeNull()
      expect((await fetchGitDiffHunks()).size).toBe(0)
    })
  })

  itRt('reftable 冲突解决（cherry-pick --quit 清伪 ref）→ 恢复展示，识别不粘死', async () => {
    await withRepo('reftable', async repo => {
      makeCherryPickConflict(repo)
      runGit(repo, ['cherry-pick', '--quit'])
      const diff = await fetchGitDiff()
      expect(diff).not.toBeNull()
      // 树里仍是冲突标记文本（用户可见自己的编辑），但不再被 transient 拦
      expect(diff!.perFileStats.has('f.txt')).toBe(true)
    })
  })
})

describe('K4-3 transient 冲突识别（revert）', () => {
  itRt('reftable revert 冲突 → 不放行', async () => {
    await withRepo('reftable', async repo => {
      makeRevertConflict(repo)
      expect(
        spawnSync('git', ['rev-parse', '--verify', '--quiet', 'REVERT_HEAD'], {
          cwd: repo,
        }).status,
      ).toBe(0)
      expect(await fetchGitDiff()).toBeNull()
      expect((await fetchGitDiffHunks()).size).toBe(0)
    })
  })

  it('守卫：files revert 冲突 → 不放行', async () => {
    await withRepo('files', async repo => {
      makeRevertConflict(repo)
      expect(await fetchGitDiff()).toBeNull()
    })
  })
})

describe('K4-3 transient 冲突识别（merge）', () => {
  itRt('reftable merge 冲突 → 不放行', async () => {
    await withRepo('reftable', async repo => {
      makeMergeConflict(repo)
      expect(
        spawnSync('git', ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], {
          cwd: repo,
        }).status,
      ).toBe(0)
      expect(await fetchGitDiff()).toBeNull()
      expect((await fetchGitDiffHunks()).size).toBe(0)
    })
  })

  it('守卫：files merge 冲突 → 不放行', async () => {
    await withRepo('files', async repo => {
      makeMergeConflict(repo)
      expect(await fetchGitDiff()).toBeNull()
    })
  })
})

// ── 非冲突态不退化（识别不得误拦正常流）────────────────────────────────────
describe('K4-3 非冲突态不退化', () => {
  it('files 普通用户编辑 → 照常展示（含文件计数）', async () => {
    await withRepo('files', async repo => {
      commitFile(repo, 'base.txt', 'x', 'c1')
      writeFileSync(join(repo, 'base.txt'), 'edited\n')
      const diff = await fetchGitDiff()
      expect(diff).not.toBeNull()
      expect(diff!.perFileStats.has('base.txt')).toBe(true)
      expect(diff!.stats.filesCount).toBeGreaterThan(0)
    })
  })

  itRt('reftable 普通用户编辑 → 照常展示（rev-parse 全合法缺失不误拦）', async () => {
    await withRepo('reftable', async repo => {
      commitFile(repo, 'base.txt', 'x', 'c1')
      writeFileSync(join(repo, 'base.txt'), 'edited\n')
      const diff = await fetchGitDiff()
      expect(diff).not.toBeNull()
      expect(diff!.perFileStats.has('base.txt')).toBe(true)
    })
  })

  it('untracked 文件 → 照常展示且标注 untracked', async () => {
    await withRepo('files', async repo => {
      commitFile(repo, 'base.txt', 'x', 'c1')
      writeFileSync(join(repo, 'new.txt'), 'fresh\n')
      const diff = await fetchGitDiff()
      expect(diff).not.toBeNull()
      expect(diff!.perFileStats.get('new.txt')?.isUntracked).toBe(true)
    })
  })

  it('detached HEAD 下编辑 → 照常展示', async () => {
    await withRepo('files', async repo => {
      commitFile(repo, 'base.txt', 'x', 'c1')
      commitFile(repo, 'base.txt', 'y', 'c2')
      runGit(repo, ['checkout', '-q', '--detach', 'HEAD~1'])
      writeFileSync(join(repo, 'base.txt'), 'detached-edit\n')
      const diff = await fetchGitDiff()
      expect(diff).not.toBeNull()
      expect(diff!.perFileStats.has('base.txt')).toBe(true)
    })
  })

  it('unborn HEAD（init 后未提交）→ 不 throw，返回 null', async () => {
    await withRepo('files', async repo => {
      writeFileSync(join(repo, 'staged.txt'), 's\n')
      runGit(repo, ['add', 'staged.txt'])
      await expect(fetchGitDiff()).resolves.toBeNull()
    })
  })
})
