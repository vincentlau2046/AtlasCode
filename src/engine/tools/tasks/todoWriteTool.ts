/**
 * engine/tools/tasks — TodoWriteTool 本体（§8.56 S-D4，任务工具本体
 * 子波 4；49 口径 15/49，注册表 ⑯ isTodoV2 槽 materialize，反向门控）。
 *
 * 旧仓来源（a8af45b）：src/tools/TodoWriteTool/TodoWriteTool.ts 116L
 * 逐字随迁（input { todos } / output { oldTodos, newTodos } / 反向门
 * isEnabled = !isTodoV2Enabled() / call = todoKey 解析 + allDone 清空 +
 * setAppState todos 面 / mapResult base 行）。
 *
 * delta 登记（旧 buildTool(zod) → 新 shared Tool 契约 + 多裁，函数体逐字；
 * 复审勿当遗漏重提）：
 *  ① 旧 buildTool(zod) → 新 shared Tool 契约：inputSchema = 纯 JSON
 *    schema 对象（旧 z.strictObject({ todos: TodoListSchema().describe(
 *    'The updated todo list') }) 逐字段转写；TodoItem 3 字段：content /
 *    activeForm 旧 min(1, msg) → minLength: 1（todoTypes delta ① 登记
 *    的承载面），status 枚举约束不进 JSON schema（宽骨架面，S-C4 delta
 *    ② / S-D3 TaskUpdate 先例，非法值走 TodoStatus 型面 + 存储域守卫）
 *    且 status 无 description（旧 types.ts 该字段无 .describe()，S-D6
 *    审视 A 移除未登记添加）/
 *    旧 zod outputSchema（z.infer）→ TS 型 TodoWriteOutput（引擎侧无
 *    wire outputSchema 消费者，D 波前向接缝）。
 *  ② 旧 prompt() 成员 → 新契约唯一 prompt 面 description() = 旧 prompt()
 *    体（PROMPT 179L 长 prompt，todoWritePrompt.ts）；旧短 description()
 *    体（DESCRIPTION 常量）留 todoWritePrompt.ts 导出不接线（TUI 波
 *    前向接缝，S-D3 delta ③ 同族）。
 *  ③ 旧 buildTool TOOL_DEFAULTS 成员对象化（逐值）：isConcurrencySafe
 *    false / isReadOnly false / isDestructive false（全默认值逐值固化）/
 *    maxResultSizeChars 100_000 / shouldDefer true / strict true /
 *    searchHint 'manage the session task checklist'（均 def 体）/
 *    userFacingName ''（def 覆写 TOOL_DEFAULTS 缺省值）/
 *    toAutoClassifierInput = `${todos.length} items`（def 体）。
 *  ④ checkPermissions = def 体显式固化（{ behavior:'allow',
 *    updatedInput }，旧注释 'No permission checks required for todo
 *    operations' 随迁）。
 *  ⑤ 反向门控（注册表 ⑯ isTodoV2 槽 materialize）：isEnabled =
 *    !isTodoV2Enabled()（v1 todo 工具在 v2 关闭时可见；Task 四件套
 *    S-D3 为正向门，本工具反向，双门互补 = 旧仓行为逐字）。
 *  ⑥ context duck = TodoWriteToolUseContext + TodoWriteAppState（残留守
 *    ① 同族：新仓 task 域 TaskAppState 仅 tasks 记录面（S-7a），todos
 *    会话态 = 全量 AppState 残留守，engine 波/D 波真 AppState 接入时整
 *    换；duck todos 可选 = 缺省零崩溃支 appState.todos[todoKey] ?? []）。
 *    todoKey = agentId ?? getSessionId()（S-D1 §8.56.3 context duck
 *    裁定；getSessionId = ../../../bootstrap，bootstrap/state 已落）。
 *  ⑦ verification nudge 双门整支裁（H6 不造假）：旧体
 *    feature('VERIFICATION_AGENT')（bun:bundle 构建门，测试态恒
 *    false）+ getFeatureValue_CACHED_MAY_BE_STALE('atlas_hive_evidence',
 *    false)（growthbook 远程特性，新仓无 analytics 后端，agentSwarms-
 *    enabled delta ① 同族先例）+ VERIFICATION_AGENT_TYPE（AgentTool 域，
 *    不在本子波）→ 三重前置全死，整支裁（output verificationNudgeNeeded
 *    字段 + mapResult nudge 行同裁）；恢复 = verification-agent 波/D 波。
 *    [§8.69 核销] 保裁确认：无 growthbook 域 + feature() 不可测 + 双门死支，核销确认（不复活）。
 *  ⑧ call 5 参声明 → 2 参声明（args, context；旧 canUseTool/
 *    parentMessage/onProgress 旧体不消费，裁，S-B5 delta ⑩ 先例）；旧
 *    import 重指：bootstrap/state → ../../../bootstrap / utils/tasks +
 *    utils/todo/types → ../../tasks（isTodoV2Enabled + TodoList 域门面）/
 *    growthbook + AgentTool/constants → 裁（delta ⑦）/ ./constants →
 *    ../toolNames（TODO_WRITE_TOOL_NAME 名引单一事实源）。
 */
