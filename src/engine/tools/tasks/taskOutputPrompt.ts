/**
 * engine/tools/tasks — TaskOutputTool prompt 面（§8.56 S-D5，任务工具
 * 本体子波 4 末件；49 口径 16/49）。
 *
 * 旧仓来源（a8af45b）：src/tools/TaskOutputTool/TaskOutputTool.tsx 旧
 * prompt() 体（PROMPT，DEPRECATED 引导 7 行）+ 旧短 description() 体
 * （DESCRIPTION 常量）逐字随迁。
 *
 * 接线面（delta ②，S-D3/S-D4 同族先例）：PROMPT = 新契约 description()
 * 唯一 prompt 面（本文件导出，taskOutputTool.ts 消费）；DESCRIPTION 短
 * 常量留导出不接线（TUI 波前向接缝，TUI 列表面消费时接线）。
 */
export const PROMPT = `DEPRECATED: Prefer using the Read tool on the task's output file path instead. Background tasks return their output file path in the tool result, and you receive a <task-notification> with the same path when the task completes — Read that file directly.

- Retrieves output from a running or completed task (background shell, agent, or remote session)
- Takes a task_id parameter identifying the task
- Returns the task output along with status information
- Use block=true (default) to wait for task completion
- Use block=false for non-blocking check of current status
- Task IDs can be found using the /tasks command
- Works with all task types: background shells, async agents, and remote sessions`

export const DESCRIPTION =
  '[Deprecated] — prefer Read on the task output file path'
