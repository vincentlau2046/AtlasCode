/**
 * K3-A8（0.1.82，上游 299 对齐）：hook 重入死循环断根。
 *
 * 上游语义：mod hook 等待另一 mod 提供的名词（工具/事件）时，hook 执行子树
 * 内再次分派回**同一 hook** → 无限重跑。本仓活面 = in-process hook
 * （callback/function/prompt/agent/http）执行中触发工具/事件 → 同一 hook
 * 再次分派（command 型子进程无法重入本进程管线，天然免疫）。
 *
 * 实现：AsyncLocalStorage 键控（先例 src/swarm/teammateContext.ts）——
 * 「正在执行」标记仅在 hook 自身的 async 调用子树内可见：嵌套分派（死循环
 * 形状）被识别并跳过；并行兄弟分派（各自独立上下文，如并行工具调用各自
 * 触发同一 PreToolUse）互不可见、照常执行。全局 in-flight Set 会误杀并行
 * 兄弟，故不可用。
 *
 * 身份键：`${hookEvent}:${type}:${pluginRoot}:${command|prompt|url|fn-id}`。
 * callback/function 以函数引用经 WeakMap 取稳定 id（注册期对象稳定）；
 * command/prompt/http 以文本为键（含 pluginRoot 防不同插件同文本互撞）。
 */
import { AsyncLocalStorage } from 'async_hooks'

const hookReentrancyStorage = new AsyncLocalStorage<ReadonlySet<string>>()

const callbackIds = new WeakMap<object, number>()
let nextCallbackId = 1

function getCallbackId(fn: object): number {
  let id = callbackIds.get(fn)
  if (id === undefined) {
    id = nextCallbackId++
    callbackIds.set(fn, id)
  }
  return id
}

/** hook 身份键：同一 hook 注册的稳定标识（跨分派调用不变）。 */
export function getHookReentrancyKey(
  hookEvent: string,
  hook: object,
  pluginRoot?: string,
): string {
  const h = hook as Record<string, unknown>
  const body =
    typeof h.callback === 'function'
      ? `fn:${getCallbackId(h.callback)}`
      : String(h.command ?? h.prompt ?? h.url ?? '')
  return `${hookEvent}:${String(h.type)}:${pluginRoot ?? ''}:${body}`
}

/** 当前 async 调用子树内该 hook 是否已在执行（重入 = 跳过再跑）。 */
export function isReentrantHook(
  hookEvent: string,
  hook: object,
  pluginRoot?: string,
): boolean {
  const inFlight = hookReentrancyStorage.getStore()
  if (inFlight === undefined) return false
  return inFlight.has(getHookReentrancyKey(hookEvent, hook, pluginRoot))
}

/**
 * 在标记「该 hook 执行中」的 async 上下文里跑 fn——fn 发起的一切异步操作
 * （含其触发的工具/事件/hook 分派）都继承该标记；fn 返回即上下文结束。
 */
export function runWithHookReentrancy<T>(
  hookEvent: string,
  hook: object,
  pluginRoot: string | undefined,
  fn: () => T,
): T {
  const store = new Set(hookReentrancyStorage.getStore() ?? [])
  store.add(getHookReentrancyKey(hookEvent, hook, pluginRoot))
  return hookReentrancyStorage.run(store, fn)
}
