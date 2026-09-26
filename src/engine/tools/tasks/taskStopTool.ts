/**
 * engine/tools/tasks — TaskStopTool 本体（§8.56 S-D4，任务工具本体子波
 * 4；49 口径 14/49，无条件注册长尾）。
 *
 * 旧仓来源（a8af45b）：src/tools/TaskStopTool/TaskStopTool.ts 131L 逐字
 * 随迁（input 2 可选字段 / output { message, task_id, task_type,
 * command? } / aliases ['KillShell'] / validateInput 3 支 / call =
 * stopTask 三态守卫消费面（E-7 S-7a 已落）/ mapResult = 整体 JSON 行）。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 多裁，函数体逐字；
 * 复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod) → 新 shared Tool 契约：inputSchema = 纯 JSON
 *    schema 对象（S-B5 先例）；旧 zod outputSchema（z.infer 推断
 *    TaskStopOutput）→ TS 型承载文档面（引擎侧无 wire outputSchema
 *    消费者，D 波前向接缝）。
 *  ② 旧 prompt() 成员 → 新契约唯一 prompt 面 description() = 旧 prompt()
 *    体（DESCRIPTION 8L，S-C5 delta ③ 先例）；旧短 description() 行内
 *    字面量裁（taskStopPrompt delta ①，TUI 波前向接缝）。
 *  ③ 旧 buildTool TOOL_DEFAULTS 成员对象化（逐值）：isConcurrencySafe
 *    true（def 体）/ isReadOnly false（默认）/ isDestructive false（默认）/
 *    maxResultSizeChars 100_000（def 体）/ shouldDefer true / searchHint
 *    'kill a running background task' / userFacingName 'Stop Task'（def
 *    体）/ aliases ['KillShell']（def 体，旧 KillShell 废弃兼容 alias 面）/
 *    toAutoClassifierInput = task_id ?? shell_id ?? ''（def 体）/
 *    isEnabled 恒 true（def 无 member，TOOL_DEFAULTS 缺省逐值固化；
 *    非 AGENT_TRIGGERS 族工具，注册表无条件注册）。
 *  ④ checkPermissions = 旧 buildTool 默认（{ behavior:'allow',
 *    updatedInput }，委托通用权限系统）显式固化（def 无 member；S-D3
 *    delta ⑤ 同族先例，本工具无路径面）。
 *  ⑤ mapResult 旧 jsonStringify(output)（utils/slowOperations =
 *    JSON.stringify 语义包装）→ 本文件内联 JSON.stringify（域内不跨域
 *    import scheduler 域本地副本，同 S-D2 outputFormatting 先例）。
 *  ⑥ call 5 参声明 → 2 参声明（旧 canUseTool/_parentMessage/onProgress
 *    旧体不消费，裁，零行为；S-B5 delta ⑩ 先例）；context duck =
 *    TaskStopToolUseContext（结构化 = coordinator/tasks stopTask 的
 *    StopTaskContext，taskToolInput.ts S-D4 块）。
 *  ⑦ P-D5 探针锚点（§8.56.5）：validateInput 3 支守卫（缺 id / 未找到 /
 *    非 running）+ call 缺失 id throw + stopTask StopTaskError 支
 *    （not_found/not_running/unsupported_type，S-7a framework 面已探，
 *    本探针 = 工具面新锚；突变放行 → 恰 1 红）。
 *  ⑧ 旧 import 重指：tasks/stopTask → ../../coordinator/tasks（E-7 S-7a
 *    已落）/ Task.js（TaskStateBase 型面）→ ../../../task 域门面 /
 *    utils/slowOperations（jsonStringify）→ 内联（delta ⑤）/ ./prompt →
 *    ./taskStopPrompt（名引 toolNames 单一事实源）。
 */
import {
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
  type ValidationResult,
} from '../../../shared'
import { stopTask } from '../../coordinator/tasks'
import { TASK_STOP_TOOL_NAME } from '../toolNames'
import { DESCRIPTION } from './taskStopPrompt'
import type {
  TaskStopToolInput,
  TaskStopToolUseContext,
} from './taskToolInput'

