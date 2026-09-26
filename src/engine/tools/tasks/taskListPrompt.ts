/**
 * engine/tools/tasks — TaskList prompt 面（§8.56 S-D3，旧仓
 * src/tools/TaskListTool/prompt.ts 49L 逐字随迁）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - import 重指：isAgentSwarmsEnabled → ../../messaging（S-D2 已落）。
 *  - 旧短 DESCRIPTION 常量（'List all tasks in the task list'）保留导出
 *    不接线（TUI 波前向接缝，S-C5 先例）；新契约唯一 prompt 面 =
 *    getPrompt() 体。
 *  - 旧 `idDescription` 死三元（isAgentSwarmsEnabled 两分支同串）→ 恒值
 *    const 直赋（零行为差，防 lint 死码）。
 */
import { isAgentSwarmsEnabled } from '../../messaging'

export const DESCRIPTION = 'List all tasks in the task list'

export function getPrompt(): string {
  const teammateUseCase = isAgentSwarmsEnabled()
    ? `- Before assigning tasks to teammates, to see what's available
`
    : ''

  const idDescription = '- **id**: Task identifier (use with TaskGet, TaskUpdate)'

  const teammateWorkflow = isAgentSwarmsEnabled()
    ? `
## Teammate Workflow

When working as a teammate:
1. After completing your current task, call TaskList to find available work
2. Look for tasks with status 'pending', no owner, and empty blockedBy
3. **Prefer tasks in ID order** (lowest ID first) when multiple tasks are available, as earlier tasks often set up context for later ones
4. Claim an available task using TaskUpdate (set \`owner\` to your name), or wait for leader assignment
5. If blocked, focus on unblocking tasks or notify the team lead
`
    : ''

  return `Use this tool to list all tasks in the task list.

## When to Use This Tool

- To see what tasks are available to work on (status: 'pending', no owner, not blocked)
- To check overall progress on the project
- To find tasks that are blocked and need dependencies resolved
${teammateUseCase}- After completing a task, to check for newly unblocked work or claim the next available task
- **Prefer working on tasks in ID order** (lowest ID first) when multiple tasks are available, as earlier tasks often set up context for later ones

## Output

Returns a summary of each task:
${idDescription}
- **subject**: Brief description of the task
- **status**: 'pending', 'in_progress', or 'completed'
- **owner**: Agent ID if assigned, empty if available
- **blockedBy**: List of open task IDs that must be resolved first (tasks with blockedBy cannot be claimed until dependencies resolve)

Use TaskGet with a specific task ID to view full details including description and comments.
${teammateWorkflow}`
}
