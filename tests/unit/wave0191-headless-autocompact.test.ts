/**
 * wave0191 W-opt-2：C-6 headless -p 车道 autoCompact 激活（工单 8e10ffce）。
 *
 * 缺陷基线（0.1.90 生产 lane 勘误 2 / C-6 候补）：print.ts autoCompact 构建
 * （:1228-1237）= AutoCompactDeps 最小面 {contextWindow, compact}，无
 * countTokens → shouldAutoCompact fail-safe false（autoCompact.ts:617）→
 * -p 长会话结构性不自动压缩。修 = deps 补 countTokens（TUI agentLoopDeps
 * 同款提供方 modelProvider.countTokens）+ keepRecent 车道对齐（Main 锁面
 * 裁定①：对齐 TUI AUTOCOMPACT_KEEP_RECENT N=3——用户 C-6 本意 = 对齐
 * TUI 处理方式；keepRecent 只影响保留段不进摘要主体，成本≈0；与压缩
 * 频率/阈值判定无关，风暴面零增量）。
 *
 * 车道对齐表（锁面裁定②，RF2 全量枚举，TUI agentLoopDeps:170-244 vs
 * print.ts autoCompact 构建块）：
 *  - contextWindow        等价对齐（角色 capabilities；print 缺省字面 200_000
 *                          vs TUI HARD_DEFAULT_CONTEXT_WINDOW 262144——缺省支
 *                          字面差，归序 2 对齐表，非本波）
 *  - countTokens           本波对齐（本体；-p 用 'small' 车道与 compactDeps
 *                          summarize 同源，语义等价）
 *  - keepRecent            本波对齐（裁定①，N=3）
 *  - compact 体            有意差登记不本波对齐：TUI 富路径（createAutoCompactCompact
 *                          附件重建+PTL 截头重试+hook 簇）依赖 CompactPorts DI
 *                          宿主 + 活 richContext；0.1.68 F-1 头注明写 headless
 *                          无宿主 port 未注册自然留裁剪——归序 2 独立件
 *  - maxOutputTokens       有意差登记（保守向）：print 未传 = 摘要预留满额
 *                          20k → 阈值更低更晚触发；-p 既有形，归序 2
 *  - enabled               本波接线 fail-closed（锁面修订裁定 cd2062cc）：激活
 *                          活压缩车道而 kill-switch 不接 = fail-open config
 *                          gate——TUI 同链 mergeAutoCompactOverrides(
 *                          getAutoCompactEnvOverrides(), settings.autoCompactWindow,
 *                          roleModel) → enabled: autoCompactDisabled ? false :
 *                          undefined；判据 = 禁用直证（DISABLE_COMPACT=1 →
 *                          shouldAutoCompact false；settings off 档位同）
 *  - pct/window            有意差登记：print 未接 getAutoCompactEnvOverrides
 *                          档位链（env 覆写/settings autoCompactWindow 在 -p
 *                          无效）；归序 2（阈值调优非 kill-switch）
 *  - thinkingBudgetTokens  有意差登记：-p 无 thinkingConfig 源
 *  - querySource           有意差（小）：-p 无 compact fork 车道，守卫缺省
 *  - tracking              非 deps 字段（engine loop 层回灌），车道无关
 *
 * 风暴重估三直证（锁面裁定③）：熔断 3 败 gate（:678-686）在 -p 可达
 * （headless 经 queryAgentLoop context.autoCompact 共用同一 DI 核）；
 * 413 守 = isAutoCompactThresholdPositive 小窗守卫（:365-380）同核可达；
 * 警告呈现形态登记（一行）：-p 无 statusline 警告 UI（calculateTokenWarningState
 * TUI 专属），压缩/熔断留痕 = loop 级 logForDebugging debug 日志面为准。
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { Message } from '../../src/shared'
import {
  AUTOCOMPACT_KEEP_RECENT,
  autoCompactIfNeeded,
  mergeAutoCompactOverrides,
  shouldAutoCompact,
  type AutoCompactDeps,
} from '../../src/engine/context/autoCompact'
import { getAutoCompactEnvOverrides } from '../../src/engine/config/autoCompactOverrides'
import { compactConversation } from '../../src/engine/context/compact'

// ─────────────────────────── 构造器 ───────────────────────────

const userText = (text: string): Message => ({
  type: 'user',
  role: 'user',
  message: { role: 'user', content: text },
})
const assistantText = (text: string): Message => ({
  type: 'assistant',
  role: 'assistant',
  message: { role: 'assistant', content: text },
})

/** print.ts 修前最小面复刻（AutoCompactDeps = {contextWindow, compact}）。 */
function minimalDeps(): AutoCompactDeps {
  return {
    contextWindow: 200_000,
    compact: async () => {
      throw new Error('compact must not be called in minimal form')
    },
  }
}

