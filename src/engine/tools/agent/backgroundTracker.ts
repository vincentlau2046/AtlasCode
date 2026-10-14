/**
 * engine/tools/agent — 后台 agent promise 追踪器（0.1.66 Q3-2 a1 翻转波 R4 裁定落码）
 *
 * R4 裁定（Main 2026-10-14）：headless/-p 翻转为后台默认后，主回合结束 +
 * stdin drain 后，进程退出前须 drain 所有 pending 后台 agent（对标上游 -p 语义
 * = 不静默 kill）。无此机制 = 后台 agent 随进程退出被杀，工作丢失。
 *
 * TUI 侧不消费本追踪器——TUI 有自己的 React task panel（progress tracker /
 * AppState.tasks 记录面），交互式会话持续运行，通知经消息队列注入。
 * headless/-p/SDK 非交互路径 = 进程退出 = fire-and-forget promise 随进程死亡
 * → 本追踪器提供 drain 面（print.ts 退出前 await）。
 *
 * 模块级 Set（同 notification.ts handler 模式，单测 reset 面）：
 *   - trackBackgroundAgent(p)：加入 Set，settle 后自动移除
 *   - drainPendingBackgroundAgents(signal)：Promise.allSettled 全 pending
 *   - hasPendingBackgroundAgents()：goal 评估器 / hasPendingBackgroundTasks 消费面
 *   - resetBackgroundAgentTracker()：单测复位
 */
const pendingBackgroundAgents = new Set<Promise<unknown>>()

/**
 * 追踪一个后台 agent promise（AgentTool.call 异步分支消费）。
 * promise settle 后自动从 Set 移除（防内存泄漏 + hasPending 准确）。
 */
export function trackBackgroundAgent(p: Promise<unknown>): void {
  // then(onFulfilled, onRejected) 防 unhandled rejection（drainPendingBackgroundAgents
  // 用 allSettled 不抛，但原始 promise rejection 须 handled 防运行时警告）。
  const handled = p.then(
    () => {},
    () => {},
  )
  pendingBackgroundAgents.add(handled)
  void handled.finally(() => {
    pendingBackgroundAgents.delete(handled)
  })
}

/**
 * 是否有 pending 后台 agent（hasPendingBackgroundTasks dep 消费面；
 * print.ts drain 门控消费面）。
 */
export function hasPendingBackgroundAgents(): boolean {
  return pendingBackgroundAgents.size > 0
}

/**
 * Drain 所有 pending 后台 agent（print.ts 进程退出前消费）。
 * Promise.allSettled = 不抛（单个 agent 失败不阻断 drain）。
 * signal abort 时立即返回（SIGINT = 用户中止，不再等）。
 */
export async function drainPendingBackgroundAgents(
  signal?: AbortSignal,
): Promise<void> {
  if (pendingBackgroundAgents.size === 0) return
  const promises = Array.from(pendingBackgroundAgents)
  if (signal?.aborted) return
  await Promise.allSettled(promises)
}

/** 单测复位（防跨用例泄漏）。 */
export function resetBackgroundAgentTracker(): void {
  pendingBackgroundAgents.clear()
}
