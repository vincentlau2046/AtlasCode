// P1a Decisions 页（spec 页 4 为什么）：最近 N 次权限判定——decisionLog
// ring buffer（useCanUseTool 收敛点记录，TUI 层加性，engine 零改动）+
// verdictLine 只读渲染（P0a 审批「为什么」行同款 formatter）。

import * as React from 'react'
import { useSyncExternalStore } from 'react'
import { Box, Text } from '../../../ink.js'
import { getDecisionLog, subscribeToDecisionLog } from '../../../utils/decisionLog.js'
import { verdictLine } from '../../permissions/permissionVerdict.js'
import { useAppState } from '../../../state/AppState.js'

const MAX_SHOWN = 10

const BADGE = {
  allow: { label: 'ALLOW', color: 'green' },
  ask: { label: 'ASK', color: 'yellow' },
  deny: { label: 'DENY', color: 'red' },
} as const

export function DecisionsPage(): React.ReactNode {
  const entries = useSyncExternalStore(subscribeToDecisionLog, getDecisionLog)
  const mode = useAppState(s => s.toolPermissionContext.mode)
  const shown = entries.slice(-MAX_SHOWN).reverse()
  if (shown.length === 0) {
    return <Text dimColor>暂无权限判定（随发生而记录）</Text>
  }
  return (
    <Box flexDirection="column">
      {shown.map((e, i) => (
        <Box key={i} flexDirection="column">
          <Text color={BADGE[e.behavior].color}>
            {`${BADGE[e.behavior].label} · ${e.toolName}`}
          </Text>
          <Text dimColor>{verdictLine(e.reason, mode) ?? '（无原因记录）'}</Text>
        </Box>
      ))}
    </Box>
  )
}
