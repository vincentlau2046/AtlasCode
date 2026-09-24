/**
 * worktree 域单测（E-7 S-7c，§8.48）：纯函数 / 零盘面
 * （slug 校验 / branch 名 / 安全守卫 ref/sha / .git/config 解析 / gitExe）。
 *
 * 真盘面（真 git 仓库 createAgentWorktree / removeAgentWorktree /
 * cleanupStaleAgentWorktrees / findGitRoot / findCanonicalGitRoot /
 * getDefaultBranch / readWorktreeHeadSha）归 tests/func/worktree-git.test.ts。
 *
 * 探针锚点（§8.48 详案，突变须恰好 1 red）：
 *   P-T1 validateWorktreeSlug `..` 段拒支 → 'a/../b 段穿越拒支'
 *   P-T2 findCanonicalGitRoot backlink 安全校验 → func 层
 *   P-T3 cleanupStaleAgentWorktrees dirty fail-closed 守卫 → func 层
 */
import { describe, test, expect } from 'bun:test'
import {
  validateWorktreeSlug,
  worktreeBranchName,
  isSafeRefName,
  isValidGitSha,
  parseConfigString,
  gitExe,
  resetWorktreeGitCaches,
} from '../../src/engine'

// ── validateWorktreeSlug（路径穿越 / 段 allowlist / 长度）──────────────────
describe('validateWorktreeSlug', () => {
  test('合法单层 slug 通过', () => {
    expect(() => validateWorktreeSlug('feature-foo')).not.toThrow()
  })

  test('嵌套 slug（asm/feature-foo）通过（逐段 allowlist）', () => {
    expect(() => validateWorktreeSlug('asm/feature-foo')).not.toThrow()
  })

  test('a/../b 段穿越拒支（P-T1 探针锚点）', () => {
    expect(() => validateWorktreeSlug('a/../b')).toThrow('..')
  })

  test('a/./b 单点段拒支', () => {
    expect(() => validateWorktreeSlug('a/./b')).toThrow('..')
  })

  test('绝对路径（前导 /）拒支（空首段 fail regex）', () => {
    expect(() => validateWorktreeSlug('/abs/path')).toThrow()
  })

  test('尾随 / 拒支（空尾段 fail regex）', () => {
    expect(() => validateWorktreeSlug('feature/')).toThrow()
  })

  test('段含空白（非 allowlist）拒支', () => {
    expect(() => validateWorktreeSlug('a b')).toThrow()
  })

  test('>64 字符拒支', () => {
    expect(() => validateWorktreeSlug('a'.repeat(65))).toThrow('64')
  })

  test('恰 64 字符通过（边界）', () => {
    expect(() => validateWorktreeSlug('a'.repeat(64))).not.toThrow()
  })
})

// ── worktreeBranchName（flatten：/ → +）────────────────────────────────────
describe('worktreeBranchName', () => {
  test('单层 → worktree-<slug>', () => {
    expect(worktreeBranchName('feature')).toBe('worktree-feature')
  })

  test('嵌套 slug flatten（/ → +，injective）', () => {
    expect(worktreeBranchName('asm/feature-foo')).toBe('worktree-asm+feature-foo')
  })
})

// ── isSafeRefName（.git 文件安全守卫）──────────────────────────────────────
describe('isSafeRefName', () => {
  test('合法分支名', () => {
    expect(isSafeRefName('main')).toBe(true)
    expect(isSafeRefName('feature/x')).toBe(true)
  })

  test('复杂依赖分支名（dependabot 形态）', () => {
    expect(
      isSafeRefName('dependabot/npm_and_yarn/@types/node-18.0.0'),
    ).toBe(true)
  })

  test('路径穿越（..）拒', () => {
    expect(isSafeRefName('a/../b')).toBe(false)
  })

  test('前导 - 拒（参数注入）', () => {
    expect(isSafeRefName('-main')).toBe(false)
  })

  test('前导 / 拒', () => {
    expect(isSafeRefName('/abs')).toBe(false)
  })

  test('空 path 分量拒（a/./b / a//b / a/）', () => {
    expect(isSafeRefName('a/./b')).toBe(false)
    expect(isSafeRefName('a//b')).toBe(false)
    expect(isSafeRefName('a/')).toBe(false)
  })

  test('shell 元字符 / 空白 / 非 ASCII 拒（allowlist-only）', () => {
    expect(isSafeRefName('a b')).toBe(false)
    expect(isSafeRefName('a;b')).toBe(false)
    expect(isSafeRefName('a{b')).toBe(false)
  })

  test('空串拒', () => {
    expect(isSafeRefName('')).toBe(false)
  })
})

