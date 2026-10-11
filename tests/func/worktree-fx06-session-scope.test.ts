/**
 * FX-06（0.1.51 C-1，CC 2.1.119）Agent `isolation:"worktree"` 复用 stale
 * worktree——session-scoped 唯一 slug 支判别 func 面（真 git 仓）。
 *
 * 定因（verify 证实）：`getOrCreateWorktree` = getOrCreate 语义——slug 撞车
 * 时 fast-resume 无条件进入现存目录（含前 session 遗留 stale 目录，或含
 * 其未提交工作）= CC bug 面在场。落码裁定 = **唯一 session-scoped slug**
 * （非清理先行：前 session 目录或含未提交工作，清理 = 数据损失；stale
 * 残留走 cleanupStaleAgentWorktrees age-cutoff 路线）。
 *
 * 判别口径（修前红 → 修后绿）：
 * ① session A 创建 → 目录为 session 作用域（slug 带 sessionId 后缀；
 *    修前：面缺席 → 裸 slug 目录 → 红）
 * ② 前 session 留 stale worktree（含未提交工作标记）→ 本 session（不同
 *    sessionId）同 base slug 不复用旧目录（修前：fast-resume 进入旧目录
 *    → 红）；旧目录未提交工作标记不被触碰
 * ③ 同 session 复用支（设计保留位）：同 sessionId 再建 → 同目录 fast-
 *    resume（恒绿守卫）
 * ④ 零回归：无 sessionId 入参 = 现逐字恒等（裸 slug getOrCreate 语义不变）
 *
 * 门控：git 不可用 → 整族 skip（同 worktree-git.test.ts 先例）。
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
import { join } from 'path'
import {
  createAgentWorktree,
  removeAgentWorktree,
  resetWorktreeGitCaches,
} from '../../src/engine'

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

async function withRepo(
  fn: (ctx: { repoPath: string; originPath: string }) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'atlas-wt-fx06-'))
  const repoPath = join(root, 'repo')
  const originPath = join(root, 'origin.git')
  mkdirSync(repoPath)
  // origin.git 尚不存在 → cwd 用存在的 root，bare 路径作参数
  runGit(root, ['init', '--bare', originPath])
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
    await fn({ repoPath, originPath })
  } finally {
    process.chdir(oldCwd)
    rmSync(root, { recursive: true, force: true })
  }
}

describe('FX-06 agent worktree session 作用域（stale 不复用）', () => {
  it('① session A 创建 → 目录为 session 作用域（slug 带 sessionId 后缀）', async () => {
    await withRepo(async ({ repoPath }) => {
      const a = await createAgentWorktree('agent-x', {
        sessionId: 'a123456789abcdef',
      })
      expect(a.worktreePath).toBe(join(repoPath, '.atlas', 'worktrees', 'agent-x-a1234567'))
      expect(a.worktreeBranch).toBe('worktree-agent-x-a1234567')
      await removeAgentWorktree(a.worktreePath, a.worktreeBranch, repoPath)
    })
  })

  it('② 前 session stale 目录（含未提交工作）→ 本 session 不复用（唯一 slug 支）', async () => {
    await withRepo(async ({ repoPath }) => {
      // 前 session（sessionId A）遗留 stale worktree + 未提交工作标记
      const stale = await createAgentWorktree('agent-x', {
        sessionId: 'a123456789abcdef',
      })
      const marker = join(stale.worktreePath, 'uncommitted-a.txt')
      writeFileSync(marker, 'a-work-in-progress\n')
      expect(existsSync(marker)).toBe(true)

      // 本 session（sessionId B）同 base slug：不复用 stale 目录
      const b = await createAgentWorktree('agent-x', {
        sessionId: 'bbbbbbbb0000ffff',
      })
      expect(b.worktreePath).not.toBe(stale.worktreePath)
      expect(b.worktreePath).toBe(join(repoPath, '.atlas', 'worktrees', 'agent-x-bbbbbbbb'))
      // stale 目录未提交工作不被触碰
      expect(existsSync(marker)).toBe(true)

      await removeAgentWorktree(b.worktreePath, b.worktreeBranch, repoPath)
      await removeAgentWorktree(stale.worktreePath, stale.worktreeBranch, repoPath)
    })
  })

  it('③ 同 session 复用支（设计保留位）：同 sessionId 再建 → 同目录 fast-resume', async () => {
    await withRepo(async () => {
      const a1 = await createAgentWorktree('agent-x', {
        sessionId: 'a123456789abcdef',
      })
      const a2 = await createAgentWorktree('agent-x', {
        sessionId: 'a123456789abcdef',
      })
      expect(a2.worktreePath).toBe(a1.worktreePath)
      await removeAgentWorktree(a1.worktreePath, a1.worktreeBranch)
    })
  })

  it('④ 零回归：无 sessionId 入参 = 现逐字恒等（裸 slug getOrCreate 语义不变）', async () => {
    await withRepo(async ({ repoPath }) => {
      const a = await createAgentWorktree('agent-legacy')
      expect(a.worktreePath).toBe(join(repoPath, '.atlas', 'worktrees', 'agent-legacy'))
      expect(a.worktreeBranch).toBe('worktree-agent-legacy')
      // resume 支（同名再建 = 同目录，现语义）
      const b = await createAgentWorktree('agent-legacy')
      expect(b.worktreePath).toBe(a.worktreePath)
      await removeAgentWorktree(a.worktreePath, a.worktreeBranch, repoPath)
    })
  })
})
