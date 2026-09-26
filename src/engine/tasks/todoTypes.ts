/**
 * engine/tasks — Todo 型面（§8.56 S-D2 依赖闭包层，旧仓 utils/todo/types.ts
 * 18L 随迁；TodoWrite 消费面）。
 *
 * 旧仓来源（a8af45b）：src/utils/todo/types.ts 18L。
 * delta ①：旧 zod TodoStatusSchema/TodoItemSchema/TodoListSchema（lazySchema 3
 *   导出）→ TS 字面量联合 TodoStatus + TodoItem/TodoList 接口（JSON schema 化
 *   先例 S-C1 delta ①）。旧 TodoItemSchema content/activeForm `min(1)` 约束 →
 *   新契约由 TodoWrite 工具面 inputSchema `minLength: 1` 承载（S-D4 登记），
 *   存储域不保留运行时守卫面（无消费方，H6 不造死面）。
 */

export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export interface TodoItem {
  /** 旧仓 `content: z.string().min(1, 'Content cannot be empty')`。 */
  content: string
  status: TodoStatus
  /** 旧仓 `activeForm: z.string().min(1, 'Active form cannot be empty')`。 */
  activeForm: string
}

export type TodoList = TodoItem[]
