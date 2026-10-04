// /sidebar 命令（spec §4 P1a）：打开多页面侧抽屉（/sidebar <page> 直达页）。
// 抽屉本体由主布局的 SidePanelDrawer 渲染（split 布局，不覆盖消息流）；
// 本命令只触发 open + 页选择（store 动作），返回 null（无内联 modal）。

import * as React from 'react'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { openSidePanel } from '../../components/SidePanel/store.js'
import { resolveSidebarPage } from '../../components/SidePanel/types.js'

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  openSidePanel(resolveSidebarPage(args))
  onDone()
  return null
}
