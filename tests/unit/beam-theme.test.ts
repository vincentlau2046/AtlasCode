/**
 * 0.1.35 Brand 封口波 · 母题铺开（spec §2.2 视觉母题系统）判别单测。
 *
 * beamTheme 纯函数面（design-system/beamTheme.ts）：母题字符单一事实源
 * （光锥角标 / 光核微符号 / 分隔线重横线 / 空态底纹 / spinner 光束帧 / 进度条填充阶）。
 * 判据（gate ② 源级在场）：
 *   - 母题字符走 Block Elements / Box Drawing（U+2500-259F / U+2571），无几何歧义字形（▲◆）
 *   - 仓模型宽度恒 1（Ink 布局确定；全角 CJK 2-cell 风险随 §3.5 降级 + MARK_BLOCKLIST 兜底，
 *     本层只锁仓模型 1 cell，不锁"零错位"）
 *   - 档位回落（T1/T2 → 旧字符，母题降一档不整版回退）
 * 分层纪律：纯函数断言（无网络 / 无真实终端 / 无 settings 读取）。
 */
import { describe, expect, test } from 'bun:test'
import { stringWidth } from '../../src/tui/ink/stringWidth.js'
import {
  BEAM_CORNER,
  EMPTY_TEXTURE,
  LIGHT_CORE,
  SPINNER_BEAM_FRAMES_T0,
  beamDividerLine,
  beamTextureLine,
  dividerLine,
  getProgressBarBlocks,
  getReducedMotionSpinnerGlyph,
  getSpinnerBeamFrames,
} from '../../src/tui/components/design-system/beamTheme.js'

/** codepoint 是否落在 Block Elements（U+2580-259F）/ Box Drawing（U+2500-257F）/ 光核（U+2580 族）内。 */
function isThemeGlyph(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0
  return (
    (cp >= 0x2500 && cp <= 0x259f) || // Block Elements + Box Drawing
    cp === 0x2571 // ╱（Box Drawing 扩展斜线，U+2571）
  )
}

describe('母题常量单一事实源（光锥角标 / 光核 / 空态底纹）', () => {
  test('BEAM_CORNER = ╱（U+2571 边框角标）', () => {
    expect(BEAM_CORNER).toBe('╱')
    expect(BEAM_CORNER.codePointAt(0)).toBe(0x2571)
  })

  test('LIGHT_CORE = ▀（光心色块，与 0.1.33 tips 前缀 D-3 同字）', () => {
    expect(LIGHT_CORE).toBe('▀')
    expect(LIGHT_CORE.codePointAt(0)).toBe(0x2580)
  })

  test('EMPTY_TEXTURE = 4 单元 ░ 留白排布（guest-passes 既有先例同形）', () => {
    expect(EMPTY_TEXTURE).toBe('░ ░ ░ ░')
    // 仓模型宽度 = 7（4 个 ░ + 3 个空格，全 1-cell）
    expect(stringWidth(EMPTY_TEXTURE)).toBe(7)
  })
})

describe('beamDividerLine：分隔线触面（━ 重横线 + 宽度恒定）', () => {
  test('宽度恒定：任意 width 输出恰 width 列（CJK 1-cell 安全）', () => {
    for (const w of [1, 2, 3, 5, 40, 120, 200]) {
      const line = beamDividerLine(w)
      expect(line.length).toBe(w)
      expect(stringWidth(line)).toBe(w)
    }
  })

  test('━ 重横线（单字符满宽，宽度恒定，CJK 1-cell 安全）', () => {
    expect(beamDividerLine(5)).toBe('━'.repeat(5)) // 恰 5 个 ━
    expect(beamDividerLine(6)).toBe('━'.repeat(6)) // 偶数宽满 6
    expect(beamDividerLine(7)).toBe('━'.repeat(7)) // 奇数宽满 7
  })

  test('width<=0 → 空串（无渲染）', () => {
    expect(beamDividerLine(0)).toBe('')
    expect(beamDividerLine(-1)).toBe('')
  })

  test('pattern 可覆写（自定义光束单元）', () => {
    expect(beamDividerLine(4, '▓▒')).toBe('▓▒▓▒')
  })
})

describe('beamTextureLine：空态底纹（░ 重复 + 宽度恒定）', () => {
  test('░ 满宽重复，仓模型 1 cell/字', () => {
    const line = beamTextureLine(12)
    expect(line).toBe('░'.repeat(12))
    expect(stringWidth(line)).toBe(12)
  })

  test('width<=0 → 空串', () => {
    expect(beamTextureLine(0)).toBe('')
  })
})

