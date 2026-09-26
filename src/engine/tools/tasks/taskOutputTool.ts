/**
 * engine/tools/tasks — TaskOutputTool 本体（§8.56 S-D5，任务工具本体
 * 子波 4 末件；49 口径 16/49）。
 *
 * 旧仓来源（a8af45b）：src/tools/TaskOutputTool/TaskOutputTool.tsx 583L
 * （buildTool 体 L30-352 逐字随迁；TaskOutputResultDisplay 230L React
 * 编译面 + 5 render 成员裁，见 delta ⑧）。input { task_id, block,
 * timeout } / output { retrieval_status, task } / getTaskOutputData
 * （local_bash shellCommand.taskOutput 端口 vs 磁盘读 / local_agent
 * 内存 result 净文本 vs 磁盘读）+ waitForTaskCompletion（100ms 轮询 +
 * abort + 超时回落）+ call（block 双分支 + onProgress waiting_for_task）
 * + mapResult XML-ish 6 行。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 多裁，函数体
 * 逐字；复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod) → 新 shared Tool 契约：inputSchema = 纯 JSON
 *    schema 对象（3 字段逐字段转写；旧 semanticBoolean(z.boolean().
 *    default(true)) 字符串容忍布尔 → JSON schema plain boolean（字符串
 *    容忍 = 客户端不可见 coercion，非声明输入形态，JSON schema 无
 *    string 枚举面）；旧 zod .default(true)/.default(30000) 运行时
 *    parse 填充 → JSON schema default 键（wire 文档面）+ call 解构
 *    缺省位（行为保留：block = true / timeout = 30000）；旧 zod
 *    outputSchema（z.infer）→ TS 型 TaskOutput/TaskOutputToolOutput
 *    （引擎侧无 wire outputSchema 消费者，D 波前向接缝）。
 *  ② 旧 prompt() 成员 → 新契约唯一 prompt 面 description() = 旧
 *    prompt() 体（PROMPT 7 行 DEPRECATED 引导，taskOutputPrompt.ts，
 *    shell 侧字节核 hash 逐字）；旧短 description() 体（'[Deprecated]
 *    — prefer Read...'）→ DESCRIPTION 常量（taskOutputPrompt.ts）留
 *    导出不接线（TUI 波前向接缝，S-D3 delta ③ 同族）。
 *  ③ 旧 buildTool TOOL_DEFAULTS 成员对象化（逐值）：searchHint 'read
 *    output/logs from a background task' / maxResultSizeChars 100_000 /
 *    shouldDefer true / aliases ['AgentOutputTool','BashOutputTool']
 *    （Backwards-compatible aliases for renamed tools；
 *    legacyToolNameAliases.ts:31-32 已接线）/ userFacingName 'Task
 *    Output'（def 体）/ toAutoClassifierInput = input.task_id（def 体）。
 *  ④ isConcurrencySafe 旧体 `this.isReadOnly?.(_input) ?? false`
 *    （isReadOnly 恒 true）→ `() => true` 常量化（对象字面量自引用
 *    裁，行为逐字）；isReadOnly `() => true`（def 体）/ isDestructive
 *    false（TOOL_DEFAULTS 缺省值）。
 *  ⑤ isEnabled 旧 ant 面 `("external" as any) !== 'ant'`（构建期渠道
 *    判别，新仓无 ant 渠道）→ `() => true` 常量（行为逐字 = 非 ant
 *    构建恒启用）。
 *  ⑥ getTaskOutputData remote_agent 支裁（新 TaskState = LocalShell
 *    TaskState | LocalAgentTaskState 两路联合无 remote 成员，
 *    coordinator/tasks types.ts S-7a 登记；remote 任务 = D 波/remote
 *    波前向接缝）；旧 Progress re-export（types/tools.ts 旧 `any` 桩）
 *    → 本地结构型 TaskOutputProgress（call onProgress 消费点定型）/
 *    旧 sleep(100)（utils/sleep.ts abort-aware 变体）→ 本地
 *    setTimeout helper（旧调用点 = 无 signal 的 sleep(100)，语义逐字）
 *    / waitForTaskCompletion getAppState duck = TaskStateBase（旧仓
 *    TaskState = any 桩，新 tasks 记录面 = TaskStateBase；内部
 *    `as TaskState | undefined` cast = 旧逐字面）/ AbortError → ../bash
 *    子门面（index.ts:168 导出；避 tools/index 门面环，F4 首消费者
 *    本地模块先例）。
 *  ⑦ call 5 参声明保留（异 S-D3/S-D4 2 参裁——本体 onProgress 消费支
 *    保留：block 支发 waiting_for_task progress）；canUseTool/
 *    _parentMessage 仍不消费（下划线占位参，S-B5 delta ⑩ 同族）。
 *  ⑧ React render 5 面（renderToolUseTag/ProgressMessage/ResultMessage/
 *    RejectedMessage/ErrorMessage + TaskOutputResultDisplay 编译组件）
 *    整裁（无 React 面，TUI 波）；renderToolUseMessage = 旧体逐字
 *    （纯字符串 'non-blocking' / ''，无 JSX 依赖——异 S-D3/D4 null 裁，
 *    本面保留旧体）；checkPermissions = def 体显式固化（旧 def 无
 *    member = buildTool 默认 allow，S-D4 delta ④ 同族）。
 *  ⑨ 旧 import 重指：utils/task/diskOutput + utils/task/outputFormatting
 *    → ../../../task 域门面（getTaskOutput/formatTaskOutput）/
 *    utils/task/framework → ../../coordinator/tasks（updateTaskState，
 *    E-7 S-7a）/ utils/messages → ../../messaging（extractTextContent，
 *    E-7 S-7e d1）/ utils/errors → ../bash（AbortError）/ tasks/* 型面
 *    → ../../coordinator/tasks（TaskState 两路联合 + LocalShellTaskState
 *    / LocalAgentTaskState）/ Task.js TaskType → TaskState['type']（新
 *    两路联合字面）/ utils/slowOperations（jsonParse）+
 *    utils/stringUtils（countCharInString）+ AgentTool/UI +
 *    BashTool/BashToolResultMessage + Fallback* 组件 → 随 React 面裁
 *    （独消费者 = TaskOutputResultDisplay）/ 旧 zod lazySchema/
 *    semanticBoolean → 裁（纯 JSON schema 无 zod 运行时，S-C4 delta ②
 *    先例）。
 */
