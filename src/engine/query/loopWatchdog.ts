/**
 * Loop watchdog (0.1.102 P0 切片 2-B, lock-face ① / f4 批复 2026-11-12).
 *
 * 主循环「错误后长久停止无自恢复」P0 的自恢复面：回合内 armed
 * （round_start→round_end），若 120s 缺省窗口内无任何事件且无任何豁免
 * 活动在途，fire = abort 自有 AbortController → 下游经既有 abort 穿透
 * （withTurnRecovery 不重试 abort → loop catch → REPL R1 catch → 错误行
 * + 复位可重入）。禁用用户 abort controller（语义污染）——watchdog 自有
 * controller，只镜像外部 signal 的 abort（outer abort → 本 controller
 * 同步 abort，reason 透传；反向不成立）。
 *
 * 四豁免（lock-face (a)-(d)，到期检查全零才 fire，否则重排定时器）：
 *   (a) 仅回合内 armed —— round_start arm / round_end|loop_end disarm；
 *   (b) permission 等待暂停 —— beginPermissionWait/endPermissionWait
 *       （defer 单源 = mergeHookPermission defer 支 → toolExecution.ts
 *       deferredOutcome，checkPermission 未决即豁免）；
 *   (c) 在途工具计活 —— runToolBatch batch 级在途计数（hung tool 不由
 *       watchdog 管——per-tool timeoutMs 是登记池后续）；LLM 调用同理计活
 *       （modelProvider.chat wrapper，含 backoff 窗内重试在途）；
 *   (d) backoff 窗计活 —— turnRecovery onBackoffStart/End 钩子计数。
 *
 * 单点活动源 = deps.emit 汇聚处（noteEvent）：任意事件 reset 计时窗；
 * round_start/round_end/loop_end 另承担 arm/disarm。轮间（loop 不在
 * while 内时）disarmed = REPL 空闲不触发格。
 *
 * env：ATLAS_LOOP_WATCHDOG_MS（毫秒；0=关；非法值回缺省 120000）。
 * React-free engine leaf（cli 域不引 tui 域边界纪律不破——本模块只被
 * loop.ts / 单测消费）。
 */

/** 回合内无事件判定窗缺省（毫秒）。f4 批复三常数之一。 */
export const DEFAULT_LOOP_WATCHDOG_MS = 120_000

export const LOOP_WATCHDOG_ENV_KEY = 'ATLAS_LOOP_WATCHDOG_MS'

/** 解析看门狗窗口毫秒：env 数字（0=关）→ 缺省；非法值回缺省（fail-open 到保守缺省）。 */
export function resolveLoopWatchdogTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[LOOP_WATCHDOG_ENV_KEY]
  if (raw === undefined || raw === '') return DEFAULT_LOOP_WATCHDOG_MS
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_LOOP_WATCHDOG_MS
  return parsed
}

/** fire 后 abort 的 reason（REPL 错误行可见，给出修复旋钮）。 */
export class LoopWatchdogTimeoutError extends Error {
  constructor(idleMs: number) {
    super(
      `主循环无响应中止：回合内 ${Math.round(idleMs / 1000)}s 无任何事件且无在途活动` +
        `（模型流式/工具执行/权限裁定均无）——本回合已中止，可重试；` +
        `如持续出现请调大 ${LOOP_WATCHDOG_ENV_KEY}（0=关）`,
    )
    this.name = 'LoopWatchdogTimeoutError'
  }
}

type ExpiryCheck = () => void

export class LoopWatchdog {
  private readonly timeoutMs: number
  private readonly controller = new AbortController()
  private timer: ReturnType<typeof setTimeout> | undefined
  private armed = false
  private fired = false
  private disposed = false
  private permissionWaits = 0
  private llmInFlight = 0
  private toolInFlight = 0
  private backoffDepth = 0
  private expiryHook: ExpiryCheck | undefined

  constructor(timeoutMs: number) {
    this.timeoutMs = timeoutMs
  }

  /** 下游消费面（deps.signal 替身）。fire 后 aborted=true，reason=超时错误。 */
  get abortSignal(): AbortSignal {
    return this.controller.signal
  }

  get isFired(): boolean {
    return this.fired
  }

  get isArmed(): boolean {
    return this.armed
  }

  /** 诊断/判别单测快照。 */
  activitySnapshot(): {
    armed: boolean
    permissionWaits: number
    llmInFlight: number
    toolInFlight: number
    backoffDepth: number
  } {
    return {
      armed: this.armed,
      permissionWaits: this.permissionWaits,
      llmInFlight: this.llmInFlight,
      toolInFlight: this.toolInFlight,
      backoffDepth: this.backoffDepth,
    }
  }

