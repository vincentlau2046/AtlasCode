/**
 * 0.1.102 P0 切片 3 判据格：inline 视口压缩器（R3-A 钉底）三钉。
 *
 * 格面（lock-face ④）：
 *  - 钉② 小终端退化边界：<5 完全退化（degraded）/ <20 保底集（fallback，
 *    cap 0 消息区全额归滚动区 + 流式块抑制）/ ≥20 正常预算分配序
 *  - 钉③ 流式块常数帽：capStreamingText 任意输入输出行数 ≤
 *    STREAMING_BLOCK_CAP_ROWS；预算分配序单帧总高恒 ≤ 视口
 *    （判据格「流式单帧超限不破钉底格」）
 *  - 钉① computeSliceStart 动态 cap（签名已参数化零改复用）：cap 参 =
 *    剩余行数预算；cap 0 保底集态零消息渲染 + 锚存活；缺省 200/50 行为
 *    不回归
 */
import { describe, expect, test } from 'bun:test'

import {
  MIN_COMPRESS_ROWS,
  MIN_SURGERY_ROWS,
  STREAMING_BLOCK_CAP_ROWS,
  capStreamingText,
  computeViewportPlan,
  resolveRenderCap,
} from 'src/tui/components/viewportBudget'
import { computeSliceStart, type SliceAnchor } from 'src/tui/components/Messages'

function makeCollapsed(n: number): Array<{ uuid: string }> {
  return Array.from({ length: n }, (_, i) => ({ uuid: `uuid-${i}` }))
}

describe('computeViewportPlan（钉② 退化边界 + 钉③ 预算分配序）', () => {
  test('常量定形：流式帽 24 / 退化阈 5 / 保底阈 20', () => {
    expect(STREAMING_BLOCK_CAP_ROWS).toBe(24)
    expect(MIN_SURGERY_ROWS).toBe(5)
    expect(MIN_COMPRESS_ROWS).toBe(20)
  })

  test('<5 行 degraded；5–19 行 fallback；≥20 行 compress', () => {
    expect(computeViewportPlan(4, 0).mode).toBe('degraded')
    expect(computeViewportPlan(5, 0).mode).toBe('fallback')
    expect(computeViewportPlan(19, 0).mode).toBe('fallback')
    expect(computeViewportPlan(20, 0).mode).toBe('compress')
  })

  test('预算分配序：输入框/提示行全保 → 流式块限高 → 消息区自尾截断', () => {
    const plan = computeViewportPlan(30, 5, 10)
    expect(plan).toEqual({ mode: 'compress', messageBudgetRows: 15, streamingCapRows: 10 })
    // 流式超帽：100 行流式截到 24，预算扣 24
    const capped = computeViewportPlan(30, 5, 100)
    expect(capped).toEqual({ mode: 'compress', messageBudgetRows: 1, streamingCapRows: STREAMING_BLOCK_CAP_ROWS })
    // 预留吃满预算 → 消息区 0（不低于 0）
    expect(computeViewportPlan(30, 40, 0)).toEqual({ mode: 'compress', messageBudgetRows: 0, streamingCapRows: 0 })
  })

  test('单帧总高恒 ≤ 视口（流式单帧超限不破钉底格的预算面）', () => {
    for (const rows of [20, 24, 30, 40, 80]) {
      for (const reserved of [0, 3, 8]) {
        for (const streaming of [0, 5, 24, 1000]) {
          const plan = computeViewportPlan(rows, reserved, streaming)
          if (plan.mode !== 'compress') continue
          // 消息区预算 + 流式保留 + 预留 ≤ 视口 ⇒ 流式块按帽截断后
          // 单帧总高 ≤ 视口 + 提示行（提示行 1 行由测量环兜底）。
          expect(plan.messageBudgetRows + plan.streamingCapRows + reserved).toBeLessThanOrEqual(rows)
        }
      }
    }
  })

  test('非法输入夹紧：NaN 视口 → degraded（按 0）', () => {
    expect(computeViewportPlan(Number.NaN, 0).mode).toBe('degraded')
    expect(computeViewportPlan(-3, 0).mode).toBe('degraded')
  })
})