// ── isValidGitSha（40/64 hex）──────────────────────────────────────────────
describe('isValidGitSha', () => {
  test('40 hex（SHA-1）', () => {
    expect(isValidGitSha('a'.repeat(40))).toBe(true)
  })

  test('64 hex（SHA-256）', () => {
    expect(isValidGitSha('b'.repeat(64))).toBe(true)
  })

  test('长度不足拒', () => {
    expect(isValidGitSha('a'.repeat(39))).toBe(false)
  })

  test('非 hex 字符拒', () => {
    expect(isValidGitSha('g'.repeat(40))).toBe(false)
  })

  test('空串拒', () => {
    expect(isValidGitSha('')).toBe(false)
  })
})

// ── parseConfigString（.git/config 解析，纯函数）────────────────────────────
describe('parseConfigString', () => {
  test('简单 section/key/value', () => {
    const cfg = '[core]\n\tbare = true\n'
    expect(parseConfigString(cfg, 'core', null, 'bare')).toBe('true')
  })

  test('section 大小写不敏感', () => {
    const cfg = '[CORE]\n\tbare = true\n'
    expect(parseConfigString(cfg, 'core', null, 'bare')).toBe('true')
  })

  test('subsection（remote "origin"）大小写敏感', () => {
    const cfg = '[remote "origin"]\n\turl = https://x\n'
    expect(parseConfigString(cfg, 'remote', 'origin', 'url')).toBe(
      'https://x',
    )
    // 大小写不匹配 → 未命中
    expect(parseConfigString(cfg, 'remote', 'ORIGIN', 'url')).toBeNull()
  })

  test('简单 section 须以 ] 收尾（无 subsection）', () => {
    const cfg = '[core]\nbare = true\n'
    // 无 subsection 查询命中
    expect(parseConfigString(cfg, 'core', null, 'bare')).toBe('true')
    // 有 subsection 查询不命中（[core] 是简单 section）
    expect(parseConfigString(cfg, 'core', 'x', 'bare')).toBeNull()
  })

  test('引号值（含空格保留）', () => {
    const cfg = '[user]\n\tname = "John Doe"\n'
    expect(parseConfigString(cfg, 'user', null, 'name')).toBe('John Doe')
  })

  test('行内注释（引号外 # 截断 + 尾空白 trim）', () => {
    const cfg = '[core]\n\tshallow = true # a comment\n'
    expect(parseConfigString(cfg, 'core', null, 'shallow')).toBe('true')
  })

  test('引号内转义（\\n / \\t / \\\" / 未知转义丢反斜杠）', () => {
    const cfg = '[a]\n\tmsg = "x\\n\\ty\\\\z\\\\qb"\n'
    expect(parseConfigString(cfg, 'a', null, 'msg')).toBe('x\n\ty\\z\\qb')
  })

  test('引号内未知转义丢反斜杠（\\q→q）+ 转义引号（\\"→"）', () => {
    // 值串（引号内）= q \q 空格 \\" c \\"（\q 未知转义、\" 转义引号）
    const cfg = '[a]\n\tmsg = "q\\q \\"c\\"\n'
    expect(parseConfigString(cfg, 'a', null, 'msg')).toBe('qq "c"')
  })

  test('无值布尔 key（无 =）→ null', () => {
    const cfg = '[core]\nbare\n'
    expect(parseConfigString(cfg, 'core', null, 'bare')).toBeNull()
  })

  test('注释行（# / ;）+ 空行跳过', () => {
    const cfg = '# top\n; semi\n\n[core]\nbare = true\n'
    expect(parseConfigString(cfg, 'core', null, 'bare')).toBe('true')
  })

  test('非命中 section 的 key → null', () => {
    const cfg = '[core]\nbare = true\n'
    expect(parseConfigString(cfg, 'other', null, 'bare')).toBeNull()
  })
})

// ── gitExe（env 覆写 + 缺省）───────────────────────────────────────────────
describe('gitExe', () => {
  test('缺省 → git', () => {
    delete process.env.ATLAS_GIT_EXE
    resetWorktreeGitCaches()
    expect(gitExe()).toBe('git')
  })

  test('env 覆写（ATLAS_GIT_EXE）', () => {
    process.env.ATLAS_GIT_EXE = 'git-custom'
    resetWorktreeGitCaches()
    expect(gitExe()).toBe('git-custom')
    delete process.env.ATLAS_GIT_EXE
    resetWorktreeGitCaches()
  })
})
