/**
 * Inline 视口压缩器（0.1.102 P0 切片 3，工单「R3-A 默认 inline 模式钉底」）。
 *
 * 全屏路径（FullscreenLayout 全屏支）结构面已在（ScrollBox stickyScroll +
 * bottom flexShrink=0）；本组件只服务非全屏支——把动态渲染面强制 ≤ 视口
 * 高度，输入框恒在视口内（用户 P0 #3「输入框不钉底，整屏上滚丢失」）。
 *
 * 机制（设计稿「yoga 实测高度预算器」）：
 *  1. 纯预算（viewportBudget.computeViewportPlan）：输入框/提示行全保 →
 *     流式块限高（STREAMING_BLOCK_CAP_ROWS，Messages 侧执行）→ 消息区自尾
 *     截断（messageBudgetRows 作 cap 参传 computeSliceStart，钉① 单源）。
 *  2. 实测收缩环：useLayoutEffect 里 measureElement 实测整帧高度；溢出
 *     （帧高 > 视口行数）→ shrinkRows += 溢出 + 1 → 消息区 cap 收缩重渲。
 *     每消息 ≥1 行 ⇒ 每步收缩消除 ≥ 溢出行 ⇒ 收敛（≤2 步）；溢出恒回落，
 *     输入框钉底不破（多行大消息场景由本环兜底——纯预算的 cap 是行数
 *     预算，消息单位换算不精确，实测环补齐）。
 *  3. 终端 resize → shrinkRows 归零重算（只重置不回涨，无振荡面）。
 *
 * 退化规则（钉②）：<5 行 degraded（原样渲染，零手术）；<20 行 fallback
 * （保底集：cap 0 消息区全归滚动区 + 流式块抑制，Messages 渲染
 * 「N 条已入滚动区」提示行）。
 *
 * 挂载点：FullscreenLayout 非全屏支（编译态文件最小插入——只把
 * {scrollable}{bottom} 包进本组件；overlay/modal 留在外层不参与测量）。
 */
import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react'

import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { Box, type DOMElement, measureElement } from '../ink.js'
import { computeViewportPlan, resolveRenderCap, type ViewportPlan, type ViewportRenderCap } from './viewportBudget.js'

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
  // 实测溢出收缩量（只增不减；resize 归零）。
  const [shrinkRows, setShrinkRows] = useState(0)

  const plan: ViewportPlan = computeViewportPlan(rows, bottomRows)
  const renderCap = resolveRenderCap(plan, shrinkRows)

  // resize → 收缩量归零（预算重算，溢出由测量环重新收敛）。
  useLayoutEffect(() => {
    setShrinkRows(0)
  }, [rows])

  // 预留行实测：bottom 槽（输入框/提示行/permission 卡等）高度。
  useLayoutEffect(() => {
    const node = bottomRef.current
    if (!node) return
    const h = measureElement(node).height
    setBottomRows(prev => (prev === h ? prev : h))
  }, [bottom])

  // 实测收缩环：整帧（消息区 + bottom + 提示行）> 视口 → 收缩消息区。
  // scrollable/bottom 身份每 REPL 渲染都新（流式 chunk 经 REPL state 落）
  // ⇒ 每 内容变化 帧复测一次；溢出 >0 才 setState（无环自激）。
  useLayoutEffect(() => {
    if (plan.mode !== 'compress') return
    const node = rootRef.current
    if (!node) return
    const h = measureElement(node).height
    const overflow = h - rows
    if (overflow > 0) {
      setShrinkRows(prev => prev + overflow + 1)
    }
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