/** 修后形态 deps（countTokens 桩 + 压窗构造）。 */
function fixedDeps(tokenCount: number): AutoCompactDeps & {
  compactCalls: number
} {
  const state = { compactCalls: 0 }
  return {
    contextWindow: 200_000,
    countTokens: async () => tokenCount,
    compact: async msgs => {
      state.compactCalls += 1
      return {
        summaryMessages: [userText('summary')],
        messagesToKeep: msgs.slice(-AUTOCOMPACT_KEEP_RECENT),
        summary: 'S',
      }
    },
    ...state,
  } as AutoCompactDeps & { compactCalls: number }
}

/** 压窗会话构造（任意内容，计数由桩决定）。 */
const pressuring = (): Message[] => [
  userText('q'),
  assistantText('a'),
  userText('q2'),
]

// ───────────────── C6-1 源级接线锚（RED = 修前 grep 落空）─────────────────

describe('wave0191 print.ts autoCompact deps 接线源级锚', () => {
  const src = () => readFileSync('src/cli/print.ts', 'utf8')

  test('autoCompact 构建块补 countTokens 接线（C6-1 本体）', () => {
    const s = src()
    // 构建块内实注入（注释行不算：取键赋值形）
    expect(s).toMatch(/const autoCompact: AutoCompactDeps = \{[\s\S]*?countTokens:/)
  })

  test('keepRecent 车道对齐 = AUTOCOMPACT_KEEP_RECENT 注入 compactDeps（锁面裁定①；keepRecent 归 CompactDeps/compactConversation options 面，非 AutoCompactDeps 字段）', () => {
    const s = src()
    expect(s).toMatch(/const compactDeps: CompactDeps = \{[\s\S]*?keepRecent:\s*AUTOCOMPACT_KEEP_RECENT/)
    // 保留段定参单一事实源（禁止 print.ts 本地魔数复刻）
    expect(s).toContain('AUTOCOMPACT_KEEP_RECENT')
  })

  test('enabled kill-switch 接线（锁面修订裁定 cd2062cc）：autoCompact 块 enabled 门 + TUI 同链三件 import（fail-closed 判据本体）', () => {
    const s = src()
    // enabled 门现形（TUI agentLoopDeps:175 同形）
    expect(s).toMatch(
      /const autoCompact: AutoCompactDeps = \{[\s\S]*?enabled:\s*mergedAutoCompact\.autoCompactDisabled \? false : undefined/,
    )
    // 单一事实源链（env 读侧 + settings 读侧 + merge 面；禁本地重实现）
    expect(s).toMatch(/mergeAutoCompactOverrides\(\s*getAutoCompactEnvOverrides\(\)/)
    expect(s).toMatch(/getInitialSettings\(\)\.autoCompactWindow/)
  })
})

// ───────────────── C6-2 DI 核车道判定语义 ────────────────

describe('wave0191 shouldAutoCompact DI 核（0.1.90 勘误 2 根因面）', () => {
  test('修前最小面（无 countTokens）→ fail-safe false 不压缩（缺陷基线钉住）', async () => {
    expect(await shouldAutoCompact(pressuring(), minimalDeps())).toBe(false)
  })

  test('修后形态（countTokens 注入 + 压窗计数）→ true 压缩触发', async () => {
    const deps = fixedDeps(199_000)
    expect(await shouldAutoCompact(pressuring(), deps)).toBe(true)
  })

  test('修后形态低计数 → false（阈值下不压缩）', async () => {
    const deps = fixedDeps(1_000)
    expect(await shouldAutoCompact(pressuring(), deps)).toBe(false)
  })

  test('NaN guard：计数残缺 → false 静默禁用（不假压缩）', async () => {
    const deps = fixedDeps(Number.NaN)
    expect(await shouldAutoCompact(pressuring(), deps)).toBe(false)
  })
})

// ───────────────── 锁面裁定③ 风暴重估三直证 ────────────────

describe('wave0191 风暴重估直证（-p 车道可达性 = 同一 DI 核）', () => {
  test('直证① 熔断：tracking.consecutiveFailures=3 → 不调 compact 直通（3 败熔断 -p 生效）', async () => {
    const deps = fixedDeps(199_000)
    const r = await autoCompactIfNeeded(pressuring(), { compacted: false, turnCounter: 0, turnId: 't', consecutiveFailures: 3 }, deps)
    expect(r.wasCompacted).toBe(false)
    expect(r.consecutiveFailures).toBe(3)
    expect(deps.compactCalls).toBe(0)
  })

  test('直证② 413 守：32K 小窗 → 阈值负 → 结构性禁用（近满窗摘要风暴守卫可达）', async () => {
    const deps = fixedDeps(31_000)
    deps.contextWindow = 32_768
    expect(await shouldAutoCompact(pressuring(), deps)).toBe(false)
  })

  test('直证③ 熔断恢复面：2 败未达 3 → 压缩链仍可达（gate 只封 ≥3）', async () => {
    const deps = fixedDeps(199_000)
    const r = await autoCompactIfNeeded(pressuring(), { compacted: false, turnCounter: 1, turnId: 't', consecutiveFailures: 2 }, deps)
    expect(r.wasCompacted).toBe(true)
    expect(r.tracking?.consecutiveFailures).toBe(0)
  })
})

// ───────────────── keepRecent N=3 装配语义（compactConversation 面）─────────────────

describe('wave0191 keepRecent=3 车道对齐装配语义', () => {
  test('compactConversation keepRecent=3 → messagesToKeep 保留 3 条（TUI 同参语义）', async () => {
    const msgs = [userText('a'), assistantText('b'), userText('c'), assistantText('d'), userText('e')]
    const r = await compactConversation(msgs, {
      summarize: async () => '<analysis>x</analysis><summary>S</summary>',
      keepRecent: AUTOCOMPACT_KEEP_RECENT,
    })
    expect(r.messagesToKeep).toHaveLength(3)
  })
})

// ───────────── 锁面修订裁定（cd2062cc）禁用 kill-switch 直证 ─────────────

describe('wave0191 禁用直证（fail-closed 判据：kill-switch 在 -p 生效）', () => {
  test('DI 核：enabled:false + 压窗计数 → shouldAutoCompact false（用户显式关闭不被压缩）', async () => {
    const deps = fixedDeps(199_000)
    deps.enabled = false
    expect(await shouldAutoCompact(pressuring(), deps)).toBe(false)
  })

  test('DI 核：enabled 缺省（undefined）→ 判定不受影响（未关闭面恒等）', async () => {
    const deps = fixedDeps(199_000)
    deps.enabled = undefined
    expect(await shouldAutoCompact(pressuring(), deps)).toBe(true)
  })

  test('merge 链：DISABLE_COMPACT=1 env → autoCompactDisabled true（env 总开关在 -p 生效）', () => {
    const prev = process.env['DISABLE_COMPACT']
    try {
      process.env['DISABLE_COMPACT'] = '1'
      const env = getAutoCompactEnvOverrides()
      expect(env.disabled).toBe(true)
      expect(mergeAutoCompactOverrides(env, undefined, 'any-model').autoCompactDisabled).toBe(true)
    } finally {
      if (prev === undefined) delete process.env['DISABLE_COMPACT']
      else process.env['DISABLE_COMPACT'] = prev
    }
  })

  test('merge 链：settings off 档位 → autoCompactDisabled true（/autocompact off 持久化在 -p 生效）', () => {
    const merged = mergeAutoCompactOverrides(
      {},
      { default: { kind: 'off' } },
      'small-model',
    )
    expect(merged.autoCompactDisabled).toBe(true)
  })

  test('merge 链：env 胜 settings 既有纪律——env 关 + settings 开档 → disabled；均未设 → false', () => {
    // env 关 + settings 无 off 档 → 关（env 杠杆）
    expect(
      mergeAutoCompactOverrides({ disabled: true }, { default: { kind: 'auto' } }, 'm').autoCompactDisabled,
    ).toBe(true)
    // 均未设 → false（enabled undefined → 不显式禁用，与 TUI 形精确同值）
    expect(
      mergeAutoCompactOverrides({}, undefined, 'm').autoCompactDisabled,
    ).toBe(false)
  })
})

// ───────────────── TUI 车道零触碰锚（agentLoopDeps 现形不变）─────────────────

describe('wave0191 TUI 车道零 diff 锚（scoped 边界）', () => {
  test('agentLoopDeps.ts countTokens/keepRecent 接线现形在位（本波零改动面）', () => {
    const s = readFileSync('src/tui/agentLoopDeps.ts', 'utf8')
    expect(s).toMatch(/modelProvider\.countTokens\(/)
    expect(s).toContain('keepRecent: AUTOCOMPACT_KEEP_RECENT')
  })
})
