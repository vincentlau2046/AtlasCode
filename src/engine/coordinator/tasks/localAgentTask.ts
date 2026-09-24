/**
 * LocalAgentTask — 后台 agent 任务态 + 进度追踪 + 通知（旧仓
 * src/tasks/LocalAgentTask/LocalAgentTask.tsx 695L 核心随迁，S-7a）
 *
 * 旧仓 .tsx 的 React 渲染面（CoordinatorTaskPanel 等）裁出——新仓无 .tsx 渲染
 * 层，本文件 = 纯状态机 + 通知构造 + 进度追踪。
 *
 * 裁剪登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - abortSpeculation（PromptSuggestion 投机缓存，旧仓 services/PromptSuggestion）
 *     未迁 → enqueueAgentNotification 内调用裁除（speculation 面随对应波落位）。
 *   - initTaskOutputAsSymlink(agentId, getAgentTranscriptPath(asAgentId(agentId)))
 *     整行裁除：getAgentTranscriptPath 属 sessionStorage（S-7d session 波未迁）；
 *     输出文件由 executor/TaskOutput spawn 时创建，symlink→transcript 面待 S-7d。
 *   - updateAgentSummary 尾部 emitTaskProgress（SDK 进度事件，
 *     getSdkAgentProgressSummariesEnabled 门控）裁除 → captured 局部变量随之
 *     死代码化删除（SDK 波未迁）。
 *   - updateProgressFromMessage 的 getToolSearchOrReadInfo（旧仓
 *     collapseReadSearch 未迁）→ isSearch/isRead 恒 undefined（字段保留防
 *     消费点缺字段）；`tools` 参保留签名位（_tools，前向消费点接线时启用）。
 *   - createActivityDescriptionResolver：旧仓 findToolByName（name + aliases
 *     匹配）→ 本面仅 name 精确匹配；Tool 契约无 getActivityDescription 字段
 *     （工具本体波未落）→ 鸭子结构读取（前向接缝，非遗漏）。
 *   - enqueuePendingNotification → 域内通知注入窗口 enqueueTaskNotification
 *     （messageQueueManager 全量队列随 S-7e messaging 波）。
 *   - AgentId brand → string（残余 ②，同 LocalShellSpawnInput.agentId 口径）。
 *   - AgentDefinition.agentType 新仓为必填 string（旧仓 optional + ?? 兜底）
 *     → `?? 'general-purpose'` 死支删除。
 *   - 消息面窄化：新仓 shared Message 为松散类型（message?: unknown）→
 *     inner cast（usage/content 双源兜底，agentToolUtils messageBlocks 同式）；
 *     Usage 各计数字段全部 optional → 计账 ?? 0 守卫（旧仓强类型下无守卫）。
 */
import type { Message, Tools, Usage } from '../../../shared'
import {
  createTaskStateBase,
  evictTaskOutput,
  getTaskOutputPath,
  type SetAppState,
  type Task,
  type TaskAppState,
  type TaskStateBase,
} from '../../../task'
import type { AgentDefinition } from '../../tools/agent/agentDefinition'
import type { AgentToolResult } from '../../tools/agent/agentToolUtils'
import { SYNTHETIC_OUTPUT_TOOL_NAME } from '../../tools/toolNames'
import {
  createAbortController,
  createChildAbortController,
} from './abortController'
import { registerCleanup } from './cleanupRegistry'
import { PANEL_GRACE_MS, registerTask, updateTaskState } from './framework'
import { enqueueTaskNotification } from './notification'
import type { TaskState } from './types'
import {
  escapeXml,
  OUTPUT_FILE_TAG,
  STATUS_TAG,
  SUMMARY_TAG,
  TASK_ID_TAG,
  TASK_NOTIFICATION_TAG,
  TOOL_USE_ID_TAG,
  WORKTREE_BRANCH_TAG,
  WORKTREE_PATH_TAG,
  WORKTREE_TAG,
} from './xml'

