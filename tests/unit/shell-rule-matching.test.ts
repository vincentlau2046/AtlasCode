/**
 * shellRuleMatching 三态规则匹配契约测试（E-4 S-4b，旧仓 228L 全迁）
 *
 * 被测能力（旧仓 shellRuleMatching.ts 逐字迁）：
 *   - parsePermissionRule 三态归类（exact / `:*` legacy 前缀 / wildcard）
 *   - permissionRuleExtractPrefix / hasWildcards（转义星号扫描）
 *   - matchWildcardPattern（`\*` `\\` 转义 + 尾 ` *` 尾参可选 + 多通配排除 +
 *     内嵌换行 dotAll + caseInsensitive）
 *   - suggestionForExactCommand / suggestionForPrefix（PermissionUpdate 形状）
 * L3：只 import permissions 域根门面（STR-1）。零磁盘纯字符串。
 */
import { describe, test, expect } from 'bun:test'
import {
  parsePermissionRule,
  permissionRuleExtractPrefix,
  hasWildcards,
  matchWildcardPattern,
  suggestionForExactCommand,
  suggestionForPrefix,
} from '../../src/permissions'

// ── parsePermissionRule 三态归类 ────────────────────────────────────

describe('parsePermissionRule 三态归类', () => {
  test('exact（无通配无 `:*`）', () => {
    expect(parsePermissionRule('npm install')).toEqual({
      type: 'exact',
      command: 'npm install',
    })
  })

  test('legacy `:*` 前缀（优先于 wildcard 判定）', () => {
    expect(parsePermissionRule('npm:*')).toEqual({
      type: 'prefix',
      prefix: 'npm',
    })
  })

  test('wildcard（含未转义 `*` 且非 `:*` 结尾）', () => {
    expect(parsePermissionRule('git *')).toEqual({
      type: 'wildcard',
      pattern: 'git *',
    })
  })

  test('转义星号 `\*` 不触发 wildcard（归 exact）', () => {
    expect(parsePermissionRule('git \\*')).toEqual({
      type: 'exact',
      command: 'git \\*',
    })
  })
})

// ── permissionRuleExtractPrefix ─────────────────────────────────────

describe('permissionRuleExtractPrefix（legacy `:*` 前缀提取）', () => {
  test('npm:* → npm', () => {
    expect(permissionRuleExtractPrefix('npm:*')).toBe('npm')
  })

  test('前缀本身含冒号（贪婪捕获）', () => {
    expect(permissionRuleExtractPrefix('a:b:*')).toBe('a:b')
  })

  test('非 `:*` 结尾 → null', () => {
    expect(permissionRuleExtractPrefix('npm')).toBeNull()
    expect(permissionRuleExtractPrefix('git *')).toBeNull()
  })
})

// ── hasWildcards ────────────────────────────────────────────────────

describe('hasWildcards（未转义星号判定）', () => {
  test('未转义 `*` → true', () => {
    expect(hasWildcards('git *')).toBe(true)
  })

  test('legacy `:*` 结尾 → false（前缀语法非通配）', () => {
    expect(hasWildcards('npm:*')).toBe(false)
  })

  test('转义 `\*` → false', () => {
    expect(hasWildcards('git \\*')).toBe(false)
  })

  test('转义反斜杠 `\\*` → true（偶数个反斜杠后 = 未转义星号）', () => {
    expect(hasWildcards('git \\\\*')).toBe(true)
  })

  test('无星号 → false', () => {
    expect(hasWildcards('npm install')).toBe(false)
  })
})

// ── matchWildcardPattern ────────────────────────────────────────────

describe('matchWildcardPattern', () => {
  test('基础通配（`npm *` 匹配带参命令）', () => {
    expect(matchWildcardPattern('npm *', 'npm install')).toBe(true)
    expect(matchWildcardPattern('npm *', 'npm i --save x')).toBe(true)
    expect(matchWildcardPattern('npm *', 'yarn install')).toBe(false)
  })

  test('尾 ` *` 单通配 = 尾参可选（git 匹配 git add，对齐前缀语义）', () => {
    expect(matchWildcardPattern('git *', 'git')).toBe(true)
    expect(matchWildcardPattern('git *', 'git add')).toBe(true)
    expect(matchWildcardPattern('git *', 'git add x')).toBe(true)
    expect(matchWildcardPattern('git *', 'gitx')).toBe(false)
  })

  test('多通配排除（`* install *` 不匹配无尾参命令）', () => {
    expect(matchWildcardPattern('* install *', 'npm install foo')).toBe(true)
    // 第二个通配不作可选 → 无尾参不匹配
    expect(matchWildcardPattern('* install *', 'npm install')).toBe(false)
  })

  test('`\\*` 字面星号（匹配含 `*` 的命令，非通配）', () => {
    expect(matchWildcardPattern('git \\*', 'git *')).toBe(true)
    expect(matchWildcardPattern('git \\*', 'git add')).toBe(false)
    // 通配 + 字面星号组合
    expect(matchWildcardPattern('git *\\*', 'git a*')).toBe(true)
  })

  test('`\\\\` 字面反斜杠', () => {
    expect(matchWildcardPattern('echo \\\\', 'echo \\')).toBe(true)
    expect(matchWildcardPattern('echo \\\\', 'echo x')).toBe(false)
  })

  test('普通通配多段（`a*b*`）', () => {
    expect(matchWildcardPattern('a*b*', 'a1b2')).toBe(true)
    expect(matchWildcardPattern('a*b*', 'ab')).toBe(true)
    expect(matchWildcardPattern('a*b*', 'a1')).toBe(false)
  })

  test('内嵌换行（dotAll：通配跨行，heredoc 命令）', () => {
    expect(matchWildcardPattern('echo *', 'echo a\nb')).toBe(true)
  })

  test('caseInsensitive 开关', () => {
    expect(matchWildcardPattern('NPM *', 'npm install')).toBe(false)
    expect(matchWildcardPattern('NPM *', 'npm install', true)).toBe(true)
  })

  test('pattern 首尾空白 trim', () => {
    expect(matchWildcardPattern('  npm *  ', 'npm install')).toBe(true)
  })
})

// ── suggestion 两函数（PermissionUpdate 形状）──────────────────────

describe('suggestionForExactCommand / suggestionForPrefix', () => {
  test('exact 建议（addRules allow localSettings）', () => {
    expect(suggestionForExactCommand('Bash', 'npm install')).toEqual([
      {
        type: 'addRules',
        rules: [{ toolName: 'Bash', ruleContent: 'npm install' }],
        behavior: 'allow',
        destination: 'localSettings',
      },
    ])
  })

  test('prefix 建议（ruleContent 归一 `:*` 语法）', () => {
    expect(suggestionForPrefix('Bash', 'npm')).toEqual([
      {
        type: 'addRules',
        rules: [{ toolName: 'Bash', ruleContent: 'npm:*' }],
        behavior: 'allow',
        destination: 'localSettings',
      },
    ])
  })
})
