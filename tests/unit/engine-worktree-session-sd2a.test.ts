/**
 * engine/worktree S-D2a（§8.57 worktree 工具本体子波）：交互会话绑定面 +
 * tmux 族 + bootstrap projectRoot 面 unit 面（零盘）。
 *
 * unit 层纪律（同 S-D4/S-D5 对象面先例）：纯函数 + 模块状态机 + tmpdir
 * 标记探针（仅 mkdtemp + .git 标记 mkdir 的读探测，无 git 子进程、无 worktree
 * 真创建——真盘 git 支归 S-D2b func 面 engine-tools-worktree-func）。
 *  - generateTmuxSessionName 命名链（basename + [/.]→_）逐字。
 *  - parsePRReference 双形态（GitHub URL 尾随斜杠/query/hash + #N + 非 PR
 *    形态 null）逐字。
 *  - 会话状态机：null 初值 / restoreWorktreeSession 置位 / 复位 null。
 *  - createWorktreeForSession slug 校验先于 git 探针（任何 fs/子进程之前
 *    同步 throw；git 仓库外 throw 支经 tmpdir chdir 探针）。
 *  - getTmuxInstallInstructions 平台面（本宿主 linux 支文案锚点）。
 *  - bootstrap getProjectRoot 上探 `.git` 标记支 + setProjectRoot no-op
 *    （S-D2a state.ts ⑥ 登记：no-op 语义逐字，勿当真行为）。
 *
 * 探针锚点（§8.57，突变须恰好 1 red）：
 *   P-W1 generateTmuxSessionName [/.]→_ 替换链
 *   P-W2 parsePRReference GitHub URL 尾随形态 + #N + 双 null 支
 *   P-W3 会话状态机 restore→get→null 三段
 *   P-W4 createWorktreeForSession slug 校验先于 git 探针（'..' 同步 throw）
 *   P-W5 getProjectRoot `.git` 标记上探 + setProjectRoot no-op 不改变判定
 *
 * 深度 import（门面归集，双门面回归面）：
 *   ../../src/engine（会话族/tmux 族门面，S-D2a 扩面）+
 *   ../../src/bootstrap（getProjectRoot/setProjectRoot ⑥ 面）
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  getCurrentWorktreeSession,
  restoreWorktreeSession,
  generateTmuxSessionName,
  parsePRReference,
  createWorktreeForSession,
  getTmuxInstallInstructions,
  type WorktreeSession,
} from '../../src/engine'
import { getProjectRoot, setProjectRoot } from '../../src/bootstrap'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// 模块态复位（会话状态机跨测共享进程内模块变量）
beforeEach(() => {
  restoreWorktreeSession(null)
})

// ── P-W1 generateTmuxSessionName 命名链 ────────────────────────────────────
describe('generateTmuxSessionName（P-W1）', () => {
  test('basename(repoPath)_branch 基链', () => {
    expect(generateTmuxSessionName('/home/vince/proj', 'main')).toBe(
      'proj_main',
    )
  })

  test('repo 名与分支内的 / 与 . 全替换 _（[/.] 替换链）', () => {
    expect(generateTmuxSessionName('/home/vince/my.proj', 'feat/x.y')).toBe(
      'my_proj_feat_x_y',
    )
  })
})

// ── P-W2 parsePRReference 双形态 ───────────────────────────────────────────
describe('parsePRReference（P-W2）', () => {
  test('GitHub URL 基础形态', () => {
    expect(parsePRReference('https://github.com/owner/repo/pull/123')).toBe(123)
  })

  test('尾随斜杠 + query + hash 形态', () => {
    expect(
      parsePRReference('https://github.com/owner/repo/pull/123/?ref#files'),
    ).toBe(123)
  })

  test('GHE 等价主机形态（任意 host 安全匹配）', () => {
    expect(
      parsePRReference('https://ghe.example.com/owner/repo/pull/456'),
    ).toBe(456)
  })

  test('#N 形态', () => {
    expect(parsePRReference('#789')).toBe(789)
  })

  test('非 PR 形态 null 双支（裸数字 / GitLab MR 路径）', () => {
    expect(parsePRReference('123')).toBe(null)
    expect(
      parsePRReference('https://gitlab.com/owner/repo/-/merge_requests/1'),
    ).toBe(null)
  })
})

// ── P-W3 会话状态机 ────────────────────────────────────────────────────────
describe('worktree 会话状态机（P-W3）', () => {
  const session: WorktreeSession = {
    originalCwd: '/origin',
    worktreePath: '/wt',
    worktreeName: 'slug',
    sessionId: 's1',
  }

  test('null 初值（beforeEach 复位后）', () => {
    expect(getCurrentWorktreeSession()).toBe(null)
  })

  test('restore 置位 → get 返同引用 → 复位 null 三段', () => {
    restoreWorktreeSession(session)
    expect(getCurrentWorktreeSession()).toBe(session)
    restoreWorktreeSession(null)
    expect(getCurrentWorktreeSession()).toBe(null)
  })
})

// ── P-W4 createWorktreeForSession 守卫支 ───────────────────────────────────
describe('createWorktreeForSession 守卫支（P-W4）', () => {
  test('slug 校验先于 git 探针（.. 同步 throw，零 fs/子进程）', async () => {
    await expect(
      createWorktreeForSession('s1', '..'),
    ).rejects.toThrow('Invalid worktree name')
  })

  test('非 git 仓库 throw 支（tmpdir chdir 探针，E-7 订正文案）', async () => {
    const orig = process.cwd()
    const dir = mkdtempSync(join(tmpdir(), 'atlas-wt-sd2a-nogit-'))
    try {
      process.chdir(dir)
      await expect(
        createWorktreeForSession('s1', 'slug-a'),
      ).rejects.toThrow('not in a git repository')
      expect(getCurrentWorktreeSession()).toBe(null)
    } finally {
      process.chdir(orig)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ── tmux 安装指引平台面 ────────────────────────────────────────────────────
describe('getTmuxInstallInstructions', () => {
  test('本宿主支文案锚点（含 tmux 安装动词）', () => {
    const msg = getTmuxInstallInstructions()
    expect(msg).toContain('tmux')
    expect(msg.length).toBeGreaterThan(10)
  })
})

// ── P-W5 bootstrap projectRoot 面（S-D2a state.ts ⑥）──────────────────────
describe('getProjectRoot / setProjectRoot（P-W5）', () => {
  test('.git 标记上探支（tmpdir 标记探针）+ setProjectRoot no-op 不改变判定', () => {
    const orig = process.cwd()
    const dir = mkdtempSync(join(tmpdir(), 'atlas-wt-sd2a-root-'))
    const marker = join(dir, 'sub')
    mkdirSync(marker)
    mkdirSync(join(marker, '.git'))
    try {
      process.chdir(marker)
      // 上探：marker 自身含 .git → 直接命中（不落 parent 支）
      expect(getProjectRoot()).toBe(marker)
      // no-op 语义逐字：调用不改变上探判定（勿当真行为）
      setProjectRoot('/nonexistent/root')
      expect(getProjectRoot()).toBe(marker)
    } finally {
      process.chdir(orig)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
