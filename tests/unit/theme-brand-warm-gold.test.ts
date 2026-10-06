/**
 * BR-2 theme 品牌色 橙→暖金（0.1.31，spec §4.3）+ BR-3 mark 键族/色板（0.1.33 D-9）判别单测。
 *
 * 被测：src/tui/utils/theme 6 主题 3 键（brand/brandShimmer/briefLabelAssistant）
 * 换暖金值；BR-3 将旧 clawd 键族改名为 brand_mark 键族 + 新增 4 色光锥色板
 * （ascendBlue/ascendViolet/ascendAmber/ascendFlame）。theme.ts 的 6 个主题对象是模块
 * 私有 const，公开面仅 getTheme(ThemeName) —— 本单测经 getTheme 公开面断言（与 TUI
 * 消费路径一致）。
 *
 * 判别点：
 *  - 6 主题 brand 家族 3 键均非旧 Anthropic 橙 rgb(215,119,87) / 旧色盲橙
 *    rgb(255,153,51) / ansi:redBright（brand 家族内零残留）
 *  - dark 系 brand = 暖金 rgb(255,184,0)；ansi 系 brand = ansi:yellowBright
 *  - light 系 brand = amber-700 rgb(180,83,9)（浅底 AA 5.02:1，对比度记录
 *    docs/assets/brand-system-spec.md §3）
 *  - **BR-3 键族改名**：clawd_body→brand_mark（mark 块字色随品牌色，单一事实源）
 *    / clawd_background→brand_mark_bg（纯黑底块未动）；clawd_* 标识符全清
 *  - **BR-3 光锥 4 色板**：truecolor 主题 4 段 truecolor 值 / ansi 主题塌到两档
 *    （blueBright + yellowBright 三同色）
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

// BR-3 光锥 4 色板（spec §4.1：blue / violet / amber(=brand) + flame accent）
const ASCEND_PALETTE_KEYS = [
  'ascendBlue',
  'ascendViolet',
  'ascendAmber',
  'ascendFlame',
] as const

// truecolor 主题（light / light-daltonized / dark / dark-daltonized）色板值
const TRUECOLOR_PALETTE: Record<(typeof ASCEND_PALETTE_KEYS)[number], string> = {
  ascendBlue: 'rgb(0,102,255)',
  ascendViolet: 'rgb(155,58,138)',
  ascendAmber: 'rgb(255,184,0)',
  ascendFlame: 'rgb(255,140,66)',
}

// ansi 主题（dark-ansi / light-ansi）色板值（§4.2 降级链塌到 16 ANSI 两档）
const ANSI_PALETTE: Record<(typeof ASCEND_PALETTE_KEYS)[number], string> = {
  ascendBlue: 'ansi:blueBright',
  ascendViolet: 'ansi:yellowBright',
  ascendAmber: 'ansi:yellowBright',
  ascendFlame: 'ansi:yellowBright',
}

describe('BR-2 主题品牌色 橙→暖金（0.1.31）', () => {
  test('brand 家族 3 键 × 6 主题零 Anthropic 橙残留', () => {
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
})

describe('BR-3 mark 键族改名 + 光锥色板（0.1.33 D-9）', () => {
  test('brand_mark 对齐各主题对比度（light 系 amber-deep / dark 系暖金 / ansi 黄亮）', () => {
    // truecolor light 系 = amber-deep rgb(217,119,6)（浅底 AA，比 brand rgb(180,83,9)
    // 更亮以承载 mark 图形）；truecolor dark 系 = 暖金 rgb(255,184,0)；ansi = 黄亮。
    expect(getTheme('dark').brand_mark).toBe('rgb(255,184,0)')
    expect(getTheme('dark-daltonized').brand_mark).toBe('rgb(255,184,0)')
    expect(getTheme('dark-ansi').brand_mark).toBe('ansi:yellowBright')
    expect(getTheme('light').brand_mark).toBe('rgb(217,119,6)')
    expect(getTheme('light-daltonized').brand_mark).toBe('rgb(217,119,6)')
    expect(getTheme('light-ansi').brand_mark).toBe('ansi:yellowBright')
    // 零旧 Anthropic 橙残留（brand_mark 亦不再是旧橙）
    for (const [name] of THEMES) {
      expect(getTheme(name).brand_mark, `${name}.brand_mark 不得为旧橙`).not.toBe(
        OLD_ANTHROPIC_ORANGE,
      )
    }
  })

  test('brand_mark_bg 纯黑底块（rgb 系 rgb(0,0,0) / ansi 系 ansi:black）未动', () => {
    expect(getTheme('dark').brand_mark_bg).toBe('rgb(0,0,0)')
    expect(getTheme('dark-daltonized').brand_mark_bg).toBe('rgb(0,0,0)')
    expect(getTheme('dark-ansi').brand_mark_bg).toBe('ansi:black')
    expect(getTheme('light').brand_mark_bg).toBe('rgb(0,0,0)')
    expect(getTheme('light-daltonized').brand_mark_bg).toBe('rgb(0,0,0)')
    expect(getTheme('light-ansi').brand_mark_bg).toBe('ansi:black')
  })

  test('光锥 4 色板：truecolor 4 段 / ansi 塌两档（spec §4.1/§4.2 降级链）', () => {
    const truecolor = ['light', 'light-daltonized', 'dark', 'dark-daltonized']
    for (const name of truecolor) {
      const t = getTheme(name as ThemeName)
      for (const key of ASCEND_PALETTE_KEYS) {
        expect(t[key], `${name}.${key} = truecolor 值`).toBe(TRUECOLOR_PALETTE[key])
      }
    }
    const ansi = ['dark-ansi', 'light-ansi']
    for (const name of ansi) {
      const t = getTheme(name as ThemeName)
      for (const key of ASCEND_PALETTE_KEYS) {
        expect(t[key], `${name}.${key} = ansi 降级值`).toBe(ANSI_PALETTE[key])
      }
    }
  })
})
