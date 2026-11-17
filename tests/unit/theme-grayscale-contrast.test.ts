/**
 * 灰阶 token 对比度护栏（WCAG 2.x）。
 *
 * 背景（0.1.94 macOS 可读性修复）：truecolor 主题的灰阶 token 承载大量
 * 真实文本（dimColor → theme.inactive、color="subtle"、promptBorder 边框），
 * 旧值在对应底色上低于 WCAG 线——dark 系 subtle rgb(80,80,80) 黑底 2.7:1、
 * light 系 subtle rgb(175,175,175) 白底 2.0:1——肉眼不可读。本测试锚定
 * 修正后的下限：正文类（text/inactive/subtle）≥ 4.5:1（AA），边框类
 * （promptBorder）≥ 3:1（非文本线）。ansi 主题走 16 标准色，不在此约束。
 *
 * 分层纪律：纯常量读取（无网络/无 PTY）。
 */
import { describe, test, expect } from 'bun:test'
import { getTheme, type ThemeName } from '../../src/tui/utils/theme'

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

const TEXT_KEYS = ['inactive', 'subtle'] as const

const LIGHT_THEMES: ThemeName[] = ['light', 'light-daltonized']
const DARK_THEMES: ThemeName[] = ['dark', 'dark-daltonized']

describe('灰阶 token 对比度护栏（WCAG）', () => {
  test('dark 系 truecolor：inactive/subtle 黑底 ≥ 4.5:1，promptBorder ≥ 3:1', () => {
    for (const name of DARK_THEMES) {
      const t = getTheme(name)
      for (const key of TEXT_KEYS) {
        const ratio = wcagContrast(t[key], 'black')
        expect(ratio, `${name}.${key} = ${t[key]} 黑底 ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
      }
      const border = wcagContrast(t.promptBorder, 'black')
      expect(border, `${name}.promptBorder 黑底 ${border.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
    }
  })

  test('light 系 truecolor：inactive/subtle 白底 ≥ 4.5:1，promptBorder ≥ 3:1', () => {
    for (const name of LIGHT_THEMES) {
      const t = getTheme(name)
      for (const key of TEXT_KEYS) {
        const ratio = wcagContrast(t[key], 'white')
        expect(ratio, `${name}.${key} = ${t[key]} 白底 ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
      }
      const border = wcagContrast(t.promptBorder, 'white')
      expect(border, `${name}.promptBorder 白底 ${border.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
    }
  })

  test('灰阶层级健全：text / inactive / subtle 三层互不重叠（信息层级不塌）', () => {
    for (const name of [...DARK_THEMES, ...LIGHT_THEMES] as ThemeName[]) {
      const t = getTheme(name)
      expect(t.inactive, `${name}.inactive ≠ text`).not.toBe(t.text)
      expect(t.subtle, `${name}.subtle ≠ inactive`).not.toBe(t.inactive)
      expect(t.subtle, `${name}.subtle ≠ text`).not.toBe(t.text)
    }
  })
})
