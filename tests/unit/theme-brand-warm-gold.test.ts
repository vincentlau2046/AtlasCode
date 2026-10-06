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

// dark 系 truecolor（dark / dark-daltonized）色板值（黑底，4 色 ≥3:1 不变）
const DARK_TRUECOLOR_PALETTE: Record<(typeof ASCEND_PALETTE_KEYS)[number], string> = {
  ascendBlue: 'rgb(0,102,255)',
  ascendViolet: 'rgb(155,58,138)',
  ascendAmber: 'rgb(255,184,0)',
  ascendFlame: 'rgb(255,140,66)',
}

// light 系 truecolor（light / light-daltonized）色板值
// O-8（0.1.34）：白底安全变体 = 同色相加深（amber→amber-700 5.03:1 / flame→orange-700
// 5.18:1；blue 4.83:1 / violet 6.24:1 已达标不变）——原 dark 同值白底 1.73/2.31 不可读。
const LIGHT_TRUECOLOR_PALETTE: Record<(typeof ASCEND_PALETTE_KEYS)[number], string> = {
  ascendBlue: 'rgb(0,102,255)',
  ascendViolet: 'rgb(155,58,138)',
  ascendAmber: 'rgb(180,83,9)',
  ascendFlame: 'rgb(194,65,12)',
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

  test('光锥 4 色板：truecolor 4 段（dark 原值 / light 白底安全变体）/ ansi 塌两档（spec §4.1/§4.2 降级链）', () => {
    const darkTruecolor = ['dark', 'dark-daltonized']
    for (const name of darkTruecolor) {
      const t = getTheme(name as ThemeName)
      for (const key of ASCEND_PALETTE_KEYS) {
        expect(t[key], `${name}.${key} = dark truecolor 原值（零回归）`).toBe(
          DARK_TRUECOLOR_PALETTE[key],
        )
      }
    }
    const lightTruecolor = ['light', 'light-daltonized']
    for (const name of lightTruecolor) {
      const t = getTheme(name as ThemeName)
      for (const key of ASCEND_PALETTE_KEYS) {
        expect(t[key], `${name}.${key} = light 白底安全变体（O-8）`).toBe(
          LIGHT_TRUECOLOR_PALETTE[key],
        )
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

describe('O-8 光锥 4 色白底/黑底对比度（0.1.34，WCAG 非文本 3:1 线）', () => {
  // WCAG 2.x 相对亮度 + 对比度（白底/黑底双向，图形 3:1 线——堵"只验在场不验可读"判据缺口，
  // 与 e2e gate C1 的 light 场景对比度断言交叉：本单测=源级数值，gate=SGR 实捕）
  function wcagContrast(rgb: string, bg: 'white' | 'black'): number {
    const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(rgb)
    if (!m) throw new Error(`non-truecolor value: ${rgb}`)
    const lin = [Number(m[1]), Number(m[2]), Number(m[3])].map(v => {
      const c = v / 255
      return c > 0.03928 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92
    })
    const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
    const Lbg = bg === 'white' ? 1 : 0
    const [hi, lo] = L > Lbg ? [L, Lbg] : [Lbg, L]
    return (hi + 0.05) / (lo + 0.05)
  }

  test('light 系 truecolor 光锥 4 色白底对比度 ≥ 3:1（O-8 保形案①白底安全变体）', () => {
    for (const name of ['light', 'light-daltonized'] as ThemeName[]) {
      const t = getTheme(name)
      for (const key of ASCEND_PALETTE_KEYS) {
        const ratio = wcagContrast(t[key], 'white')
        expect(
          ratio,
          `${name}.${key} = ${t[key]} 白底 ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(3)
      }
    }
  })

  test('dark 系 truecolor 光锥 4 色黑底对比度 ≥ 3:1（零回归护栏）', () => {
    for (const name of ['dark', 'dark-daltonized'] as ThemeName[]) {
      const t = getTheme(name)
      for (const key of ASCEND_PALETTE_KEYS) {
        const ratio = wcagContrast(t[key], 'black')
        expect(
          ratio,
          `${name}.${key} = ${t[key]} 黑底 ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(3)
      }
    }
  })
})
