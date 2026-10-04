/**
 * P0a 可解释审批：用户弹框批准标记（allow 态「为何自动放行」= 用户裁决方向）。
 *
 * 在权限弹框 yes 分支置位（components/permissions/* 的 onSelect），
 * UserToolSuccessMessage 挂载时读取并立即删除（防 Map 无界增长）——
 * 与 classifierApprovals.ts 同模式（Map + 挂载即删），但不加 feature 门
 * （用户批准不依赖任何分类器 stub，恒可用）。
 *
 * 零边界：纯 TUI 层标记面，主路径（engine/query/permissions）零改动。
 */

const USER_APPROVALS = new Map<string, true>()

export function setUserApproval(toolUseID: string): void {
  USER_APPROVALS.set(toolUseID, true)
}

export function getUserApproval(toolUseID: string): boolean {
  return USER_APPROVALS.has(toolUseID)
}

export function deleteUserApproval(toolUseID: string): void {
  USER_APPROVALS.delete(toolUseID)
}
