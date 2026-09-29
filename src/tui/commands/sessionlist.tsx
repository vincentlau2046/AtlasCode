// /sessionlist 斜杠命令——打开会话树管理列表
// 17-TUI设计方案 §9.3：替代 ctrl+t 键位

import * as React from 'react'
import type { ToolUseContext } from '../Tool.js'
import type {
  Command,
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../types/command.js'

export const sessionlist: Command = {
  type: 'local-jsx',
  name: 'sessionlist',
  description: 'Browse and manage sessions (fork / enter)',
  isEnabled: () => true,
  isHidden: false,
  aliases: [],
  immediate: true,
  load: () =>
    Promise.resolve({
      async call(
        onDone: LocalJSXCommandOnDone,
        context: ToolUseContext & LocalJSXCommandContext,
      ): Promise<React.ReactNode> {
        // 通过 AppState 中转切屏（LocalJSXCommandContext 无 setScreen）
        context.setAppState(prev => ({
          ...prev,
          pendingScreen: 'session-tree',
        }))
        onDone(null, { display: 'skip' })
        return null
      },
    }),
} satisfies Command