export type ToolActivity = {
  toolName: string
  input: Record<string, unknown>
  /** Pre-computed activity description from the tool, e.g. "Reading src/foo.ts" */
  activityDescription?: string
  /** Pre-computed: true if this is a search operation (Grep, Glob, etc.) */
  isSearch?: boolean
  /** Pre-computed: true if this is a read operation (Read, cat, etc.) */
  isRead?: boolean
}
export type AgentProgress = {
  toolUseCount: number
  tokenCount: number
  lastActivity?: ToolActivity
  recentActivities?: ToolActivity[]
  summary?: string
}
const MAX_RECENT_ACTIVITIES = 5
export type ProgressTracker = {
  toolUseCount: number
  // Track input and output separately to avoid double-counting.
  // input_tokens in Claude API is cumulative per turn (includes all previous context),
  // so we keep the latest value. output_tokens is per-turn, so we sum those.
  latestInputTokens: number
  cumulativeOutputTokens: number
  recentActivities: ToolActivity[]
}
export function createProgressTracker(): ProgressTracker {
  return {
    toolUseCount: 0,
    latestInputTokens: 0,
    cumulativeOutputTokens: 0,
    recentActivities: [],
  }
}
export function getTokenCountFromTracker(tracker: ProgressTracker): number {
  return tracker.latestInputTokens + tracker.cumulativeOutputTokens
}

/**
 * Resolver function that returns a human-readable activity description
 * for a given tool name and input. Used to pre-compute descriptions
 * from Tool.getActivityDescription() at recording time.
 */
export type ActivityDescriptionResolver = (
  toolName: string,
  input: Record<string, unknown>,
) => string | undefined

export function updateProgressFromMessage(
  tracker: ProgressTracker,
  message: Message,
  resolveActivityDescription?: ActivityDescriptionResolver,
  _tools?: Tools,
): void {
  if (message.type !== 'assistant') {
    return
  }
  // 新仓 shared Message 松散（message?: unknown）→ 内层 API 响应窄化 cast；
  // 顶层 usage 兜底（flat 形态消息）。
  const inner = (message.message ?? {}) as {
    usage?: Usage
    content?: Array<{
      type: string
      name?: string
      input?: unknown
      [key: string]: unknown
    }>
  }
  const usage = inner.usage ?? message.usage
  // Keep latest input (it's cumulative in the API), sum outputs
  // （新仓 Usage 全字段 optional → ?? 0 守卫。）
  if (usage) {
    tracker.latestInputTokens =
      (usage.input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0)
    tracker.cumulativeOutputTokens += usage.output_tokens ?? 0
  }
  for (const block of inner.content ?? []) {
    if (block.type === 'tool_use') {
      tracker.toolUseCount++
      // Omit StructuredOutput from preview - it's an internal tool
      // 前导 block.name !== undefined 守卫 = 对宽松 Message 铸形的防御
      // （旧仓 content.name !== SYNTHETIC…；良构消息行为等价，头注登记）。
      if (block.name !== undefined && block.name !== SYNTHETIC_OUTPUT_TOOL_NAME) {
        const input = (block.input ?? {}) as Record<string, unknown>
        tracker.recentActivities.push({
          toolName: block.name,
          input,
          activityDescription: resolveActivityDescription?.(block.name, input),
          // 旧仓 getToolSearchOrReadInfo 分类（collapseReadSearch 未迁）→ 恒
          // undefined（头注登记）；字段保留防消费点缺字段。
          isSearch: undefined,
          isRead: undefined,
        })
      }
    }
  }
  while (tracker.recentActivities.length > MAX_RECENT_ACTIVITIES) {
    tracker.recentActivities.shift()
  }
}
export function getProgressUpdate(tracker: ProgressTracker): AgentProgress {
  return {
    toolUseCount: tracker.toolUseCount,
    tokenCount: getTokenCountFromTracker(tracker),
    lastActivity:
      tracker.recentActivities.length > 0
        ? tracker.recentActivities[tracker.recentActivities.length - 1]
        : undefined,
    recentActivities: [...tracker.recentActivities],
  }
}

/**
 * Creates an ActivityDescriptionResolver from a tools list.
 * Looks up the tool by name and calls getActivityDescription if available.
 * （旧仓 findToolByName 精确名 + aliases 匹配 → 本面仅 name 精确匹配；
 * Tool 契约无 getActivityDescription → 鸭子结构读取，头注登记。）
 */
