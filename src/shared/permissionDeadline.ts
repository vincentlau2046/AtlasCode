/**
 * P1 mailbox 审批兜底 deadline 策略（0.1.37 ⑧ 收敛：shared 单一事实源）。
 *
 * 0.1.36 切片① 原定义在 src/swarm/inProcessRunner.ts（engine 面）。0.1.37 ⑧ 封
 * TUI pane-worker 用户面（swarmWorkerHandler worker 侧 promise）时，boundaries
 * 规则 tui↛swarm（eslint.config.mjs tui allow 面不含 swarm）→ 两面（swarm
 * engine + tui）共同收敛到 shared 叶子经门面消费：env 名 + 缺省值 + fail-closed
 * 措辞单一事实源，两消费面不漂移。
 *
 * 消费面：
 * - engine：src/swarm/inProcessRunner.ts（mailbox 回退支 gate，0.1.36 切片①）
 * - tui：src/tui/hooks/toolPermission/handlers/swarmWorkerHandler.ts（worker
 *   侧 promise 第 4 终态，0.1.37 ⑧）
 */

/**
 * P1（0.1.36 切片①）：mailbox 兜底协作式 deadline 缺省（ms）。
 * 参照 deepseek `guard/timeout-policy`（仅本层 timer 先到期才替换结果）：leader
 * 失响应超 deadline → 第 4 个终态 fail-closed deny（unavailable 语义），回合继续、
 * 进程可退、pendingCallbacks 不泄漏。30s = leader 审批的有界等待上限（超此 = leader
 * 失响应，回合不再无限挂死）。env `ATLAS_PERM_MAILBOX_DEADLINE_MS` 可覆盖（e2e V3
 * 探针设小值加速；非法/非正值回落缺省）。
 */
const PERMISSION_MAILBOX_DEADLINE_MS = 30_000

/** P1：mailbox 兜底 deadline 解析（env 覆盖 + 缺省回落；纯面 = 判别单测可测）。 */
export function resolveMailboxPermissionDeadlineMs(): number {
  const raw = process.env.ATLAS_PERM_MAILBOX_DEADLINE_MS
  const parsed = raw !== undefined ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : PERMISSION_MAILBOX_DEADLINE_MS
}

/**
 * P1：timeout 终态 fail-closed deny 的模型可见 reason（unavailable 语义，**deny**
 * 措辞——超时场景恰是「无人可确认」，非 "confirmation required"；带 deadline Nms
 * 可审计）。engine 面经 toolExecution ask:false 支渲染 `permission denied: <reason>`
 * （is_error tool_result，模型可见、回合继续）；TUI 面经 buildReject 拼
 * SUBAGENT 前缀送回 worker agent（A2 语义：不 abort，回合继续）。
 */
export function approvalUnavailableReason(deadlineMs: number): string {
  return (
    `approval unavailable: the approver (leader) did not respond within ` +
    `${deadlineMs}ms, so this tool use was denied (fail-closed) — the permission ` +
    `request was not granted and the tool did NOT run. Try a different approach that ` +
    `does not require approval, or retry once the approver is available.`
  )
}
