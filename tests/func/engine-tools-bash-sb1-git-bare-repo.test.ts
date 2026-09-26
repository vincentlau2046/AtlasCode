/**
 * engine/tools/bash S-B1 gitBareRepo 真盘 fixture 面（Bash 本体纵切子波
 * §8.54 S-B1 func 层 1 文件，C 桶 ① 子波 2）。
 *
 * func 层（真盘 I/O 允许）：mkdtemp fixture 目录 + setCwdState 指向
 * （bootstrap/cwd getCwd 面，测试后恢复）→ isCurrentDirectoryBareGitRepo
 * 判定链（旧仓 utils/git.ts L846-933 逐字随迁）：
 *   - .git 文件（worktree/submodule gitdir 引用）→ 非裸库 false
 *   - .git 目录 + .git/HEAD 常规文件 → 正常仓库 false
 *   - .git 目录 + .git/HEAD 目录型（P-B5 探针锚点：攻击者目录型 HEAD
 *     被 git setup_git_directory 拒 → 回落裸库探测）→ 指示符判
 *   - .git 目录无 HEAD + objects 目录 → 裸库 true
 *   - 无 .git：HEAD 文件 / objects 目录 / refs 目录 任一指示符 → true；
 *     全无 → false
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { isCurrentDirectoryBareGitRepo } from '../../src/engine/tools/bash/gitBareRepo'
import {
  getCwdState,
  setCwdState,
} from '../../src/bootstrap/state'

const ROOT = join(tmpdir(), 'atlas-bash-sb1-bare-repo-')

let root: string
let savedCwdState: string

beforeAll(() => {
  root = mkdtempSync(ROOT)
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

beforeEach(() => {
  savedCwdState = getCwdState()
})

afterEach(() => {
  setCwdState(savedCwdState)
})

/** 在 root 下建子目录 fixture 并指向，返回目录名。 */
function fixture(name: string): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  setCwdState(dir)
  return dir
}

describe('isCurrentDirectoryBareGitRepo 判定链（真盘 fixture）', () => {
  test('.git 文件（worktree gitdir 引用）→ 非裸库', () => {
    const dir = fixture('worktree')
    writeFileSync(join(dir, '.git'), 'gitdir: /tmp/somewhere/.git/worktrees/x\n')
    expect(isCurrentDirectoryBareGitRepo()).toBe(false)
  })

  test('.git 目录 + .git/HEAD 常规文件 → 正常仓库', () => {
    const dir = fixture('normal-repo')
    mkdirSync(join(dir, '.git'), { recursive: true })
    writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    expect(isCurrentDirectoryBareGitRepo()).toBe(false)
  })

  test('.git 目录 + .git/HEAD 目录型（P-B5 锚点：isFile 守卫）→ 指示符判', () => {
    const dir = fixture('dir-head-clean')
    mkdirSync(join(dir, '.git'), { recursive: true })
    // 攻击形：.git/HEAD 是目录 → isFile 守卫拒 → 回落裸库指示符
    mkdirSync(join(dir, '.git', 'HEAD'), { recursive: true })
    // 无裸库指示符 → false
    expect(isCurrentDirectoryBareGitRepo()).toBe(false)

    // 同形态 + objects 指示符 → true
    const dir2 = join(root, 'dir-head-bare')
    mkdirSync(join(dir2, '.git'), { recursive: true })
    mkdirSync(join(dir2, '.git', 'HEAD'), { recursive: true })
    mkdirSync(join(dir2, 'objects'), { recursive: true })
    setCwdState(dir2)
    expect(isCurrentDirectoryBareGitRepo()).toBe(true)
  })

  test('.git 目录无 HEAD + objects 目录 → 裸库', () => {
    const dir = fixture('bare-objects')
    mkdirSync(join(dir, '.git'), { recursive: true })
    mkdirSync(join(dir, 'objects'), { recursive: true })
    expect(isCurrentDirectoryBareGitRepo()).toBe(true)
  })

  test('.git 目录无 HEAD 且无指示符 → 非裸库', () => {
    const dir = fixture('no-head-no-indicators')
    mkdirSync(join(dir, '.git'), { recursive: true })
    expect(isCurrentDirectoryBareGitRepo()).toBe(false)
  })

  test('无 .git：三指示符任一 → true', () => {
    const dir = fixture('no-git-indicators')
    writeFileSync(join(dir, 'HEAD'), 'ref: refs/heads/main\n')
    expect(isCurrentDirectoryBareGitRepo()).toBe(true)

    const dir2 = join(root, 'no-git-objects')
    mkdirSync(join(dir2, 'objects'), { recursive: true })
    setCwdState(dir2)
    expect(isCurrentDirectoryBareGitRepo()).toBe(true)

    const dir3 = join(root, 'no-git-refs')
    mkdirSync(join(dir3, 'refs'), { recursive: true })
    setCwdState(dir3)
    expect(isCurrentDirectoryBareGitRepo()).toBe(true)
  })

  test('无 .git 且无指示符 → false', () => {
    const dir = fixture('no-git-clean')
    writeFileSync(join(dir, 'README.md'), 'x\n')
    expect(isCurrentDirectoryBareGitRepo()).toBe(false)
    // 形态核验：cwd 确为 fixture（防 setCwdState 失效假绿）
    expect(statSync(join(dir, 'README.md')).isFile()).toBe(true)
  })
})
