/**
 * K3-A7（0.1.82，上游 299 对齐）：hook 输入序列化 getter 单键拒。
 *
 * 上游语义：mod hook 收到的值某 getter 抛错（RangeError 等）时**只拒该键**，
 * 不再整值拒收。修前本仓两面（executeHooks getJsonInput /
 * executeHooksOutsideREPL）的 jsonStringify 读到抛错 getter 即 throw → 整个
 * hookInput 拒收，好键一并丢失（且 K3-A6 深度检查的 Object.values 枚举自身
 * 会触发 getter，RangeError 直接穿透调用方）。
 *
 * 实现：快路径先直接 jsonStringify（正常面零开销）；throw 后回退
 * materializeHookInput 逐键物化——**迭代显式栈**（深嵌套不爆栈）+ 逐键
 * try/catch（抛错键丢弃并记名）+ WeakMap 环防护（cyclic 以 '[Circular]'
 * 占位终止，否则克隆不终止）。克隆再序列化成功则照常跑钩子。
 */
import { jsonStringify } from '../slowOperations.js'

export type MaterializeResult =
  | { ok: true; value: unknown; droppedKeys: string[] }
  | { ok: false; error: unknown }

/**
 * 逐键物化：把值克隆为可安全序列化的 plain 结构。
 * - 抛错 getter：该键丢弃（droppedKeys 记名），其余键保留；
 * - cyclic 引用：'[Circular]' 占位（克隆终止的必要条件）；
 * - 整容器枚举抛错（enumerable getter 于 Object.keys 期抛）：该容器落空。
 */
export function materializeHookInput(value: unknown): MaterializeResult {
  if (value === null || typeof value !== 'object') {
    return { ok: true, value, droppedKeys: [] }
  }

  const droppedKeys: string[] = []
  const visited = new WeakMap<object, unknown>()
  const root: unknown[] | Record<string, unknown> = Array.isArray(value) ? [] : {}
  visited.set(value, root)
  const stack: Array<{
    src: object
    target: unknown[] | Record<string, unknown>
  }> = [{ src: value, target: root }]

  while (stack.length > 0) {
    const { src, target } = stack.pop()!
    let keys: string[]
    try {
      keys = Object.keys(src)
    } catch {
      droppedKeys.push('<enumeration-failed>')
      continue
    }
    for (const key of keys) {
      let child: unknown
      try {
        child = (src as Record<string, unknown>)[key]
      } catch {
        // K3-A7：只拒该键
        droppedKeys.push(key)
        continue
      }
      if (child === null || typeof child !== 'object') {
        ;(target as Record<string, unknown>)[key] = child
      } else if (visited.has(child)) {
        ;(target as Record<string, unknown>)[key] = '[Circular]'
      } else {
        const childClone: unknown[] | Record<string, unknown> = Array.isArray(child)
          ? []
          : {}
        visited.set(child, childClone)
        ;(target as Record<string, unknown>)[key] = childClone
        stack.push({ src: child, target: childClone })
      }
    }
  }
  return { ok: true, value: root, droppedKeys }
}

export type StringifyResult =
  | { ok: true; value: string; droppedKeys: string[] }
  | { ok: false; error: unknown }

/**
 * 快路径直接序列化（正常面恒等零开销）；throw 后物化回退（getter 抛错
 * 只丢该键、cyclic 占位）再序列化。两级都失败才报错（整值拒收面收窄为
 * 仅「物化后仍不可序列化」——如对象带不可枚举 Proxy trap 等）。
 */
export function stringifyWithGetterFallback(value: unknown): StringifyResult {
  try {
    return { ok: true, value: jsonStringify(value), droppedKeys: [] }
  } catch (error) {
    // 否定支用 `=== false` 显式比较（同 hooks.ts 注：strict:false 下真值窄化不生效）
    const materialized = materializeHookInput(value)
    if (materialized.ok === false) return { ok: false, error }
    try {
      return {
        ok: true,
        value: jsonStringify(materialized.value),
        droppedKeys: materialized.droppedKeys,
      }
    } catch {
      return { ok: false, error }
    }
  }
}
