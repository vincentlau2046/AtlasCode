// P1a Plan 页（spec 页 2 目标 + 还差几步）：plan 文件（getPlan，/plan 同源）
// + 任务清单（useTasksV2，与主屏 TaskListV2 同 store，free 同步）。只读投影。

import * as React from 'react'
import { Box, Text } from '../../../ink.js'
import { getPlan, getPlanFilePath } from '../../../utils/plans.js'
import { useTasksV2WithCollapseEffect } from '../../../hooks/useTasksV2.js'

const STATUS_ICON: Record<string, string> = {
  pending: '○',
  in_progress: '▶',
  completed: '✓',
}

export function PlanPage(): React.ReactNode {
  const plan = getPlan()
  const tasks = useTasksV2WithCollapseEffect()
  const planLines = plan ? plan.trim().split('\n') : []
  const done = tasks ? tasks.filter(t => t.status === 'completed').length : 0
  return (
    <Box flexDirection="column">
      <Text bold>目标</Text>
      {plan ? (
        <Text dimColor>{planLines.slice(0, 6).join('\n')}</Text>
      ) : (
        <Text dimColor>（无 plan 文件 —— 尚未写入计划）</Text>
      )}
      <Text bold>
        {tasks && tasks.length > 0 ? `还差几步（${done}/${tasks.length} 完成）` : '还差几步'}
      </Text>
      {tasks && tasks.length > 0 ? (
        tasks.map((t, i) => (
          <Text
            key={i}
            color={t.status === 'in_progress' ? 'yellow' : undefined}
            dimColor={t.status === 'completed'}
          >
            {`${STATUS_ICON[t.status] ?? '·'} ${t.subject}`}
          </Text>
        ))
      ) : (
        <Text dimColor>（无任务 —— 尚未使用 TodoWrite）</Text>
      )}
      {plan ? <Text dimColor>{getPlanFilePath()}</Text> : null}
    </Box>
  )
}