export function createActivityDescriptionResolver(
  tools: Tools,
): ActivityDescriptionResolver {
  return (toolName, input) => {
    const tool = tools.find(t => t.name === toolName)
    const activity = (
      tool as {
        getActivityDescription?: (
          input: Record<string, unknown>,
        ) => string | undefined
      } | undefined
    )?.getActivityDescription
    return activity?.(input)
  }
}
export type LocalAgentTaskState = TaskStateBase & {
  type: 'local_agent'
  agentId: string
  prompt: string
  selectedAgent?: AgentDefinition
  agentType: string
  model?: string
  abortController?: AbortController
  unregisterCleanup?: () => void
  error?: string
  result?: AgentToolResult
  progress?: AgentProgress
  retrieved: boolean
  messages?: Message[]
  // Track what we last reported for computing deltas
  lastReportedToolCount: number
  lastReportedTokenCount: number
  // Whether the task has been backgrounded (false = foreground running, true = backgrounded)
  isBackgrounded: boolean
  // Messages queued mid-turn via SendMessage, drained at tool-round boundaries
  pendingMessages: string[]
  // UI is holding this task: blocks eviction, enables stream-append, triggers
  // disk bootstrap. Set by enterTeammateView. Separate from viewingAgentTaskId
  // (which is "what am I LOOKING at") — retain is "what am I HOLDING."
  retain: boolean
  // Bootstrap has read the sidechain JSONL and UUID-merged into messages.
  // One-shot per retain cycle; stream appends from there.
  diskLoaded: boolean
  // Panel visibility deadline. undefined = no deadline (running or retained);
  // timestamp = hide + GC-eligible after this time. Set at terminal transition
  // and on unselect; cleared on retain.
  evictAfter?: number
}
export function isLocalAgentTask(task: unknown): task is LocalAgentTaskState {
  return (
    typeof task === 'object' &&
    task !== null &&
    'type' in task &&
    task.type === 'local_agent'
  )
}

/**
 * A local_agent task that the CoordinatorTaskPanel manages (not main-session).
 * For ants, these render in the panel instead of the background-task pill.
 * This is the ONE predicate that all pill/panel filters must agree on — if
 * the gate changes, change it here.
 */
export function isPanelAgentTask(t: unknown): t is LocalAgentTaskState {
  return isLocalAgentTask(t) && t.agentType !== 'main-session'
}
export function queuePendingMessage(
  taskId: string,
  msg: string,
  setAppState: SetAppState,
): void {
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => ({
    ...task,
    pendingMessages: [...task.pendingMessages, msg],
  }))
}

/**
 * Append a message to task.messages so it appears in the viewed transcript
 * immediately. Caller constructs the Message (breaks the messages.ts cycle).
 * queuePendingMessage and resumeAgentBackground route the prompt to the
 * agent's API input but don't touch the display.
 */
export function appendMessageToLocalAgent(
  taskId: string,
  message: Message,
  setAppState: SetAppState,
): void {
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => ({
    ...task,
    messages: [...(task.messages ?? []), message],
  }))
}
export function drainPendingMessages(
  taskId: string,
  getAppState: () => TaskAppState,
  setAppState: SetAppState,
): string[] {
  const task = getAppState().tasks[taskId]
  if (!isLocalAgentTask(task) || task.pendingMessages.length === 0) {
    return []
  }
  const drained = task.pendingMessages
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, t => ({
    ...t,
    pendingMessages: [],
  }))
  return drained
}

/**
 * Enqueue an agent notification to the message queue.
 */
