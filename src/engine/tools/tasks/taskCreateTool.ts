/**
 * engine/tools/tasks — TaskCreateTool 本体（§8.56 S-D3，任务工具本体子波
 * 4，Task 四件套 ①；49 口径 7/49）。
 *
 * 旧仓来源（a8af45b）：src/tools/TaskCreateTool/TaskCreateTool.ts 138L
 * 逐字随迁（input 4 字段 / output { task: { id, subject } } / call =
 * createTask + TaskCreated 钩子阻塞回滚支 + mapResult 成功行）。消费方 =
 * `tasks/` 子门面 + `tools/` 门面 re-export + 注册表 ⑯ isTodoV2 槽
 * （isEnabled = isTodoV2Enabled 自门控，组合根 baseTools 注入位）。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 多裁，函数体逐字；
 * 复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema) → 新 shared Tool 契约：inputSchema =
 *    纯 JSON schema 对象（TASK_CREATE_TOOL_INPUT_SCHEMA，S-B5 先例）；旧
 *    zod outputSchema（z.infer 推断 Output 型）→ TS 型 TaskCreateOutput
 *    承载文档面（引擎侧无 wire outputSchema 消费者，wire 面 = D 波前向
 *    接缝）。
 *  ② 旧 zod 类型约束（.string()/.record）不进 JSON schema（宽骨架面，
 *    S-C4 delta ② 先例）。
 *  ③ 旧 prompt() 成员 → 新契约唯一 prompt 面 description() = 旧 getPrompt()
 *    体（S-C5 delta ③ 先例）；旧短 DESCRIPTION 常量留 taskCreatePrompt.ts
 *    不接线（TUI 波前向接缝）。
 *  ④ 旧 buildTool TOOL_DEFAULTS 成员对象化（逐值）：isConcurrencySafe
 *    true / isReadOnly false（def 无覆写取默认）/ isDestructive false /
 *    maxResultSizeChars 100_000（def 体）/ shouldDefer true / searchHint
 *    'create a task in the task list' / userFacingName 'TaskCreate' /
 *    toAutoClassifierInput = input.subject（def 体）。
 *  ⑤ checkPermissions = 旧 buildTool 默认（{ behavior:'allow',
 *    updatedInput }，委托通用权限系统）显式固化；具体规则求值归 E-4/S-6b
 *    权限层统一消费（AgentTool passthrough 同族先例，本工具无路径面）。
 *  ⑥ 旧 call 9 参钩子执行器 executeTaskCreatedHooks（AsyncGenerator）→
 *    新 Promise 适配 runTaskCreatedHooks（S-D2 taskHooks ①②）：signal 经
 *    context duck abortController?.signal 透传 + sessionId 经 bootstrap
 *    门面 getSessionId()（旧 toolUseContext 解析职责，S-D2 delta ②）；
 *    旧 for-await 收集 blockingErrors 数组 → 新 AggregatedHookResult
 *    .blockingError 单值（runHooks 聚合面，末次钩子阻塞为准）→ 回滚
 *    deleteTask + throw 措辞逐字（getTaskCreatedHookMessage 单条）。
 *  ⑦ 旧 `context.setAppState(expandedView:'tasks')` 自动展开支 → 裁（新仓
 *    无 expandedView AppState 消费面，TUI 波前向接缝；AppState 族字段
 *    挂载归 D 波，engine/state 头注残留守同族）。
 *  ⑧ call 5 参声明 → 2 参声明（旧 canUseTool/_parentMessage/onProgress
 *    旧体不消费，裁，零行为；S-B5 delta ⑩ 先例）；context duck =
 *    TaskToolUseContext（taskToolInput.ts）。
 *  ⑨ 旧 import 重指：utils/tasks → ../../tasks（S-D2 已落）/
 *    utils/teammate → ../../messaging（getAgentName/getTeamName）/
 *    utils/hooks → ../../../hooks（taskHooks S-D2 已落）/
 *    ./constants → ../toolNames（值逐字同 'TaskCreate'）。
 *
 * 残留守（防「以为已全」）：真 ToolUseContext 全字段面（setAppState /
 *  expandedView / agentId）= 残留守（TUI 波/D 波）。
 */
