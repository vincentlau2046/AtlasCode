/**
 * LocalShellTask 状态类型 + guard（旧仓 src/tasks/LocalShellTask/guards.ts 41L
 * 逐字随迁，S-7a）
 *
 * 旧仓分离理由（防非 React 消费者拖 React 进模块图）在新仓无 .tsx 面 →
 * 保留独立文件仅为域内分层清晰（killShellTasks / localShellTask / stopTask
 * 共享 guard，localAgentTask 反向消费 isLocalAgentTask 无循环）。
 *
 * 移植口径：AgentId（旧 types/ids brand）→ string（残余 ②，与
 * LocalShellSpawnInput.agentId 同口径）；ShellCommand 换 executor 域端口类型
 * （含 taskOutput 12 成员句柄）。
 */
import type { ShellCommand } from '../../../executor'
import type { TaskStateBase } from '../../../task'

export type BashTaskKind = 'bash' | 'monitor'

export type LocalShellTaskState = TaskStateBase & {
  type: 'local_bash' // Keep as 'local_bash' for backward compatibility with persisted session state
  command: string
  result?: {
    code: number
    interrupted: boolean
  }
  /** 旧仓附件支消费（delta 行号口径）——S-7a 附件生成面未迁，字段随状态形状保留。 */
  completionStatusSentInAttachment: boolean
  shellCommand: ShellCommand | null
  unregisterCleanup?: () => void
  cleanupTimeoutId?: NodeJS.Timeout
  // Track what we last reported for computing deltas (total lines from TaskOutput)
  lastReportedTotalLines: number
  // Whether the task has been backgrounded (false = foreground running, true = backgrounded)
  isBackgrounded: boolean
  // Agent that spawned this task. Used to kill orphaned bash tasks when the
  // agent exits (see killShellTasksForAgent). Undefined = main thread.
  agentId?: string
  // UI display variant. 'monitor' → shows description instead of command,
  // 'Monitor details' dialog title, distinct status bar pill.
  kind?: BashTaskKind
}

export function isLocalShellTask(task: unknown): task is LocalShellTaskState {
  return (
    typeof task === 'object' &&
    task !== null &&
    'type' in task &&
    task.type === 'local_bash'
  )
}
