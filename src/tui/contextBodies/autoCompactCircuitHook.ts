import { useSyncExternalStore } from 'react'
import { autoCompactCircuitStore } from 'src/engine'

/**
 * D2（0.1.37 ③，P2 恢复层 C2 缺口）：auto-compact 断路器跳闸态 React 订阅
 * hook（compactWarningHook 同款先例——engine store React-free 红线，hook 留
 * tui 壳订阅 engine 模块态 store）。
 *
 * 消费面 = TokenWarning 区跳闸态渲染：断路器 3 连败跳闸（≥ MAX_CONSECUTIVE_
 * AUTOCOMPACT_FAILURES）后 pre-turn auto-compact 永久短路，原「X% until
 * auto-compact」文案失真（auto-compact 不会触发）→ 跳闸态改渲染「auto-compact
 * 已暂停（N 次失败）· 可手动 /compact·换小模型·新会话」，纯加性渲染零行为面
 * 变更。返回值 = 当前连续失败计数（0 = 未失败/已复位）；跳闸判定 =
 * isAutoCompactCircuitTripped(count)（消费点自判，语义单源 engine 域）。
 */
export function useAutoCompactCircuitFailures(): number {
  return useSyncExternalStore(
    autoCompactCircuitStore.subscribe,
    autoCompactCircuitStore.getState,
  )
}
