/**
 * K3-B1（0.1.82，上游 300 对齐）：headless（-p）退出面 SessionEnd hooks。
 *
 * 判别结论：TUI 退出面已覆盖（exit.tsx → gracefulShutdown →
 * executeSessionEndHooks，tui 面，1.5s 预算 + failsafe timer）；
 * **headless 车道缺口**——print.ts runHeadless 接的是 engine 面 hooks
 * （wireCliHooksDeps 三窗口），其 runSessionEndHooks 全仓零消费：成功支
 * （cron 停 + drain 后台命令/pending agent 完）与错误支（abort +
 * exitCode=1）均直接退出，SessionEnd 从不触发。-p 恰是最常与后台命令
 * 共存的形态，即上游 300「退出时后台命令在跑 SessionEnd 有时不跑」的
 * 本地等价缺口。
 *
 * 语义：fail-open——hook 执行失败/抛错不阻断退出路径（收尾钩子不该改写
 * 退出码）；runSessionEndHooks 自带 1500ms 短超时档
 * （ATLAS_SESSIONEND_HOOKS_TIMEOUT_MS），收尾不挂起。
 */
import { runSessionEndHooks } from '../hooks'
import { logForDebugging } from './debugSink'

/**
 * headless 退出前触发 SessionEnd hooks（engine 面）。
 * @param reason 退出原因（成功支 'prompt_input_exit'，错误支 'other'，
 *               与 TUI gracefulShutdown 的 reason 语义对齐）
 */
export async function runHeadlessSessionEndHooks(
  reason: string,
): Promise<void> {
  try {
    await runSessionEndHooks(reason)
  } catch (error) {
    // fail-open：收尾钩子异常不改变退出路径（debug 面记录）
    logForDebugging(
      `SessionEnd hooks (headless exit, reason=${reason}) failed: ${String(error)}`,
      { level: 'error' },
    )
  }
}
