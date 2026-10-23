/**
 * 0.1.80 V3-1 K1-F⑤ 判别锁 — 预算思考 token 计入兜底（@296）
 *
 * 问题面：countTokens 为消息面估算（chars/4），不含思考模型本轮将消耗的
 * reasoning 预算 → 自适应思考模型实际占用被低估 → auto-compact 晚触发
 * （压缩前已 PTL / 网关拒绝）。
 *
 * 修法（通用化，不绑一方模型品牌面）：
 *   - 消费面：AutoCompactDeps.thinkingBudgetTokens + shouldAutoCompact
 *     阈值比较计入（tokenCount + thinkingBudgetTokens ≥ 阈值）。
 *   - 装配面：buildAgentLoopParams 从活 ToolUseContext.options
 *     .thinkingConfig 取 'enabled' 型 budgetTokens（--max-thinking-tokens
 *     面）；'adaptive' 本仓配置面无具体预算数 → 不计入（修前行为）。
 *
 * 判别锚（修前红）：消费面 a（预算计入后跨阈值触发）——修前 thinkingBudget
 * 字段不存在、比较不含预算 → 恒 false。
 *
 * 阈值算术（同 engine-auto-compact-window.test.ts 头注）：未注册模型回落
 * 262_144 = HARD_DEFAULT_CONTEXT_WINDOW；COMPACT_MAX_OUTPUT_TOKENS = 20_000；
 * AUTOCOMPACT_BUFFER_TOKENS = 13_000；缺省阈值 = 229_144。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { shouldAutoCompact } from '../../src/engine'
import {
  buildAgentLoopParams,
  type AgentLoopMaterials,
} from '../../src/tui/agentLoopDeps'
import { resetSettingsCache } from '../../src/tui/utils/settings/settingsCache'
import type { Tools } from '../../src/shared'
import type { ToolUseContext } from '../../src/tui/Tool'
import type { CanUseToolFn } from '../../src/tui/hooks/useCanUseTool'

// ── 脚手架 ──────────────────────────────────────────────────────────────────

const fakeCanUseTool = (() =>
  Promise.resolve({ behavior: 'allow' })) as unknown as CanUseToolFn

function makeContext(thinkingConfig: unknown): ToolUseContext {
  return {
    getAppState: () => ({ toolPermissionContext: {} }),
    options: { mainLoopModel: 'k1f-thinking-model', thinkingConfig },
  } as unknown as ToolUseContext
}

function makeMaterials(
  thinkingConfig: unknown,
): AgentLoopMaterials {
  return {
    messages: [{ role: 'user', content: 'hi', uuid: 'm1' }],
    userContext: {},
    systemPrompt: ['BASE-PROMPT'] as unknown as AgentLoopMaterials['systemPrompt'],
    systemContext: {},
    tools: [] as unknown as Tools,
    toolPermissionContext: { mode: 'default' },
    canUseTool: fakeCanUseTool,
    toolUseContext: makeContext(thinkingConfig),
    querySource: 'agent:k1f-thinking-test',
  }
}

/** 直调 shouldAutoCompact 的最小 deps（countTokens 恒返回 fixed）。 */
function compactDeps(fixedTokenCount: number, thinkingBudgetTokens?: number) {
  return {
    contextWindow: 262_144,
    countTokens: () => fixedTokenCount,
    compact: () => Promise.resolve({ messages: [] }) as never,
    ...(thinkingBudgetTokens !== undefined ? { thinkingBudgetTokens } : {}),
  }
}

const MESSAGES = [{ role: 'user', content: 'x', uuid: 'u1' }] as never[]

beforeEach(() => {
  delete process.env.ATLAS_AUTO_COMPACT_WINDOW
  delete process.env.ATLAS_AUTOCOMPACT_PCT_OVERRIDE
  delete process.env.DISABLE_COMPACT
  delete process.env.DISABLE_AUTO_COMPACT
})

afterEach(() => {
  resetSettingsCache()
})

// ── 消费面：shouldAutoCompact 阈值比较计入 ─────────────────────────────────

describe('K1-F⑤ shouldAutoCompact thinkingBudgetTokens 计入', () => {
  test('a) 预算计入后跨阈值触发（修前红：修前比较不含预算恒 false）', async () => {
    // 220_000 < 阈值 229_144；+10_000 预算 = 230_000 ≥ 229_144 → 触发
    const withBudget = await shouldAutoCompact(
      MESSAGES,
      compactDeps(220_000, 10_000),
    )
    expect(withBudget).toBe(true)
  })

  test('b) 无预算同 tokenCount 不触发（零回归锚，修前同绿）', async () => {
    const noBudget = await shouldAutoCompact(MESSAGES, compactDeps(220_000))
    expect(noBudget).toBe(false)
  })

  test('c) 非 finite 预算按 0 计（不引入新静默触发面）', async () => {
    const nanBudget = await shouldAutoCompact(
      MESSAGES,
      compactDeps(220_000, Number.NaN),
    )
    expect(nanBudget).toBe(false)
    // 已超阈值的计数不因 NaN 预算误降（NaN 按 0，非污染加法）
    const overThreshold = await shouldAutoCompact(
      MESSAGES,
      compactDeps(230_000, Number.NaN),
    )
    expect(overThreshold).toBe(true)
  })

  test('d) tokenCount NaN guard 语义保持（预算在场亦不破坏）', async () => {
    const nanCount = await shouldAutoCompact(
      MESSAGES,
      compactDeps(Number.NaN, 10_000),
    )
    expect(nanCount).toBe(false)
  })
})

// ── 装配面：buildAgentLoopParams 从 thinkingConfig 接线 ────────────────────

describe('K1-F⑤ buildAgentLoopParams thinkingBudgetTokens 装配', () => {
  test('e) enabled 型 budgetTokens 透传（--max-thinking-tokens 面）', () => {
    const { args } = buildAgentLoopParams(
      makeMaterials({ type: 'enabled', budgetTokens: 16_384 }),
    )
    expect(args.context?.autoCompact?.thinkingBudgetTokens).toBe(16_384)
  })

  test('f) adaptive 型无具体预算数 → 不计入（修前行为；本仓 budget→effort 映射后无 token 值）', () => {
    const { args } = buildAgentLoopParams(
      makeMaterials({ type: 'adaptive' }),
    )
    expect(args.context?.autoCompact?.thinkingBudgetTokens).toBeUndefined()
  })

  test('g) disabled 型 → 不计入（零回归）', () => {
    const { args } = buildAgentLoopParams(
      makeMaterials({ type: 'disabled' }),
    )
    expect(args.context?.autoCompact?.thinkingBudgetTokens).toBeUndefined()
  })
})
