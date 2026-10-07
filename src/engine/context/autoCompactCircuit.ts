/**
 * engine/context — D2（0.1.37 ③，P2 恢复层 C2 缺口）：auto-compact 断路器
 * 跳闸态 store（React-free 模块态，compactWarningStore 同款先例）。
 *
 * P2 报告 §2 C2：断路器 3 连败跳闸（autoCompact.ts:532-535，MAX_CONSECUTIVE_
 * AUTOCOMPACT_FAILURES）后 pre-turn compact 永久短路，**无任何用户面状态**
 *（静默失能 = 最坏失败形态）。本 store = 跳闸态单一事实源：
 *   - 更新点 = engine loop（queryAgentLoop pre-turn 支，双车道 TUI/headless
 *     同面）：压缩成功重置支 → clearAutoCompactCircuitFailures()；失败回灌支
 *     → reportAutoCompactCircuitFailures(n)。
 *   - 消费面 = ① TUI TokenWarning 区跳闸态渲染（「auto-compact 已暂停（N 次
 *     失败）· 可手动 /compact·换小模型·新会话」，纯加性渲染零行为面）② 模型侧
 *     告知一句话注入（deepseek NEVER_SENTENCE 模式，防 futile 请求——跳闸态
 *     下模型侧知悉 auto-compact 不可用，不发起注定超窗的长请求）。
 * 订阅面（subscribe）供 TUI hook 活订阅；渲染面可经 getAutoCompactCircuitFailures
 * 快照读（组件重渲染时新鲜，跳闸态为低频态，快照语义足够）。
 */
import { MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES } from './autoCompact'

type Listener = () => void

let failures = 0
const listeners = new Set<Listener>()

export const autoCompactCircuitStore = {
  getState: (): number => failures,
  setState: (next: number): void => {
    if (Object.is(next, failures)) return
    failures = next
    for (const listener of listeners) listener()
  },
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

/** 当前连续失败计数（快照读；= 0 表示未失败/已复位）。 */
export function getAutoCompactCircuitFailures(): number {
  return failures
}

/** 断路器跳闸判定（n 缺省 = 当前 store 值）。 */
export function isAutoCompactCircuitTripped(n?: number): boolean {
  return (n ?? failures) >= MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES
}

/** 失败回灌更新点（loop pre-turn 压缩失败支，tracking.consecutiveFailures 回灌同值）。 */
export function reportAutoCompactCircuitFailures(n: number): void {
  autoCompactCircuitStore.setState(n)
}

/** 成功复位更新点（loop pre-turn 压缩成功重置支；计数清零）。 */
export function clearAutoCompactCircuitFailures(): void {
  autoCompactCircuitStore.setState(0)
}

/** 单测 teardown：清状态 + 清订阅（compactWarningState 无 teardown 面 = 本面补全）。 */
export function resetAutoCompactCircuitForTesting(): void {
  autoCompactCircuitStore.setState(0)
  listeners.clear()
}
