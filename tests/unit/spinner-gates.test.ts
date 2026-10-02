/**
 * #250 concern 3（issule-analyst 专项）：spinner 早显时间门判别单测
 * （spinnerGates 纯函数面，零渲染）。
 *
 * 被测能力 = timer / token 计数两路状态行的时间门——修前 30s 单门
 * （SHOW_TOKENS_AFTER_MS=30_000 同时控 timer+tokens，前 30 秒状态行空白）；
 * 修后拆双门：timer 1s 门 / tokens 5s 门（严格 > 语义），verbose /
 * hasRunningTeammates 两路强制显不变。totalTokens > 0 值门在组件侧
 * showTokens 保留（纯时间门面外，本测不覆盖）。
 */
import { describe, expect, test } from 'bun:test'
import {
  getSpinnerDisplayGates,
  SHOW_TIMER_AFTER_MS,
  SHOW_TOKENS_AFTER_MS,
} from '../../src/tui/components/Spinner/spinnerGates'

const base = { verbose: false, hasRunningTeammates: false }

describe('spinnerGates 时间门（#250 concern 3）', () => {
  test('常量值锁定：timer 1s / tokens 5s', () => {
    expect(SHOW_TIMER_AFTER_MS).toBe(1_000)
    expect(SHOW_TOKENS_AFTER_MS).toBe(5_000)
  })

  test('静默期（elapsed 0）双门均关', () => {
    const g = getSpinnerDisplayGates({ ...base, effectiveElapsedMs: 0 })
    expect(g.wantsTimer).toBe(false)
    expect(g.wantsTokens).toBe(false)
  })

  test('1s 门：999ms 关 / 1001ms 开（严格 >，1000ms 边界关）', () => {
    expect(
      getSpinnerDisplayGates({ ...base, effectiveElapsedMs: 999 }).wantsTimer,
    ).toBe(false)
    expect(
      getSpinnerDisplayGates({ ...base, effectiveElapsedMs: 1_000 }).wantsTimer,
    ).toBe(false)
    expect(
      getSpinnerDisplayGates({ ...base, effectiveElapsedMs: 1_001 }).wantsTimer,
    ).toBe(true)
  })

  test('5s 门：4999ms 关 / 5001ms 开（5000ms 边界关）', () => {
    expect(
      getSpinnerDisplayGates({ ...base, effectiveElapsedMs: 4_999 }).wantsTokens,
    ).toBe(false)
    expect(
      getSpinnerDisplayGates({ ...base, effectiveElapsedMs: 5_000 }).wantsTokens,
    ).toBe(false)
    expect(
      getSpinnerDisplayGates({ ...base, effectiveElapsedMs: 5_001 }).wantsTokens,
    ).toBe(true)
  })

  test('双门分离区（1s < t ≤ 5s）：timer 开 tokens 关', () => {
    const g = getSpinnerDisplayGates({ ...base, effectiveElapsedMs: 3_000 })
    expect(g.wantsTimer).toBe(true)
    expect(g.wantsTokens).toBe(false)
  })

  test('verbose 强制双开（elapsed 0）', () => {
    const g = getSpinnerDisplayGates({
      verbose: true,
      hasRunningTeammates: false,
      effectiveElapsedMs: 0,
    })
    expect(g.wantsTimer).toBe(true)
    expect(g.wantsTokens).toBe(true)
  })

  test('hasRunningTeammates 强制双开（elapsed 0）', () => {
    const g = getSpinnerDisplayGates({
      verbose: false,
      hasRunningTeammates: true,
      effectiveElapsedMs: 0,
    })
    expect(g.wantsTimer).toBe(true)
    expect(g.wantsTokens).toBe(true)
  })

  test('单调性：tokens 开则 timer 必开（5s 门 ⊆ 1s 门，任意 elapsed）', () => {
    for (const t of [0, 500, 1_000, 1_001, 3_000, 5_000, 5_001, 30_000]) {
      const g = getSpinnerDisplayGates({ ...base, effectiveElapsedMs: t })
      if (g.wantsTokens) {
        expect(g.wantsTimer, `t=${t}ms tokens 开但 timer 关（单调性破）`).toBe(
          true,
        )
      }
    }
  })
})