import { getSessionId } from '../../../bootstrap'
import {
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
} from '../../../shared'
import { isTodoV2Enabled, type TodoList } from '../../tasks'
import { TODO_WRITE_TOOL_NAME } from '../toolNames'
import { PROMPT } from './todoWritePrompt'
import type {
  TodoWriteToolInput,
  TodoWriteToolUseContext,
} from './taskToolInput'

/**
 * 输入 JSON schema（旧仓 zod inputSchema 逐字段转写，delta ①；与
 * TodoWriteToolInput duck 型单一事实源对齐）。
 */
export const TODO_WRITE_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  properties: {
    todos: {
      type: 'array',
      description: 'The updated todo list',
      items: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            minLength: 1,
            description: 'Content cannot be empty',
          },
          status: {
            type: 'string',
          },
          activeForm: {
            type: 'string',
            minLength: 1,
            description: 'Active form cannot be empty',
          },
        },
        required: ['content', 'status', 'activeForm'],
      },
    },
  },
  required: ['todos'],
}

/** 旧 zod outputSchema z.infer 型（delta ① TS 型承载；delta ⑦ nudge 字段裁）。 */
export type TodoWriteOutput = {
  oldTodos: TodoList
  newTodos: TodoList
}

export const TodoWriteTool: Tool = {
  name: TODO_WRITE_TOOL_NAME,
  inputSchema: TODO_WRITE_TOOL_INPUT_SCHEMA,
  inputJSONSchema: TODO_WRITE_TOOL_INPUT_SCHEMA,
  searchHint: 'manage the session task checklist',
  maxResultSizeChars: 100_000,
  strict: true,
  shouldDefer: true,
  // 反向门控（delta ⑤，注册表 ⑯ isTodoV2 槽 materialize）
  isEnabled: () => !isTodoV2Enabled(),
  // 旧 buildTool TOOL_DEFAULTS 成员对象化（delta ③，逐值）
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  toAutoClassifierInput: (input: unknown) => {
    const { todos } = input as TodoWriteToolInput
    return `${todos.length} items`
  },
  userFacingName: () => '',
  // delta ④：def 体显式固化（No permission checks required for todo
  // operations）
  checkPermissions: async (input: unknown) => ({
    behavior: 'allow',
    updatedInput: input,
  }),
  // delta ②：新契约唯一 prompt 面 = 旧 prompt() 体（长 prompt）
  description: async () => PROMPT,
  // delta ⑥/⑦/⑧：2 参声明 + duck 型 + nudge 整支裁
  async call(
    args: unknown,
    context: unknown,
  ): Promise<ToolResult<TodoWriteOutput>> {
    const { todos } = args as TodoWriteToolInput
    const ctx = context as TodoWriteToolUseContext
    const appState = ctx.getAppState()
    const todoKey = ctx.agentId ?? getSessionId()
    const oldTodos = appState.todos?.[todoKey] ?? []
    const allDone = todos.every(_ => _.status === 'completed')
    const newTodos = allDone ? [] : todos

    ctx.setAppState(prev => ({
      ...prev,
      todos: {
        ...prev.todos,
        [todoKey]: newTodos,
      },
    }))

    return {
      data: {
        oldTodos,
        newTodos: todos,
      },
    }
  },
  // delta ③：旧 UI 面 renderToolUseMessage() → null（无 React 面，TUI 波）
  renderToolUseMessage: () => null,
  // delta ⑦：nudge 行裁（恢复 = verification-agent 波/D 波），base 行逐字
  mapToolResultToToolResultBlockParam(
    content: unknown,
    toolUseID: string,
  ): ToolResultBlockParam {
    void content
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Todos have been modified successfully. Ensure that you continue to use the todo list to track your progress. Please proceed with the current tasks if applicable`,
    }
  },
}
