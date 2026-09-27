/**
 * PermissionResponse — 权限响应共享形（S-E2a 抽取；R3 配套）。
 *
 * 源 = 旧仓 a8af45b src/utils/swarm/permissionSync.ts:523-539（6 字段）逐字。
 * 归属裁定：类型本体落本文件（叶子层单一事实源），S-E2d permissionSync.ts
 * 经 `export type { PermissionResponse } from './permissionResponse'` 再导出
 * （旧仓该类型即定义于 permissionSync，消费点经其门面导入的兼容性保持）。
 * 消费面 = permissionPoller 回调面（本切片）+ useCanUseTool worker 集成
 * （TUI 波）+ permissionSync（S-E2d）。
 */

/**
 * Legacy response type for worker polling
 * Used for backward compatibility with worker integration code
 */
export type PermissionResponse = {
  /** ID of the request this responds to */
  requestId: string
  /** Decision: approved or denied */
  decision: 'approved' | 'denied'
  /** Timestamp when response was created */
  timestamp: string
  /** Optional feedback message if denied */
  feedback?: string
  /** Optional updated input if the resolver modified it */
  updatedInput?: Record<string, unknown>
  /** Permission updates to apply (e.g., "always allow" rules) */
  permissionUpdates?: unknown[]
}
