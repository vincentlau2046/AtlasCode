/**
 * tasks 域 TaskState 真联合（S-7a）
 *
 * 旧仓 tasks/types.ts 为 `TaskState = any` 三行桩（React 渲染面分离产物）；
 * 新仓无 .tsx 渲染面 → 域内真联合。
 *
 * 联合扩三态（C 桶 ③ shell·swarm 波 S-E2b，§8.66；§8.50 裁定 / §8.51
 * 复审 B-NOTE-1 回刷项核销）：InProcessTeammateTaskState 归 task 域
 * （task/inProcessTeammate.ts，4 消费端反推真形——旧仓 any-stub 5 行，
 * H6 重建登记见该文件头注），联合面经 task 域门面单一事实源。
 */
import type { InProcessTeammateTaskState } from '../../../task'
import type { LocalAgentTaskState } from './localAgentTask'
import type { LocalShellTaskState } from './guards'

export type TaskState =
  | LocalAgentTaskState
  | LocalShellTaskState
  | InProcessTeammateTaskState
