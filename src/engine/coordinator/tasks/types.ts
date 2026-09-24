/**
 * tasks 域 TaskState 真联合（S-7a）
 *
 * 旧仓 tasks/types.ts 为 `TaskState = any` 三行桩（React 渲染面分离产物）；
 * 新仓无 .tsx 渲染面 → 域内真联合（当前注册表 = LocalShellTask +
 * LocalAgentTask 两态；InProcessTeammateTask 随 S-7e 扩联合，不预置死位）。
 */
import type { LocalAgentTaskState } from './localAgentTask'
import type { LocalShellTaskState } from './guards'

export type TaskState = LocalAgentTaskState | LocalShellTaskState