describe('resolveRenderCap（plan → Messages 消费形）', () => {
  test('degraded → undefined（压缩器不在场，缺省 200 零行为变更）', () => {
    expect(resolveRenderCap({ mode: 'degraded' })).toBeUndefined()
  })

  test('fallback 保底集 → capRows 0 + 流式块抑制', () => {
    expect(resolveRenderCap({ mode: 'fallback' })).toEqual({ capRows: 0, streamingCapRows: 0, suppressStreaming: true })
  })

  test('compress → 预算 − 收缩量（不低于 0）+ 流式块放行', () => {
    expect(resolveRenderCap({ mode: 'compress', messageBudgetRows: 12, streamingCapRows: 24 }, 0)).toEqual({
      capRows: 12,
      streamingCapRows: 24,
      suppressStreaming: false,
    })
    expect(resolveRenderCap({ mode: 'compress', messageBudgetRows: 12, streamingCapRows: 24 }, 5).capRows).toBe(7)
    expect(resolveRenderCap({ mode: 'compress', messageBudgetRows: 3, streamingCapRows: 24 }, 100).capRows).toBe(0)
  })

  test('窄视口二次限高：流式帽让位于「输入框全保 + 视口本身」', () => {
    // 20 行视口、零预留、1000 行流式 → 帽被压到 20（不是 24），预算 0
    const plan = computeViewportPlan(20, 0, 1000)
    expect(plan).toEqual({ mode: 'compress', messageBudgetRows: 0, streamingCapRows: 20 })
    // 输入框全保优先：10 行视口走 fallback（不到 compress 域）；
    // 25 行视口预留 10 → 帽 = min(24, 15) = 15，预算 0
    expect(computeViewportPlan(25, 10, 1000)).toEqual({ mode: 'compress', messageBudgetRows: 0, streamingCapRows: 15 })
  })
})

describe('capStreamingText（钉③ 流式块常数帽）', () => {
  test('短块透传：零溢出', () => {
    const r = capStreamingText('a\nb\nc')
    expect(r).toEqual({ text: 'a\nb\nc', overflowRows: 0 })
  })

  test('1000 行流式 → 保尾 24 行 + 溢出 976 折叠入「已入滚动区」计数', () => {
    const text = Array.from({ length: 1000 }, (_, i) => `line-${i}`).join('\n')
    const r = capStreamingText(text)
    expect(r.overflowRows).toBe(1000 - STREAMING_BLOCK_CAP_ROWS)
    const lines = r.text.split('\n')
    expect(lines.length).toBe(STREAMING_BLOCK_CAP_ROWS)
    // 保尾：最近内容在屏
    expect(lines[lines.length - 1]!).toBe('line-999')
    expect(lines[0]!).toBe(`line-${1000 - STREAMING_BLOCK_CAP_ROWS}`)
  })

  test('联动断言：任意输入输出行数 ≤ STREAMING_BLOCK_CAP_ROWS', () => {
    for (const n of [0, 1, 23, 24, 25, 100, 5000]) {
      const text = Array.from({ length: n }, (_, i) => `L${i}`).join('\n')
      expect(capStreamingText(text).text.split('\n').length).toBeLessThanOrEqual(STREAMING_BLOCK_CAP_ROWS)
    }
  })
})

describe('computeSliceStart 动态 cap（钉① 单源复用，UUID 锚不变式）', () => {
  test('小 cap + step 1：start = length − cap，锚落在切片头', () => {
    const collapsed = makeCollapsed(100)
    const anchorRef = { current: null as SliceAnchor }
    const start = computeSliceStart(collapsed, anchorRef, 5, 1)
    expect(start).toBe(95)
    expect(anchorRef.current).toEqual({ uuid: 'uuid-95', idx: 95 })
  })

  test('cap 0（保底集）：零消息渲染（start = length），锚存活不清', () => {
    const collapsed = makeCollapsed(30)
    const anchorRef = { current: { uuid: 'uuid-10', idx: 10 } as SliceAnchor }
    const start = computeSliceStart(collapsed, anchorRef, 0, 1)
    expect(start).toBe(30)
    expect(collapsed.slice(start)).toHaveLength(0)
    // 锚不被清（恢复 compress 后零成本续位，不重放全量历史）
    expect(anchorRef.current).toEqual({ uuid: 'uuid-10', idx: 10 })
  })

  test('追加消息步进：超 cap+step 才前进（锚 immune to length churn）', () => {
    const collapsed = makeCollapsed(100)
    const anchorRef = { current: null as SliceAnchor }
    expect(computeSliceStart(collapsed, anchorRef, 5, 1)).toBe(95)
    collapsed.push({ uuid: 'uuid-100' })
    // 101 − 95 = 6 > 5+1? 否 → start 不动（无 churn）
    expect(computeSliceStart(collapsed, anchorRef, 5, 1)).toBe(95)
    collapsed.push({ uuid: 'uuid-101' })
    // 102 − 95 = 7 > 6 → start 前进到 97
    expect(computeSliceStart(collapsed, anchorRef, 5, 1)).toBe(97)
  })

  test('锚 uuid 丢失（collapse 重排 churn）→ 存储索引兜底不重置 0', () => {
    const collapsed = makeCollapsed(100)
    const anchorRef = { current: { uuid: 'vanished', idx: 95 } as SliceAnchor }
    expect(computeSliceStart(collapsed, anchorRef, 5, 1)).toBe(95)
  })

  test('缺省参数回归：200/50 既有行为不变', () => {
    const collapsed = makeCollapsed(300)
    const anchorRef = { current: null as SliceAnchor }
    expect(computeSliceStart(collapsed, anchorRef)).toBe(100)
    const small = makeCollapsed(150)
    const ref2 = { current: null as SliceAnchor }
    expect(computeSliceStart(small, ref2)).toBe(0)
  })
})
