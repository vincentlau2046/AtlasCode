/**
 * FX-38b（0.1.51 C-1，CC 2.1.97）worktree 子代理自目录拒访——权限矩阵判别
 * func 面（真 git 仓 + 真 worktree）。工单 §1.6 判别：权限矩阵 子代理
 * cwd=自 worktree → 自目录 Read/Edit 放行；拒访证实（CC bug 面在场）→
 * 补自目录放行支。
 *
 * verify 定因（已证实，双车道同构）：Read/Edit 权限 allow 集 =
 * allWorkingDirectories = { originalCwd（进程启动 cwd，不可变）,
 * ...additionalWorkingDirectories }，活跃 worktree 的 cwd 不在集内 →
 * 自目录 Read/Edit = 'Path is outside allowed working directories' ask
 * → 异步子代理（shouldAvoidPermissionPrompts）= 自目录拒访；acceptEdits
 * 模式 worktree 内每写皆弹（同缺陷第二表现）。sandbox 侧
 * allowWrite.push(worktreeMainRepoPath) 仅覆 shell 命令面，不覆 Read/Edit
 * 工具决策面 = 本项落码面。
 *
 * 落码裁定 = 补自目录放行支（双拷贝同改，同 PT-17 纪律）：cwd 为主仓
 * 注册 git worktree（cwd/.git 为 gitdir 指针文件、指针落主仓
 * `<main>/.git/worktrees/` marker 下——与 sandbox detectWorktreeMainRepoPath
 * 同款 marker 口径）时，cwd 入 allow 集。两份拷贝：
 *   - src/permissions/filesystem.ts（共享 lane，engine 工具面消费）
 *   - src/tui/utils/permissions/filesystem.ts（TUI lane 双拷贝）
 *
 * 判别（修前红 → 修后绿）：
 * ① 共享 lane 决策：cwd=自 worktree → Read 自目录文件 allow（修前 ask·workingDir）
 * ② 共享 lane 决策：default 模式 Write 自目录 = ask 但非 workingDir 判别
 *    （修前 decisionReason.type='workingDir'，修后 undefined——default 模式
 *    写恒 ask 不变，仅 working-dir 归类变化）
 * ③ 共享 lane 决策：acceptEdits Write 自目录 allow（修前 ask）
 * ④ 零回归（恒绿）：cwd=主仓（.git 目录形态，探针 null 支）→ 主仓文件
 *    allow + 仓外文件 ask·workingDir
 * ⑤ 零回归（恒绿）：cwd=非 git 普通目录（无 .git，探针 null 支）→ 其内
 *    文件 ask（无新增放行支）
 * ⑥ TUI 双拷贝矩阵：allWorkingDirectories 含自 worktree（修前缺席）
 * ⑦ TUI 双拷贝决策：cwd=自 worktree → Read 自目录文件 allow（修前 ask）
 *
 * 分层纪律：func 层真盘 + 真 git（mkdtemp + 真 worktree 生命周期，同
 * worktree-ad21-path 先例）；git 不可用 → 整族 skip（worktree-git 先例）。
 */
import { describe, test, expect } from 'bun:test'
import { execFileSync } from 'child_process'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  checkReadPermissionForTool as sharedCheckRead,
  checkWritePermissionForTool as sharedCheckWrite,
  setPermissionsBootstrapEnv,
  resetPermissionsBootstrapEnv,
  type PermissionTool,
} from '../../src/permissions'
import {
  allWorkingDirectories as tuiAllWorkingDirectories,
  checkReadPermissionForTool as tuiCheckRead,
} from '../../src/tui/utils/permissions/filesystem'
import {
  getCwdState,
  getOriginalCwd,
  setOriginalCwd,
  setCwdState,
} from '../../src/bootstrap'
import type { ToolPermissionContext } from '../../src/shared'

let gitAvailable = false
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' })
  gitAvailable = true
} catch {
  gitAvailable = false
}
const it = gitAvailable ? test : test.skip

const readTool: PermissionTool = {
  name: 'Read',
  getPath: input => (input.file_path as string) ?? '',
}
const editTool: PermissionTool = {
  name: 'Edit',
  getPath: input => (input.file_path as string) ?? '',
}

function makeContext(mode: 'default' | 'acceptEdits' = 'default'): ToolPermissionContext {
  return {
    mode,
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  } as ToolPermissionContext
}

type Fixture = { repo: string; wt: string; outside: string; plain: string }

const savedOriginalCwd = getOriginalCwd()
const savedCwdState = getCwdState()

function gitIn(dir: string, args: string[]): void {
  execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
}

