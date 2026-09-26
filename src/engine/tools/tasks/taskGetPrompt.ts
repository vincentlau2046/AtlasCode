/**
 * engine/tools/tasks — TaskGet prompt 面（§8.56 S-D3，旧仓
 * src/tools/TaskGetTool/prompt.ts 24L 逐字随迁）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - 旧短 DESCRIPTION 常量（'Get a task by ID from the task list'）无新
 *    Tool 契约消费者 → 保留导出不接线（TUI 波前向接缝，S-C5 readPrompt
 *    DESCRIPTION 先例）；新契约唯一 prompt 面 = PROMPT 体。
 */
export const DESCRIPTION = 'Get a task by ID from the task list'

export const PROMPT = `Use this tool to retrieve a task by its ID from the task list.

## When to Use This Tool

- When you need the full description and context before starting work on a task
- To understand task dependencies (what it blocks, what blocks it)
- After being assigned a task, to get complete requirements

## Output

Returns full task details:
- **subject**: Task title
- **description**: Detailed requirements and context
- **status**: 'pending', 'in_progress', or 'completed'
- **blocks**: Tasks waiting on this one to complete
- **blockedBy**: Tasks that must complete before this one can start

## Tips

- After fetching a task, verify its blockedBy list is empty before beginning work.
- Use TaskList to see all tasks in summary form.
`
