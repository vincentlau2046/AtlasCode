/**
 * engine/context — 压缩警告抑制态（D-2a S1，M5 切端回填）：
 * 旧仓 orchestrator/context/compactWarningState.ts 单源迁 engine（store 为
 * React-free 最小实现——engine 域 React-free 红线，React hook
 * useCompactWarningSuppression 留 tui 壳经 useSyncExternalStore 订阅本 store）。
 *
 * 语义（旧仓逐字）：压缩成功后立即抑制 "context left until autocompact" 警告
 * （下次 API response 前 token 计数不精确）；新压缩尝试开始时 clear。
 * tui 侧 compactWarningState.ts 退化为经 src/engine 门面 re-export 壳（S1），
 * S9 随 orchestrator 目录删除。
 */

type Listener = () => void

let suppressed = false
const listeners = new Set<Listener>()

export const compactWarningStore = {
  getState: (): boolean => suppressed,
  setState: (updater: (prev: boolean) => boolean): void => {
    const prev = suppressed
    const next = updater(prev)
    if (Object.is(next, prev)) return
    suppressed = next
    for (const listener of listeners) listener()
  },
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

/** Suppress the compact warning. Call after successful compaction. */
export function suppressCompactWarning(): void {
  compactWarningStore.setState(() => true)
}

/** Clear the compact warning suppression. Called at start of new compact attempt. */
export function clearCompactWarningSuppression(): void {
  compactWarningStore.setState(() => false)
}
