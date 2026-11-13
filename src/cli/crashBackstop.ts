/**
 * 全局崩溃兜底（loop-robustness 缺口①，#262）：headless/CLI 车道装全局
 * uncaughtException / unhandledRejection 处理器，对齐 TUI 车道。
 *
 * 根因：TUI 车道经 setupGracefulShutdown（src/tui/utils/gracefulShutdown.ts，
 * 仅 TUI 入口 entrypoints/init.ts:79 调）注册了 uncaught/unhandledRejection
 * log 处理器 → 长跑中单次 uncaught 被 log + 存活；headless 车道
 * （cli.ts binMain headless 支 → dispatch.main → print.ts）无此兜底 → Node
 * 默认 uncaught 直接 FATAL 崩（进程亡），击穿「coding agent 持续长时间不
 * 中断」基本要求（用户点名最高优先，#262）。
 *
 * 域裁定：落 cli（CLI 公共域）= headless 车道生命周期面（本缺口为 headless
 * 车道特有，非通用 bootstrap 面）。React-free、零 import（leaf），不 import
 * src/tui（cli 公共域不引 tui 域，见 dispatch.ts / cli.ts 边界纪律）。TUI 车道
 * 保留其更富的 setupGracefulShutdown（终端清理 + resume hint + SessionEnd
 * hooks），本模块只在 headless 支调用（不触 TUI/dev 支，避免 TUI 双 handler
 * 语义漂移）。
 *
 * 语义：注册处理器 = Node 不再走默认崩溃，改为 log（stderr）+ 存活。幂等
 * （memoize）：重复调用不重复注册。
 */

let registered = false

/** 是否已装（判别单测 / 活探针用；headless 支调用后 = true）。 */
export function isCrashBackstopRegistered(): boolean {
  return registered
}

/**
 * 装全局崩溃兜底（幂等）。headless 支入口 binMain() 首段调用，早于任何命令
 * 执行，使 mount / 命令 / agent loop 全程的 uncaught / unhandledRejection 均
 * 被 log + 存活兜住（长跑不中断）。
 */
export function registerGlobalCrashBackstop(): void {
  if (registered) {
    return
  }
  registered = true

  process.on('uncaughtException', error => {
    writeCrashDiag('uncaughtException', error)
  })

  process.on('unhandledRejection', reason => {
    writeCrashDiag('unhandledRejection', reason)
  })
}

/** log + 存活（非 Node 默认崩溃）：stderr 写失败（SIGHUP 后 / PTY 断）忽略。 */
function writeCrashDiag(kind: string, value: unknown): void {
  const formatted =
    value instanceof Error
      ? `${value.name}: ${value.message}\n${value.stack ?? ''}`.trim()
      : String(value)
  try {
    process.stderr.write(`[atlas][${kind}] ${formatted}\n`)
  } catch {
    // 兜底目标（log + 存活）已达成，stderr 写失败忽略。
  }
}
