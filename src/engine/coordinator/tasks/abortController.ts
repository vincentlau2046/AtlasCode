/**
 * AbortController 工厂族（旧仓 utils/abortController.ts 99L 逐字随迁，S-7a）
 *
 * 消费方：LocalAgentTask 注册/前台 agent 的 abort 链（父 abort → 子 agent
 * 自动 abort，子 abort 不回传父）。
 */
import { setMaxListeners } from 'events'

/**
 * 标准操作默认监听器上限
 */
const DEFAULT_MAX_LISTENERS = 50

/**
 * 创建带监听器上限的 AbortController。
 * 防止多个监听器挂在 abort signal 上触发 MaxListenersExceededWarning。
 *
 * @param maxListeners - 监听器上限（默认 50）
 * @returns 配置好监听器上限的 AbortController
 */
export function createAbortController(
  maxListeners: number = DEFAULT_MAX_LISTENERS,
): AbortController {
  const controller = new AbortController()
  setMaxListeners(maxListeners, controller.signal)
  return controller
}

/**
 * 将 abort 从父传播到弱引用的子 controller。
 * 父子双向弱引用——任一方向都不建立阻止 GC 的强引用。
 * 模块级函数避免每次调用分配闭包。
 */
function propagateAbort(
  this: WeakRef<AbortController>,
  weakChild: WeakRef<AbortController>,
): void {
  const parent = this.deref()
  weakChild.deref()?.abort(parent?.signal.reason)
}

/**
 * 从弱引用的父 signal 上移除 abort 处理器。
 * 父与 handler 均弱引用——任一被 GC 或父已 abort（{once: true}）时为 no-op。
 * 模块级函数避免每次调用分配闭包。
 */
function removeAbortHandler(
  this: WeakRef<AbortController>,
  weakHandler: WeakRef<(...args: unknown[]) => void>,
): void {
  const parent = this.deref()
  const handler = weakHandler.deref()
  if (parent && handler) {
    parent.signal.removeEventListener('abort', handler)
  }
}

/**
 * 创建父 abort 时自动 abort 的子 AbortController。
 * 子 abort 不影响父。
 *
 * 内存安全：WeakRef 保证父不持有已抛弃的子。子未被 abort 即丢弃引用
 * 时仍可被 GC；子被 abort 时父监听器被移除，防死 handler 堆积。
 *
 * @param parent - 父 AbortController
 * @param maxListeners - 监听器上限（默认 50）
 * @returns 子 AbortController
 */
export function createChildAbortController(
  parent: AbortController,
  maxListeners?: number,
): AbortController {
  const child = createAbortController(maxListeners)

  // 快路径：父已 abort，无需装监听器
  if (parent.signal.aborted) {
    child.abort(parent.signal.reason)
    return child
  }

  // WeakRef 防止父持有已抛弃的子存活。所有子强引用丢弃且未 abort 时，
  // 子仍可 GC——父只持有一个死 WeakRef。
  const weakChild = new WeakRef(child)
  const weakParent = new WeakRef(parent)
  const handler = propagateAbort.bind(weakParent, weakChild)

  parent.signal.addEventListener('abort', handler, { once: true })

  // 自动清理：子 abort（任意来源）时移除父监听器。父子与 handler 均弱引用——
  // 任一被 GC 或父已 abort（{once: true}）时清理为无害 no-op。
  child.signal.addEventListener(
    'abort',
    removeAbortHandler.bind(weakParent, new WeakRef(handler)),
    { once: true },
  )

  return child
}