import type {
  Tool,
  ToolInputJSONSchema,
  ToolResult,
  ToolResultBlockParam,
} from '../../../shared'
import { getSessionId } from '../../../bootstrap'
import { getAgentName, getTeamName } from '../../messaging'
import {
  createTask,
  deleteTask,
  getTaskListId,
  isTodoV2Enabled,
} from '../../tasks'
import { TASK_CREATE_TOOL_NAME } from '../toolNames'
import {
  getTaskCreatedHookMessage,
  runTaskCreatedHooks,
} from '../../../hooks'
import { getPrompt } from './taskCreatePrompt'
import type {
  TaskCreateToolInput,
  TaskToolUseContext,
} from './taskToolInput'

/**
 * 输入 JSON schema（旧仓 zod inputSchema 4 字段逐字段转写，delta ①/②；
 * 与 TaskCreateToolInput duck 型单一事实源逐字段对齐）。
 */
export const TASK_CREATE_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    subject: {
      type: 'string',
      description: 'A brief title for the task',
    },
    description: {
      type: 'string',
      description: 'What needs to be done',
    },
    activeForm: {
      type: 'string',
      description:
        'Present continuous form shown in spinner when in_progress (e.g., "Running tests")',
    },
    metadata: {
      type: 'object',
      additionalProperties: true,
      description: 'Arbitrary metadata to attach to the task',
    },
  },
  required: ['subject', 'description'],
}

/** 旧 zod outputSchema z.infer 型（delta ① TS 型承载）。 */
export type TaskCreateOutput = {
  task: {
    id: string
    subject: string
  }
}

export const TaskCreateTool: Tool = {
  name: TASK_CREATE_TOOL_NAME,
  inputSchema: TASK_CREATE_TOOL_INPUT_SCHEMA,
  inputJSONSchema: TASK_CREATE_TOOL_INPUT_SCHEMA,
  searchHint: 'create a task in the task list',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  isEnabled: () => isTodoV2Enabled(),
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ④，逐值）
  isConcurrencySafe: () => true,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: (input: unknown) =>
    (input as TaskCreateToolInput).subject,
  userFacingName: () => 'TaskCreate',
  // delta ⑤：旧 buildTool 默认显式固化（委托通用权限系统）
  checkPermissions: async (input: unknown) => ({
    behavior: 'allow',
    updatedInput: input,
  }),
  description: async () => getPrompt(),
  // delta ⑥/⑦/⑧：钩子 Promise 适配 + setAppState 支裁 + 2 参声明
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<TaskCreateOutput>> {
    const { subject, description, activeForm, metadata } =
      args as TaskCreateToolInput
    const ctx = context as TaskToolUseContext | undefined

    const taskId = await createTask(getTaskListId(), {
      subject,
      description,
      activeForm,
      status: 'pending',
      owner: undefined,
      blocks: [],
      blockedBy: [],
      metadata,
    })

    const hookResult = await runTaskCreatedHooks(
      taskId,
      subject,
      description,
      getAgentName(),
      getTeamName(),
      { signal: ctx?.abortController?.signal, sessionId: getSessionId() },
    )

    if (hookResult.blockingError) {
      await deleteTask(getTaskListId(), taskId)
      throw new Error(getTaskCreatedHookMessage(hookResult.blockingError))
    }

    return {
      data: {
        task: {
          id: taskId,
          subject,
        },
      },
    }
  },
  // delta ④：旧 UI 面 renderToolUseMessage() → null（无 React 面，TUI 波）
  renderToolUseMessage: () => null,
  mapToolResultToToolResultBlockParam(
    content: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    const { task } = content as TaskCreateOutput
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Task #${task.id} created successfully: ${task.subject}`,
    }
  },
}
