/**
 * engine/context autoCompact W2-2-pre 缺面先迁①判别单测（§8.74.2）：
 * TUI warning 态面 3 常量 + calculateTokenWarningState / isAutoCompactEnabled
 * / getEffectiveContextWindowSize 纯函数面（旧仓 autoCompact.ts 语义逐字移植，
 * env 读侧归 config 面——本文件零 env 断言，纯参数判别）。
 *
 * 判别目标（突变即红）：
 *   - 3 buffer 常量值（20k/20k/3k）与 AUTOCOMPACT_BUFFER_TOKENS(13k) 的叠加关系
 *   - 摘要输出预留 min(maxOutput ?? 20k, 20k)（大输出模型 cap 语义）
 *   - 阈值/pct/window 覆写 guard（有效域越界忽略）
 *   - autoCompactEnabled=false 时 threshold 退化为有效窗口 + 自动压缩判定恒 false
 *   - blocking limit 覆写 >0 生效 / 缺省 = 有效窗口 − 3k
 */
import { describe, test, expect } from 'bun:test'
import {
  AUTOCOMPACT_BUFFER_TOKENS,
  WARNING_THRESHOLD_BUFFER_TOKENS,
  ERROR_THRESHOLD_BUFFER_TOKENS,
  MANUAL_COMPACT_BUFFER_TOKENS,
  getEffectiveContextWindowSize,
  getAutoCompactThreshold,
  calculateTokenWarningState,
  isAutoCompactEnabled,
} from '../../src/engine'

// 基线参数：contextWindow 200k，未注入 maxOutputTokens → 摘要预留满额 20k
// → 有效窗口 180k；auto-compact 阈值 = 180k − 13k = 167k
const CW = 200_000

describe('engine autoCompact 3 buffer 常量（旧仓 :63-65 逐字）', () => {
  test('常量值固定（判别：任何改动即红）', () => {
    expect(WARNING_THRESHOLD_BUFFER_TOKENS).toBe(20_000)
    expect(ERROR_THRESHOLD_BUFFER_TOKENS).toBe(20_000)
    expect(MANUAL_COMPACT_BUFFER_TOKENS).toBe(3_000)
    expect(AUTOCOMPACT_BUFFER_TOKENS).toBe(13_000)
  })
})

describe('getEffectiveContextWindowSize（窗口 cap + 摘要输出预留）', () => {
  test('无覆写：contextWindow − 满额 20k 预留', () => {
    expect(getEffectiveContextWindowSize(CW)).toBe(180_000)
  })

  test('maxOutput 小值按实预留（8k → 192k）', () => {
    expect(getEffectiveContextWindowSize(CW, 8_000)).toBe(192_000)
  })

  test('maxOutput 大值 cap 满额 20k（32k 模型仍 180k）', () => {
    expect(getEffectiveContextWindowSize(CW, 32_000)).toBe(180_000)
  })

  test('windowOverride >0 先 cap 再扣预留（100k → 80k）', () => {
    expect(getEffectiveContextWindowSize(CW, undefined, 100_000)).toBe(80_000)
  })

  test('windowOverride 越界（0/负）忽略不生效', () => {
    expect(getEffectiveContextWindowSize(CW, undefined, 0)).toBe(180_000)
    expect(getEffectiveContextWindowSize(CW, undefined, -5)).toBe(180_000)
  })
})

describe('getAutoCompactThreshold（有效窗口 − 13k + 双覆写 guard）', () => {
  test('基线：180k − 13k = 167k', () => {
    expect(getAutoCompactThreshold(CW)).toBe(167_000)
  })

  test('pct 50 → min(floor(180k×0.5), 167k) = 90k', () => {
    expect(getAutoCompactThreshold(CW, undefined, 50)).toBe(90_000)
  })

  test('pct 100 → min(180k, 167k) = 167k（不抬高基线）', () => {
    expect(getAutoCompactThreshold(CW, undefined, 100)).toBe(167_000)
  })

  test('pct 越界（0/101/NaN 注入）忽略', () => {
    expect(getAutoCompactThreshold(CW, undefined, 0)).toBe(167_000)
    expect(getAutoCompactThreshold(CW, undefined, 101)).toBe(167_000)
    expect(getAutoCompactThreshold(CW, undefined, NaN)).toBe(167_000)
  })

  test('windowOverride 与 pct 叠加（100k 窗口 → 67k 基线）', () => {
    expect(getAutoCompactThreshold(CW, undefined, undefined, 100_000)).toBe(
      67_000,
    )
  })
})

