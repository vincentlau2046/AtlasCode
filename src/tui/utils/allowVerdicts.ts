/**
 * #278 A4 allow 面（0.1.26 波）：auto-allow 判定的 verdict 数据（rule-allow /
 * bypass / classifier-approved 三句的渲染源，句体单一事实源 = permissionVerdict.ts
 * verdictLine，本文件只存数据不造句，红线④ 文案原创）。
 *
 * 在 auto-allow 决策收敛点（useCanUseTool allow 支，与 recordDecision 同点）置位——
 * 记 { reason（decisionReason）, mode }；UserToolSuccessMessage 挂载时读取并立即删除
 * （防 Map 无界增长）——与 userApprovals.ts / classifierApprovals.ts 同模式
 * （Map + 挂载即删），不加 feature 门（allow 面 verdict 不依赖分类器 stub，恒可用）。
 *
 * 零边界：纯 TUI 层只读投影面，主路径（engine/query/permissions）零改动（红线①）。
 */

import type {
  PermissionDecisionReason,
  PermissionMode,
} from '../types/permissions.js'

/** auto-allow 判定面：为何自动放行（decisionReason + 当时 mode，verdictLine 消费）。 */
export type AllowVerdict = {
  reason: PermissionDecisionReason | undefined
  mode: PermissionMode
}

const ALLOW_VERDICTS = new Map<string, AllowVerdict>()

export function setAllowVerdict(
  toolUseID: string,
  verdict: AllowVerdict,
): void {
  ALLOW_VERDICTS.set(toolUseID, verdict)
}

export function getAllowVerdict(
  toolUseID: string,
): AllowVerdict | undefined {
  return ALLOW_VERDICTS.get(toolUseID)
}

export function deleteAllowVerdict(toolUseID: string): void {
  ALLOW_VERDICTS.delete(toolUseID)
}

/** 测试用重置。 */
export function clearAllowVerdicts(): void {
  ALLOW_VERDICTS.clear()
}
