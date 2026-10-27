/**
 * 0.1.81 V3-2 K2 MCP 面 — #16 判别单测：描述与 server 指令上限
 * 2048 → 4096（工单 `docs/2026-10-25-p0-wave-0181-ticket.md` item 16）。
 *
 * 工单缺口：`MAX_MCP_DESCRIPTION_LENGTH = 2048`（client.ts）把 OpenAPI
 * 生成长描述截在 2048，损失工具语义；上游已放宽到 4096。改面 = 常量
 * 2048 → 4096 + 抽取纯函数 `truncateMcpDescriptionText`（server
 * instructions 与 tool description 两消费站共用，判别单测边界面）。
 * C 类条不落：1P server 描述不截 4096 的差异化不在本件 scope。
 *
 * 判别（修前红 → 修后绿）：
 *  - truncateMcpDescriptionText 导出缺席（修前）→ `toBeTypeOf('function')` 红
 *  - 边界：4096 恰不截 / 4097 截（修前 2048 面下 4096 长文本已截 → 红）
 *  - 2049 长文本不再截（行为变更面：旧 2048 上限下被截）
 *  - 短文本 / 空串恒等
 */
import { describe, expect, test } from 'bun:test'

const CLIENT_SPEC = '../../src/tui/services/mcp/client.js'

describe('K2 #16：MCP 描述/指令上限 2048 → 4096', () => {
  test('truncateMcpDescriptionText 导出在场 + 4096 边界（恰不截）+ 4097 截', async () => {
    const mod = (await import(CLIENT_SPEC)) as {
      truncateMcpDescriptionText?: (text: string | undefined) => string | undefined
    }
    const truncate = mod.truncateMcpDescriptionText
    expect(
      truncate,
      'truncateMcpDescriptionText 导出缺席（修前红）',
    ).toBeTypeOf('function')

    const atLimit = 'x'.repeat(4096)
    expect(truncate!(atLimit)).toBe(atLimit)

    const overLimit = 'x'.repeat(4097)
    expect(truncate!(overLimit)).toBe('x'.repeat(4096) + '… [truncated]')
  })

  test('2049 长文本不再截（旧 2048 上限行为变更面）+ 短文本/undefined 恒等', async () => {
    const mod = (await import(CLIENT_SPEC)) as {
      truncateMcpDescriptionText?: (text: string | undefined) => string | undefined
    }
    const truncate = mod.truncateMcpDescriptionText
    expect(truncate).toBeTypeOf('function')

    const mid = 'y'.repeat(2049)
    expect(truncate!(mid)).toBe(mid)

    expect(truncate!('short')).toBe('short')
    expect(truncate!('')).toBe('')
    expect(truncate!(undefined)).toBeUndefined()
  })
})
