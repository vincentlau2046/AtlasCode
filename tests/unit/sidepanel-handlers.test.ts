/**
 * P1a 抽屉键位 handlers（sidePanelHandlers）判别单测。
 * 被测：关闭时 close/←→/ctrl+shift+d 透传（return false，既有键行为零改动）；
 * 1-5 始终生效（打开+直达页，spec 门禁①）；打开时切页/关闭/切档。
 * 分层纪律：纯逻辑（store + handlers，无 React 渲染/无网络/无盘）。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  closeSidePanel,
  getSidePanel,
  isSidePanelOpen,
  openSidePanel,
  resetSidePanelStore,
  setSidePanelPage,
} from '../../src/tui/components/SidePanel/store'
import { createSidePanelHandlers } from '../../src/tui/components/SidePanel/sidePanelHandlers'

describe('P1a SidePanel handlers', () => {
  beforeEach(() => {
    resetSidePanelStore()
  })

  test('关闭时 close/←→/sbs 全透传（return false）', () => {
    const h = createSidePanelHandlers()
    expect(h['sidePanel:close']()).toBe(false)
    expect(h['sidePanel:nextPage']()).toBe(false)
    expect(h['sidePanel:prevPage']()).toBe(false)
    expect(h['sidePanel:toggleDiffLayout']()).toBe(false)
    expect(isSidePanelOpen()).toBe(false)
  })

  test('1-5 关闭时也生效：打开 + 直达对应页（spec 门禁①）', () => {
    const h = createSidePanelHandlers()
    h['sidePanel:openDecisions']()
    expect(isSidePanelOpen()).toBe(true)
    expect(getSidePanel().page).toBe('decisions')
    resetSidePanelStore()
    h['sidePanel:openBudget']()
    expect(getSidePanel().page).toBe('budget')
  })

  test('打开时 ←→ 循环切页（wrap-around）', () => {
    openSidePanel('diff')
    const h = createSidePanelHandlers()
    expect(h['sidePanel:nextPage']()).toBeUndefined()
    expect(getSidePanel().page).toBe('plan')
    h['sidePanel:prevPage']()
    h['sidePanel:prevPage']()
    expect(getSidePanel().page).toBe('budget') // diff ← prev = budget（wrap）
    h['sidePanel:nextPage']()
    expect(getSidePanel().page).toBe('diff')
  })

  test('打开时 Esc 关闭', () => {
    openSidePanel()
    const h = createSidePanelHandlers()
    expect(h['sidePanel:close']()).toBeUndefined()
    expect(isSidePanelOpen()).toBe(false)
  })

  test('ctrl+shift+d 仅 Diff 页生效（预算页 → 透传）', () => {
    openSidePanel('budget')
    const h = createSidePanelHandlers()
    expect(h['sidePanel:toggleDiffLayout']()).toBe(false)
    setSidePanelPage('diff')
    expect(getSidePanel().diffLayout).toBe('unified')
    expect(h['sidePanel:toggleDiffLayout']()).toBeUndefined()
    expect(getSidePanel().diffLayout).toBe('side-by-side')
  })

  test('closeSidePanel 幂等（handler 面二次 close 仍安全）', () => {
    openSidePanel()
    closeSidePanel()
    const h = createSidePanelHandlers()
    expect(h['sidePanel:close']()).toBe(false)
  })
})
