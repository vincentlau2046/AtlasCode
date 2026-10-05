/**
 * BR-2 theme 品牌色 橙→暖金（0.1.31，spec §4.3）判别单测。
 *
 * 被测：src/tui/utils/theme 6 主题 3 键（brand/brandShimmer/briefLabelAssistant）
 * 换暖金值。theme.ts 的 6 个主题对象是模块私有 const，公开面仅
 * getTheme(ThemeName) —— 本单测经 getTheme 公开面断言（与 TUI 消费路径一致）。
 *
 * 判别点：
 *  - 6 主题 brand 家族 3 键均非旧 Anthropic 橙 rgb(215,119,87) / 旧色盲橙
 *    rgb(255,153,51) / ansi:redBright（brand 家族内零残留——clawd 键除外，归 BR-3）
 *  - dark 系 brand = 暖金 rgb(255,184,0)；ansi 系 brand = ansi:yellowBright
 *  - light 系 brand = amber-700 rgb(180,83,9)（浅底 AA 5.02:1，对比度记录
 *    docs/assets/brand-system-spec.md §3）
 *  - clawd_body/clawd_background **未动**（BR-3 域，D-2 随 BR-3 处理）——
 *    本单测钉住「BR-2 不越界」边界
 *
 * 分层纪律：纯常量读取（无网络/无 PTY）。
 */
import { describe, test, expect } from 'bun:test'
import { getTheme, type ThemeName } from '../../src/tui/utils/theme'

const OLD_ANTHROPIC_ORANGE = 'rgb(215,119,87)'
const OLD_DALTON_ORANGE = 'rgb(255,153,51)'

const THEMES: [ThemeName, string][] = [
  ['dark', 'darkTheme'],
  ['light', 'lightTheme'],
  ['dark-ansi', 'darkAnsiTheme'],
  ['light-ansi', 'lightAnsiTheme'],
  ['dark-daltonized', 'darkDaltonizedTheme'],
  ['light-daltonized', 'lightDaltonizedTheme'],
]

const BRAND_FAMILY_KEYS = ['brand', 'brandShimmer', 'briefLabelAssistant'] as const

describe('BR-2 主题品牌色 橙→暖金（0.1.31）', () => {
  test('brand 家族 3 键 × 6 主题零 Anthropic 橙残留（clawd 键除外）', () => {
    for (const [name, label] of THEMES) {
      const t = getTheme(name)
      for (const key of BRAND_FAMILY_KEYS) {
        const v = t[key]
        expect(v, `${label}.${key} 不得为旧 Anthropic 橙`).not.toBe(
          OLD_ANTHROPIC_ORANGE,
        )
        expect(v, `${label}.${key} 不得为旧色盲橙`).not.toBe(OLD_DALTON_ORANGE)
        expect(v, `${label}.${key} 不得为 ansi:redBright`).not.toBe(
          'ansi:redBright',
        )
      }
    }
  })

  test('dark 系 brand = 暖金 rgb(255,184,0) / ansi 系 = yellowBright', () => {
    expect(getTheme('dark').brand).toBe('rgb(255,184,0)')
    expect(getTheme('dark-ansi').brand).toBe('ansi:yellowBright')
    expect(getTheme('dark-daltonized').brand).toBe('rgb(255,184,0)')
    expect(getTheme('dark-ansi').brandShimmer).toBe('ansi:yellow')
  })

  test('light 系 brand = amber-700 rgb(180,83,9)（浅底 AA 5.02:1，spec §4.4）', () => {
    expect(getTheme('light').brand).toBe('rgb(180,83,9)')
    expect(getTheme('light-daltonized').brand).toBe('rgb(180,83,9)')
    expect(getTheme('light').briefLabelAssistant).toBe('rgb(180,83,9)')
  })

  test('clawd 键未动（BR-3 域边界：BR-2 不越界）', () => {
    expect(getTheme('dark').clawd_body).toBe(OLD_ANTHROPIC_ORANGE)
    expect(getTheme('dark').clawd_background).toBe('rgb(0,0,0)')
    expect(getTheme('light-ansi').clawd_body).toBe('ansi:redBright')
    expect(getTheme('light-daltonized').clawd_body).toBe(OLD_ANTHROPIC_ORANGE)
  })
})
