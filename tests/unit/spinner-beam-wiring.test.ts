/**
 * 0.1.35 母题铺开 · spinner 触面接线判别单测（gate ① 源级在场 + 行为镜像）。
 *
 * 被测：SpinnerGlyph.tsx / Spinner.tsx（两渲染路径）已接 beamTheme 光束串
 * （BR-7 档位感知 resolveMarkTierFromEnv 单一事实源；reduced-motion 静态字形；
 * 点状帧 ping-pong 构造零残留）。
 *
 * 分层纪律：源级在场断言（gate 镜像，仓内既有先例 = 品牌 gate grep 源级断言）+
 * 行为镜像（beamTheme 纯函数面，T0 帧集无点状字符）；无网络 / 无真实终端。
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SPINNER_BEAM_FRAMES_T0,
  getSpinnerBeamFrames,
} from '../../src/tui/components/design-system/beamTheme.js'

function readSrc(rel: string): string {
  return readFileSync(join(import.meta.dir, '../../src', rel), 'utf8')
}

describe('spinner 光束串接线（gate ① 源级在场：spinner 光束串 + verb 行同屏的字形基座）', () => {
  test('SpinnerGlyph 接 beamTheme（BR-7 档位感知 + 点状 ping-pong 构造零残留）', () => {
    const src = readSrc('tui/components/Spinner/SpinnerGlyph.tsx')
    expect(src).toContain('const MARK_TIER = resolveMarkTierFromEnv()')
    expect(src).toContain('getSpinnerBeamFrames(MARK_TIER)')
    expect(src).toContain('getReducedMotionSpinnerGlyph(MARK_TIER)')
    // 改前点状帧 ping-pong 构造（DEFAULT_CHARACTERS 双拼）零残留
    expect(src).not.toContain('[...DEFAULT_CHARACTERS, ...[...DEFAULT_CHARACTERS].reverse()]')
    expect(src).not.toContain("REDUCED_MOTION_DOT")
  })

  test('简易 Spinner 路径同接 beamTheme（两渲染路径零漏网）', () => {
    const src = readSrc('tui/components/Spinner.tsx')
    expect(src).toContain('const MARK_TIER = resolveMarkTierFromEnv()')
    expect(src).toContain('getSpinnerBeamFrames(MARK_TIER)')
    expect(src).toContain('REDUCED_MOTION_GLYPH')
    expect(src).not.toContain('[...DEFAULT_CHARACTERS, ...[...DEFAULT_CHARACTERS].reverse()]')
  })
})

describe('行为镜像：T0 光束帧集与旧点状集互斥（换形非叠加）', () => {
  test('T0 帧集无点状字符（· ✢ ✳ ✶ ✻ ✽ 零残留），T1·T2 回落集含点状首帧', () => {
    for (const ch of '·✢✳✶✻✽') {
      expect(SPINNER_BEAM_FRAMES_T0.some(f => f.includes(ch))).toBe(false)
    }
    expect(getSpinnerBeamFrames(1)[0]).toBe('·')
    expect(getSpinnerBeamFrames(2)[0]).toBe('·')
  })
})
