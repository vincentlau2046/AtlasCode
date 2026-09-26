/**
 * engine/tools/tasks — Task 四件套本体 duck 型（§8.56 S-D3，任务工具本体
 * 子波 4）。
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
import type { TaskStatus } from '../../tasks'

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
