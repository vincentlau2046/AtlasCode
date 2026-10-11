/**
 * AD-21（0.1.51 C-1）EnterWorktree `path` 入参面 func 面（真 git 仓 +
 * 真 worktree 生命周期）。工单 §1.1 判别 ①②③ 对应面：
 *
 *  - ① path 指向现存注册 worktree → 进入不新建（分支不变 + 会话装配
 *    creationDurationMs 不设 = resume 信号 + worktree 列表计数不变 +
 *    无 <configDir>/worktrees/ 新建目录）
 *  - ② 路径不存在 → 可操作报错（'does not exist' + name 入参提示）
 *  - ③ 存在但非本仓注册 worktree → 可操作拒（'not a registered worktree'
 *    + 可用 worktree 列举）
 *  - 零回归：仅 name 入参新建支不回归（= 既有 sd2b-fs / worktree-git
 *    回归族，本文件重跑不重复）
 *
 * func 层纪律（同 S-B5 fs / sd2b-fs 先例）：真盘 I/O + 真 git 子进程
 * 允许；端口接线 = executor BootstrapStatePort（setCwd 落 bootstrap
 * cwdState，未注入 fail-fast）+ beforeAll 注入 / afterAll 复位。
 *
 * 会话守卫纪律：每个 call 前 restoreWorktreeSession(null) + chdir 回主
 * 仓根（会话守卫 'Already in a worktree session' 先于盘上探针支）。
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { execFileSync } from 'child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { EnterWorktreeTool } from '../../src/engine/tools'
import {
  getCurrentWorktreeSession,
  restoreWorktreeSession,
} from '../../src/engine'
import {
  getCwdState,
  getOriginalCwd,
  setOriginalCwd,
  setCwdState,
} from '../../src/bootstrap'
import { resetBootstrapStatePort, setBootstrapStatePort } from '../../src/executor'

const ROOT = join(tmpdir(), 'atlas-wt-ad21-fs-')

let root: string
let savedCwdState: string
let savedOriginalCwd: string
let savedProcessCwd: string

function gitIn(dir: string, args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
  }).trim()
}

function initRepo(dir: string): void {
  gitIn(dir, ['init', '-b', 'main'])
  gitIn(dir, ['config', 'user.name', 'atlas-test'])
  gitIn(dir, ['config', 'user.email', 'atlas-test@local'])
  writeFileSync(join(dir, 'base.txt'), 'base\n')
  gitIn(dir, ['add', 'base.txt'])
  gitIn(dir, ['commit', '-m', 'base'])
}

function worktreeListCount(): number {
  return gitIn(root, ['worktree', 'list']).split('\n').filter(Boolean).length
}

/** 会话守卫复位 + 进程/状态 chdir 回主仓根（每 call 前确定性位）。 */
function resetToMainRoot(): void {
  restoreWorktreeSession(null)
  process.chdir(root)
  setCwdState(root)
  setOriginalCwd(root)
}

beforeAll(() => {
  // realpath 化：tmpdir 在部分平台是 symlink（macOS /tmp → /private/tmp），
  // 全链比较（worktree list 路径面 / process.cwd kernel 面）须同一物理路径
  root = realpathSync(mkdtempSync(ROOT))
  initRepo(root)
  savedCwdState = getCwdState()
  savedOriginalCwd = getOriginalCwd()
  savedProcessCwd = process.cwd()
  // executor setCwd 经 BootstrapStatePort 落 bootstrap cwdState（未注入 fail-fast）
  setBootstrapStatePort({
    getCwd: () => getCwdState(),
    getOriginalCwd: () => getOriginalCwd(),
    setCwdState: (p: string) => setCwdState(p),
  })
  setCwdState(root)
  setOriginalCwd(root)
  process.chdir(root)
})

afterAll(() => {
  process.chdir(savedProcessCwd)
  setCwdState(savedCwdState)
  setOriginalCwd(savedOriginalCwd)
  resetBootstrapStatePort()
  restoreWorktreeSession(null)
  rmSync(root, { recursive: true, force: true })
})

describe('AD-21 EnterWorktree path 面（真 git worktree）', () => {
  test('① path 指向现存注册 worktree → 进入不新建（分支不变 + 列表计数不变 + 无新建目录）', async () => {
    const wtPath = join(root, 'wt-a')
    gitIn(root, ['worktree', 'add', 'wt-a', '-b', 'wt-a'])
    const countBefore = worktreeListCount()
    resetToMainRoot()

    const res = await EnterWorktreeTool.call({ path: wtPath })

    // 进入面：会话装配 = 现存 worktree（非新建支）
    const session = getCurrentWorktreeSession()
    expect(session?.worktreePath).toBe(realpathSync(wtPath))
    expect(session?.worktreeBranch).toBe('wt-a') // 原分支不变（新建支会是 slug 分支）
    expect(session?.creationDurationMs).toBeUndefined() // resume 信号（不新建）
    // 输出面：进入文案（非 'Created worktree'）
    expect(res.data.worktreePath).toBe(realpathSync(wtPath))
    expect(res.data.worktreeBranch).toBe('wt-a')
    expect(res.data.message).toContain('Entered existing worktree')
    // 不新建面：worktree 列表计数不变 + 会话 worktree 目录（<configDir>/worktrees/）未创建
    expect(worktreeListCount()).toBe(countBefore)
    expect(existsSync(join(root, '.atlas', 'worktrees'))).toBe(false)
    // 进程落位面：chdir 到现存 worktree
    expect(realpathSync(process.cwd())).toBe(realpathSync(wtPath))

    restoreWorktreeSession(null)
    gitIn(root, ['worktree', 'remove', '--force', 'wt-a'])
  })

  test('② 路径不存在 → 可操作报错（does not exist + name 入参提示）', async () => {
    resetToMainRoot()
    await expect(
      EnterWorktreeTool.call({ path: join(root, 'no-such-wt') }),
    ).rejects.toThrow(/does not exist/)
    // 会话未装配（报错先于装配）
    expect(getCurrentWorktreeSession()).toBeNull()
  })

  test('③ 存在但非本仓注册 worktree → 可操作拒（not a registered worktree + 可用列举）', async () => {
    const plainDir = join(root, 'plain-dir')
    mkdirSync(plainDir, { recursive: true })
    writeFileSync(join(plainDir, 'f.txt'), 'x\n')
    // 一个注册 worktree 在场（报错面列举支非空断言位）
    const wtPath = join(root, 'wt-b')
    gitIn(root, ['worktree', 'add', 'wt-b', '-b', 'wt-b'])
    resetToMainRoot()

    await expect(EnterWorktreeTool.call({ path: plainDir })).rejects.toThrow(
      /not a registered worktree/,
    )
    expect(getCurrentWorktreeSession()).toBeNull()

    gitIn(root, ['worktree', 'remove', '--force', 'wt-b'])
  })

  test('零回归：name 入参新建支不受 path 面影响（slug 分支面不变）', async () => {
    resetToMainRoot()
    const res = await EnterWorktreeTool.call({ name: 'ad21-regress' })
    const session = getCurrentWorktreeSession()
    expect(session?.worktreeName).toBe('ad21-regress')
    expect(res.data.worktreeBranch).toBe('worktree-ad21-regress')
    expect(res.data.message).toContain('Created worktree')
    // 会话复位 + 盘清（removeAgentWorktree 支不经 Exit 工具：直接 git 清）
    restoreWorktreeSession(null)
    process.chdir(root)
    gitIn(root, ['worktree', 'remove', '--force', res.data.worktreePath])
  })
})
