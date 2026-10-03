import type { ToolPermissionContext } from '../../Tool.js'
import type { AppState } from '../../state/AppState.js'
import {
  isAutoModeGateEnabled,
  transitionPermissionMode,
} from './permissionSetup.js'

type SetAppState = (updater: (prev: AppState) => AppState) => void

/**
 * 2026-10-04 issule 工单 Task A2 — 权限弹框第 4 选项 = auto mode。
 *
 * 裁定（记录于 A2 提交头注）：选中该选项 = 把本 session 切到 auto mode
 * （transitionPermissionMode current→'auto'，permissionSetup.ts:585 — 激活
 * 分类器 + stripDangerousPermissionsForAutoMode），并把当前这 1 个 pending
 * 请求 re-dispatch 走 auto 门控——不重收 accept/reject、不重放历史队列。
 *
 * re-dispatch 复用现有 ToolUseConfirm.recheckPermission() 面：它按 LIVE
 * AppState（此刻已带 mode 'auto'）重跑 hasPermissionsToUseTool，于是：
 *   - 非危险 / 规则已覆盖的工具 → 结果翻 'allow'，recheck 自行 resolve +
 *     移出队列（弹框关闭、工具执行）—— auto 放行
 *   - 危险工具 → 结果仍 'ask'，弹框留在原地按 auto 态再问（对齐先前
 *     「危险工具仍弹框问」裁定）
 * 不新造判定逻辑：门控判定（isAutoModeGateEnabled）与危险权限剥离
 * （transitionPermissionMode 内）均为既有面。
 */

/**
 * Whether the 4th "auto mode" option should be shown in a permission dialog:
 * the auto gate is enabled AND the session is not already in auto mode
 * (re-selecting auto would be a no-op transition).
 */
export function isAutoModeOptionVisible(
  context: ToolPermissionContext,
): boolean {
  return isAutoModeGateEnabled() && context.mode !== 'auto'
}

/**
 * Apply the "auto mode" option selection: transition the session to auto mode
 * and re-dispatch the caller's single pending request through the auto gate.
 *
 * @param context The current tool permission context (source mode).
 * @param setAppState AppState updater — publishes the transitioned context so
 *   the live permission check (recheckPermission → hasPermissionsToUseTool →
 *   context.getAppState()) sees mode 'auto'.
 * @param recheckPermission The pending request's recheck (ToolUseConfirm
 *   `.recheckPermission`). allow → resolves + closes the dialog; ask → leaves
 *   the dialog open for a re-ask. Runs AFTER the AppState update so the
 *   recheck reads the new mode.
 */
export function applyAutoModePermissionOption(
  context: ToolPermissionContext,
  setAppState: SetAppState,
  recheckPermission: () => Promise<void>,
): void {
  let next: ToolPermissionContext
  try {
    next = {
      ...transitionPermissionMode(context.mode, 'auto', context),
      mode: 'auto',
    }
  } catch {
    // Race: gate flipped off between render and click (circuit breaker
    // tripped or settings hot-reload). Fall back to a plain re-dispatch in
    // the current mode — the dialog behaves exactly as before.
    void recheckPermission()
    return
  }
  setAppState(prev => ({ ...prev, toolPermissionContext: next }))
  // Re-dispatch ONLY this single pending request (not any historical queue):
  // the recheck settles it via the auto gate (allow → close; ask → re-ask).
  void recheckPermission()
}
