/**
 * engine/config autoCompact env 覆写读侧 + context 消费面 契约测试
 * （§8.29 E-3 S-3d：旧仓 autoCompact 三 env 覆写收拢 config 面，残留守③ 核销）。
 *
 * 被测能力：
 *   - getAutoCompactEnvOverrides 五变量解析 + 有效域（旧仓 autoCompact.ts
 *     解析 guard 逐字：pct (0,100] / window >0 / DISABLE_COMPACT isEnvTruthy
 *     + W2-2-pre 扩面① DISABLE_AUTO_COMPACT isEnvTruthy /
 *     ATLAS_BLOCKING_LIMIT_OVERRIDE parseInt >0）
 *   - getAutoCompactThreshold 双覆写语义（window cap / pct floor + min 取小；
 *     越界值忽略不生效——raw 注入亦安全）+ 无覆写回归（既有 2 参调用不变）
 *   - shouldAutoCompact / autoCompactIfNeeded override 提前触发
 * 纯内存态（process.env 存还隔离，unit 层无磁盘/网络/PTY）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  getAutoCompactEnvOverrides,
  getAutoCompactThreshold,
  shouldAutoCompact,
  autoCompactIfNeeded,
  type AutoCompactDeps,
  type AutoCompactTrackingState,
  type CompactionResult,
} from '../../src/engine'
import type { Message } from '../../src/shared'

const TRACKED_ENV_KEYS = [
  'ATLAS_AUTOCOMPACT_PCT_OVERRIDE',
  'ATLAS_AUTO_COMPACT_WINDOW',
  'DISABLE_COMPACT',
  'DISABLE_AUTO_COMPACT',
  'ATLAS_BLOCKING_LIMIT_OVERRIDE',
]

let savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  savedEnv = {}
  for (const k of TRACKED_ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of TRACKED_ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

// ── getAutoCompactEnvOverrides 三变量解析 + 有效域 ────────────────────

describe('engine/config getAutoCompactEnvOverrides（§8.29 三变量收拢）', () => {
  test('全未设 → 空对象（无覆写）', () => {
    expect(getAutoCompactEnvOverrides()).toEqual({})
  })

  test('pct 有效域 (0,100]（越界/非数忽略）', () => {
    process.env.ATLAS_AUTOCOMPACT_PCT_OVERRIDE = '25'
    expect(getAutoCompactEnvOverrides().pctOverride).toBe(25)
    process.env.ATLAS_AUTOCOMPACT_PCT_OVERRIDE = '100'
    expect(getAutoCompactEnvOverrides().pctOverride).toBe(100)
    process.env.ATLAS_AUTOCOMPACT_PCT_OVERRIDE = '0.5'
    expect(getAutoCompactEnvOverrides().pctOverride).toBe(0.5)
    for (const v of ['0', '101', 'abc']) {
      process.env.ATLAS_AUTOCOMPACT_PCT_OVERRIDE = v
      expect(getAutoCompactEnvOverrides().pctOverride).toBeUndefined()
    }
  })

  test('window 有效域 >0（非正/非数忽略）', () => {
    process.env.ATLAS_AUTO_COMPACT_WINDOW = '50000'
    expect(getAutoCompactEnvOverrides().windowOverride).toBe(50_000)
    for (const v of ['0', '-3', 'abc']) {
      process.env.ATLAS_AUTO_COMPACT_WINDOW = v
      expect(getAutoCompactEnvOverrides().windowOverride).toBeUndefined()
    }
  })

  test('DISABLE_COMPACT isEnvTruthy 语义（1/true → 关；false/未设 → 不置位）', () => {
    process.env.DISABLE_COMPACT = '1'
    expect(getAutoCompactEnvOverrides().disabled).toBe(true)
    process.env.DISABLE_COMPACT = 'true'
    expect(getAutoCompactEnvOverrides().disabled).toBe(true)
    process.env.DISABLE_COMPACT = 'false'
    expect(getAutoCompactEnvOverrides().disabled).toBeUndefined()
    delete process.env.DISABLE_COMPACT
    expect(getAutoCompactEnvOverrides().disabled).toBeUndefined()
  })
})

// ── W2-2-pre 扩面① 两变量（§8.74.2 缺面先迁①配套）────────────────────

describe('getAutoCompactEnvOverrides W2-2-pre 扩面（DISABLE_AUTO_COMPACT / ATLAS_BLOCKING_LIMIT_OVERRIDE）', () => {
  test('DISABLE_AUTO_COMPACT isEnvTruthy 语义（细粒度开关：保手动 /compact）', () => {
    process.env.DISABLE_AUTO_COMPACT = '1'
    expect(getAutoCompactEnvOverrides().autoCompactDisabled).toBe(true)
    process.env.DISABLE_AUTO_COMPACT = 'false'
    expect(getAutoCompactEnvOverrides().autoCompactDisabled).toBeUndefined()
    delete process.env.DISABLE_AUTO_COMPACT
    expect(getAutoCompactEnvOverrides().autoCompactDisabled).toBeUndefined()
  })

  test('ATLAS_BLOCKING_LIMIT_OVERRIDE parseInt >0 语义（越界/非数忽略）', () => {
    process.env.ATLAS_BLOCKING_LIMIT_OVERRIDE = '5000'
    expect(getAutoCompactEnvOverrides().blockingLimitOverride).toBe(5_000)
    for (const v of ['0', '-100', 'abc']) {
      process.env.ATLAS_BLOCKING_LIMIT_OVERRIDE = v
      expect(getAutoCompactEnvOverrides().blockingLimitOverride).toBeUndefined()
    }
  })
})

// ── getAutoCompactThreshold 双覆写语义 ───────────────────────────────

describe('getAutoCompactThreshold 双覆写（§8.29 旧仓 guard 逐字）', () => {
  // 基线：100k 窗口 − 摘要预留 20k（min(maxOutput ?? 20k, 20k)）− 缓冲 13k
  test('无覆写回归（既有 2 参调用不变）', () => {
    expect(getAutoCompactThreshold(100_000, 20_000)).toBe(67_000)
    // 未注入 maxOutputTokens = 满额 20k 预留
    expect(getAutoCompactThreshold(100_000)).toBe(67_000)
  })

  test('window cap（旧仓 autoCompact.ts:40 语义）', () => {
    // 50k cap：50k − 20k − 13k
    expect(getAutoCompactThreshold(100_000, 20_000, undefined, 50_000)).toBe(
      17_000,
    )
  })

  test('pct（旧仓 autoCompact.ts:79 语义：floor(有效窗口 × pct/100) 与基础阈值取小）', () => {
    // 有效窗口 80k：pct 50 → floor(80k × 0.5) = 40k < 67k
    expect(getAutoCompactThreshold(100_000, 20_000, 50)).toBe(40_000)
  })

  test('pct ∩ window 组合（先 cap 后 pct）', () => {
    // 有效窗口 50k − 20k = 30k：基础 17k；pct 50 → floor(30k × 0.5) = 15k
    expect(getAutoCompactThreshold(100_000, 20_000, 50, 50_000)).toBe(15_000)
  })

  test('越界值忽略（raw 注入安全：pct 150 / window -5 均不生效）', () => {
    expect(getAutoCompactThreshold(100_000, 20_000, 150)).toBe(67_000)
    expect(getAutoCompactThreshold(100_000, 20_000, undefined, -5)).toBe(67_000)
  })
})

// ── shouldAutoCompact / autoCompactIfNeeded override 提前触发 ─────────

const fakeCompact = async (): Promise<CompactionResult> => ({
  boundaryMarker: { role: 'system', content: 'compact' } as unknown as Message,
  summaryMessages: [],
})

const depsBase = {
  contextWindow: 100_000,
  maxOutputTokens: 20_000,
  countTokens: () => 60_000,
}

describe('override 提前触发（§8.29 deps 消费面）', () => {
  test('shouldAutoCompact：无覆写不触发 / pctOverride 提前触发', async () => {
    const base: AutoCompactDeps = { ...depsBase, compact: fakeCompact }
    // 阈值 67k > 60k → 不触发
    expect(await shouldAutoCompact([], base)).toBe(false)
    const withPct: AutoCompactDeps = { ...base, pctOverride: 50 }
    // 阈值 40k ≤ 60k → 触发
    expect(await shouldAutoCompact([], withPct)).toBe(true)
  })

  test('autoCompactIfNeeded：windowOverride 提前触发 + tracking 重置', async () => {
    const deps: AutoCompactDeps = {
      ...depsBase,
      windowOverride: 50_000,
      compact: fakeCompact,
    }
    // 阈值 17k ≤ 60k → 触发
    const r = await autoCompactIfNeeded([], undefined, deps)
    expect(r.wasCompacted).toBe(true)
    // 成功重置（旧仓 loop 语义：compacted/turnCounter/consecutiveFailures 归零）
    const tracking = r.tracking as AutoCompactTrackingState
    expect(tracking.compacted).toBe(true)
    expect(tracking.turnCounter).toBe(0)
    expect(tracking.consecutiveFailures).toBe(0)
  })

  test('disabled（DISABLE_COMPACT 映射面）→ 不触发', async () => {
    const deps: AutoCompactDeps = { ...depsBase, enabled: false, compact: fakeCompact }
    expect(await shouldAutoCompact([], deps)).toBe(false)
  })
})