export function enqueueAgentNotification({
  taskId,
  description,
  status,
  error,
  setAppState,
  finalMessage,
  usage,
  toolUseId,
  worktreePath,
  worktreeBranch,
}: {
  taskId: string
  description: string
  status: 'completed' | 'failed' | 'killed'
  error?: string
  setAppState: SetAppState
  finalMessage?: string
  usage?: {
    totalTokens: number
    toolUses: number
    durationMs: number
  }
  toolUseId?: string
  worktreePath?: string
  worktreeBranch?: string
}): void {
  // Atomically check and set notified flag to prevent duplicate notifications.
  // If the task was already marked as notified (e.g., by TaskStopTool), skip
  // enqueueing to avoid sending redundant messages to the model.
  let shouldEnqueue = false
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => {
    if (task.notified) {
      return task
    }
    shouldEnqueue = true
    return {
      ...task,
      notified: true,
    }
  })
  if (!shouldEnqueue) {
    return
  }

  // 旧仓 abortSpeculation(setAppState) 裁除（PromptSuggestion 未迁，头注登记）——
  // background 任务态变更后投机结果失效的语义随 speculation 面落位复核。
  const escapedDescription = escapeXml(description)
  const summary =
    status === 'completed'
      ? `Agent "${escapedDescription}" completed`
      : status === 'failed'
        ? `Agent "${escapedDescription}" failed: ${escapeXml(error || 'Unknown error')}`
        : `Agent "${escapedDescription}" was stopped`
  const outputPath = getTaskOutputPath(taskId)
  const toolUseIdLine = toolUseId
    ? `\n<${TOOL_USE_ID_TAG}>${escapeXml(toolUseId)}</${TOOL_USE_ID_TAG}>`
    : ''
  const resultSection = finalMessage
    ? `\n<result>${escapeXml(finalMessage)}</result>`
    : ''
  const usageSection = usage
    ? `\n<usage><total_tokens>${usage.totalTokens}</total_tokens><tool_uses>${usage.toolUses}</tool_uses><duration_ms>${usage.durationMs}</duration_ms></usage>`
    : ''
  const worktreeSection = worktreePath
    ? `\n<${WORKTREE_TAG}><${WORKTREE_PATH_TAG}>${escapeXml(worktreePath)}</${WORKTREE_PATH_TAG}>${worktreeBranch ? `<${WORKTREE_BRANCH_TAG}>${escapeXml(worktreeBranch)}</${WORKTREE_BRANCH_TAG}>` : ''}</${WORKTREE_TAG}>`
    : ''
  const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${escapeXml(taskId)}</${TASK_ID_TAG}>${toolUseIdLine}
