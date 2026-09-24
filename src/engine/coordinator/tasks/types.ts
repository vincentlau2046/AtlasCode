/**
 * tasks 域 TaskState 真联合（S-7a）
 *
 * 旧仓 tasks/types.ts 为 `TaskState = any` 三行桩（React 渲染面分离产物）；
 * 新仓无 .tsx 渲染面 → 域内真联合（当前注册表 = LocalShellTask +
 * LocalAgentTask 两态；InProcessTeammateTask 归 shell/swarm 波扩联合
 * （§8.50 裁定，原注「随 S-7e」陈旧，§8.51 复审 B-NOTE-1 回刷），不预置死位）。
 */
import type { LocalAgentTaskState } from './localAgentTask'
import type { LocalShellTaskState } from './guards'

export type TaskState = LocalAgentTaskState | LocalShellTaskState