import {
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
  type ValidationResult,
} from '../../../shared'
import {
  updateTaskState,
  type LocalAgentTaskState,
  type LocalShellTaskState,
  type TaskState,
} from '../../coordinator/tasks'
import { extractTextContent } from '../../messaging'
import {
  formatTaskOutput,
  getTaskOutput,
  type TaskStateBase,
} from '../../../task'
import { AbortError } from '../bash'
import { TASK_OUTPUT_TOOL_NAME } from '../toolNames'
import { PROMPT } from './taskOutputPrompt'
import type {
  TaskOutputToolInput,
  TaskOutputToolUseContext,
} from './taskToolInput'

/** 输入 JSON schema（旧仓 zod inputSchema 3 字段逐字段转写，delta ①）。 */
export const TASK_OUTPUT_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    task_id: {
      type: 'string',
      description: 'The task ID to get output from',
    },
    block: {
      type: 'boolean',
      default: true,
      description: 'Whether to wait for completion',
    },
    timeout: {
      type: 'number',
      minimum: 0,
      maximum: 600000,
      default: 30000,
      description: 'Max wait time in ms',
    },
  },
  required: ['task_id'],
}

/** 统一输出型（覆盖全部任务类型；旧 zod outputSchema z.infer TS 型承载，delta ①）。 */
export type TaskOutput = {
  task_id: string
  task_type: TaskState['type']
  status: string
  description: string
  output: string
  exitCode?: number | null
  error?: string
  // For agents
  prompt?: string
  result?: string
}

export type TaskOutputToolOutput = {
  retrieval_status: 'success' | 'timeout' | 'not_ready'
  task: TaskOutput | null
}

/**
 * onProgress 数据面（delta ⑥）：旧仓 TaskOutputProgress = any 桩
 * re-export（types/tools.ts），新仓本地结构型按 call 消费点定型。
 */
