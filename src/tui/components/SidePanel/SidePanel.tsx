// P1a 多页面侧抽屉（spec §4 P1a）——消息流旁的 5 页 split 布局（不覆盖，
// spec 门禁①）。页签条（1-5）+ 当前页 + 底部键位提示。页数据全部只读投影
// （红线 2）；本组件只消费布局态（useSidePanel）+ 向页组件透传 messages。
//
// 渲染位置：REPL mainReturn 水平 Box 的右列（左列 = FullscreenLayout 消息流，
// flexGrow 占剩余宽；抽屉 40% 定宽）。关闭时返回 null → 布局零变化。

import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { useSidePanel } from './store.js'
import {
  SIDE_PANEL_PAGES,
  SIDE_PANEL_PAGE_LABELS,
  type SidePanelPage,
} from './types.js'
import type { Message } from '../../types/message.js'
import { DiffPage } from './pages/DiffPage.js'
import { PlanPage } from './pages/PlanPage.js'
import { ActivityPage } from './pages/ActivityPage.js'
import { DecisionsPage } from './pages/DecisionsPage.js'
import { BudgetPage } from './pages/BudgetPage.js'

export function SidePanelDrawer({ messages }: { messages: Message[] }): React.ReactNode {
  const panel = useSidePanel()
  if (!panel.open) return null
  const page: SidePanelPage = panel.page
  return (
    <Box flexDirection="column" width="40%" borderStyle="round" borderColor="gray">
      <Box flexDirection="row">
        {SIDE_PANEL_PAGES.map((p, i) => (
          <Text key={p} bold={p === page} dimColor={p !== page}>
            {`${i + 1} ${SIDE_PANEL_PAGE_LABELS[p]} `}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {page === 'diff' && <DiffPage />}
        {page === 'plan' && <PlanPage />}
        {page === 'activity' && <ActivityPage messages={messages} />}
        {page === 'decisions' && <DecisionsPage />}
        {page === 'budget' && <BudgetPage messages={messages} />}
      </Box>
      <Box flexDirection="row">
        <Text dimColor>Esc 关 · 1-5 页 · ←→ 切</Text>
        {page === 'diff' ? (
          <Text dimColor>
            {` · ctrl+shift+d ${panel.diffLayout === 'unified' ? '→side-by-side' : '→unified'}`}
          </Text>
        ) : null}
      </Box>
    </Box>
  )
}
