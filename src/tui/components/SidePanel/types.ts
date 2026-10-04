// P1a 多页面侧栏（spec docs/tui-differentiation-spec.md §4 P1a）——类型面
//
// 5 页（spec 钉死顺序 = tab 键 1-5 序）：
//   1 变革 Diff     —— 你改了什么（unified 默认 + side-by-side 可选，唯一纯新增渲染）
//   2 计划 Plan     —— 目标 + 还差几步（TodoWrite/TaskList 数据）
//   3 活动 Activity —— 本回合工具调用清单 + 结果概览（消息流 tool_use 只读投影）
//   4 决策 Decisions—— 最近 N 次权限判定：放行/拦截 + why（信任线「为什么」直达页）
//   5 预算 Budget   —— 上下文 % / token 用量 / autoCompact 状态（信任线「还剩」直达页）
//
// 数据全部只读投影（红线 2：不回写主循环）；store 只管抽屉布局态
// （开/关 + 当前页 + diff 渲染档），页数据由各页组件自取，store 零业务数据。

/** 5 页枚举（spec 顺序 = tab 1-5 键序）。 */
export type SidePanelPage = 'diff' | 'plan' | 'activity' | 'decisions' | 'budget'

/** 抽屉内 Diff 页渲染档：unified（默认，延续 G1 #258 内联 diff）⇄ side-by-side（P1a 唯一纯新增渲染）。 */
export type SidePanelDiffLayout = 'unified' | 'side-by-side'

/** 抽屉布局态（纯 UI 状态，不含页数据）。 */
export interface SidePanelState {
  /** 抽屉是否打开（split 布局，与消息流同屏不覆盖）。 */
  open: boolean
  /** 当前页（tab 1-5 / ←→ 切换）。 */
  page: SidePanelPage
  /** Diff 页渲染档（仅 Diff 页生效）。 */
  diffLayout: SidePanelDiffLayout
}

/** spec 顺序 = tab 键 1-5 序。 */
export const SIDE_PANEL_PAGES: readonly SidePanelPage[] = [
  'diff',
  'plan',
  'activity',
  'decisions',
  'budget',
] as const

/** 页 → tab 键（'1'-'5'）。 */
export const SIDE_PANEL_PAGE_KEYS: Readonly<Record<SidePanelPage, string>> = {
  diff: '1',
  plan: '2',
  activity: '3',
  decisions: '4',
  budget: '5',
}

/** 页显示名（页签渲染 + 命令回执用）。 */
export const SIDE_PANEL_PAGE_LABELS: Readonly<Record<SidePanelPage, string>> = {
  diff: 'Diff',
  plan: 'Plan',
  activity: 'Activity',
  decisions: 'Decisions',
  budget: 'Budget',
}

/** /sidebar <arg> → 页（纯 resolver，判别单测可测；空/无效 → 默认 diff 页）。 */
export function resolveSidebarPage(args?: string): SidePanelPage {
  const a = (args ?? '').trim().toLowerCase()
  return (SIDE_PANEL_PAGES as readonly string[]).includes(a)
    ? (a as SidePanelPage)
    : 'diff'
}
