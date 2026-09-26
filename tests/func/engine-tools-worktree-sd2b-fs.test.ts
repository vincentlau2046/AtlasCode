/**
 * engine/tools/worktree S-D2b（§8.57 worktree 工具本体子波）：Enter/
 * ExitWorktree 两本体 func 面（真盘 git 仓 + 真 worktree 生命周期）。
 *
 * func 层纪律（真盘 I/O + 真 git 子进程允许，同 S-B5 fs 先例）：
 *  - EnterWorktree.call 真 worktree 创建（真 git worktree add 经
 *    createWorktreeForSession S-D2a 面）：worktreePath/分支名面 +
 *    会话装配 + 进程 chdir 落 worktree。
 *  - 会话守卫：有会话再 Enter → throw 'Already in a worktree session'。
 *  - ExitWorktree keep 支（净 worktree）：真盘保留（目录仍在）+ 会话复位
 *    + 进程 chdir 回 originalCwd + message 逐字面。
 *  - discard 守卫 ec2（脏 worktree：uncommitted 文件）：validateInput
 *    拒（errorCode 2 + 变更列举文案逐字）→ discard_changes=true 放行 →
 *    remove 支真盘删除（目录不在 + 分支删除）。
 *  - 失败封闭 ec3（countWorktreeChanges 判别支）：worktree 目录带外删除后
 *    git status 非零 → null → validateInput 拒（errorCode 3 文案逐字）。
 *
 * 端口接线（S-B5 先例）：executor setCwd 经 BootstrapStatePort 落
 * bootstrap cwdState（未注入 fail-fast），beforeAll 注入 / afterAll 复位。
 *
 * 深度 import（门面归集）：../../src/engine/tools（两本体 + schema 常量）+
 * ../../src/engine（getCurrentWorktreeSession / restoreWorktreeSession，
 * S-D2a 面）+ ../../src/bootstrap（cwd 两状态）+ ../../src/executor
 * （bootstrap port 接线面）。
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
} from 'bun:test'
import {
  execFileSync,
} from 'child_process'
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  realpathSync,
  readdirSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  EnterWorktreeTool,
  ExitWorktreeTool,
} from '../../src/engine/tools'
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

const ROOT = join(tmpdir(), 'atlas-wt-sd2b-fs-')

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

beforeAll(() => {
  // realpath 化：tmpdir 在部分平台是 symlink（macOS /tmp → /private/tmp），
  // 全链比较（worktreePath join 面 / process.cwd kernel 面）须同一物理路径
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
  restoreWorktreeSession(null)
  process.chdir(savedProcessCwd)
  setCwdState(savedCwdState)
  setOriginalCwd(savedOriginalCwd)
  resetBootstrapStatePort()
  rmSync(root, { recursive: true, force: true })
})

// ── Enter 真 worktree 创建面 ─────────────────────────────────────────────

describe('EnterWorktree.call 真 worktree 创建', () => {
  test('真 git worktree 创建 + 会话装配 + 进程 chdir 落 worktree', async () => {
    process.chdir(root)
    const r = await EnterWorktreeTool.call({ name: 'sd2b-func' })
    const wt = r.data.worktreePath
    // S-D2a worktreesDir 面：<repoRoot>/.atlas/worktrees/<slug>
    expect(wt).toBe(join(root, '.atlas', 'worktrees', 'sd2b-func'))
    expect(r.data.worktreeBranch).toBe('worktree-sd2b-func')
    expect(existsSync(wt)).toBe(true)
    // 进程已 chdir 落 worktree（kernel realpath 面）
    expect(process.cwd()).toBe(realpathSync(wt))
    // 会话装配（originalCwd = 进入前 cwd = root）
    const session = getCurrentWorktreeSession()
    expect(session).not.toBe(null)
    expect(session?.originalCwd).toBe(root)
    expect(session?.originalHeadCommit).toHaveLength(40)
    // message 逐字面
    expect(r.data.message).toBe(
      `Created worktree at ${wt} on branch worktree-sd2b-func. The session is now working in the worktree. Use ExitWorktree to leave mid-session, or exit the session to be prompted.`,
    )
  })

  test('有会话再 Enter → throw（会话守卫）', async () => {
    await expect(EnterWorktreeTool.call({})).rejects.toThrow(
      'Already in a worktree session',
    )
  })
})

// ── Exit keep 支（净 worktree）──────────────────────────────────────────

describe('ExitWorktree keep 支（净 worktree 真盘保留）', () => {
  test('keep：目录保留 + 会话复位 + 进程 chdir 回 originalCwd + message 逐字', async () => {
    // 净 worktree：validateInput keep 直通（无变更 → 无 ec2 判别）
    expect(await ExitWorktreeTool.validateInput!({ action: 'keep' })).toEqual({
      result: true,
    })
    const session = getCurrentWorktreeSession()
    const wt = session?.worktreePath
    const originalCwd = session?.originalCwd
    const r = await ExitWorktreeTool.call({ action: 'keep' })
    expect(r.data.message).toBe(
      `Exited worktree. Your work is preserved at ${wt} on branch worktree-sd2b-func. Session is now back in ${originalCwd}.`,
    )
    // 真盘保留：目录 + 分支俱在（linked worktree 检出中 → git 输出带
    // '+ ' 前缀，剥前缀后核分支名）
    expect(existsSync(wt)).toBe(true)
    expect(
      gitIn(root, ['branch', '--list', 'worktree-sd2b-func']).replace(
        /^\+ /,
        '',
      ),
    ).toBe('worktree-sd2b-func')
    // 会话复位 + 进程回 originalCwd（keepWorktree chdir 面）
    expect(getCurrentWorktreeSession()).toBe(null)
    expect(process.cwd()).toBe(originalCwd)
    expect(process.cwd()).toBe(root)
  })
})

// ── discard 守卫 ec2（脏 worktree）──────────────────────────────────────

describe('ExitWorktree discard 守卫（脏 worktree）', () => {
  test('re-Enter + uncommitted 文件 → ec2 拒（变更列举文案逐字）', async () => {
    const r = await EnterWorktreeTool.call({ name: 'sd2b-dirty' })
    const wt = r.data.worktreePath
    writeFileSync(join(wt, 'dirty.txt'), 'dirty\n')

    const v = await ExitWorktreeTool.validateInput!({ action: 'remove' })
    expect(v.result).toBe(false)
    if (v.result === false) {
      expect(v.errorCode).toBe(2)
      expect(v.message).toBe(
        'Worktree has 1 uncommitted file. Removing will discard this work permanently. Confirm with the user, then re-invoke with discard_changes: true — or use action: "keep" to preserve the worktree.',
      )
    }
    // discard_changes=true 跳过探针直通（零子进程支，unit 已核；此处真盘复核）
    expect(
      await ExitWorktreeTool.validateInput!({
        action: 'remove',
        discard_changes: true,
      }),
    ).toEqual({ result: true })

    const rem = await ExitWorktreeTool.call({
      action: 'remove',
      discard_changes: true,
    })
    // 真盘删除：目录不在 + 分支删除
    expect(existsSync(wt)).toBe(false)
    expect(gitIn(root, ['branch', '--list', 'worktree-sd2b-dirty'])).toBe('')
    // message 逐字面（commits 0 → discardParts 仅文件项）
    expect(rem.data.message).toBe(
      `Exited and removed worktree at ${wt}. Discarded 1 uncommitted file. Session is now back in ${root}.`,
    )
    expect(rem.data.discardedFiles).toBe(1)
    expect(rem.data.discardedCommits).toBe(0)
    expect(getCurrentWorktreeSession()).toBe(null)
  })
})

// ── 失败封闭 ec3（countWorktreeChanges 判别支）──────────────────────────

describe('ExitWorktree 失败封闭 ec3', () => {
  test('worktree 目录带外删除 → git status 非零 → null → ec3 拒（文案逐字）', async () => {
    const r = await EnterWorktreeTool.call({ name: 'sd2b-ec3' })
    const wt = r.data.worktreePath
    // 带外删 worktree 目录（S-D2a 登记 c 语境：路径消失）→ git -C wt
    // 全族失败（exit 128）→ countWorktreeChanges 失败封闭 null。
    // （注：仅删 .git 指针文件不够——git 会上探至 root 仓仍成功，
    // 本支须目录整体缺失才触发非零退出）
    rmSync(wt, { recursive: true, force: true })

    const v = await ExitWorktreeTool.validateInput!({ action: 'remove' })
    expect(v.result).toBe(false)
    if (v.result === false) {
      expect(v.errorCode).toBe(3)
      expect(v.message).toBe(
        `Could not verify worktree state at ${wt}. Refusing to remove without explicit confirmation. Re-invoke with discard_changes: true to proceed — or use action: "keep" to preserve the worktree.`,
      )
    }
    // 手工清理（本支不调 cleanupWorktree）：prune + 分支删 + 会话复位
    // （sd2b-func 为 keep 支保留位，仅断言 ec3 目录已清）
    gitIn(root, ['worktree', 'prune'])
    gitIn(root, ['branch', '-D', 'worktree-sd2b-ec3'])
    restoreWorktreeSession(null)
    expect(readdirSync(join(root, '.atlas', 'worktrees'))).not.toContain(
      'sd2b-ec3',
    )
  })
})
