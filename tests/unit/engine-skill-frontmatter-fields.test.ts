/**
 * engine/skill 域 D 波 S-E2a unit 层（零盘零模型）：frontmatter 辅助
 * 解析族（src/engine/skill/frontmatterFields.ts 逐字语义）。
 */
import { describe, expect, test } from 'bun:test'

import {
  coerceDescriptionToString,
  parseBooleanFrontmatter,
  parseSkillFrontmatterFields,
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

  // S-E3 修波锚（审视 A 路 major-2）：花括号感知逗号切分 + 花括号展开
  // （旧仓 frontmatterParser.ts:189-266 逐字语义；初版朴素切分丢此两面）
  test('花括号内逗号不切分 + expandBraces 展开（旧仓 @example 4 例）', () => {
    expect(splitPathInFrontmatter('a, b')).toEqual(['a', 'b'])
    expect(splitPathInFrontmatter('a, src/*.{ts,tsx}')).toEqual([
      'a',
      'src/*.ts',
      'src/*.tsx',
    ])
    expect(splitPathInFrontmatter('{a,b}/{c,d}')).toEqual([
      'a/c',
      'a/d',
      'b/c',
      'b/d',
    ])
    expect(splitPathInFrontmatter(['a', 'src/*.{ts,tsx}'])).toEqual([
      'a',
      'src/*.ts',
      'src/*.tsx',
    ])
  })

  test('花括号面 + 换行/数组混合', () => {
    expect(splitPathInFrontmatter('src/*.{ts,tsx}\nlib/**')).toEqual([
      'src/*.ts',
      'src/*.tsx',
      'lib/**',
    ])
  })
})

/**
 * S1（感知面反馈波）whenToUse 键名双形式接受（mutation-red：修前连字符
 * 形态整字段静默丢失 → whenToUse undefined，自动触发线索降级）：
 *   ① 连字符 `when-to-use`（与 allowed-tools / disable-model-invocation
 *      兄弟键约定一致，skill 作者按约定书写的主形态）→ 命中；
 *   ② 下划线 `when_to_use`（bundled ascend 技能现用形态）→ 回归保护；
 *   ③ 双写 → 连字符优先（约定面胜出，契约锁定）；
 *   ④ 均缺 → undefined。
 */
describe('parseSkillFrontmatterFields whenToUse 双形式接受（S1）', () => {
  const base = { description: 'd' } as const

  test('① 连字符 when-to-use（约定面）命中', () => {
    const out = parseSkillFrontmatterFields(
      { ...base, 'when-to-use': 'WHEN' },
      '',
      's',
    )
    expect(out.whenToUse).toBe('WHEN')
  })

  test('② 下划线 when_to_use（bundled 兼容面）回归', () => {
    const out = parseSkillFrontmatterFields(
      { ...base, when_to_use: 'WHEN_US' },
      '',
      's',
    )
    expect(out.whenToUse).toBe('WHEN_US')
  })

  test('③ 双写连字符优先（契约锁定）', () => {
    const out = parseSkillFrontmatterFields(
      { ...base, 'when-to-use': 'HY', when_to_use: 'US' },
      '',
      's',
    )
    expect(out.whenToUse).toBe('HY')
  })

  test('④ 均缺 → undefined', () => {
    const out = parseSkillFrontmatterFields({ ...base }, '', 's')
    expect(out.whenToUse).toBeUndefined()
  })
})
