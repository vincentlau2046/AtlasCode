/**
 * P1a 抽屉键位 handlers（sidePanelHandlers）判别单测。
 * 被测：关闭时 close/←→/ctrl+shift+d 透传（return false，既有键行为零改动）；
 * 无模态时 1-5 始终生效（打开+直达页，spec 门禁①）；打开时切页/关闭/切档；
 * 0.1.23 P0a 回归修（红线③）：模态 overlay 激活时全键透传（cede，模态拥有键位）。
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

describe('P0a 回归修（0.1.23，红线③）：模态 overlay 激活时侧栏全键透传', () => {
  beforeEach(() => {
    resetSidePanelStore()
  })

  test('模态激活 + 抽屉关闭：1-5 不再开页（不再抢模态数字选）', () => {
    const h = createSidePanelHandlers({ isModalActive: true })
    for (const name of [
      'sidePanel:openDiff',
      'sidePanel:openPlan',
      'sidePanel:openActivity',
      'sidePanel:openDecisions',
      'sidePanel:openBudget',
    ]) {
      expect(h[name]()).toBe(false) // 透传 → 模态 ink useInput 数字选可接收
    }
    expect(isSidePanelOpen()).toBe(false) // 抽屉未被打开
  })

  test('模态激活 + 抽屉已开：close/←→/ctrl+shift+d 也全透传', () => {
    openSidePanel('diff')
    const h = createSidePanelHandlers({ isModalActive: true })
    expect(h['sidePanel:close']()).toBe(false)
    expect(h['sidePanel:nextPage']()).toBe(false)
    expect(h['sidePanel:prevPage']()).toBe(false)
    expect(h['sidePanel:toggleDiffLayout']()).toBe(false)
    // 状态未被动过：模态关闭后抽屉仍停在原页（渲染面 cede，状态面保全）
    expect(isSidePanelOpen()).toBe(true)
    expect(getSidePanel().page).toBe('diff')
    expect(getSidePanel().diffLayout).toBe('unified')
  })

  test('无模态（deps 缺省）：1-5 一键开页不变（spec 门禁① 未被回归修打掉）', () => {
    const h = createSidePanelHandlers()
    h['sidePanel:openPlan']()
    expect(isSidePanelOpen()).toBe(true)
    expect(getSidePanel().page).toBe('plan')
  })
})
