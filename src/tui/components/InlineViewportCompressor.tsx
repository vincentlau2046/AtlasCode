/**
 * Inline 视口压缩器（0.1.102 P0 切片 3，工单「R3-A 默认 inline 模式钉底」）。
 *
 * 全屏路径（FullscreenLayout 全屏支）结构面已在（ScrollBox stickyScroll +
 * bottom flexShrink=0）；本组件只服务非全屏支——把动态渲染面强制 ≤ 视口
 * 高度，输入框恒在视口内（用户 P0 #3「输入框不钉底，整屏上滚丢失」）。
 *
 * 机制（设计稿「yoga 实测高度预算器」+ gate-102 RED 修形）：
 *  1. 纯预算（viewportBudget.computeViewportPlan）：输入框/提示行全保 →
 *     流式块限高（STREAMING_BLOCK_CAP_ROWS，Messages 侧执行）→ 消息区自尾
 *     截断（messageBudgetRows 作 cap 参传 computeSliceStart，钉① 单源）。
 *  2. 实测收缩环（有界，gate-102 RED 修形）：useLayoutEffect 里
 *     measureElement 实测整帧高度；溢出 → resolveShrinkDecision 决策——
 *     收缩量钳制 = 实测溢出行数（禁 +1 盲加），episode 内至多
 *     MAX_SHRINK_ATTEMPTS 次；耗尽仍溢出（bottom 槽增长/流式压缩下限等
 *     不可收敛场景）→ surrender 锁 fallback 保底形（cap 0 + 流式抑制 +
 *     「N 条已入滚动区」提示行），停止 setState（禁无限自激崩溃）。
 *     收缩 setState 走 setTimeout(0) 异步调度——同一 commit 环内零
 *     setState（React Maximum update depth 崩溃根因即同步环内反复
 *     dispatchSetState）。
 *  3. 复位面：终端 resize（rows 变）/ bottom 槽实测高度变化（permission
 *     卡出现/消失等布局语境变化）→ shrinkRows/attempts/surrendered 归零
 *     重新有界尝试；只重置不回涨，无振荡面。
 *
 * 退化规则（钉②）：<5 行 degraded（原样渲染，零手术）；<20 行 fallback
 * （保底集：cap 0 消息区全归滚动区 + 流式块抑制，Messages 渲染
 * 「N 条已入滚动区」提示行）。
 *
 * 挂载点：FullscreenLayout 非全屏支（编译态文件最小插入——只把
 * {scrollable}{bottom} 包进本组件；overlay/modal 留在外层不参与测量）。
 */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { Box, type DOMElement, measureElement } from '../ink.js'
import {
  computeViewportPlan,
  fallbackTailCapRows,
  resolveRenderCap,
  resolveShrinkDecision,
  type ViewportPlan,
  type ViewportRenderCap,
} from './viewportBudget.js'

/**
 * 压缩器 → Messages 消费通道。undefined = 压缩器不在场（全屏 / degraded），
 * Messages 走缺省 200 消息帽（零行为变更）。
 */
export const ViewportRenderCapContext = createContext<ViewportRenderCap | undefined>(undefined)

/** 测试/诊断面：当前上下文消费形直读。 */
export function useViewportRenderCap(): ViewportRenderCap | undefined {
  return useContext(ViewportRenderCapContext)
}

export function InlineViewportCompressor({
  scrollable,
  bottom,
}: {
  scrollable: React.ReactNode
  bottom: React.ReactNode
}): React.ReactNode {
  const { rows } = useTerminalSize()
  const rootRef = useRef<DOMElement | null>(null)
  const bottomRef = useRef<DOMElement | null>(null)
  // 输入框/提示行实测预留行数（预算分配序第一优先：全保）。
  const [bottomRows, setBottomRows] = useState(0)
  // 实测溢出收缩量（episode 有界内只增；复位面归零）。
  const [shrinkRows, setShrinkRows] = useState(0)
  // 不可收敛降级锁（surrender）：真 = 落 fallback 保底形并停止收缩 setState。
  const [surrendered, setSurrendered] = useState(false)
  // 本溢出 episode 内已收缩次数（ref 传递，不走渲染）。
  const attemptsRef = useRef(0)

  const plan: ViewportPlan = surrendered
    ? { mode: 'fallback', messageTailCapRows: fallbackTailCapRows(rows, bottomRows) }
    : computeViewportPlan(rows, bottomRows)
  const renderCap = resolveRenderCap(plan, surrendered ? 0 : shrinkRows)

  // 复位面 1：resize → 收缩量/episode/降级锁全归零（预算重算，重新有界尝试）。
  useLayoutEffect(() => {
    attemptsRef.current = 0
    setShrinkRows(0)
    setSurrendered(false)
  }, [rows])

  // 复位面 2：bottom 槽实测高度变化（permission 卡出现/消失等布局语境
  // 变化）→ episode/降级锁归零重新有界尝试（等值守卫：恒等高度不触发）。
  const resetOnBottomChangeRef = useRef(bottomRows)
  useEffect(() => {
    if (resetOnBottomChangeRef.current !== bottomRows) {
      resetOnBottomChangeRef.current = bottomRows
      attemptsRef.current = 0
      setSurrendered(false)
    }
  }, [bottomRows])

  // 预留行实测：bottom 槽（输入框/提示行/permission 卡等）高度。
  useLayoutEffect(() => {
    const node = bottomRef.current
    if (!node) return
    const h = measureElement(node).height
    setBottomRows(prev => (prev === h ? prev : h))
  }, [bottom])

  // 实测收缩环（有界 + 异步，gate-102 RED 修形）：整帧（消息区 + bottom +
  // 提示行）> 视口 → resolveShrinkDecision 单步决策。收缩 setState 走
  // setTimeout(0)：同 commit 环内零 setState（同步环 = Maximum update
  // depth 崩溃根因）；surrender 单次 setState 后 plan 锁 fallback，后续
  // 本 effect 早退，无环。scrollable/bottom 身份每 REPL 渲染都新 ⇒ 每
  // 内容变化帧复测一次。
  useLayoutEffect(() => {
    if (plan.mode !== 'compress') return
    const node = rootRef.current
    if (!node) return
    const overflow = measureElement(node).height - rows
    // capHeadroom = budget − 已收缩量：本次收缩将使 capRows 跌破 1 →
    // 决策面直接 surrender（f4 t108 修形指令 2，禁 <1 中间态）。
    const decision = resolveShrinkDecision(overflow, attemptsRef.current, plan.messageBudgetRows - shrinkRows)
    if (decision.action === 'hold') {
      attemptsRef.current = 0
      return
    }
    if (decision.action === 'surrender') {
      attemptsRef.current = 0
      setSurrendered(true)
      return
    }
    attemptsRef.current += 1
    const t = setTimeout(() => setShrinkRows(prev => prev + decision.shrinkRows), 0)
    return () => clearTimeout(t)
  }, [scrollable, bottom, rows, plan])

  if (plan.mode === 'degraded') {
    // 钉② <5 行：完全退化——零布局手术，终端原生滚动接管（现状行为）。
    return <>{scrollable}{bottom}</>
  }

  return (
    <ViewportRenderCapContext.Provider value={renderCap}>
      <Box ref={rootRef} flexDirection="column">
        {scrollable}
        <Box ref={bottomRef} flexDirection="column">
          {bottom}
        </Box>
      </Box>
    </ViewportRenderCapContext.Provider>
  )
}
