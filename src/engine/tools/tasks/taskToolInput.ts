/**
 * engine/tools/tasks — Task 四件套本体 duck 型（§8.56 S-D3，任务工具本体
 * 子波 4）+ TaskStop/TodoWrite 扩 2 件 duck 型（S-D4，文件尾块）+
 * TaskOutput 末件 duck 型（S-D5，文件尾块）。
 *
 * 旧仓来源（a8af45b）：zod inputSchema 推断型（TaskCreate 4 字段 /
 * TaskGet 1 字段 / TaskList 空 strictObject / TaskUpdate 9 字段）+
 * ToolUseContext 消费子集（TaskCreate/TaskUpdate call 消费
 * `context?.abortController?.signal` 传钩子执行器；旧 `context.setAppState`
 * 自动展开 expandedView 面 + `context.agentId` verification nudge 面裁，
 * 见各工具头注 delta）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - duck 型 = 类型位单一事实源（S-B5 bashToolInput / S-C4 filesToolInput
 *    先例）：新 shared Tool 契约 call 2 参（args: unknown / context:
 *    unknown），工具本体入口 cast 到本 duck 型；旧 zod 运行时校验层裁
 *    （纯 JSON schema 无 zod 运行时——status 字段旧 TaskStatusSchema
 *    enum 约束不进 JSON schema，ToolInputJSONSchema 宽骨架面，S-C4
 *    delta ② 先例；非法 status 值运行时走 updateTask 守卫面）。
 *  - TaskUpdateToolInput.status 含 'deleted' 特殊动作（旧仓
 *    TaskUpdateStatusSchema = TaskStatusSchema().or(z.literal('deleted'))
 *    逐字）；metadata = Record<string, unknown>（null 值 = 删 key 语义，
 *    call 入口合并支处理）。
 *  - TaskToolUseContext.getAppState/setAppState/agentId 全面 = 残留守
 *    （TUI 波/D 波真 ToolUseContext 全字段面；本波仅 signal 消费）。
 */
import type { TaskStatus, TodoList } from '../../tasks'
import type { SetAppState, TaskAppState } from '../../../task'

/** TaskCreate 输入（旧 zod 4 字段逐字段对齐）。 */
export interface TaskCreateToolInput {
  subject: string
  description: string
  activeForm?: string
  metadata?: Record<string, unknown>
}

/** TaskGet 输入（旧 zod 1 字段）。 */
export interface TaskGetToolInput {
  taskId: string
}

/** TaskList 输入（旧 zod 空 strictObject，无字段）。 */
export interface TaskListToolInput {
  [k: string]: never
}

/** TaskUpdate 输入（旧 zod 9 字段逐字段对齐；status 含 'deleted' 动作）。 */
export interface TaskUpdateToolInput {
  taskId: string
  subject?: string
  description?: string
  activeForm?: string
  status?: TaskStatus | 'deleted'
  owner?: string
  addBlocks?: string[]
  addBlockedBy?: string[]
  metadata?: Record<string, unknown>
}

/**
 * Task 族工具 context 消费子集（duck）：仅 `abortController?.signal`
 * （钩子执行器 HookRunOptions.signal 透传，S-D2 taskHooks delta ②③）。
 */
export interface TaskToolUseContext {
  abortController?: { signal: AbortSignal }
}

// ── S-D4（§8.56）：TaskStop + TodoWrite 扩 2 件 duck 型 ──

/** TaskStop 输入（旧 zod 2 可选字段；shell_id = 旧 KillShell 废弃别名位）。 */
export interface TaskStopToolInput {
  task_id?: string
  shell_id?: string
}

/**
 * TaskStop context 消费子集（duck）：结构化 = coordinator/tasks
 * stopTask 的 StopTaskContext（getAppState/setAppState 双函数，E-7 S-7a
 * 已落）；旧 call 5 参中 abortController 不消费（裁，S-B5 delta ⑩ 先例）。
 */
export interface TaskStopToolUseContext {
  getAppState: () => TaskAppState
  setAppState: SetAppState
}

/** TodoWrite 输入（旧 zod 1 字段 = TodoList；TodoItem 3 字段面见 schema）。 */
export interface TodoWriteToolInput {
  todos: TodoList
}

/**
 * TodoWrite AppState 消费子集（duck，残留守 ① 同族）：新仓 task 域
 * TaskAppState 仅 tasks 记录面（S-7a），todos 会话态 = 全量 AppState
 * 残留守（engine 波/D 波真 AppState 接入时整换）。duck 缺省零崩溃支
 * （todos 可选，S-C5 delta ⑭ 先例）。
 */
export interface TodoWriteAppState {
  todos?: Record<string, TodoList>
}

/**
 * TodoWrite context 消费子集（duck）：getAppState/setAppState（todos
 * 读写）+ agentId?（todoKey = agentId ?? getSessionId()，S-D1 §8.56.3
 * context duck 裁定）。
 */
export interface TodoWriteToolUseContext {
  getAppState: () => TodoWriteAppState
  setAppState: (f: (prev: TodoWriteAppState) => TodoWriteAppState) => void
  agentId?: string
}

// ── S-D5（§8.56）：TaskOutput 末件 duck 型 ──

/** TaskOutput 输入（旧 zod 3 字段；block/timeout 缺省位由 call 解构承旧 .default）。 */
export interface TaskOutputToolInput {
  task_id: string
  block?: boolean
  timeout?: number
}

/**
 * TaskOutput context 消费子集（duck）：getAppState（任务记录读，call /
 * validateInput / waitForTaskCompletion 轮询面）+ setAppState（notified
 * 标记 updateTaskState 面）+ abortController?（waitForTaskCompletion
 * 中断信号面，旧 5 参 call 消费位；异 S-D4 TaskStop 不消费位）。
 */
export interface TaskOutputToolUseContext {
  getAppState: () => TaskAppState
  setAppState: SetAppState
  abortController?: AbortController
}
