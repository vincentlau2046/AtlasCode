/**
 * engine/state — EngineState 不可变 store（set(f) 纯函数, 同 AppState 同构）
 *
 * 来源（R3a 并发模型，execution-strategy §5 R3a / M3a.3 原型 9/9 绿转正）：
 *   旧仓 QueryEngine `updateFileHistoryState`（QueryEngine.ts:375-383）= 嵌套
 *   functional-update + `setAppState` 串行（React 批处理），旧仓
 *   `MAX_TOOL_USE_CONCURRENCY=10` 并发全绿 → set(f) 队列是 **setAppState 串行性
 *   的同构迁移非新发明**。M3a.3 原型 9 断言全绿（100 并发零丢失 / f 看最新 prev /
 *   并行 Edit 可交换 / 不批处理合并 / 反例守卫 / rewind 串行化），本版将原型
 *   `~30 行 store 原语` 转正为正式模块；并发正确性由 co-located 单测
 *   `tests/unit/engine-state.test.ts` 锁定（非 tautology）。
 *
 * 设计（裁剪版真核心，残留守头注释防「以为已全」）：
 *   - 本版 = 泛型 store 原语（`set(f)` 串行 apply 队列 + `get()`）。并发正确性
 *     已由单测锁（100 并发零丢失 + 反例 read-compute-write 丢更新守卫）。
 *   - 具体 AppState 族字段（fileHistory / attribution / totalUsage / readFileState /
 *     permissionDenials / mutableMessages，charter L4.7 裁定 #3 收进 EngineState）
 *     随各自纵切在此类上挂载（fileHistory/attribution 骨架待 C 波填实），本版不预造。
 *   - 残留守：批处理合并策略（与 React 差异已原型验证为「不合并」，中间态可观测）/
 *     具体字段挂载（后续纵切）/ 可选 subscribe 观测 API（暂无消费方，不加）。
 */
export type StateUpdater<S> = (prev: S) => S

export class EngineState<S> {
  private state: S
  private queue: Array<{
    f: StateUpdater<S>
    resolve: () => void
    reject: (e: unknown) => void
  }> = []
  private processing = false

  constructor(initial: S) {
    this.state = initial
  }

  /**
   * 串行 apply：f 始终看最新 committed prev；每次 apply 即提交（不批处理合并）。
   * 并发 set 入同一队列串行 drain，非函数式/无队列的 read-compute-write 会丢更新。
   *
   * updater 抛错语义（review 2026-09-23 修）：reject 该调用方（不挂起）+ state 不变 +
   * 队列继续 drain（单个坏 updater 不卡死整队列）。异于 React error boundary（React
   * updater 返 void 无 awaitable、抛错走 boundary）——本版 awaitable 契约下 fail-fast 到调用方。
   */
  set(f: StateUpdater<S>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ f, resolve, reject })
      void this.process()
    })
  }

  private async process(): Promise<void> {
    if (this.processing) return
    this.processing = true
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!
        // 微任务边界：每次 apply 是独立 async 提交（不合并，与 React 批处理差异）。
        await Promise.resolve()
        try {
          this.state = item.f(this.state) // f 看最新 committed state
          item.resolve()
        } catch (e) {
          // updater 抛错：只 reject 该调用方（state 不变），队列继续 drain 后续 updater。
          item.reject(e)
        }
      }
    } finally {
      this.processing = false
    }
  }

  /** 最新 committed 状态（set 是 async，未 await 的 set 尚未提交）。 */
  get(): S {
    return this.state
  }
}
