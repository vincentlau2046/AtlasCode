// P1a 抽屉键位动作 handlers（纯工厂，无 React——判别单测可测；
// SidePanelKeybindings 组件经 useKeybindings 消费）。
//
// fall-through 约定（useKeybindings 文档）：handler 返回 false = 不消费，
// 键事件继续传给后续监听者（prompt 文本输入 / chat:cancel / 光标键等）；
// 返回 undefined = 消费（stopImmediatePropagation）。
//
// 抽屉关闭时：close/←→/ctrl+shift+d 全透传（既有键行为零改动）；1-5 是
// spec 门禁①「任一 tab 一键开页」→ 打开 + 直达页（始终生效，spec 钉死）。

import {
  closeSidePanel,
  cycleSidePanelPage,
  getSidePanel,
  isSidePanelOpen,
  openSidePanel,
  toggleSidePanelDiffLayout,
} from './store.js'

export function createSidePanelHandlers(): Record<string, () => void | false> {
  return {
    // 1-5 = 开 + 直达页（已开 = 切页；spec 页序 = tab 键序）
    'sidePanel:openDiff': () => openSidePanel('diff'),
    'sidePanel:openPlan': () => openSidePanel('plan'),
    'sidePanel:openActivity': () => openSidePanel('activity'),
    'sidePanel:openDecisions': () => openSidePanel('decisions'),
    'sidePanel:openBudget': () => openSidePanel('budget'),
    // ←→ 循环切页（仅打开时生效；关闭时透传给输入光标键）
    'sidePanel:nextPage': () => {
      if (!isSidePanelOpen()) return false
      cycleSidePanelPage(1)
    },
    'sidePanel:prevPage': () => {
      if (!isSidePanelOpen()) return false
      cycleSidePanelPage(-1)
    },
    // Esc 关（关闭时透传给 chat:cancel）
    'sidePanel:close': () => {
      if (!isSidePanelOpen()) return false
      closeSidePanel()
    },
    // ctrl+shift+d：Diff 页 unified ⇄ side-by-side（仅 Diff 页生效，其余透传）
    'sidePanel:toggleDiffLayout': () => {
      const s = getSidePanel()
      if (!s.open || s.page !== 'diff') return false
      toggleSidePanelDiffLayout()
    },
  }
}
