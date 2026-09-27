/**
 * In-Process Teammate Helpers（C 桶 ③ shell·swarm 波 S-E2b，§8.66）。
 *
 * 源 = 旧仓 a8af45b src/utils/inProcessTeammateHelpers.ts（102L 逐字）。
 * 提供面：按 agent name 查 task ID / plan 审批响应处理 /
 * awaitingPlanApproval 状态更新 / 权限相关消息判定。
 *
 * import 面重映射：
 *   - InProcessTeammateTaskState/isInProcessTeammateTask → task 域门面
 *     （task/inProcessTeammate 反推真形，本波落）
 *   - SetAppState/TaskAppState → task 域门面（旧 state/AppState 全量面 →
 *     task 域最小 AppState 残余 ① 同型）
 *   - updateTaskState → engine 域根门面（coordinator tasks 框架）
 *   - isPermissionResponse/isSandboxPermissionResponse/
 *     PlanApprovalResponseMessage → engine 域根门面（messaging mailbox 面）
 */
import {
  type InProcessTeammateTaskState,
  isInProcessTeammateTask,
  type SetAppState,
  type TaskAppState,
} from '../task'
import {
  isPermissionResponse,
  isSandboxPermissionResponse,
  type PlanApprovalResponseMessage,
  updateTaskState,
} from '../engine'

/**
 * Find the task ID for an in-process teammate by agent name.
 *
 * @param agentName - The agent name (e.g., "researcher")
 * @param appState - Current task 域 AppState
 * @returns Task ID if found, undefined otherwise
 */
export function findInProcessTeammateTaskId(
  agentName: string,
  appState: TaskAppState,
): string | undefined {
  for (const task of Object.values(appState.tasks)) {
    if (isInProcessTeammateTask(task) && task.identity.agentName === agentName) {
      return task.id
    }
  }
  return undefined
}

/**
 * Set awaitingPlanApproval state for an in-process teammate.
 *
 * @param taskId - Task ID of the in-process teammate
 * @param setAppState - AppState setter
 * @param awaiting - Whether teammate is awaiting plan approval
 */
export function setAwaitingPlanApproval(
  taskId: string,
  setAppState: SetAppState,
  awaiting: boolean,
): void {
  updateTaskState<InProcessTeammateTaskState>(taskId, setAppState, task => ({
    ...task,
    awaitingPlanApproval: awaiting,
  }))
}

/**
 * Handle plan approval response for an in-process teammate.
 * Called by the message callback when a plan_approval_response arrives.
 *
 * This resets awaitingPlanApproval to false. The permissionMode from the
 * response is handled separately by the agent loop (Task #11).
 *
 * @param taskId - Task ID of the in-process teammate
 * @param _response - The plan approval response message (for future use)
 * @param setAppState - AppState setter
 */
export function handlePlanApprovalResponse(
  taskId: string,
  _response: PlanApprovalResponseMessage,
  setAppState: SetAppState,
): void {
  setAwaitingPlanApproval(taskId, setAppState, false)
}

// ============ Permission Delegation Helpers ============

/**
 * Check if a message is a permission-related response.
 * Used by in-process teammate message handlers to detect and process
 * permission responses from the team leader.
 *
 * Handles both tool permissions and sandbox (network host) permissions.
 *
 * @param messageText - The raw message text to check
 * @returns true if the message is a permission response
 */
export function isPermissionRelatedResponse(messageText: string): boolean {
  return (
    !!isPermissionResponse(messageText) ||
    !!isSandboxPermissionResponse(messageText)
  )
}
