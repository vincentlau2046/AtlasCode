/**
 * 0.1.120 件 1：headless result usage 纯聚合 + 件 2 wire 装配判据格。
 * 工单 docs/2026-11-16-headless-usage-result-ticket.md §3 格 1/格 3 +
 * 呈批书 L6（聚合落点 (a) 终裁）+ §7-2/4（聚合 helper 单源 + error 站点
 * 双缺席钉 iv）。全离线零网络。
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { aggregateResultUsage } from '../../src/cli/print'

const REPO = join(import.meta.dir, '..', '..')

/** modelprovider yield 形 assistant 消息（message.usage 四字段 snake_case）。 */
function assistantMsg(
  model: string,
  usage: Record<string, number> | undefined,
): Record<string, unknown> {
  return {
    type: 'assistant',
    uuid: `u-${Math.random()}`,
    message: {
      id: 'm1',
      model,
      role: 'assistant',
      stop_reason: 'end_turn',
      type: 'message',
      ...(usage !== undefined ? { usage } : {}),
      content: [{ type: 'text', text: 'hi' }],
    },
  }
}

describe('0.1.120 件 1 · aggregateResultUsage 聚合（单一 helper，禁三处各算）', () => {
  test('四 token 字段跨消息求和（嵌套 message.usage 主取形）', () => {
    const r = aggregateResultUsage([
      assistantMsg('claude-sonnet-4-5', {
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 40,
      }),
      assistantMsg('claude-sonnet-4-5', {
        input_tokens: 1,
        output_tokens: 2,
        cache_read_input_tokens: 3,
        cache_creation_input_tokens: 4,
      }),
    ])
    expect(r.usage).toEqual({
      input_tokens: 11,
      output_tokens: 22,
      cache_read_input_tokens: 33,
      cache_creation_input_tokens: 44,
    })
  })

  test('顶层 usage fallback（loop.ts:1034 同形先例）', () => {
    const r = aggregateResultUsage([
      {
        type: 'assistant',
        message: { role: 'assistant', content: [] },
        usage: {
          input_tokens: 7,
          output_tokens: 8,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    ])
    expect(r.usage.input_tokens).toBe(7)
    expect(r.usage.output_tokens).toBe(8)
  })

  test('单谓词跳过：synthetic/无 usage 消息自然跳过（零类型枚举外推）', () => {
    const r = aggregateResultUsage([
      { type: 'user', message: { role: 'user', content: 'x' } },
      { type: 'system', subtype: 'compact_boundary' },
      assistantMsg('claude-sonnet-4-5', undefined),
      { type: 'progress', data: {} },
    ])
    expect(r.usage).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    })
  })

  test('usage 恒在矩阵（件 1）：零 usage 消息 → usage 在场全 0（非缺席）', () => {
    const r = aggregateResultUsage([])
    expect(r.usage).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    })
    expect(r.totalCostUsd).toBeUndefined()
  })

  test('known 模型精算：单模型 cost = Σ(in×pi + out×po)/1e6', () => {
    const r = aggregateResultUsage([
      assistantMsg('claude-sonnet-4-5', {
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      }),
    ])
    // 内置表 sonnet 价（3/15）
    expect(r.totalCostUsd).toBeCloseTo(3 + 15, 10)
  })

  test('跨模型求和：两模型两价表累计', () => {
    const overrides = {
      'cheap-model': { inputPerMTok: 1, outputPerMTok: 1 },
    }
    const r = aggregateResultUsage(
      [
        assistantMsg('claude-sonnet-4-5', {
          input_tokens: 1_000_000,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        }),
        assistantMsg('cheap-model', {
          input_tokens: 2_000_000,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        }),
      ],
      overrides,
    )
    expect(r.totalCostUsd).toBeCloseTo(3 + 2, 10)
  })

  test('unknown 模型 → total_cost_usd 缺席（禁伪造 0，fail-closed）', () => {
    const r = aggregateResultUsage([
      assistantMsg('unknown-gateway-x', {
        input_tokens: 100,
        output_tokens: 100,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      }),
    ])
    expect(r.totalCostUsd).toBeUndefined()
  })

  test('override 穿透聚合面（settings cost.pricingOverrides 接缝）', () => {
    const r = aggregateResultUsage(
      [
        assistantMsg('claude-sonnet-4-5', {
          input_tokens: 1_000_000,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        }),
      ],
      { 'claude-sonnet-4-5': { inputPerMTok: 0, outputPerMTok: 0 } },
    )
    // 显式 0 = 合法 0：字段在、值 0
    expect(r.totalCostUsd).toBe(0)
  })

  test('半字段 override → cost 缺席（半价禁算穿透聚合面）', () => {
    const r = aggregateResultUsage(
      [
        assistantMsg('half-model', {
          input_tokens: 100,
          output_tokens: 100,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        }),
      ],
      { 'half-model': { inputPerMTok: 3 } as Record<string, number> },
    )
    expect(r.totalCostUsd).toBeUndefined()
  })

  test('格 1 对账（reqlog 形，0.1.112 容差先例）：messages 求和 = 逐回合 roundUsage 精确累加 Δ=0', () => {
    // fixture：三回合，每回合 1 条 assistant（usage 终值）+ 若干 tool_result
    const rounds = [
      { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 },
      { input_tokens: 200, output_tokens: 60, cache_read_input_tokens: 20, cache_creation_input_tokens: 6 },
      { input_tokens: 300, output_tokens: 70, cache_read_input_tokens: 30, cache_creation_input_tokens: 7 },
    ]
    const messages: Record<string, unknown>[] = []
    const roundUsage: Record<string, number>[] = []
    for (const u of rounds) {
      messages.push({ type: 'user', message: { role: 'user', content: 'go' } })
      const m = assistantMsg('claude-sonnet-4-5', u)
      messages.push(m)
      messages.push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result' }] } })
      roundUsage.push({
        input_tokens: u.input_tokens,
        output_tokens: u.output_tokens,
        cache_read_input_tokens: u.cache_read_input_tokens,
        cache_creation_input_tokens: u.cache_creation_input_tokens,
      })
    }
    const agg = aggregateResultUsage(messages).usage
    const perRound = roundUsage.reduce(
      (a, r) => ({
        input_tokens: a.input_tokens + r.input_tokens,
        output_tokens: a.output_tokens + r.output_tokens,
        cache_read_input_tokens: a.cache_read_input_tokens + r.cache_read_input_tokens,
        cache_creation_input_tokens: a.cache_creation_input_tokens + r.cache_creation_input_tokens,
      }),
      { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    )
    expect(agg).toEqual(perRound) // Δ=0 应然（精确累加）
  })

  test('钉 iv：error_during_execution 站点 usage/total_cost_usd 双缺席（源级断言）', () => {
    const src = readFileSync(join(REPO, 'src/cli/print.ts'), 'utf8')
    // error 站点 = subtype 'error_during_execution' 手拼字面量块
    const idx = src.indexOf("subtype: 'error_during_execution'")
    expect(idx).toBeGreaterThan(0)
    const block = src.slice(idx, idx + 700)
    expect(block).not.toMatch(/\busage\b/)
    expect(block).not.toContain('total_cost_usd')
    // 而常路径站点（buildResultMessage）带聚合装配
    const buildIdx = src.indexOf('aggregateResultUsage')
    expect(buildIdx).toBeGreaterThan(0)
  })
})
