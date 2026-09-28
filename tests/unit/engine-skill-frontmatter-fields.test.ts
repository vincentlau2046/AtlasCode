/**
 * engine/skill 域 D 波 S-E2a unit 层（零盘零模型）：frontmatter 辅助
 * 解析族（src/engine/skill/frontmatterFields.ts 逐字语义）。
 */
import { describe, expect, test } from 'bun:test'

import {
  coerceDescriptionToString,
  parseBooleanFrontmatter,
  parseShellFrontmatter,
  splitPathInFrontmatter,
} from '../../src/engine/skill'

describe('parseBooleanFrontmatter', () => {
  test('字符串形态：true/1 归一（大小写/空白不敏感）', () => {
    expect(parseBooleanFrontmatter('true')).toBe(true)
    expect(parseBooleanFrontmatter('TRUE')).toBe(true)
    expect(parseBooleanFrontmatter(' 1 ')).toBe(true)
    expect(parseBooleanFrontmatter('false')).toBe(false)
    expect(parseBooleanFrontmatter('0')).toBe(false)
  })

  test('布尔透传 / 缺失与非法 → false', () => {
    expect(parseBooleanFrontmatter(true)).toBe(true)
    expect(parseBooleanFrontmatter(false)).toBe(false)
    expect(parseBooleanFrontmatter(undefined)).toBe(false)
    expect(parseBooleanFrontmatter(null)).toBe(false)
    expect(parseBooleanFrontmatter(1)).toBe(false)
  })
})

describe('coerceDescriptionToString', () => {
  test('字符串透传（trim；空串 → null）', () => {
    expect(coerceDescriptionToString('  desc ', 's')).toBe('desc')
    expect(coerceDescriptionToString('   ', 's')).toBeNull()
  })

  test('对象取 .description 字符串面', () => {
    expect(coerceDescriptionToString({ description: ' nested ' }, 's')).toBe(
      'nested',
    )
    expect(coerceDescriptionToString({ description: 42 }, 's')).toBeNull()
  })

  test('缺失 / 其他类型 → null', () => {
    expect(coerceDescriptionToString(undefined, 's')).toBeNull()
    expect(coerceDescriptionToString(42, 's')).toBeNull()
  })
})

describe('parseShellFrontmatter', () => {
  test("'bash'/'powershell' 合法；其他丢弃", () => {
    expect(parseShellFrontmatter('bash', 's')).toBe('bash')
    expect(parseShellFrontmatter('powershell', 's')).toBe('powershell')
    expect(parseShellFrontmatter('zsh', 's')).toBeUndefined()
    expect(parseShellFrontmatter(undefined, 's')).toBeUndefined()
  })
})

describe('splitPathInFrontmatter', () => {
  test('字符串按逗号/换行拆 + trim + 空滤', () => {
    expect(splitPathInFrontmatter('a.ts, b.ts\n c.ts,')).toEqual([
      'a.ts',
      'b.ts',
      'c.ts',
    ])
  })

  test('数组形态（非字符串项过滤 + trim）', () => {
    expect(splitPathInFrontmatter(['a.ts', 42, ' b.ts ', ''])).toEqual([
      'a.ts',
      'b.ts',
    ])
  })

  test('缺失 / 其他类型 → 空数组', () => {
    expect(splitPathInFrontmatter(undefined)).toEqual([])
    expect(splitPathInFrontmatter(42)).toEqual([])
  })
})