async function withFixture(
  fn: (ctx: Fixture) => Promise<void> | void,
): Promise<void> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-wt-fx38b-')))
  const repo = join(root, 'repo')
  mkdirSync(repo)
  gitIn(repo, ['init', '-b', 'main'])
  gitIn(repo, ['config', 'user.name', 'atlas-test'])
  gitIn(repo, ['config', 'user.email', 'atlas-test@local'])
  writeFileSync(join(repo, 'base.txt'), 'base\n')
  gitIn(repo, ['add', 'base.txt'])
  gitIn(repo, ['commit', '-m', 'base'])
  // 真 worktree（.git = gitdir 指针文件，落 main/.git/worktrees/wt-x）。
  // 关键：worktree 须建在 originalCwd（repo）目录之外（sibling）——建在
  // repo 内（repo/wt-x）会被 originalCwd 包含面遮蔽拒访缺陷（自目录文件
  // 天然落 repo 内 → 修前即 allow，判别面失效）
  gitIn(repo, ['worktree', 'add', join(root, 'wt-x'), '-b', 'wt-x'])
  const wt = join(root, 'wt-x')
  writeFileSync(join(wt, 'self-read.txt'), 'x\n')
  writeFileSync(join(wt, 'self-write.txt'), 'x\n')
  const outside = join(root, 'outside')
  mkdirSync(outside)
  writeFileSync(join(outside, 'o.txt'), 'o\n')
  const plain = join(root, 'plain')
  mkdirSync(plain)
  writeFileSync(join(plain, 'p.txt'), 'p\n')
  try {
    await fn({ repo, wt, outside, plain })
  } finally {
    resetPermissionsBootstrapEnv()
    setOriginalCwd(savedOriginalCwd)
    setCwdState(savedCwdState)
    rmSync(root, { recursive: true, force: true })
  }
}

describe('FX-38b worktree 子代理自目录权限矩阵（真 git worktree）', () => {
  it('① 共享 lane 决策：cwd=自 worktree → Read 自目录文件 allow', async () => {
    await withFixture(({ repo, wt }) => {
      setPermissionsBootstrapEnv({
        getOriginalCwd: () => repo,
        getCwd: () => wt,
      })
      const d = sharedCheckRead(
        readTool,
        { file_path: join(wt, 'self-read.txt') },
        makeContext(),
      )
      expect(d.behavior).toBe('allow')
    })
  })

  it('② 共享 lane 决策：default 模式 Write 自目录 = ask 但非 workingDir 判别', async () => {
    await withFixture(({ repo, wt }) => {
      setPermissionsBootstrapEnv({
        getOriginalCwd: () => repo,
        getCwd: () => wt,
      })
      const d = sharedCheckWrite(
        editTool,
        { file_path: join(wt, 'self-write.txt') },
        makeContext(),
      )
      // default 模式写恒 ask（不变）；判别面 = working-dir 归类
      expect(d.behavior).toBe('ask')
      expect(
        (d.decisionReason as { type?: string } | undefined)?.type,
      ).not.toBe('workingDir')
    })
  })

  it('③ 共享 lane 决策：acceptEdits Write 自目录 allow', async () => {
    await withFixture(({ repo, wt }) => {
      setPermissionsBootstrapEnv({
        getOriginalCwd: () => repo,
        getCwd: () => wt,
      })
      const d = sharedCheckWrite(
        editTool,
        { file_path: join(wt, 'self-write.txt') },
        makeContext('acceptEdits'),
      )
      expect(d.behavior).toBe('allow')
    })
  })

  it('④ 零回归：cwd=主仓（.git 目录形态）→ 主仓文件 allow + 仓外文件 ask·workingDir', async () => {
    await withFixture(({ repo, outside }) => {
      setPermissionsBootstrapEnv({
        getOriginalCwd: () => repo,
        getCwd: () => repo,
      })
      const inside = sharedCheckRead(
        readTool,
        { file_path: join(repo, 'base.txt') },
        makeContext(),
      )
      expect(inside.behavior).toBe('allow')
      const outsideD = sharedCheckRead(
        readTool,
        { file_path: join(outside, 'o.txt') },
        makeContext(),
      )
      expect(outsideD.behavior).toBe('ask')
      expect(
        (outsideD.decisionReason as { type?: string } | undefined)?.type,
      ).toBe('workingDir')
    })
  })

  it('⑤ 零回归：cwd=非 git 普通目录 → 其内文件 ask（无新增放行支）', async () => {
    await withFixture(({ repo, plain }) => {
      setPermissionsBootstrapEnv({
        getOriginalCwd: () => repo,
        getCwd: () => plain,
      })
      const d = sharedCheckRead(
        readTool,
        { file_path: join(plain, 'p.txt') },
        makeContext(),
      )
      expect(d.behavior).toBe('ask')
    })
  })

  it('⑥ TUI 双拷贝矩阵：allWorkingDirectories 含自 worktree', async () => {
    await withFixture(({ repo, wt }) => {
      setOriginalCwd(repo)
      setCwdState(wt)
      const dirs = Array.from(tuiAllWorkingDirectories(makeContext() as never))
      expect(dirs).toContain(realpathSync(wt))
    })
  })

  it('⑦ TUI 双拷贝决策：cwd=自 worktree → Read 自目录文件 allow', async () => {
    await withFixture(({ repo, wt }) => {
      setOriginalCwd(repo)
      setCwdState(wt)
      const d = tuiCheckRead(
        { name: 'Read', getPath: (i: { file_path?: string }) => i.file_path ?? '' } as never,
        { file_path: join(wt, 'self-read.txt') },
        makeContext() as never,
      )
      expect(d.behavior).toBe('allow')
    })
  })
})
