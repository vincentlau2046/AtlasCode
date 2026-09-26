/**
 * engine/tools/tasks — TaskStopTool prompt 面（§8.56 S-D4，任务工具本体
 * 子波 4；49 口径 14/49）。
 *
 * 旧仓来源（a8af45b）：src/tools/TaskStopTool/prompt.ts 8L 逐字随迁
 * （DESCRIPTION 常量；工具名 TASK_STOP_TOOL_NAME 归 toolNames 单一事实源
 * 不重声明，S-D3 先例）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  ① 旧短 description() 体（'Stop a running background task by ID' 行内
 *    字面量，无具名常量）→ 裁（新契约唯一 prompt 面 = 旧 prompt() 体
 *    DESCRIPTION，taskStopTool description() 消费；短显示面 = TUI 波
 *    前向接缝，S-D3 delta ③ 同族）。
 */
export const DESCRIPTION = `
- Stops a running background task by its ID
- Takes a task_id parameter identifying the task to stop
- Returns a success or failure status
- Use this tool when you need to terminate a long-running task
`