describe('calculateTokenWarningState（warning 态 5 字段）', () => {
  // threshold = 167k；warning/error 阈值 = 167k − 20k = 147k；
  // blocking = 有效窗口 180k − 3k = 177k
  test('低用量（10k）：全 false + percentLeft 94', () => {
    const s = calculateTokenWarningState(10_000, { contextWindow: CW })
    expect(s.percentLeft).toBe(94)
    expect(s.isAboveWarningThreshold).toBe(false)
    expect(s.isAboveErrorThreshold).toBe(false)
    expect(s.isAboveAutoCompactThreshold).toBe(false)
    expect(s.isAtBlockingLimit).toBe(false)
  })

  test('越过 warning/error 阈值（150k ≥ 147k）：前二 true，autoCompact/blocking 仍 false', () => {
    const s = calculateTokenWarningState(150_000, { contextWindow: CW })
    expect(s.isAboveWarningThreshold).toBe(true)
    expect(s.isAboveErrorThreshold).toBe(true)
    expect(s.isAboveAutoCompactThreshold).toBe(false)
    expect(s.isAtBlockingLimit).toBe(false)
  })

  test('越过 auto-compact 阈值（168k ≥ 167k）：三 true，blocking 仍 false（< 177k）', () => {
    const s = calculateTokenWarningState(168_000, { contextWindow: CW })
    expect(s.isAboveAutoCompactThreshold).toBe(true)
    expect(s.isAtBlockingLimit).toBe(false)
  })

  test('到 blocking limit（178k ≥ 177k）', () => {
    const s = calculateTokenWarningState(178_000, { contextWindow: CW })
    expect(s.isAtBlockingLimit).toBe(true)
  })

  test('autoCompactEnabled=false：threshold 退化为有效窗口 180k，自动压缩判定恒 false', () => {
    const s = calculateTokenWarningState(168_000, {
      contextWindow: CW,
      autoCompactEnabled: false,
    })
    // percentLeft 按 180k 阈值：round((180k−168k)/180k×100) = 7
    expect(s.percentLeft).toBe(7)
    expect(s.isAboveAutoCompactThreshold).toBe(false)
  })

  test('blockingLimitOverride >0 生效（50k → 60k 用量即 blocking）', () => {
    const s = calculateTokenWarningState(60_000, {
      contextWindow: CW,
      blockingLimitOverride: 50_000,
    })
    expect(s.isAtBlockingLimit).toBe(true)
  })

  test('blockingLimitOverride 越界（0/负）忽略，回缺省 177k', () => {
    const s = calculateTokenWarningState(60_000, {
      contextWindow: CW,
      blockingLimitOverride: 0,
    })
    expect(s.isAtBlockingLimit).toBe(false)
  })
})

describe('isAutoCompactEnabled（三 flag 优先级）', () => {
  test('缺省 = 开（settingsEnabled 缺省 true 语义）', () => {
    expect(isAutoCompactEnabled()).toBe(true)
    expect(isAutoCompactEnabled({})).toBe(true)
  })

  test('disabled（DISABLE_COMPACT 面）优先 false', () => {
    expect(isAutoCompactEnabled({ disabled: true, settingsEnabled: true })).toBe(
      false,
    )
  })

  test('autoCompactDisabled（DISABLE_AUTO_COMPACT 细粒度面）false', () => {
    expect(isAutoCompactEnabled({ autoCompactDisabled: true })).toBe(false)
  })

  test('settingsEnabled=false → false', () => {
    expect(isAutoCompactEnabled({ settingsEnabled: false })).toBe(false)
  })
})
