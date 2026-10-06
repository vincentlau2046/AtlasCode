/**
 * 0.1.35 Brand 封口波 · tips 切换 80ms 光扫渐显（spec §0.2 动效精修 ③）判别单测。
 *
 * 被测：useDynamicTips 80ms 渐显面（TIP_FADE_MS / tipRevealStep 纯时序面 / useTipReveal hook）
 * + PersistentFooterIndicator 消费（光核 brand_mark↔dim 随渐显 step 翻转，非硬切）。
 * 判据（gate ④「tips 切换渐显非硬切」源级镜像 + 纯时序面）：
 *   - tip 切换先置 step 0（将显暗态 40ms）→ 40ms 后 step 1（满显），非硬切
 *   - reduced-motion 恒 step 1（静态，spec §9.1 关动效不留过渡）
 *   - 母题光核前缀 TIP_PREFIX 不回归（0.1.33 D-3 落地面）
 * 分层纪律：纯时序面（无网络 / 无真实终端 / 无 settings 读取）+ 源级在场断言。
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  TIP_FADE_MS,
  tipRevealStep,
} from '../../src/tui/components/StatusLine/useDynamicTips.js'

function readSrc(rel: string): string {
  return readFileSync(join(import.meta.dir, '../../src', rel), 'utf8')
}

describe('tips 80ms 光扫渐显 · 纯时序面（spec §0.2 非硬切）', () => {
  test('TIP_FADE_MS = 80ms', () => {
    expect(TIP_FADE_MS).toBe(80)
  })

  test('非 reducedMotion：elapsed < 40ms = 将显暗态 step 0 / ≥ 40ms = 满显 step 1', () => {
    expect(tipRevealStep(0, false)).toBe(0)
    expect(tipRevealStep(39, false)).toBe(0)
    expect(tipRevealStep(40, false)).toBe(1)
    expect(tipRevealStep(80, false)).toBe(1)
  })

  test('reducedMotion 恒满显 step 1（静态，spec §9.1 关动效不留过渡）', () => {
    expect(tipRevealStep(0, true)).toBe(1)
    expect(tipRevealStep(40, true)).toBe(1)
    expect(tipRevealStep(80, true)).toBe(1)
  })
})

describe('tips 渐显 · 源级在场（gate ④ 判据镜像）', () => {
  test('useDynamicTips 暴露 TIP_FADE_MS + tipRevealStep 纯面 + useTipReveal hook（非硬切）', () => {
    const src = readSrc('tui/components/StatusLine/useDynamicTips.ts')
    expect(src).toContain('export const TIP_FADE_MS = 80')
    expect(src).toContain('export function tipRevealStep(')
    expect(src).toContain('export function useTipReveal(')
    // 非硬切：切换先置 step 0（将显暗态），40ms 定时器翻 step 1（满显）
    expect(src).toContain('setStep(0)')
    expect(src).toContain('setTimeout(() => setStep(1), TIP_FADE_MS / 2)')
    // reduced-motion 回落（静态，无过渡）
    expect(src).toContain('getInitialSettings().prefersReducedMotion')
  })

  test('PersistentFooterIndicator 消费 useTipReveal + 光核 ignite（step 翻转 brand_mark↔dim，母题前缀不回归）', () => {
    const src = readSrc('tui/components/PromptInput/PersistentFooterIndicator.tsx')
    expect(src).toContain('useTipReveal(tip)')
    expect(src).toContain('const tipLit = tipStep === 1')
    expect(src).toContain("color={tipLit ? 'brand_mark' : undefined}")
    // 母题光核前缀（0.1.33 D-3）仍在
    expect(src).toContain('{TIP_PREFIX}')
  })
})
