/**
 * O-9（0.1.34，e2e O-9）：光锥顶点脉冲 4 拍收敛判别单测（纯面，无定时器）。
 *
 * 缺陷定因（e2e 用户视角报告 §5.5 V-2）：全屏（ATLAS_NO_FLICKER）下光锥顶点
 * 永久 0.8s 脉冲，与防闪烁诉求相悖。修：脉冲限定 4 拍（4 × 0.8s ≈ 3.2s）后
 * 收敛为静态全亮 apex。收敛规则 = AnimatedBeam 纯面 `nextPulseStep`（effect
 * 由它驱动），本单测钉 4 拍序 + 收敛幂等 + 暗态末拍补亮护栏；真机时序/观感
 * 归生产 lane（防闪烁=软面观项，不占 harness）。
 */
import { describe, expect, it } from 'bun:test'
import {
  nextPulseStep,
  PULSE_MAX_BEATS,
} from '../../src/tui/components/LogoV2/AnimatedBeam.js'

type Pulse = { beats: number; pulseOn: boolean }

function step(p: Pulse): Pulse {
  const s = nextPulseStep(p.beats, p.pulseOn)
  return { beats: s.beats, pulseOn: s.pulseOn }
}

describe('O-9 光锥顶点脉冲 4 拍收敛（0.1.34 纯面契约）', () => {
  it('PULSE_MAX_BEATS = 4（4 × PULSE_MS 0.8s ≈ 3.2s）', () => {
    expect(PULSE_MAX_BEATS).toBe(4)
  })

  it('4 拍序 = 亮→暗→亮→暗→亮（初态全亮，每拍 0.8s 翻一次）', () => {
    let p: Pulse = { beats: 0, pulseOn: true }
    const seq: boolean[] = []
    for (let i = 0; i < PULSE_MAX_BEATS; i++) {
      const s = nextPulseStep(p.beats, p.pulseOn)
      expect(s.done, `${i + 1} 拍未用尽不得收敛`).toBe(false)
      p = { beats: s.beats, pulseOn: s.pulseOn }
      seq.push(p.pulseOn)
    }
    expect(seq).toEqual([false, true, false, true])
  })

  it('4 拍用尽：done + 收敛全亮（幂等，不再翻拍）', () => {
    let p: Pulse = { beats: 0, pulseOn: true }
    for (let i = 0; i < PULSE_MAX_BEATS; i++) {
      p = step(p)
    }
    expect(nextPulseStep(p.beats, p.pulseOn)).toEqual({
      beats: 4,
      pulseOn: true,
      done: true,
    })
    // 幂等：收敛态再步进仍收敛（effect 重跑不重挂定时器）
    expect(nextPulseStep(4, true)).toEqual({ beats: 4, pulseOn: true, done: true })
  })

  it('护栏：末拍停在暗态（奇数拍限）→ 收敛补亮，不锁死暗 apex', () => {
    // 假设 PULSE_MAX_BEATS 为奇数或自定义截断在暗态：nextPulseStep 收敛必全亮
    expect(nextPulseStep(4, false)).toEqual({ beats: 4, pulseOn: true, done: true })
  })
})
