// Powerline 主题工具——箭头分隔符 + 色阶降级
// 17-TUI设计方案 §9.7 开源印证：借鉴 ccstatusline color-sanitize 按终端色阶降级
// 箭头字形对终端字体有依赖，不支持时降级为 gap=3 空格分隔（P0 已有方式）

import { getTheme } from '../../../utils/theme.js'

/** 终端色阶能力 */
type ColorLevel = 'truecolor' | 'color256' | 'ansi16'

/** 检测终端色阶能力（借鉴 ink/colorize.ts + native-ts/color-diff） */
export function detectColorLevel(): ColorLevel {
  const ct = process.env.COLORTERM ?? ''
  if (ct === 'truecolor' || ct === '24bit') return 'truecolor'
  const term = process.env.TERM ?? ''
  if (term.includes('256color')) return 'color256'
  return 'ansi16'
}

/** 将 rgb 字符串按终端能力降级 */
export function sanitizeColor(rgbOrName: string): string {
  const level = detectColorLevel()
  if (level === 'truecolor') return rgbOrName  // 原样输出

  // color256 / ansi16：使用 Ink 内置的命名色（chalk 会自动降级）
  // 如果是 rgb() 格式，映射到最接近的命名色
  if (rgbOrName.startsWith('rgb(')) {
    const match = rgbOrName.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (match) {
      const [, r, g, b] = match
      return nearestNamedColor(Number(r), Number(g), Number(b))
    }
  }
  // 已经是命名色直接返回
  return rgbOrName
}

/** rgb → 最接近的 Ink 命名色（简化版，6 色映射） */
function nearestNamedColor(r: number, g: number, b: number): string {
  // 简单亮度+色相判断
  if (r > 150 && g < 100 && b < 100) return 'red'
  if (r < 100 && g > 150 && b < 100) return 'green'
  if (r > 150 && g > 150 && b < 100) return 'yellow'
  if (r < 100 && g < 150 && b > 150) return 'blue'
  if (r > 150 && g < 150 && b > 150) return 'magenta'
  if (r > 150 && g > 150 && b > 150) return 'white'
  return 'gray'
}

// ── 箭头分隔符 ────────────────────────────────────────────────────

/** Powerline 箭头字形（需要 Nerd Font / Powerline 字体支持） */
const POWERLINE_ARROW_RIGHT = ''  // U+E0B0
const POWERLINE_ARROW_LEFT = ''   // U+E0B2

/** 检测终端是否支持 Powerline 字形（保守判断：COLORTERM=truecolor 通常配好字体） */
export function supportsPowerlineGlyphs(): boolean {
  // 无法可靠检测字体支持——保守策略：仅在 truecolor 终端启用箭头
  // 用户可通过 settings 显式覆盖
  return detectColorLevel() === 'truecolor'
}

/** 获取 segment 间的分隔符：箭头（Powerline）或空格（降级） */
export function getSegmentSeparator(): { content: string; isArrow: boolean } {
  if (supportsPowerlineGlyphs()) {
    return { content: POWERLINE_ARROW_RIGHT, isArrow: true }
  }
  return { content: '', isArrow: false }  // gap=3 空格由 Box gap={3} 处理
}

// ── 色阶映射（复用 theme.ts token） ────────────────────────────────

/** 从 theme.ts 获取上下文色阶三色（success/warning/error） */
export function getContextThemeColors(): { good: string; warn: string; bad: string } {
  // 使用当前主题的 success/warning/error token
  // getTheme 需要 ThemeName 参数——这里用默认 dark 主题
  // 消费方调 contextColorForPercentage 拿到 cyan/yellow/red（B2 2026-10-05 §4b：
  // <70% cyan）后，可通过此函数拿到 rgb 值做 Powerline 背景色填充
  try {
    const theme = getTheme('dark')
    return {
      good: theme.success,
      warn: theme.warning,
      bad: theme.error,
    }
  } catch {
    return { good: 'green', warn: 'yellow', bad: 'red' }
  }
}
