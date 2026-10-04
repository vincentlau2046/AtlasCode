// P1a 多页面侧栏布局态微 store（spec §4 P1a）——开/关 + 当前页 + diff 渲染档
//
// 先例：StatusLine densityStore.ts（模块级微 store + createSignal +
// useSyncExternalStore 消费，独立于 AppState 避免高频重渲）。页数据不入此
// store（各页组件自取只读投影）——本 store 只管抽屉布局态，变更频率 = 键击
// 级（打开/切页/切档/关闭），订阅者 = SidePanel host + 信任线直达段。
//
// 红线 2（只读投影，零回写主循环）：本 store 无任何 engine/modelprovider 依赖；
// 消费者（REPL split 布局 / 键位 handler / 信任线段）均为 tui 内。

import { useSyncExternalStore } from 'react'
import { createSignal } from '../../utils/signal.js'
import {
  SIDE_PANEL_PAGES,
  type SidePanelDiffLayout,
  type SidePanelPage,
  type SidePanelState,
} from './types.js'

const INITIAL: SidePanelState = {
  open: false,
  page: 'diff',
  diffLayout: 'unified',
}

let state: SidePanelState = INITIAL
const panelChanged = createSignal()

function set(next: SidePanelState): void {
  // 快照对象引用仅在变更时换新（useSyncExternalStore 稳定快照纪律）
  state = next
  panelChanged.emit()
}

export function getSidePanel(): SidePanelState {
  return state
}

export function isSidePanelOpen(): boolean {
  return state.open
}

/** 打开抽屉（可选直达页：信任线「为什么」→ decisions /「还剩」→ budget 一键直达）。 */
export function openSidePanel(page?: SidePanelPage): void {
  set({
    ...state,
    open: true,
    page: page && SIDE_PANEL_PAGES.includes(page) ? page : state.page,
  })
}

export function closeSidePanel(): void {
  if (!state.open) return
  set({ ...state, open: false })
}

export function setSidePanelPage(page: SidePanelPage): void {
  if (!SIDE_PANEL_PAGES.includes(page) || state.page === page) return
  set({ ...state, page })
}

/** ←→ 循环切页（wrap-around；dir=1 下一页 / dir=-1 上一页）。 */
export function cycleSidePanelPage(dir: 1 | -1): void {
  const idx = SIDE_PANEL_PAGES.indexOf(state.page)
  const next = SIDE_PANEL_PAGES[(idx + dir + SIDE_PANEL_PAGES.length) % SIDE_PANEL_PAGES.length]
  set({ ...state, page: next })
}

/** Diff 页渲染档切换：unified ⇄ side-by-side（P1a 唯一纯新增渲染，无数据丢失）。 */
export function toggleSidePanelDiffLayout(): void {
  const next: SidePanelDiffLayout = state.diffLayout === 'unified' ? 'side-by-side' : 'unified'
  set({ ...state, diffLayout: next })
}

export function setSidePanelDiffLayout(layout: SidePanelDiffLayout): void {
  if (state.diffLayout === layout) return
  set({ ...state, diffLayout: layout })
}

// ── useSyncExternalStore 消费面（先例 densityStore 的 subscribeToX/getXSnapshot）──
export const subscribeToSidePanel = panelChanged.subscribe
export function getSidePanelSnapshot(): SidePanelState {
  return state
}

/** 抽屉布局态 hook（SidePanel host / 信任线直达段 / 键位 handler 门控共用）。 */
export function useSidePanel(): SidePanelState {
  return useSyncExternalStore(subscribeToSidePanel, getSidePanelSnapshot, getSidePanelSnapshot)
}

/** 测试用重置（回初始态 + 清订阅）。 */
export function resetSidePanelStore(): void {
  state = INITIAL
  panelChanged.clear()
}
