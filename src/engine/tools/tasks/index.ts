/**
 * engine/tools/tasks 子门面（§8.56 S-D3，STR-1 显式名块纪律）。
 *
 * 覆盖 Task 四件套本体（taskCreateTool / taskGetTool / taskListTool /
 * taskUpdateTool 各 1 对象 + JSON schema 常量 + Output 型）+ 4 prompt 面
 * （taskCreatePrompt / taskGetPrompt / taskListPrompt / taskUpdatePrompt）+
 * duck 型（taskToolInput 5 型）+ S-D4 扩 2 件（TaskStopTool +
 * TodoWriteTool 各 1 对象 + JSON schema 常量 + Output 型 + 2 prompt 面
 * taskStopPrompt/todoWritePrompt + duck 型 5 型扩块）。
 *
 * 纪律（tools/index.ts bash 块先例）：逐名显式 re-export，无 `export *`；
 * 各文件头注 delta 登记不随门面重复（单一事实源 = 各模块头注）。
 *
 * 重名登记：4 个 prompt 文件的 DESCRIPTION 短常量互异名（任务名区分），
 * 门面 re-export 全量（消费方 = 各工具 description() 同源 + TUI 波前向
 * 接缝面）；PROMPT 仅 TaskGet/TaskUpdate 导出（TaskCreate/TaskList 为
 * getPrompt() 动态面）。
 *
 * 消费方：tools/ 门面 S-D3 re-export 块 + 组合根 baseTools 注入位
 * （Task 四件套 = 注册表 ⑯ isTodoV2 槽，isEnabled 自门控）+ S-D4 cron
 * 三件套（同子波，scheduler 域已落）/ S-D5 TaskOutput（同子波）。
 */
export {
  TASK_CREATE_TOOL_INPUT_SCHEMA,
  TaskCreateTool,
  type TaskCreateOutput,
} from './taskCreateTool'
export {
  TASK_GET_TOOL_INPUT_SCHEMA,
  TaskGetTool,
  type TaskGetOutput,
} from './taskGetTool'
export {
  TASK_LIST_TOOL_INPUT_SCHEMA,
  TaskListTool,
  type TaskListOutput,
} from './taskListTool'
export {
  TASK_UPDATE_TOOL_INPUT_SCHEMA,
  TaskUpdateTool,
  type TaskUpdateOutput,
} from './taskUpdateTool'
// ── prompt 面（旧短 DESCRIPTION 常量保留导出不接线，TUI 波前向接缝）──
export {
  DESCRIPTION as TASK_CREATE_DESCRIPTION,
  getPrompt as getTaskCreatePrompt,
} from './taskCreatePrompt'
export {
  DESCRIPTION as TASK_GET_DESCRIPTION,
  PROMPT as TASK_GET_PROMPT,
} from './taskGetPrompt'
export {
  DESCRIPTION as TASK_LIST_DESCRIPTION,
  getPrompt as getTaskListPrompt,
} from './taskListPrompt'
export {
  DESCRIPTION as TASK_UPDATE_DESCRIPTION,
  PROMPT as TASK_UPDATE_PROMPT,
} from './taskUpdatePrompt'
// ── S-D4（§8.56 任务工具本体子波 4）：TaskStop + TodoWrite 扩 2 件 ──
export {
  TASK_STOP_TOOL_INPUT_SCHEMA,
  TaskStopTool,
  type TaskStopOutput,
} from './taskStopTool'
export {
  TODO_WRITE_TOOL_INPUT_SCHEMA,
  TodoWriteTool,
  type TodoWriteOutput,
} from './todoWriteTool'
// ── S-D4 prompt 面（旧短 DESCRIPTION 常量保留导出不接线，TUI 波前向接缝）──
export { DESCRIPTION as TASK_STOP_DESCRIPTION } from './taskStopPrompt'
export {
  DESCRIPTION as TODO_WRITE_DESCRIPTION,
  PROMPT as TODO_WRITE_PROMPT,
} from './todoWritePrompt'
// ── duck 型（taskToolInput.ts）──
export type {
  TaskCreateToolInput,
  TaskGetToolInput,
  TaskListToolInput,
  TaskUpdateToolInput,
  TaskToolUseContext,
  TaskStopToolInput,
  TaskStopToolUseContext,
  TodoWriteToolInput,
  TodoWriteAppState,
  TodoWriteToolUseContext,
} from './taskToolInput'
