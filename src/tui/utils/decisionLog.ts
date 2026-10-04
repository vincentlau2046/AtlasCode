// P1a Decisions 页（spec §4 P1a 页 4）——权限判定只读投影 ring buffer
//
// 记录点：useCanUseTool 的 decisionPromise.then 收敛点（allow/deny/ask 唯一
// 汇聚处）——TUI hook 层加性调用（判定逻辑本体零改动）。红线 1：engine/query
// 主路径零触碰；红线 2：页面仅订阅本 buffer 快照（只读），不回写主循环。
//
// 先例：gitStore.ts / densityStore.ts（模块级快照 + createSignal +
// useSyncExternalStore 消费）；有界 append-only（cap 50 = Decisions 页「最近 N」）。
// 零 engine/modelprovider 依赖（TUI leaf）。

import { createSignal } from './signal.js'
import type { PermissionDecisionReason } from '../types/permissions.js'

/** 判定结果（PermissionDecision.behavior 三态）。 */
export type DecisionBehavior = 'allow' | 'ask' | 'deny'

/** Decisions 页一条（经 verdictLine 只读渲染）。 */
export interface DecisionEntry {
  behavior: DecisionBehavior
  toolName: string
  toolUseID: string
  reason: PermissionDecisionReason | undefined
  at: number
}

const CAP = 50

let snapshot: readonly DecisionEntry[] = []
const changed = createSignal()

/** 记录一条判定（useCanUseTool 收敛点加性调用；append-only，超 cap 丢最旧）。 */
export function recordDecision(
  behavior: DecisionBehavior,
  toolName: string,
  toolUseID: string,
  reason: PermissionDecisionReason | undefined,
): void {
  const next = [
    ...snapshot,
    { behavior, toolName, toolUseID, reason, at: Date.now() },
  ]
  snapshot = next.length > CAP ? next.slice(next.length - CAP) : next
  changed.emit()
}

/** 稳定快照（useSyncExternalStore getSnapshot 契约：仅变更时换新引用）。 */
export function getDecisionLog(): readonly DecisionEntry[] {
  return snapshot
}

export const subscribeToDecisionLog = changed.subscribe

/** 测试用重置。 */
export function resetDecisionLogForTests(): void {
  snapshot = []
  changed.clear()
}
