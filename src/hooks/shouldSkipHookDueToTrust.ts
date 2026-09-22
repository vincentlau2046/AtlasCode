/**
 * hooks 域 — shouldSkipHookDueToTrust（C-Deep 切片 3 T6）
 *
 * 旧仓来源（a8af45b）: src/utils/hooks.ts shouldSkipHookDueToTrust（L282）。
 * 跨域依赖（isNonInteractive / hasTrustAccepted）经 bootstrap-env 注入窗口斩断。
 *
 * 语义：非交互（SDK/headless）信任隐式 → 恒执行；交互式下所有钩子都要求
 * 工作区信任（防信任对话框前误执行 SessionEnd/SubagentStop 等历史漏洞）。
 */
import { getHooksBootstrapEnv } from './bootstrap-env'

/** @returns true 表示应跳过该钩子（缺信任），false 表示应执行。 */
export function shouldSkipHookDueToTrust(): boolean {
  const b = getHooksBootstrapEnv()
  // 非交互模式（SDK/headless）信任隐式 —— 恒执行（不跳过）
  if (b.isNonInteractive()) {
    return false
  }
  // 交互模式：所有钩子都要求信任，缺信任则跳过
  return !b.hasTrustAccepted()
}
