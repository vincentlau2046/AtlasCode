/**
 * TUI 域 skill frontmatter whenToUse 双形式判别单测（S1 P1 回归：
 * 0.1.12 的 S1 修复只改了 engine 域 skillCommand.ts，TUI 运行时车道
 * （loadSkillsDir）仍只读下划线 → 连字符 when-to-use 在 TUI 车道静默
 * 丢失（用户「skill 没自动加载」主诉的 TUI 侧残口）。本测防再次测错域。
 *
 * 判别点（mutation-red 面）：
 *  - ① 连字符 `when-to-use` 命中（修前 = undefined，本测红）
 *  - ② 下划线回归（bundled ascend 技能现用形式不破）
 *  - ③ 双写 = 连字符优先（约定面）
 *  - ④ 两键皆无 → undefined
 *
 * 登记：插件 skill 命令车道（loadPluginCommands 内联 whenToUse 行）同款
 * 双形式修已同波落盘；该车道解析嵌于大函数无独立可测面 = 模式核验
 * （与 loadSkillsDir 同 2 行式）+ tsc，全量 loader 覆盖不在此列。
 */
import { describe, expect, test } from 'bun:test'
import { type FrontmatterData } from '../../src/tui/utils/frontmatterParser'
import { parseSkillFrontmatterFields } from '../../src/tui/skills/loadSkillsDir'

function fields(frontmatter: FrontmatterData): { whenToUse: string | undefined } {
  return parseSkillFrontmatterFields(
    frontmatter,
    '# skill body',
    'test-skill',
  )
}

describe('TUI 域 parseSkillFrontmatterFields whenToUse（S1 P1 回归）', () => {
  test('① 连字符 when-to-use 命中（判别点）', () => {
    expect(
      fields({ 'when-to-use': 'R4-HYPHEN-WHENUSE-MARKER' } as FrontmatterData)
        .whenToUse,
    ).toBe('R4-HYPHEN-WHENUSE-MARKER')
  })

  test('② 下划线 when_to_use 回归（bundled ascend 兼容）', () => {
    expect(
      fields({ when_to_use: 'underscore-form' } as FrontmatterData).whenToUse,
    ).toBe('underscore-form')
  })

  test('③ 双写 = 连字符优先', () => {
    expect(
      fields({
        'when-to-use': 'hyphen-wins',
        when_to_use: 'underscore-loses',
      } as FrontmatterData).whenToUse,
    ).toBe('hyphen-wins')
  })

  test('④ 两键皆无 → undefined', () => {
    expect(fields({} as FrontmatterData).whenToUse).toBeUndefined()
  })
})
