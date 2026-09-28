/**
 * engine/skill 域 D 波 S-E2a unit 层（零盘零模型）：gitignoreMatch
 * 本地最小 matcher（`ignore` 库裁面，src/engine/skill/patternMatch.ts
 * 头注语义差登记 ①②③ 的负向边界断言）。
 *
 * 测面 = `**` 整段/前缀/中段/尾缀 + `*`/`?`/字符类 + 锚定/任意深度 +
 * 目录前缀规则 + 负模式最后命中者 + 语义差 ①（父目录排除后无法再
 * 包含）②（段内双星子串按 `[^/]*`）③（字符类 `!`/`^` 双否定记法）。
 */
import { describe, expect, test } from 'bun:test'

import { gitignoreMatch } from '../../src/engine/skill'

describe('gitignoreMatch — 基础匹配', () => {
  test('单段 pattern 任意深度（无内部 / 规则）', () => {
    expect(gitignoreMatch(['build'], 'build')).toBe(true)
    expect(gitignoreMatch(['build'], 'src/build')).toBe(true)
    expect(gitignoreMatch(['build'], 'src/build/out.js')).toBe(true)
    expect(gitignoreMatch(['build'], 'src/building')).toBe(false)
    expect(gitignoreMatch(['build'], 'other')).toBe(false)
  })

  test('* 段内任意（不含 /）', () => {
    expect(gitignoreMatch(['*.log'], 'a.log')).toBe(true)
    expect(gitignoreMatch(['*.log'], 'src/a.log')).toBe(true)
    expect(gitignoreMatch(['src/*.ts'], 'src/a.ts')).toBe(true)
    expect(gitignoreMatch(['src/*.ts'], 'src/sub/a.ts')).toBe(false)
  })

  test('? 段内单字符', () => {
    expect(gitignoreMatch(['file?'], 'file1')).toBe(true)
    expect(gitignoreMatch(['file?'], 'file12')).toBe(false)
  })

  test('字符类 [abc] / [!abc] / [^abc]', () => {
    expect(gitignoreMatch(['file[0-9]'], 'file1')).toBe(true)
    expect(gitignoreMatch(['file[0-9]'], 'filea')).toBe(false)
    expect(gitignoreMatch(['file[!0-9]'], 'filea')).toBe(true)
    expect(gitignoreMatch(['file[^0-9]'], 'filea')).toBe(true)
    expect(gitignoreMatch(['file[!0-9]'], 'file1')).toBe(false)
  })

  test('含内部 / 锚定仓根', () => {
    expect(gitignoreMatch(['src/a.ts'], 'src/a.ts')).toBe(true)
    expect(gitignoreMatch(['src/a.ts'], 'x/src/a.ts')).toBe(false)
  })
})

describe('gitignoreMatch — ** 语义', () => {
  test('前导 **/ = 零或多层目录（含根级）', () => {
    expect(gitignoreMatch(['**/foo'], 'foo')).toBe(true)
    expect(gitignoreMatch(['**/foo'], 'a/foo')).toBe(true)
    expect(gitignoreMatch(['**/foo'], 'a/b/foo')).toBe(true)
    expect(gitignoreMatch(['**/foo'], 'bar')).toBe(false)
  })

  test('尾随 /** = 其下一切', () => {
    expect(gitignoreMatch(['vendor/'], 'vendor/a.js')).toBe(true)
    expect(gitignoreMatch(['vendor'], 'vendor/a/b.js')).toBe(true)
    expect(gitignoreMatch(['vendor'], 'vendored.js')).toBe(false)
  })

  test('中段 a/**/b = 零或多层目录', () => {
    expect(gitignoreMatch(['a/**/b'], 'a/b')).toBe(true)
    expect(gitignoreMatch(['a/**/b'], 'a/x/b')).toBe(true)
    expect(gitignoreMatch(['a/**/b'], 'a/x/y/b')).toBe(true)
    expect(gitignoreMatch(['a/**/b'], 'a/x/c')).toBe(false)
  })

  test('全 ** = match-all（parseSkillPaths 上游已滤，直喂仍成立）', () => {
    expect(gitignoreMatch(['**'], 'any/depth/path')).toBe(true)
  })
})

describe('gitignoreMatch — 目录前缀规则', () => {
  test('非 dirOnly pattern 命中目录前缀 = 命中其下文件', () => {
    expect(gitignoreMatch(['out'], 'out/a.js')).toBe(true)
    expect(gitignoreMatch(['dist/**'], 'dist/a.js')).toBe(true)
  })

  test('尾随 / 目录 pattern 命中其下文件', () => {
    expect(gitignoreMatch(['logs/'], 'logs/2026.log')).toBe(true)
  })
})

describe('gitignoreMatch — 负模式', () => {
  test('! 负模式最后命中者生效', () => {
    expect(gitignoreMatch(['*.md', '!README.md'], 'README.md')).toBe(false)
    expect(gitignoreMatch(['*.md', '!README.md'], 'notes.md')).toBe(true)
    // 正模式重开
    expect(gitignoreMatch(['*.md', '!README.md', 'README.md'], 'README.md')).toBe(
      true,
    )
  })

  test('空 pattern 集不命中', () => {
    expect(gitignoreMatch([], 'a/b')).toBe(false)
  })
})

describe('gitignoreMatch — 语义差边界（头注登记）', () => {
  test('② 段内双星子串按 [^/]* 展开（fnmatch 等价）', () => {
    // a**b ≡ a*b：段内匹配，不跨 /
    expect(gitignoreMatch(['a**b'], 'axxb')).toBe(true)
    expect(gitignoreMatch(['a**b'], 'a/x/b')).toBe(false)
  })

  test('① 父目录被排除后无法再包含其下文件（gitignore 语义保留）', () => {
    // 旧 ignore 库：目录排除后子模式失效（本 matcher 最后命中者生效，
    // 负模式命中目录前缀同样压制其下文件 → 断言负向压制成立）
    expect(gitignoreMatch(['node_modules', '!node_modules/keep.js'], 'node_modules/keep.js')).toBe(
      false,
    )
  })

  test('win32 反斜杠路径归一 posix', () => {
    expect(gitignoreMatch(['src'], 'src\\a.ts')).toBe(true)
  })
})