  /**
   * 外部 signal 镜像：outer abort → 本 controller 同步 abort（reason 透传）。
   * 镜像不受 dispose 封锁（dispose 只关 watchdog 自身的 timer/fire 面——
   * 中止链透传是无条件语义，loop 结束后的 abort 仍须到达下游持有者）。
   */
  attachOuterSignal(signal: AbortSignal | undefined): void {
    if (!signal) return
    if (signal.aborted) {
      this.abort(signal.reason)
      return
    }
    signal.addEventListener('abort', () => {
      this.abort(signal.reason)
    })
  }

  /** emit 汇聚单点：任意事件 reset；round_start/round_end/loop_end 另 arm/disarm。 */
  noteEvent(type: string): void {
    if (this.disposed) return
    if (type === 'round_start') {
      this.arm()
      return
    }
    if (type === 'round_end' || type === 'loop_end') {
      this.disarm()
      return
    }
    this.reset()
  }

  /** 回合开始：armed + 计时窗重开。 */
  arm(): void {
    if (this.disposed || this.fired) return
    this.armed = true
    this.reset()
  }

  /** 回合结束/loop 结束：清定时器（轮间空闲不触发格）。 */
  disarm(): void {
    this.armed = false
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
  }

  /** 事件到达：计时窗重开（仅 armed 时有意义）。 */
  reset(): void {
    if (this.disposed || this.fired || !this.armed) return
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.schedule()
  }

  /** (b) permission 等待豁免：checkPermission wrapper 进出。 */
  beginPermissionWait(): void {
    this.permissionWaits++
  }

  endPermissionWait(): void {
    if (this.permissionWaits > 0) this.permissionWaits--
  }

  /** (c) LLM 调用计活：modelProvider.chat wrapper 进出。 */
  beginLlmCall(): void {
    this.llmInFlight++
  }

  endLlmCall(): void {
    if (this.llmInFlight > 0) this.llmInFlight--
  }

  /** (c) 工具 batch 计活：runToolBatch wrapper 进出。 */
  trackToolBatch<T>(promise: Promise<T>): Promise<T> {
    this.toolInFlight++
    return promise.finally(() => {
      if (this.toolInFlight > 0) this.toolInFlight--
    })
  }

  /** (d) backoff 窗计活：turnRecovery 钩子进出。 */
  beginBackoff(): void {
    this.backoffDepth++
  }

  endBackoff(): void {
    if (this.backoffDepth > 0) this.backoffDepth--
  }

  /**
   * 到期检查：disarmed/disposed = 不动；任一豁免活动在途 = 重排（等待期
   * 每窗复查一次）；全零 = fire（abort 自有 controller + 钩子）。
   */
  private schedule(): void {
    if (this.timeoutMs <= 0) return // 0=关
    this.timer = setTimeout(this.checkExpiry, this.timeoutMs)
    this.timer.unref?.()
  }

  private checkExpiry: ExpiryCheck = () => {
    this.timer = undefined
    if (this.disposed || this.fired || !this.armed) return
    if (
      this.permissionWaits > 0 ||
      this.llmInFlight > 0 ||
      this.toolInFlight > 0 ||
      this.backoffDepth > 0
    ) {
      // 豁免活动在途：不算无事件，重排等待下一窗。
      this.schedule()
      return
    }
    this.fired = true
    this.armed = false
    this.controller.abort(new LoopWatchdogTimeoutError(this.timeoutMs))
    this.expiryHook?.()
  }

  /** fire 侧钩（诊断/测试观察点；生产零消费）。 */
  onExpiry(hook: ExpiryCheck): void {
    this.expiryHook = hook
  }

  /** 统一 abort 入口：watchdog fire 与 outer 镜像共用（首因胜出）。 */
  abort(reason: unknown): void {
    if (this.controller.signal.aborted) return
    this.controller.abort(reason)
  }

  /** run 结束：清定时器 + 封锁后续 arm/fire（per-run 实例生命周期终点）。 */
  dispose(): void {
    this.disposed = true
    this.disarm()
  }
}

/** per-run 实例工厂（env 解析；0=关返回仍可用的零窗实例——schedule 直接短路）。 */
export function createLoopWatchdogFromEnv(env: NodeJS.ProcessEnv = process.env): LoopWatchdog {
  return new LoopWatchdog(resolveLoopWatchdogTimeoutMs(env))
}