<${OUTPUT_FILE_TAG}>${escapeXml(outputPath)}</${OUTPUT_FILE_TAG}>
<${STATUS_TAG}>${status}</${STATUS_TAG}>
<${SUMMARY_TAG}>${summary}</${SUMMARY_TAG}>${resultSection}${usageSection}${worktreeSection}
</${TASK_NOTIFICATION_TAG}>`
  enqueueTaskNotification({
    value: message,
    mode: 'task-notification',
  })
}

/**
 * LocalAgentTask - Handles background agent execution.
 *
 * Replaces the AsyncAgent implementation from src/tools/AgentTool/asyncAgentUtils.ts
 * with a unified Task interface.
 */
export const LocalAgentTask: Task = {
  name: 'LocalAgentTask',
  type: 'local_agent',
  async kill(taskId, setAppState) {
    killAsyncAgent(taskId, setAppState)
  },
}

/**
 * Kill an agent task. No-op if already killed/completed.
 */
export function killAsyncAgent(taskId: string, setAppState: SetAppState): void {
  let killed = false
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') {
      return task
    }
    killed = true
    task.abortController?.abort()
    task.unregisterCleanup?.()
    return {
      ...task,
      status: 'killed',
      endTime: Date.now(),
      evictAfter: task.retain ? undefined : Date.now() + PANEL_GRACE_MS,
      abortController: undefined,
      unregisterCleanup: undefined,
      selectedAgent: undefined,
    }
  })
  if (killed) {
    void evictTaskOutput(taskId)
  }
}

/**
 * Kill all running agent tasks.
 * Used by ESC cancellation in coordinator mode to stop all subagents.
 */
export function killAllRunningAgentTasks(
  tasks: Record<string, TaskState>,
  setAppState: SetAppState,
): void {
  for (const [taskId, task] of Object.entries(tasks)) {
    if (task.type === 'local_agent' && task.status === 'running') {
      killAsyncAgent(taskId, setAppState)
    }
  }
}

/**
 * Mark a task as notified without enqueueing a notification.
 * Used by chat:killAgents bulk kill to suppress per-agent async notifications
 * when a single aggregate message is sent instead.
 */
export function markAgentsNotified(taskId: string, setAppState: SetAppState): void {
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => {
    if (task.notified) {
      return task
    }
    return {
      ...task,
      notified: true,
    }
  })
}

/**
 * Update progress for an agent task.
 * Preserves the existing summary field so that background summarization
 * results are not clobbered by progress updates from assistant messages.
 */
export function updateAgentProgress(
  taskId: string,
  progress: AgentProgress,
  setAppState: SetAppState,
): void {
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') {
      return task
    }
    const existingSummary = task.progress?.summary
    return {
      ...task,
      progress: existingSummary
        ? {
            ...progress,
            summary: existingSummary,
          }
        : progress,
    }
  })
}

/**
 * Update the background summary for an agent task.
 * Called by the periodic summarization service to store a 1-2 sentence progress summary.
 * （旧仓尾部 emitTaskProgress SDK 支裁除，头注登记。）
 */
export function updateAgentSummary(
  taskId: string,
  summary: string,
  setAppState: SetAppState,
): void {
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') {
      return task
    }
    return {
      ...task,
      progress: {
        ...task.progress,
        toolUseCount: task.progress?.toolUseCount ?? 0,
        tokenCount: task.progress?.tokenCount ?? 0,
        summary,
      },
    }
  })
}

/**
 * Complete an agent task with result.
 */
export function completeAgentTask(
  result: AgentToolResult,
  setAppState: SetAppState,
): void {
  const taskId = result.agentId
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') {
      return task
    }
    task.unregisterCleanup?.()
    return {
      ...task,
      status: 'completed',
      result,
      endTime: Date.now(),
      evictAfter: task.retain ? undefined : Date.now() + PANEL_GRACE_MS,
      abortController: undefined,
      unregisterCleanup: undefined,
      selectedAgent: undefined,
    }
  })
  void evictTaskOutput(taskId)
  // Note: Notification is sent by AgentTool via enqueueAgentNotification
}

/**
 * Fail an agent task with error.
 */
export function failAgentTask(
  taskId: string,
  error: string,
  setAppState: SetAppState,
): void {
  updateTaskState<LocalAgentTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') {
      return task
    }
    task.unregisterCleanup?.()
    return {
      ...task,
      status: 'failed',
      error,
      endTime: Date.now(),
      evictAfter: task.retain ? undefined : Date.now() + PANEL_GRACE_MS,
      abortController: undefined,
      unregisterCleanup: undefined,
      selectedAgent: undefined,
    }
  })
  void evictTaskOutput(taskId)
  // Note: Notification is sent by AgentTool via enqueueAgentNotification
}

/**
 * Register an agent task.
 * Called by AgentTool to create a new background agent.
 *
 * @param parentAbortController - Optional parent abort controller. If provided,
 *   the agent's abort controller will be a child that auto-aborts when parent aborts.
 *   This ensures subagents are aborted when their parent (e.g., in-process teammate) aborts.
 */
export function registerAsyncAgent({
  agentId,
  description,
  prompt,
  selectedAgent,
  setAppState,
  parentAbortController,
  toolUseId,
}: {
  agentId: string
  description: string
  prompt: string
  selectedAgent: AgentDefinition
  setAppState: SetAppState
  parentAbortController?: AbortController
  toolUseId?: string
}): LocalAgentTaskState {
  // 旧仓 `void initTaskOutputAsSymlink(agentId, getAgentTranscriptPath(asAgentId(agentId)))`
  // 裁除（getAgentTranscriptPath 属 sessionStorage，S-7d session 波未迁；
  // symlink 面待 S-7d，头注登记）。

  // Create abort controller - if parent provided, create child that auto-aborts with parent
  const abortController = parentAbortController
    ? createChildAbortController(parentAbortController)
    : createAbortController()
  const taskState: LocalAgentTaskState = {
    ...createTaskStateBase(agentId, 'local_agent', description, toolUseId),
    type: 'local_agent',
    status: 'running',
    agentId,
    prompt,
    selectedAgent,
    agentType: selectedAgent.agentType,
    abortController,
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: true,
    // registerAsyncAgent immediately backgrounds
    pendingMessages: [],
    retain: false,
    diskLoaded: false,
  }

  // Register cleanup handler
  const unregisterCleanup = registerCleanup(async () => {
    killAsyncAgent(agentId, setAppState)
  })
  taskState.unregisterCleanup = unregisterCleanup

  // Register task in AppState
  registerTask(taskState, setAppState)
  return taskState
}

// Map of taskId -> resolve function for background signals
// When backgroundAgentTask is called, it resolves the corresponding promise
const backgroundSignalResolvers = new Map<string, () => void>()

/**
 * Register a foreground agent task that could be backgrounded later.
 * Called when an agent has been running long enough to show the BackgroundHint.
 * @returns object with taskId and backgroundSignal promise
 */
export function registerAgentForeground({
  agentId,
  description,
  prompt,
  selectedAgent,
  setAppState,
  autoBackgroundMs,
  toolUseId,
}: {
  agentId: string
  description: string
  prompt: string
  selectedAgent: AgentDefinition
  setAppState: SetAppState
  autoBackgroundMs?: number
  toolUseId?: string
}): {
  taskId: string
  backgroundSignal: Promise<void>
  cancelAutoBackground?: () => void
} {
  // initTaskOutputAsSymlink 同 registerAsyncAgent 裁除（头注登记）。
  const abortController = createAbortController()
  const unregisterCleanup = registerCleanup(async () => {
    killAsyncAgent(agentId, setAppState)
  })
  const taskState: LocalAgentTaskState = {
    ...createTaskStateBase(agentId, 'local_agent', description, toolUseId),
    type: 'local_agent',
    status: 'running',
    agentId,
    prompt,
    selectedAgent,
    agentType: selectedAgent.agentType,
    abortController,
    unregisterCleanup,
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: false,
    // Not yet backgrounded - running in foreground
    pendingMessages: [],
    retain: false,
    diskLoaded: false,
  }

  // Create background signal promise
  let resolveBackgroundSignal: () => void
  const backgroundSignal = new Promise<void>(resolve => {
    resolveBackgroundSignal = resolve
  })
  backgroundSignalResolvers.set(agentId, resolveBackgroundSignal!)
  registerTask(taskState, setAppState)

  // Auto-background after timeout if configured
  let cancelAutoBackground: (() => void) | undefined
  if (autoBackgroundMs !== undefined && autoBackgroundMs > 0) {
    const timer = setTimeout(
      (setAppState, agentId) => {
        // Mark task as backgrounded and resolve the signal
        setAppState(prev => {
          const prevTask = prev.tasks[agentId]
          if (!isLocalAgentTask(prevTask) || prevTask.isBackgrounded) {
            return prev
          }
          return {
            ...prev,
            tasks: {
              ...prev.tasks,
              [agentId]: {
                ...prevTask,
                isBackgrounded: true,
              },
            },
          }
        })
        const resolver = backgroundSignalResolvers.get(agentId)
        if (resolver) {
          resolver()
          backgroundSignalResolvers.delete(agentId)
        }
      },
      autoBackgroundMs,
      setAppState,
      agentId,
    )
    cancelAutoBackground = () => clearTimeout(timer)
  }
  return {
    taskId: agentId,
    backgroundSignal,
    cancelAutoBackground,
  }
}

/**
 * Background a specific foreground agent task.
 * @returns true if backgrounded successfully, false otherwise
 */
export function backgroundAgentTask(
  taskId: string,
  getAppState: () => TaskAppState,
  setAppState: SetAppState,
): boolean {
  const state = getAppState()
  const task = state.tasks[taskId]
  if (!isLocalAgentTask(task) || task.isBackgrounded) {
    return false
  }

  // Update state to mark as backgrounded
  setAppState(prev => {
    const prevTask = prev.tasks[taskId]
    if (!isLocalAgentTask(prevTask)) {
      return prev
    }
    return {
      ...prev,
      tasks: {
        ...prev.tasks,
        [taskId]: {
          ...prevTask,
          isBackgrounded: true,
        },
      },
    }
  })

  // Resolve the background signal to interrupt the agent loop
  const resolver = backgroundSignalResolvers.get(taskId)
  if (resolver) {
    resolver()
    backgroundSignalResolvers.delete(taskId)
  }
  return true
}

/**
 * Unregister a foreground agent task when the agent completes without being backgrounded.
 */
export function unregisterAgentForeground(
  taskId: string,
  setAppState: SetAppState,
): void {
  // Clean up the background signal resolver
  backgroundSignalResolvers.delete(taskId)
  let cleanupFn: (() => void) | undefined
  setAppState(prev => {
    const task = prev.tasks[taskId]
    // Only remove if it's a foreground task (not backgrounded)
    if (!isLocalAgentTask(task) || task.isBackgrounded) {
      return prev
    }

    // Capture cleanup function to call outside of updater
    cleanupFn = task.unregisterCleanup
    const {
      [taskId]: _removed,
      ...rest
    } = prev.tasks
    return {
      ...prev,
      tasks: rest,
    }
  })

  // Call cleanup outside of the state updater (avoid side effects in updater)
  cleanupFn?.()
}
