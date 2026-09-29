// 密度状态微 store——simple | detailed 两态
// 17-TUI设计方案 §9.1：ctrl+shift+b（app:toggleBrief）两态切换
// 独立于 AppState（避免高频重渲），走 useSyncExternalStore（先例 atlasCodeHints）

import { createSignal } from '../../../utils/signal.js'

export type StatusLineDensity = 'simple' | 'detailed'

let currentDensity: StatusLineDensity = 'simple'
const densityChanged = createSignal()

// hover 态：指针是否悬停在状态栏区（驱动右端「⌖ 切换视图」提示显隐）。
// 高频事件，独立于 density signal，避免 hover 抖动连带密度订阅者重渲。
let currentHover = false
const hoverChanged = createSignal()

export function getHover(): boolean {
  return currentHover
}

export function setHover(v: boolean): void {
  if (currentHover !== v) {
    currentHover = v
    hoverChanged.emit()
  }
}

export function getDensity(): StatusLineDensity {
  return currentDensity
}

export function setDensity(d: StatusLineDensity): void {
  if (currentDensity !== d) {
    currentDensity = d
    densityChanged.emit()
  }
}

/** 两态切换：simple ⇄ detailed（鼠标左键 / meta+d 共用） */
export function toggleDensity(): void {
  setDensity(currentDensity === 'simple' ? 'detailed' : 'simple')
}

export const subscribeToDensity = densityChanged.subscribe
export function getDensitySnapshot(): StatusLineDensity {
  return currentDensity
}

export const subscribeToHover = hoverChanged.subscribe
export function getHoverSnapshot(): boolean {
  return currentHover
}

/** 测试用重置 */
export function resetDensity(): void {
  currentDensity = 'simple'
  currentHover = false
  densityChanged.clear()
  hoverChanged.clear()
}
