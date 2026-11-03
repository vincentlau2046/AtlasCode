/**
 * 0.1.87 插入件 I（f4 2026-11-03 消息 §6，R-086-1 销项）—— bootstrapState 交互
 * 时间三 stub（getLastInteractionTime / updateLastInteractionTime /
 * flushInteractionTime，起源 78624e4 移植占位）落真实现后的接线级判别单测。
 *
 * 契约（ink.tsx onRender 注释原样锚 + 消费点实核）：
 *  - getLastInteractionTime(): number —— K6-8 门（idleReturnHint 严格 >）、姊妹
 *    idle_notification 门（REPL.tsx:3708 严格 >）、backgroundHousekeeping（60s
 *    近交互支）、usePrStatus（变化检测）均按数值比较消费；stub 的 {} 在数值
 *    比较中 NaN 化 → 四面恒失效（R-086-1 活面 RED 根因）。
 *  - updateLastInteractionTime(force?) —— keypress 支（App.tsx 中央输入处理器
 *    processKeysInBatch）无 force = 只标 dirty（每帧至多一次 Date.now()，
 *    flushInteractionTime 在 ink onRender 前统一结算）；force=true（REPL effect
 *    L3685 / useNotifyAfterTimeout L50 —— useEffect 晚于 Ink render flush，
 *    必须立即置时）立即写并清 dirty。
 *  - flushInteractionTime() —— dirty 才结算（干净 flush = no-op，防每帧触碰状态）。
 *
 * 接线级（f4 判据「REPL effect 置时，非注入值」）：断言走真 bootstrapState 状态
 * 链（update → get → gate），门消费真实 getter 返回值而非手注常数；组件级 REPL
 * effect 无单测 harness（K6-8 0.1.86 先例：wave0186-backgrounding.test.ts 头注
 * L43-44），接线正确性由 tsc + e2e PTY 探针 tui-k6-idlehint-live-0186 v2
 * （gate ⑤ 增补两支之一）背书。
 *
 * 分层纪律：纯逻辑模块（无网络 / 无 PTY / 无真实 HOME）→ unit。
 * （bootstrapState 双依赖 settings/modelprovider 为叶子配置面，
 * bootstrap-state-split.test.ts 同例 unit 可 import。）
 */
import { describe, expect, test } from 'bun:test'
import {
  flushInteractionTime,
  getLastInteractionTime,
  updateLastInteractionTime,
} from '../../src/tui/bootstrapState.js'
import { shouldShowIdleReturnHint } from '../../src/tui/utils/idleReturnHint.js'

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

describe('插入件 I · 交互时间三 stub 真实现（R-086-1 销项）', () => {
  test('getLastInteractionTime 返回有限 number（stub 的 {} 数值比较 NaN 化 = 四门恒失效根因）', () => {
    expect(typeof getLastInteractionTime()).toBe('number')
    expect(Number.isFinite(getLastInteractionTime())).toBe(true)
  })

  test('force=true 立即置时（REPL effect / useNotifyAfterTimeout 契约）', async () => {
    const before = getLastInteractionTime()
    await sleep(15)
    updateLastInteractionTime(true)
    const after = getLastInteractionTime()
    expect(after).toBeGreaterThan(before)
    expect(after).toBeLessThanOrEqual(Date.now())
  })

  test('无 force = 只标 dirty 不置时；flushInteractionTime 结算（每帧至多一次 Date.now()）', async () => {
    updateLastInteractionTime(true) // 先归位到已知锚点
    const anchored = getLastInteractionTime()
    await sleep(15)
    updateLastInteractionTime() // keypress 支：deferred 标记
    expect(getLastInteractionTime()).toBe(anchored) // flush 前不变
    flushInteractionTime()
    expect(getLastInteractionTime()).toBeGreaterThan(anchored) // flush 结算
  })

  test('干净 flush = no-op（防每帧触碰状态）；force 清 pending dirty（flush 不覆盖 force 值）', async () => {
    updateLastInteractionTime(true)
    const forced = getLastInteractionTime()
    await sleep(15)
    flushInteractionTime() // 无 dirty
    expect(getLastInteractionTime()).toBe(forced)
    updateLastInteractionTime() // 标 dirty
    updateLastInteractionTime(true) // force 应清掉 pending dirty
    const forced2 = getLastInteractionTime()
    await sleep(15)
    flushInteractionTime()
    expect(getLastInteractionTime()).toBe(forced2) // dirty 已被 force 清 → flush no-op
  })
})

describe('插入件 I · 双门接线（真状态链，非注入值）', () => {
  test('K6-8 门：交互后（REPL effect force 置时）hint 抑制；新完成后恢复触发', async () => {
    // 真实时序：T0 回合完成（lqct 更新在其前）→ 用户交互（REPL effect
    // updateLastInteractionTime(true)）→ timer 触发时刻读真 getter →
    // 严格 > → 抑制（中断/空闲窗输入不冒 hint）。
    updateLastInteractionTime(true)
    const interactionAt = getLastInteractionTime()
    const gateAtFire = {
      lastQueryCompletionTime: interactionAt - 30_000, // 完成早于交互
      lastInteractionTime: getLastInteractionTime(), // fire 时刻真值（非注入常数）
      messageCount: 6,
    }
    expect(shouldShowIdleReturnHint(gateAtFire)).toBe(false)
    // 新一回合正常完成（lqct 更新到交互之后）→ 无后续输入 → hint 恢复可达
    expect(
      shouldShowIdleReturnHint({
        ...gateAtFire,
        lastQueryCompletionTime: interactionAt + 30_000,
      }),
    ).toBe(true)
  })

  test('姊妹 idle_notification 门（REPL.tsx:3708 严格 >）：交互前不抑制、交互后抑制', async () => {
    updateLastInteractionTime(true)
    const interactionAt = getLastInteractionTime()
    // 完成时刻晚于当前交互时间（正常序：回合完成后用户 idle）→ 不抑制（走通知支）
    const completionAfterInteraction = interactionAt + 30_000
    expect(getLastInteractionTime() > completionAfterInteraction).toBe(false)
    // 完成早于新交互（完成 → 用户交互，REPL effect force）→ fire 时刻严格 > → 抑制
    const completionBeforeInteraction = interactionAt
    await sleep(15)
    updateLastInteractionTime(true)
    expect(getLastInteractionTime() > completionBeforeInteraction).toBe(true)
  })
})
