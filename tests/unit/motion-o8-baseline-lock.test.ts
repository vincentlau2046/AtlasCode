/**
 * 0.1.35 Brand 封口波 · 动效时序 + O-8 light 基线封口锁（spec §0.2 动效精修 / §0.4 O-8）。
 *
 * 封口语义：0.1.35 = Brand 专项封口终版。本波不新做动效（光扫/脉冲/reduced-motion 已在
 * 0.1.33/0.1.34 落地），仅在其上封口锁两件事：
 *   (1) 动效时序源级在场（gate ③「动效：光扫上爬帧序列 + reduced-motion 回落静态」）——
 *       光扫上爬 REVEAL_MS=120（×5 行 ≈ 0.6s）+ 顶点脉冲 PULSE_MS=800（0.8s，非快闪）
 *       + O-9 4 拍收敛（PULSE_MAX_BEATS=4，另见 animated-beam-pulse.test.ts）+ reduced-motion
 *       静态回落（关动效不留残帧，spec §9.1）。
 *   (2) O-8 light 光锥基线封口（0.1.34-2 `6dc9dbf` 定稿）：light/light-daltonized 光锥
 *       amber/flame = 白底安全变体（SGR 38;2;180;83;9 / 38;2;194;65;12），0.1.35 动效精修
 *       不重映射 light 4 色（只在其上精修时序/脉冲）；dark 系黑底 ≥3:1 原值不重映射。
 * 分层纪律：theme 纯面（getTheme）+ 源级在场断言（无网络 / 无真实终端 / 无定时器）。
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getTheme } from '../../src/tui/utils/theme.js'

function readSrc(rel: string): string {
  return readFileSync(join(import.meta.dir, '../../src', rel), 'utf8')
}

describe('动效时序 · 源级在场（gate ③ 光扫上爬 + 脉冲 + reduced-motion 回落）', () => {
  test('AnimatedBeam 光扫上爬 REVEAL_MS=120（×5 行 ≈ 0.6s，底→顶逐行点亮，spec §0.2）', () => {
    const src = readSrc('tui/components/LogoV2/AnimatedBeam.tsx')
    expect(src).toContain('const REVEAL_MS = 120')
    // 逐行点亮步长 = REVEAL_MS；行数 = BEAM_ART.length（3 档均 5 行，布局零漂移）
    expect(src).toContain('const ROW_COUNT = BEAM_ART.length')
    expect(src).toContain('setRevealed((r) => r + 1), REVEAL_MS')
  })

  test('AnimatedBeam 顶点 spark 脉冲 PULSE_MS=800（0.8s 周期呼吸，非快闪，spec §0.2）', () => {
    const src = readSrc('tui/components/LogoV2/AnimatedBeam.tsx')
    expect(src).toContain('const PULSE_MS = 800')
  })

  test('reduced-motion 静态回落（关动效不留残帧，spec §9.1）', () => {
    const src = readSrc('tui/components/LogoV2/AnimatedBeam.tsx')
    // reducedMotion 时 revealed 直接满（跳过逐行渐亮）
    expect(src).toContain('reducedMotion ? ROW_COUNT : 1')
    // effect 早返（不挂定时器 = 静态全亮，无脉冲/渐亮）
    expect(src).toContain('if (reducedMotion) {\n      return\n    }')
  })
})

describe('O-8 light 光锥基线封口锁（0.1.34-2 定稿，0.1.35 动效精修不重映射 light 4 色）', () => {
  test('light 主题光锥 amber/flame = O-8 白底安全变体（SGR 38;2;180;83;9 / 38;2;194;65;12）', () => {
    expect(getTheme('light').ascendAmber).toBe('rgb(180,83,9)')
    expect(getTheme('light').ascendFlame).toBe('rgb(194,65,12)')
  })

  test('light-daltonized 同基线（deuteranopia 白底安全变体，O-8 定稿同值）', () => {
    expect(getTheme('light-daltonized').ascendAmber).toBe('rgb(180,83,9)')
    expect(getTheme('light-daltonized').ascendFlame).toBe('rgb(194,65,12)')
  })

  test('dark 主题不重映射（黑底原值沿 dark：amber rgb(255,184,0) / flame rgb(255,140,66)，黑底 ≥3:1）', () => {
    expect(getTheme('dark').ascendAmber).toBe('rgb(255,184,0)')
    expect(getTheme('dark').ascendFlame).toBe('rgb(255,140,66)')
  })

  test('源级在场：theme.ts O-8 定因注释在场（amber/flame 原值白底 1.73/2.31 不可读 → 同色相加深）', () => {
    const src = readSrc('tui/utils/theme.ts')
    expect(src).toContain('amber/flame 原值白底 1.73/2.31 不可读（O-8 定因）')
  })
})