/** 输入 JSON schema（旧仓 zod inputSchema 2 可选字段逐字段转写，delta ①）。 */
export const TASK_STOP_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    task_id: {
      type: 'string',
      description: 'The ID of the background task to stop',
    },
    // shell_id is accepted for backward compatibility with the deprecated
    // KillShell tool
    shell_id: {
      type: 'string',
      description: 'Deprecated: use task_id instead',
    },
  },
}

/** 旧 zod outputSchema z.infer 型（delta ① TS 型承载）。 */
export type TaskStopOutput = {
  /** Status message about the operation。 */
  message: string
  /** The ID of the task that was stopped。 */
  task_id: string
  /** The type of the task that was stopped。 */
  task_type: string
  /** 旧仓注释：工具输出持久化进 transcript，--resume 重放不重校验。 */
  command?: string
}

export const TaskStopTool: Tool = {
  name: TASK_STOP_TOOL_NAME,
  inputSchema: TASK_STOP_TOOL_INPUT_SCHEMA,
  inputJSONSchema: TASK_STOP_TOOL_INPUT_SCHEMA,
  // KillShell is the deprecated name - kept as alias for backward
  // compatibility with existing transcripts and SDK users
  aliases: ['KillShell'],
  searchHint: 'kill a running background task',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  isEnabled: () => true,
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ③，逐值）
  isConcurrencySafe: () => true,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: (input: unknown) => {
    const { task_id, shell_id } = input as TaskStopToolInput
    return task_id ?? shell_id ?? ''
  },
  userFacingName: () => 'Stop Task',
  // delta ④：旧 buildTool 默认显式固化（委托通用权限系统）
  checkPermissions: async (input: unknown) => ({
    behavior: 'allow',
    updatedInput: input,
  }),
  // delta ②：新契约唯一 prompt 面 = 旧 prompt() 体
  description: async () => DESCRIPTION,
  // P-D5 探针锚点：3 支守卫（delta ⑦）
  async validateInput(
    input: unknown,
    context: unknown,
  ): Promise<ValidationResult> {
    const { task_id, shell_id } = input as TaskStopToolInput
    const ctx = context as TaskStopToolUseContext
    // Support both task_id and shell_id (deprecated KillShell compat)
    const id = task_id ?? shell_id
    if (!id) {
      return {
        result: false,
        message: 'Missing required parameter: task_id',
        errorCode: 1,
      }
    }

    const appState = ctx.getAppState()
    const task = appState.tasks?.[id]

    if (!task) {
      return {
        result: false,
        message: `No task found with ID: ${id}`,
        errorCode: 1,
      }
    }

    if (task.status !== 'running') {
      return {
        result: false,
        message: `Task ${id} is not running (status: ${task.status})`,
        errorCode: 3,
      }
    }

    return { result: true }
  },
  // delta ⑤/⑥/⑦：jsonStringify 内联 + 2 参声明 + StopTaskError 支
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<TaskStopOutput>> {
    const { task_id, shell_id } = args as TaskStopToolInput
    const ctx = context as TaskStopToolUseContext
    // Support both task_id and shell_id (deprecated KillShell compat)
    const id = task_id ?? shell_id
    if (!id) {
      throw new Error('Missing required parameter: task_id')
    }

    const result = await stopTask(id, {
      getAppState: ctx.getAppState,
      setAppState: ctx.setAppState,
    })

    return {
      data: {
        message: `Successfully stopped task: ${result.taskId} (${result.command})`,
        task_id: result.taskId,
        task_type: result.taskType,
        command: result.command,
      },
    }
  },
  // delta ③：旧 UI 面 renderToolUseMessage() → null（无 React 面，TUI 波）
  renderToolUseMessage: () => null,
  mapToolResultToToolResultBlockParam(
    content: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    const output = content as TaskStopOutput
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: JSON.stringify(output),
    }
  },
}
