/**
 * SDK 事件队列（analytics 波 §8.69，末棒主项；旧仓 utils/sdkEventQueue.ts 134L
 * 逐字移植，delta 登记如下）。
 *
 * 语义（旧仓逐字）：SDK 事件仅在 headless/streaming（非交互）态入队，TUI 态
 * 早退（否则累积到 cap 永不被读）；队列 MAX 1000 溢出 shift；drainSdkEvents
 * 全取 + 逐条附 randomUUID + getSessionId。emitTaskTerminatedSdk =
 * task_notification 收尾 bookend（registerTask 恒发 task_started，此为对称收尾）。
 *
 * delta 登记（H6，复审勿当遗漏重提）：
 *   - 落点 = 与 task framework 共域（coordinator/tasks）；swarm 顶域经 engine
 *     根门面消费（L3 同型），in-domain framework/stopTask 兄弟直导。
 *   - 型面保真：旧 `SdkWorkflowProgress = any` 退化型 → `workflow_progress?:
 *     unknown[]`（any 语义保真去 lint 禁 any）。
 *   - 生产端 = 真可达（非空洞判据）：framework registerTask → task_started；
 *     stopTask / spawnInProcess / inProcessRunner 终态 → emitTaskTerminatedSdk
 *     （5 站点 rewire 见各文件 delta 头注）。
 *   - 消费端 = 前向接缝：旧 `drainSdkEvents` 唯一消费 = cli/print.ts 4 站点
 *     （headless 输出流）→ 新仓 CLI 波未落（cli/mount A 波骨架，D 波 N-1
 *     登记）→ drain 消费者随 CLI 波 print 路径接线，本波仅落队列 + 生产端。
 *   - task_progress / session_state_changed 子型 = 型面保留（wire 数据契约），
 *     生产端裁登记（task_progress 域 LocalWorkflowTask 随 S-7a 残留守 ④ 门随
 *     模块裁；session_state_changed 生产端 = print.ts，CLI 波前向）。
 *   - resetSdkEventQueueForTesting = 模块级队列对称复位（单进程连跑泄漏守卫
 *     先例同型，B13/4 复位面导出族）。
 */
import type { UUID } from 'crypto'
import { randomUUID } from 'crypto'
import { getIsNonInteractiveSession, getSessionId } from '../../../bootstrap'

// 旧仓 types/tools.ts `export type SdkWorkflowProgress = any` 退化型 →
// 本地最小面（delta 登记：any 语义保真去 lint 禁 any；producer 域裁后无消费）
type SdkWorkflowProgress = unknown

type TaskStartedEvent = {
  type: 'system'
  subtype: 'task_started'
  task_id: string
  tool_use_id?: string
  description: string
  task_type?: string
  workflow_name?: string
  prompt?: string
}

type TaskProgressEvent = {
  type: 'system'
  subtype: 'task_progress'
  task_id: string
  tool_use_id?: string
  description: string
  usage: {
    total_tokens: number
    tool_uses: number
    duration_ms: number
  }
  last_tool_name?: string
  summary?: string
  // Delta batch of workflow state changes. Clients upsert by
  // `${type}:${index}` then group by phaseIndex to rebuild the phase tree,
  // same fold as collectFromEvents + groupByPhase in PhaseProgress.tsx.
  workflow_progress?: SdkWorkflowProgress[]
}

// Emitted when a foreground agent completes without being backgrounded.
// Drained by drainSdkEvents() directly into the output stream — does NOT
// go through the print.ts XML task_notification parser and does NOT trigger
// the LLM loop. Consumers (e.g. VS Code session.ts) use this to remove the
// task from the subagent panel.
type TaskNotificationSdkEvent = {
  type: 'system'
  subtype: 'task_notification'
  task_id: string
  tool_use_id?: string
  status: 'completed' | 'failed' | 'stopped'
  output_file: string
  summary: string
  usage?: {
    total_tokens: number
    tool_uses: number
    duration_ms: number
  }
}

// Mirrors notifySessionStateChanged. The CCR bridge already receives this
// via its own listener; SDK consumers (scmuxd, VS Code) need the same signal
// to know when the main turn's generator is idle vs actively producing.
// The 'idle' transition fires AFTER heldBackResult flushes and the bg-agent
// do-while loop exits — so SDK consumers can trust it as the authoritative
// "turn is over" signal even when result was withheld for background agents.
type SessionStateChangedEvent = {
  type: 'system'
  subtype: 'session_state_changed'
  state: 'idle' | 'running' | 'requires_action'
}

export type SdkEvent =
  | TaskStartedEvent
  | TaskProgressEvent
  | TaskNotificationSdkEvent
  | SessionStateChangedEvent

const MAX_QUEUE_SIZE = 1000
const queue: SdkEvent[] = []

export function enqueueSdkEvent(event: SdkEvent): void {
  // SDK events are only consumed (drained) in headless/streaming mode.
  // In TUI mode they would accumulate up to the cap and never be read.
  if (!getIsNonInteractiveSession()) {
    return
  }
  if (queue.length >= MAX_QUEUE_SIZE) {
    queue.shift()
  }
  queue.push(event)
}

export function drainSdkEvents(): Array<
  SdkEvent & { uuid: UUID; session_id: string }
> {
  if (queue.length === 0) {
    return []
  }
  const events = queue.splice(0)
  return events.map(e => ({
    ...e,
    uuid: randomUUID(),
    session_id: getSessionId(),
  }))
}

/**
 * Emit a task_notification SDK event for a task reaching a terminal state.
 *
 * registerTask() always emits task_started; this is the closing bookend.
 * Call this from any exit path that sets a task terminal WITHOUT going
 * through enqueuePendingNotification-with-<task-id> (print.ts parses that
 * XML into the same SDK event, so paths that do both would double-emit).
 * Paths that suppress the XML notification (notified:true pre-set, kill
 * paths, abort branches) must call this directly so SDK consumers
 * (Scuttle's bg-task dot, VS Code subagent panel) see the task close.
 */
export function emitTaskTerminatedSdk(
  taskId: string,
  status: 'completed' | 'failed' | 'stopped',
  opts?: {
    toolUseId?: string
    summary?: string
    outputFile?: string
    usage?: { total_tokens: number; tool_uses: number; duration_ms: number }
  },
): void {
  enqueueSdkEvent({
    type: 'system',
    subtype: 'task_notification',
    task_id: taskId,
    tool_use_id: opts?.toolUseId,
    status,
    output_file: opts?.outputFile ?? '',
    summary: opts?.summary ?? '',
    usage: opts?.usage,
  })
}

/** 测试面：清空模块级队列（单进程连跑泄漏守卫；对称复位先例同型）。 */
export function resetSdkEventQueueForTesting(): void {
  queue.length = 0
}