export type TaskOutputProgress = {
  toolUseID: string
  data: {
    type: 'waiting_for_task'
    taskDescription: string
    taskType: string
  }
}

// Get output for any task type
async function getTaskOutputData(task: TaskState): Promise<TaskOutput> {
  let output: string
  if (task.type === 'local_bash') {
    const bashTask = task as LocalShellTaskState
    const taskOutputObj = bashTask.shellCommand?.taskOutput
    if (taskOutputObj) {
      const stdout = await taskOutputObj.getStdout()
      const stderr = taskOutputObj.getStderr()
      output = [stdout, stderr].filter(Boolean).join('\n')
    } else {
      output = await getTaskOutput(task.id)
    }
  } else {
    output = await getTaskOutput(task.id)
  }

  const baseOutput: TaskOutput = {
    task_id: task.id,
    task_type: task.type,
    status: task.status,
    description: task.description,
    output,
  }

  // Add type-specific fields（remote_agent 支裁，delta ⑥）
  if (task.type === 'local_bash') {
    const bashTask = task as LocalShellTaskState
    return {
      ...baseOutput,
      exitCode: bashTask.result?.code ?? null,
    }
  }
  if (task.type === 'local_agent') {
    const agentTask = task as LocalAgentTaskState
    // Prefer the clean final answer from the in-memory result over the raw
    // JSONL transcript on disk. The disk output is a symlink to the full
    // session transcript (every message, tool use, etc.), not just the
    // subagent's answer. The in-memory result contains only the final
    // assistant text content blocks.
    const cleanResult = agentTask.result
      ? extractTextContent(agentTask.result.content, '\n')
      : undefined
    return {
      ...baseOutput,
      prompt: agentTask.prompt,
      result: cleanResult || output,
      output: cleanResult || output,
      error: agentTask.error,
    }
  }
  return baseOutput
}

// 本地 setTimeout helper（delta ⑥：旧 utils/sleep.ts 无 signal 调用点语义）
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Wait for task to complete
async function waitForTaskCompletion(
  taskId: string,
  getAppState: () => { tasks?: Record<string, TaskStateBase> },
  timeoutMs: number,
  abortController?: AbortController,
): Promise<TaskState | null> {
  const startTime = Date.now()
  while (Date.now() - startTime < timeoutMs) {
    // Check abort signal
    if (abortController?.signal.aborted) {
      throw new AbortError()
    }
    const state = getAppState()
    const task = state.tasks?.[taskId] as TaskState | undefined
    if (!task) {
      return null
    }
    if (task.status !== 'running' && task.status !== 'pending') {
      return task
    }

    // Wait before polling again
    await sleep(100)
  }

  // Timeout - return current state
  const finalState = getAppState()
  return finalState.tasks?.[taskId] as TaskState ?? null
}

export const TaskOutputTool: Tool<
  ToolInputJSONSchema,
  TaskOutputToolOutput,
  TaskOutputProgress
