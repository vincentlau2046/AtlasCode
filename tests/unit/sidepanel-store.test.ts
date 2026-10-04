/**
 * P1a 多页面侧栏布局态 store（spec §4 P1a）判别单测。
 * 被测：SidePanel store 纯逻辑（开/关 + 页切换 + diff 档切换 + 快照稳定性）。
 * 分层纪律：纯 UI 布局态（无网络/无盘/无 PTY/无 React 渲染——hook 面由 host 组件活探针覆盖）。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  getSidePanel,
  getSidePanelSnapshot,
  isSidePanelOpen,
  openSidePanel,
  closeSidePanel,
  setSidePanelPage,
  cycleSidePanelPage,
  toggleSidePanelDiffLayout,
  setSidePanelDiffLayout,
  resetSidePanelStore,
  subscribeToSidePanel,
} from '../../src/tui/components/SidePanel/store'
import { SIDE_PANEL_PAGES } from '../../src/tui/components/SidePanel/types'

describe('P1a SidePanel store', () => {
  beforeEach(() => {
    resetSidePanelStore()
  })

  test('初始态：关闭 + diff 页 + unified 档', () => {
    const s = getSidePanel()
    expect(s.open).toBe(false)
    expect(s.page).toBe('diff')
    expect(s.diffLayout).toBe('unified')
    expect(isSidePanelOpen()).toBe(false)
  })

  test('openSidePanel() 默认打开且保留当前页', () => {
    setSidePanelPage('budget')
    openSidePanel()
    const s = getSidePanel()
    expect(s.open).toBe(true)
    expect(s.page).toBe('budget')
  })

  test('openSidePanel(page) 直达页（信任线「为什么」→decisions /「还剩」→budget）', () => {
    openSidePanel('decisions')
    expect(getSidePanel().page).toBe('decisions')
    resetSidePanelStore()
    openSidePanel('budget')
    expect(getSidePanel().page).toBe('budget')
  })

  test('closeSidePanel 幂等（已关时 no-op）', () => {
    closeSidePanel()
    expect(isSidePanelOpen()).toBe(false)
    closeSidePanel()
    expect(isSidePanelOpen()).toBe(false)
  })

  test('setSidePanelPage 越界/重复 no-op', () => {
    setSidePanelPage('activity')
    expect(getSidePanel().page).toBe('activity')
    setSidePanelPage('activity')
    setSidePanelPage('nope' as never)
    expect(getSidePanel().page).toBe('activity')
  })

  test('cycleSidePanelPage 1-5 wrap-around（dir=1 / dir=-1）', () => {
    expect(SIDE_PANEL_PAGES).toEqual(['diff', 'plan', 'activity', 'decisions', 'budget'])
    cycleSidePanelPage(1)
    expect(getSidePanel().page).toBe('plan')
    cycleSidePanelPage(1)
    cycleSidePanelPage(1)
    cycleSidePanelPage(1)
    expect(getSidePanel().page).toBe('budget')
    cycleSidePanelPage(1)
    expect(getSidePanel().page).toBe('diff')
    cycleSidePanelPage(-1)
    expect(getSidePanel().page).toBe('budget')
  })

  test('toggleSidePanelDiffLayout unified ⇄ side-by-side 往返', () => {
    expect(getSidePanel().diffLayout).toBe('unified')
    toggleSidePanelDiffLayout()
    expect(getSidePanel().diffLayout).toBe('side-by-side')
    toggleSidePanelDiffLayout()
    expect(getSidePanel().diffLayout).toBe('unified')
  })

  test('setSidePanelDiffLayout 重复 no-op（快照引用稳定）', () => {
    const before = getSidePanelSnapshot()
    setSidePanelDiffLayout('unified')
    expect(getSidePanelSnapshot()).toBe(before)
  })

  test('变更发射 signal（订阅者可感知）+ 快照引用仅变更时换新', () => {
    let emitted = 0
    const unsub = subscribeToSidePanel(() => {
      emitted += 1
    })
    const s1 = getSidePanelSnapshot()
    openSidePanel()
    expect(emitted).toBe(1)
    expect(getSidePanelSnapshot()).not.toBe(s1)
    const s2 = getSidePanelSnapshot()
    closeSidePanel()
    expect(getSidePanelSnapshot()).not.toBe(s2)
    openSidePanel()
    unsub()
  })
})
