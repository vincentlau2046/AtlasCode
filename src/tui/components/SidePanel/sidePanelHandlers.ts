// P1a 抽屉键位动作 handlers（纯工厂，无 React——判别单测可测；
// SidePanelKeybindings 组件经 useKeybindings 消费）。
//
// fall-through 约定（useKeybindings 文档）：handler 返回 false = 不消费，
// 键事件继续传给后续监听者（prompt 文本输入 / chat:cancel / 光标键等）；
// 返回 undefined = 消费（stopImmediatePropagation）。
//
// 抽屉关闭时：close/←→/ctrl+shift+d 全透传（既有键行为零改动）；1-5 是
// spec 门禁①「任一 tab 一键开页」→ 打开 + 直达页（无模态时始终生效，spec 钉死）。
//
// 红线③键位不打仗（0.1.23 P0a 回归修）：模态 overlay 激活（权限弹框/模型选择
// 等 CustomSelect，经 useRegisterOverlay 注册为 modal overlay）时，侧栏**全键
// 透传**（cede）——模态拥有键位（数字选 1-3 / Esc 取消）。否则侧栏 1-5（本地
// 'SidePanel' context 恒入匹配栈，关闭态仍匹配开页）抢先消费、饿死模态 ink
// useInput 数字选（use-select-input parseInt）→ 审批批准卡死。无模态时保留
// 门禁①一键开页（不打掉 spec 功能）。

import {
  closeSidePanel,
  cycleSidePanelPage,
  getSidePanel,
  isSidePanelOpen,
  openSidePanel,
  toggleSidePanelDiffLayout,
} from './store.js'

/** createSidePanelHandlers 注入面（纯值，无 React）：SidePanelKeybindings 传
 *  `useIsModalOverlayActive()` 的读取值。缺省 = 无模态（旧行为，1-5 一键开页）。 */
export type SidePanelHandlerDeps = {
  /** 模态 overlay 激活 → 侧栏全键透传（模态拥有键位）。 */
  isModalActive?: boolean
}

export function createSidePanelHandlers(
  deps?: SidePanelHandlerDeps,
): Record<string, () => void | false> {
  // 模态激活时全键 cede（红线③）。闭包捕获注入值：SidePanelKeybindings 经
  // useMemo([modalActive]) 重建 handlers，模态开合时值刷新 → useKeybindings 重注册。
  const cede = () => deps?.isModalActive === true
  return {
    // 1-5 = 开 + 直达页（已开 = 切页；spec 页序 = tab 键序；无模态时生效）
    'sidePanel:openDiff': () => {
      if (cede()) return false
      return openSidePanel('diff')
    },
    'sidePanel:openPlan': () => {
      if (cede()) return false
      return openSidePanel('plan')
    },
    'sidePanel:openActivity': () => {
      if (cede()) return false
      return openSidePanel('activity')
    },
    'sidePanel:openDecisions': () => {
      if (cede()) return false
      return openSidePanel('decisions')
    },
    'sidePanel:openBudget': () => {
      if (cede()) return false
      return openSidePanel('budget')
    },
    // ←→ 循环切页（仅打开时生效；关闭/模态时透传给输入光标键）
    'sidePanel:nextPage': () => {
      if (cede()) return false
      if (!isSidePanelOpen()) return false
      cycleSidePanelPage(1)
    },
    'sidePanel:prevPage': () => {
      if (cede()) return false
      if (!isSidePanelOpen()) return false
      cycleSidePanelPage(-1)
    },
    // Esc 关（关闭/模态时透传给 chat:cancel / 模态取消）
    'sidePanel:close': () => {
      if (cede()) return false
      if (!isSidePanelOpen()) return false
      closeSidePanel()
    },
    // ctrl+shift+d：Diff 页 unified ⇄ side-by-side（仅 Diff 页生效，其余透传）
    'sidePanel:toggleDiffLayout': () => {
      if (cede()) return false
      const s = getSidePanel()
      if (!s.open || s.page !== 'diff') return false
      toggleSidePanelDiffLayout()
    },
  }
}