> = {
  name: TASK_OUTPUT_TOOL_NAME,
  inputSchema: TASK_OUTPUT_TOOL_INPUT_SCHEMA,
  inputJSONSchema: TASK_OUTPUT_TOOL_INPUT_SCHEMA,
  // Backwards-compatible aliases for renamed tools
  aliases: ['AgentOutputTool', 'BashOutputTool'],
  searchHint: 'read output/logs from a background task',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  // delta ⑤：旧 ant 面构建期渠道裁
  isEnabled: () => true,
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ③/④，逐值）
  isConcurrencySafe: () => true, // 旧体 this.isReadOnly?.(_input) ?? false（isReadOnly 恒 true）
  isReadOnly: () => true,
  isDestructive: () => false,
  toAutoClassifierInput: (input: unknown) => {
    const { task_id } = input as TaskOutputToolInput
    return task_id
  },
  userFacingName: () => 'Task Output',
  // delta ⑧：def 体显式固化（旧 buildTool 默认 allow）
  checkPermissions: async (input: unknown) => ({
    behavior: 'allow',
    updatedInput: input,
  }),
  // delta ②：新契约唯一 prompt 面 = 旧 prompt() 体（长 prompt）
  description: async () => PROMPT,
  async validateInput(
    input: unknown,
    context: unknown,
  ): Promise<ValidationResult> {
    const { task_id } = input as TaskOutputToolInput
    const ctx = context as TaskOutputToolUseContext
    if (!task_id) {
      return {
        result: false,
        message: 'Task ID is required',
        errorCode: 1,
      }
    }
    const appState = ctx.getAppState()
    const task = appState.tasks[task_id] as TaskState | undefined
    if (!task) {
      return {
        result: false,
        message: `No task found with ID: ${task_id}`,
        errorCode: 2,
      }
    }
    return { result: true }
  },
  // delta ⑥/⑦：5 参声明（onProgress 消费支保留）+ 解构缺省位承旧 zod
  // .default（block = true / timeout = 30000）
  async call(
    args: unknown,
    context: unknown,
    _canUseTool: unknown,
    _parentMessage: unknown,
    onProgress?: (progress: TaskOutputProgress) => void,
  ): Promise<ToolResult<TaskOutputToolOutput>> {
    const { task_id, block = true, timeout = 30000 } = args as TaskOutputToolInput
    const ctx = context as TaskOutputToolUseContext
    const appState = ctx.getAppState()
    const task = appState.tasks[task_id] as TaskState | undefined
    if (!task) {
      throw new Error(`No task found with ID: ${task_id}`)
    }
    if (!block) {
      // Non-blocking: return current state
      if (task.status !== 'running' && task.status !== 'pending') {
        // Mark as notified
        updateTaskState(task_id, ctx.setAppState, t => ({
          ...t,
          notified: true,
        }))
        return {
          data: {
            retrieval_status: 'success' as const,
            task: await getTaskOutputData(task),
          },
        }
      }
      return {
        data: {
          retrieval_status: 'not_ready' as const,
          task: await getTaskOutputData(task),
        },
      }
    }

    // Blocking: wait for completion
    if (onProgress) {
      onProgress({
        toolUseID: `task-output-waiting-${Date.now()}`,
        data: {
          type: 'waiting_for_task',
          taskDescription: task.description,
          taskType: task.type,
        },
      })
    }
    const completedTask = await waitForTaskCompletion(
      task_id,
      ctx.getAppState,
      timeout,
      ctx.abortController,
    )
    if (!completedTask) {
      return {
        data: {
          retrieval_status: 'timeout' as const,
          task: null,
        },
      }
    }
    if (completedTask.status === 'running' || completedTask.status === 'pending') {
      return {
        data: {
          retrieval_status: 'timeout' as const,
          task: await getTaskOutputData(completedTask),
        },
      }
    }

    // Mark as notified
    updateTaskState(task_id, ctx.setAppState, t => ({
      ...t,
      notified: true,
    }))
    return {
      data: {
        retrieval_status: 'success' as const,
        task: await getTaskOutputData(completedTask),
      },
    }
  },
  mapToolResultToToolResultBlockParam(
    content: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    const data = content as TaskOutputToolOutput
    const parts: string[] = []
    parts.push(`<retrieval_status>${data.retrieval_status}</retrieval_status>`)
    if (data.task) {
      parts.push(`<task_id>${data.task.task_id}</task_id>`)
      parts.push(`<task_type>${data.task.task_type}</task_type>`)
      parts.push(`<status>${data.task.status}</status>`)
      if (data.task.exitCode !== undefined && data.task.exitCode !== null) {
        parts.push(`<exit_code>${data.task.exitCode}</exit_code>`)
      }
      if (data.task.output?.trim()) {
        const { content: formatted } = formatTaskOutput(
          data.task.output,
          data.task.task_id,
        )
        parts.push(`<output>\n${formatted.trimEnd()}\n</output>`)
      }
      if (data.task.error) {
        parts.push(`<error>${data.task.error}</error>`)
      }
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: parts.join('\n\n'),
    }
  },
  // delta ⑧：旧体逐字（纯字符串面，无 JSX 依赖）
  renderToolUseMessage(input: unknown): unknown {
    const { block = true } = input as TaskOutputToolInput
    if (!block) {
      return 'non-blocking'
    }
    return ''
  },
}
