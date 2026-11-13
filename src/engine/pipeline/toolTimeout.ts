/**
 * per-tool timeoutMs 声明预算 wrapper（0.1.104 切片 2；lock-face 必答 2/4 + f4 批复钉⑥）。
 *
 * 设计原则转向（事故沉淀）：「loop 级猜挂起」（watchdog）降为 opt-in 诊断工具；
 * 「声明预算」= 工具最懂自身时长，为主力。工具经 `Tool.timeoutMs`（shared/types.ts
 * 契约字段，**不出 LLM schema**——wrapper 层契约，防 token manifest/wire 锚漂移）
 * 声明预算；无声明 = 无限期（cooperative，零行为变更）。
 *
 * 三钉（lock-face 必答 2）：
 *   (a) arm 时点 = 权限门后实际执行开始（toolExecution 门早退支全部在 guard
 *       创建之前——预执行权限等待零预算）；
 *   (b) 交互等待同源单源：本仓 ask/defer 均为权限门早退支（arm 前），不存在
 *       「执行中」交互挂起点 → 无需 deadline 暂停机制（结构性同源）；
 *   (c) AbortSignal 走既有工具 abort 通道：guard 自建 controller，
 *       AbortSignal.any([外层 deps.signal, 自身]) 组合后经 toolCallContext.signal
 *       槽透传——零新终止路径（AbortSignal.any 仓内先例 webFetchUtils.ts:414）。
 *
 * 嵌套消歧（格 5）：guard 自身 deadline abort 打哨兵 reason
 * （TOOL_TIMEOUT_ABORT_REASON）；消费面单点比对——仅哨兵才替换 TOOL_TIMEOUT 块，
 * 外层 abort（deps.signal / loop watchdog / 用户 Escape）reason 原样透传不误记。
 *
 * 钉⑥（f4 批复）：工具转后台（C5-3 mcpAutoBackground race）即 disarm——
 * 后台 = 用户显式接管，脱离预算面，禁后台工具被到期 abort 杀死。
 */

/** deadline 到期的哨兵 abort reason（嵌套消歧单点比对标记）。 */
export const TOOL_TIMEOUT_ABORT_REASON = Symbol('atlas.toolTimeout')

/** 诊断用（生产 catch 支不走本类——直接构造 TOOL_TIMEOUT 块，见 toolExecution）。 */
export class ToolTimeoutError extends Error {
  constructor(
    toolName: string,
    timeoutMs: number,
  ) {
    super(
      `TOOL_TIMEOUT: ${toolName} exceeded its ${timeoutMs}ms execution budget and was aborted.`,
    )
    this.name = 'ToolTimeoutError'
  }
}

export interface ToolTimeoutGuard {
  /** 组合 signal（外层 deps.signal + 自身 deadline controller）→ toolCallContext.signal。 */
  readonly signal: AbortSignal
  /** 自身哨兵 deadline 到期时恰 resolve 一次（外层 abort / disarm 永不 resolve）——race 死线用。 */
  readonly whenAborted: Promise<void>
  /** 钉⑥：工具转后台即 disarm deadline（后台 continuation 不受预算面）。 */
  disarm(): void
  /** deadline 是否已触发（自身哨兵 abort；外层 abort 返 false——嵌套消歧）。 */
  isTimeoutAbort(): boolean
  /** 正常完成路径清 timer（防泄漏；arm 后未到期即返时调用）。 */
  dispose(): void
}

export function createToolTimeoutGuard(opts: {
  timeoutMs: number
  outerSignal?: AbortSignal
}): ToolTimeoutGuard {
  const controller = new AbortController()
  const signal = opts.outerSignal
    ? AbortSignal.any([opts.outerSignal, controller.signal])
    : controller.signal
  const whenAborted = new Promise<void>(resolve => {
    controller.signal.addEventListener('abort', () => {
      if (controller.signal.reason === TOOL_TIMEOUT_ABORT_REASON) resolve()
    })
  })
  const timer = setTimeout(() => {
    controller.abort(TOOL_TIMEOUT_ABORT_REASON)
  }, opts.timeoutMs)
  const unref = (timer as { unref?: () => void }).unref
  unref?.call(timer)
  let armed = true
  const clearTimer = (): void => {
    if (armed) {
      clearTimeout(timer)
      armed = false
    }
  }
  return {
    signal,
    whenAborted,
    disarm: clearTimer,
    isTimeoutAbort(): boolean {
      return (
        controller.signal.aborted &&
        controller.signal.reason === TOOL_TIMEOUT_ABORT_REASON
      )
    },
    dispose: clearTimer,
  }
}

/**
 * race 死线：deadline 到期时即使工具未消费 signal 也先返（LLM 先拿
 * TOOL_TIMEOUT；工具侧继续经既有 signal 通道自清理——终止路径不新增）。
 * 负者（pending）后续结算挂 no-op catch 防 unhandled rejection。
 */
export async function raceWithToolDeadline<T>(
  guard: ToolTimeoutGuard,
  onDeadline: () => Error,
  pending: Promise<T>,
): Promise<T> {
  pending.catch(() => {}) // 负者结算消音（值面不受影响——race 消费原 promise）
  return Promise.race([
    pending,
    guard.whenAborted.then(() => {
      throw onDeadline()
    }),
  ])
}