describe('dividerLine：分隔线触面（默认 ━ 重横线 / 显式 char legacy 重复）', () => {
  test('char 缺省 → ━ 重横线（= beamDividerLine，单字符满宽，宽度恒定）', () => {
    for (const w of [1, 5, 6, 7, 40, 120]) {
      expect(dividerLine(w)).toBe(beamDividerLine(w))
      expect(stringWidth(dividerLine(w))).toBe(w)
    }
  })

  test('显式 char → legacy char.repeat（宽度 = char 长 × 重复次数，母题不覆写自定义）', () => {
    expect(dividerLine(4, '─')).toBe('────')
    expect(dividerLine(3, '#')).toBe('###')
  })

  test('width<=0 → 空串（无论 char）', () => {
    expect(dividerLine(0)).toBe('')
    expect(dividerLine(0, '─')).toBe('')
  })
})

describe('spinner 光束帧（T0 光束串 + 档位回落）', () => {
  test('T0 帧集：8 帧 ping-pong（4 升 + 4 降），帧宽恒 2 cell', () => {
    expect(SPINNER_BEAM_FRAMES_T0).toHaveLength(8)
    for (const frame of SPINNER_BEAM_FRAMES_T0) {
      expect(frame).toHaveLength(2)
      expect(stringWidth(frame)).toBe(2)
    }
  })

  test('T0 帧集字符全落 Block Elements（无几何歧义字形 ▲◆）', () => {
    for (const frame of SPINNER_BEAM_FRAMES_T0) {
      for (const ch of frame) {
        expect(isThemeGlyph(ch)).toBe(true)
      }
    }
  })

  test('ping-pong 对称：升程 i 帧 = 降程 7-i 帧（光扫上爬底→顶再回落，非单向循环跳变）', () => {
    for (let i = 0; i < 4; i++) {
      expect(SPINNER_BEAM_FRAMES_T0[i]).toBe(SPINNER_BEAM_FRAMES_T0[7 - i])
    }
  })

  test('顶点帧 = ██（光满），起帧 = ▁▁（光自底起）', () => {
    expect(SPINNER_BEAM_FRAMES_T0[0]).toBe('▁▁')
    expect(SPINNER_BEAM_FRAMES_T0[4]).toBe('██')
  })

  test('档位回落：T0 → 光束帧 / T1·T2 → 旧点状帧（母题降一档，零回归）', () => {
    expect(getSpinnerBeamFrames(0)).toBe(SPINNER_BEAM_FRAMES_T0)
    const t1 = getSpinnerBeamFrames(1)
    const t2 = getSpinnerBeamFrames(2)
    expect(t1).toHaveLength(12) // 点状 6 帧 ping-pong
    expect(t1[0]).toBe('·')
    expect(t2).toEqual(t1) // T1/T2 同回落集（值相等；非同一引用）
  })
})

describe('reduced-motion 静态字形（关动效不留残帧）', () => {
  test('T0 = 静态光束 ▇▇（非循环）/ T1·T2 = 静态点 ●', () => {
    expect(getReducedMotionSpinnerGlyph(0)).toBe('▇▇')
    expect(getReducedMotionSpinnerGlyph(1)).toBe('●')
    expect(getReducedMotionSpinnerGlyph(2)).toBe('●')
  })
})

describe('进度条填充阶（███░░░░ 光束填充 + 档位实心回落）', () => {
  test('T0 = 8 分之一块平滑阶（▏→█）+ 空段 ░（母题化，改前 = 空格）', () => {
    const blocks = getProgressBarBlocks(0)
    expect(blocks).toHaveLength(9)
    expect(blocks[0]).toBe('░') // 空段 = ░ 底纹（非空格）
    expect(blocks[1]).toBe('▏')
    expect(blocks[blocks.length - 1]).toBe('█')
  })

  test('T1·T2 = 八分之一块降实心（[░, █] 两阶，半块类错位兜底）', () => {
    expect(getProgressBarBlocks(1)).toEqual(['░', '█'])
    expect(getProgressBarBlocks(2)).toEqual(['░', '█'])
  })

  test('全阶字符仓模型 1 cell（进度条宽度确定性）', () => {
    for (const tier of [0, 1, 2] as const) {
      for (const ch of getProgressBarBlocks(tier)) {
        expect(stringWidth(ch)).toBe(1)
      }
    }
  })
})
