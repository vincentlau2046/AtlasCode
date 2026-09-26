/**
 * engine/tools/tasks — TaskListTool 本体（§8.56 S-D3，Task 四件套 ③；
 * 49 口径 10/49）。
 *
 * 旧仓来源（a8af45b）：src/tools/TaskListTool/TaskListTool.ts 116L 逐字
 * 随迁（input 空 strictObject / output { tasks: 5 字段摘要 } / call =
 * listTasks + _internal 元数据过滤 + resolvedTaskIds 依赖过滤 / mapResult
 * 空集 + 行格式 2 支）。消费方 = `tasks/` 子门面 + `tools/` 门面
 * re-export + 注册表 ⑯ isTodoV2 槽（isEnabled = isTodoV2Enabled 自门控）。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 多裁，函数体逐字；
 * 复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod inputSchema 空 strictObject) → 新纯 JSON schema
 *    空对象（{ type:'object' }，无 properties/required；delta ② 同族）。
 *    旧 zod outputSchema → TS 型 TaskListOutput（status: TaskStatus 经
 *    ../../tasks 型承载）。
 *  ② 旧 prompt() 成员 → 新契约唯一 prompt 面 description() = 旧
 *    getPrompt() 体（isAgentSwarmsEnabled 双支逐字，S-C5 delta ③ 先例）；
 *    旧短 DESCRIPTION 常量留 taskListPrompt.ts 不接线。
 *  ③ 旧 buildTool TOOL_DEFAULTS 成员对象化（逐值）：isConcurrencySafe
 *    true / isReadOnly true（def 体）/ isDestructive false /
 *    maxResultSizeChars 100_000 / shouldDefer true / searchHint
 *    'list all tasks' / userFacingName 'TaskList' /
 *    toAutoClassifierInput = ''（旧 def 无覆写取 TOOL_DEFAULTS 缺省
 *    空串 = 跳分类器，逐值固化）。
 *  ④ checkPermissions = 旧 buildTool 默认（{ behavior:'allow',
 *    updatedInput }，委托通用权限系统）显式固化（TaskCreate ⑤ 同族）。
 *  ⑤ call 5 参声明 → 0 参声明（旧体无参，裁，零行为；S-B5 delta ⑩
 *    先例）。
 *  ⑥ 旧 import 重指：utils/tasks → ../../tasks / utils/agentSwarmsEnabled
 *    → ../../messaging（prompt 面，S-D2 已落）/ ./constants →
 *    ../toolNames（值逐字同 'TaskList'）。
 *
 * 残留守（防「以为已全」）：真 ToolUseContext 全字段面 = 残留守（TUI 波/D 波）。
 */
import type {
  Tool,
  ToolInputJSONSchema,
  ToolResult,
  ToolResultBlockParam,
} from '../../../shared'
import {
  getTaskListId,
  isTodoV2Enabled,
  listTasks,
  type TaskStatus,
} from '../../tasks'
import { TASK_LIST_TOOL_NAME } from '../toolNames'
import { getPrompt } from './taskListPrompt'

/**
 * 输入 JSON schema（旧仓 zod 空 strictObject 转写，delta ①；TaskList
 * 无入参字段，duck 型 TaskListToolInput 留 taskToolInput.ts 文档面）。
 */
export const TASK_LIST_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
}

/** 旧 zod outputSchema z.infer 型（delta ① TS 型承载）。 */
export type TaskListOutput = {
  tasks: {
    id: string
    subject: string
    status: TaskStatus
    owner?: string
    blockedBy: string[]
  }[]
}

export const TaskListTool: Tool = {
  name: TASK_LIST_TOOL_NAME,
  inputSchema: TASK_LIST_TOOL_INPUT_SCHEMA,
  inputJSONSchema: TASK_LIST_TOOL_INPUT_SCHEMA,
  searchHint: 'list all tasks',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  isEnabled: () => isTodoV2Enabled(),
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ③，逐值）
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  // 旧 def 无覆写 → TOOL_DEFAULTS 缺省 ''（跳分类器），逐值固化
  toAutoClassifierInput: () => '',
  userFacingName: () => 'TaskList',
  // delta ④：旧 buildTool 默认显式固化（委托通用权限系统）
  checkPermissions: async (input: unknown) => ({
    behavior: 'allow',
    updatedInput: input,
  }),
  description: async () => getPrompt(),
  // delta ⑤：0 参声明（旧体无参）
  async call(): Promise<ToolResult<TaskListOutput>> {
    const taskListId = getTaskListId()

    const allTasks = (await listTasks(taskListId)).filter(
      t => !t.metadata?._internal,
    )

    // Build a set of resolved task IDs for filtering
    const resolvedTaskIds = new Set(
      allTasks.filter(t => t.status === 'completed').map(t => t.id),
    )

    const tasks = allTasks.map(task => ({
      id: task.id,
      subject: task.subject,
      status: task.status,
      owner: task.owner,
      blockedBy: task.blockedBy.filter(id => !resolvedTaskIds.has(id)),
    }))

    return {
      data: {
        tasks,
      },
    }
  },
  // delta ③：旧 UI 面 renderToolUseMessage() → null（无 React 面，TUI 波）
  renderToolUseMessage: () => null,
  mapToolResultToToolResultBlockParam(
    content: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    const { tasks } = content as TaskListOutput
    if (tasks.length === 0) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: 'No tasks found',
      }
    }

    const lines = tasks.map(task => {
      const owner = task.owner ? ` (${task.owner})` : ''
      const blocked =
        task.blockedBy.length > 0
          ? ` [blocked by ${task.blockedBy.map(id => `#${id}`).join(', ')}]`
          : ''
      return `#${task.id} [${task.status}] ${task.subject}${owner}${blocked}`
    })

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: lines.join('\n'),
    }
  },
}
