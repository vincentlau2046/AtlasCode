/**
 * 0.1.120 件 2：USD 计费面首建（D1 解除）——src/cost/pricing.ts 判据格。
 * 工单 docs/2026-11-16-headless-usage-result-ticket.md §3 格 2 + 呈批书 L7
 * （f4 §10 @7ecf0fa4 批复）+ §7 判据钉 iii/iv。全离线零网络。
 */
import { describe, test, expect } from 'bun:test'
import {
  resolvePricing,
  computeCostUsd,
  BUILTIN_PRICING,
  type PricingEntry,
} from '../../src/cost/pricing'

describe('0.1.120 件 2 · pricing 判据格（格 2 三分形）', () => {
  test('known 模型（内置表裸名键）精算：resolvePricing 返回双价表', () => {
    const p = resolvePricing('claude-sonnet-4-5')
    expect(p).toBeDefined()
    expect(p!.inputPerMTok).toBeGreaterThan(0)
    expect(p!.outputPerMTok).toBeGreaterThan(0)
    expect(Object.keys(BUILTIN_PRICING).length).toBeGreaterThan(0)
  })

  test('K1-B① 归一单源复用：prefix/model 前缀名命中裸名键（钉 ii 禁第二归一实现）', () => {
    const p = resolvePricing('volc/claude-sonnet-4-5')
    expect(p).toBeDefined()
    expect(p!.inputPerMTok).toBe(BUILTIN_PRICING['claude-sonnet-4-5']!.inputPerMTok)
  })

  test('override 胜内置表（优先序 内置表 < override，钉 iii）', () => {
    const overrides = {
      'claude-sonnet-4-5': { inputPerMTok: 9, outputPerMTok: 19 },
    }
    const p = resolvePricing('claude-sonnet-4-5', overrides)
    expect(p).toEqual({ inputPerMTok: 9, outputPerMTok: 19 })
  })

  test('override-only 模型（内置表缺席）可计价', () => {
    const overrides = {
      'my-gateway-model': { inputPerMTok: 1, outputPerMTok: 2 },
    }
    expect(resolvePricing('my-gateway-model', overrides)).toEqual({
      inputPerMTok: 1,
      outputPerMTok: 2,
    })
  })

  test('unknown 模型 → undefined（禁伪造 0，fail-closed）', () => {
    expect(resolvePricing('totally-unknown-model')).toBeUndefined()
  })

  test('半字段 override（缺 outputPerMTok）→ undefined 半价禁算（钉 iii）', () => {
    const overrides = {
      'half-field-model': { inputPerMTok: 3 } as PricingEntry,
    }
    expect(resolvePricing('half-field-model', overrides)).toBeUndefined()
  })

  test('显式 0 = 合法 0（与缺席异质，钉 iv）：0 价 resolve 命中且 cost 恰 0', () => {
    const overrides = {
      'free-model': { inputPerMTok: 0, outputPerMTok: 0 },
    }
    const p = resolvePricing('free-model', overrides)
    expect(p).toEqual({ inputPerMTok: 0, outputPerMTok: 0 })
    expect(
      computeCostUsd(
        {
          input_tokens: 1000,
          output_tokens: 500,
          cache_read_input_tokens: 99,
          cache_creation_input_tokens: 99,
        },
        p!,
      ),
    ).toBe(0)
  })

  test('computeCostUsd 精算：(in×pi + out×po) / 1e6', () => {
    const cost = computeCostUsd(
      {
        input_tokens: 1_000_000,
        output_tokens: 2_000_000,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      { inputPerMTok: 3, outputPerMTok: 15 },
    )
    expect(cost).toBeCloseTo(3 + 30, 10)
  })

  test('cache token 零计入（两价表低估面，L7 终裁）：cache 字段不影响成本', () => {
    const base = computeCostUsd(
      {
        input_tokens: 1000,
        output_tokens: 1000,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      { inputPerMTok: 3, outputPerMTok: 15 },
    )
    const withCache = computeCostUsd(
      {
        input_tokens: 1000,
        output_tokens: 1000,
        cache_read_input_tokens: 999_999,
        cache_creation_input_tokens: 999_999,
      },
      { inputPerMTok: 3, outputPerMTok: 15 },
    )
    expect(withCache).toBe(base)
  })
})
