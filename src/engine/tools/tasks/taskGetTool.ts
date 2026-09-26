/**
 * engine/tools/tasks — TaskGetTool 本体（§8.56 S-D3，Task 四件套 ②；
 * 49 口径 8/49）。
 *
 * 旧仓来源（a8af45b）：src/tools/TaskGetTool/TaskGetTool.ts 128L 逐字随迁
 * （input 1 字段 / output { task: 6 字段投影 | null } / call = getTask +
 * 缺失态 null 支 / mapResult not-found + 全字段 + blocks/blockedBy 4 支）。
 * 消费方 = `tasks/` 子门面 + `tools/` 门面 re-export + 注册表 ⑯ isTodoV2
 * 槽（isEnabled = isTodoV2Enabled 自门控）。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 多裁，函数体逐字；
 * 复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema) → 新 shared Tool 契约：inputSchema =
 *    纯 JSON schema 对象（TASK_GET_TOOL_INPUT_SCHEMA）；旧 zod outputSchema
 *    （TaskStatusSchema 枚举位）→ TS 型 TaskGetOutput（status: TaskStatus
 *    经 ../../tasks 型承载）。
 *  ② 旧 prompt() 成员 → 新契约唯一 prompt 面 description() = 旧 PROMPT 体
 *    （S-C5 delta ③ 先例）；旧短 DESCRIPTION 常量留 taskGetPrompt.ts 不接线。
 *  ③ 旧 buildTool TOOL_DEFAULTS 成员对象化（逐值）：isConcurrencySafe
 *    true / isReadOnly true（def 体）/ isDestructive false /
 *    maxResultSizeChars 100_000 / shouldDefer true / searchHint
 *    'retrieve a task by ID' / userFacingName 'TaskGet' /
 *    toAutoClassifierInput = input.taskId（def 体）。
 *  ④ checkPermissions = 旧 buildTool 默认（{ behavior:'allow',
 *    updatedInput }，委托通用权限系统）显式固化（TaskCreate ⑤ 同族）。
 *  ⑤ call 5 参声明 → 1 参声明（旧 context/canUseTool/… 旧体不消费，裁，
 *    零行为；S-B5 delta ⑩ 先例）。
 *  ⑥ 旧 import 重指：utils/tasks → ../../tasks / ./constants →
 *    ../toolNames（值逐字同 'TaskGet'）。
 *
 * 残留守（防「以为已全」）：真 ToolUseContext 全字段面 = 残留守（TUI 波/D 波）。
 */
import type {
  Tool,
  ToolInputJSONSchema,
  ToolResult,
  ToolResultBlockParam,
} from '../../../shared'
import { getTask, getTaskListId, isTodoV2Enabled, type TaskStatus } from '../../tasks'
import { TASK_GET_TOOL_NAME } from '../toolNames'
import { PROMPT } from './taskGetPrompt'
import type { TaskGetToolInput } from './taskToolInput'

/**
 * 输入 JSON schema（旧仓 zod inputSchema 1 字段逐字段转写，delta ①/②；
 * 与 TaskGetToolInput duck 型单一事实源逐字段对齐）。
 */
export const TASK_GET_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    taskId: {
      type: 'string',
      description: 'The ID of the task to retrieve',
    },
  },
  required: ['taskId'],
}

/** 旧 zod outputSchema z.infer 型（delta ① TS 型承载）。 */
export type TaskGetOutput = {
  task: {
    id: string
    subject: string
    description: string
    status: TaskStatus
    blocks: string[]
    blockedBy: string[]
  } | null
}

export const TaskGetTool: Tool = {
  name: TASK_GET_TOOL_NAME,
  inputSchema: TASK_GET_TOOL_INPUT_SCHEMA,
  inputJSONSchema: TASK_GET_TOOL_INPUT_SCHEMA,
  searchHint: 'retrieve a task by ID',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  isEnabled: () => isTodoV2Enabled(),
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ③，逐值）
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  toAutoClassifierInput: (input: unknown) =>
    (input as TaskGetToolInput).taskId,
  userFacingName: () => 'TaskGet',
  // delta ④：旧 buildTool 默认显式固化（委托通用权限系统）
  checkPermissions: async (input: unknown) => ({
    behavior: 'allow',
    updatedInput: input,
  }),
  description: async () => PROMPT,
  // delta ⑤：1 参声明（旧 context 不消费）
  async call(args: unknown): Promise<ToolResult<TaskGetOutput>> {
    const { taskId } = args as TaskGetToolInput

    const taskListId = getTaskListId()

    const task = await getTask(taskListId, taskId)

    if (!task) {
      return {
        data: {
          task: null,
        },
      }
    }

    return {
      data: {
        task: {
          id: task.id,
          subject: task.subject,
          description: task.description,
          status: task.status,
          blocks: task.blocks,
          blockedBy: task.blockedBy,
        },
      },
    }
  },
  // delta ③：旧 UI 面 renderToolUseMessage() → null（无 React 面，TUI 波）
  renderToolUseMessage: () => null,
  mapToolResultToToolResultBlockParam(
    content: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    const { task } = content as TaskGetOutput
    if (!task) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: 'Task not found',
      }
    }

    const lines = [
      `Task #${task.id}: ${task.subject}`,
      `Status: ${task.status}`,
      `Description: ${task.description}`,
    ]

    if (task.blockedBy.length > 0) {
      lines.push(`Blocked by: ${task.blockedBy.map(id => `#${id}`).join(', ')}`)
    }
    if (task.blocks.length > 0) {
      lines.push(`Blocks: ${task.blocks.map(id => `#${id}`).join(', ')}`)
    }

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: lines.join('\n'),
    }
  },
}
