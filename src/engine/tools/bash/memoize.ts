/**
 * engine/tools/bash — memoize 本地最小实现（§8.53 S-T1；lodash 裁剪先例）。
 *
 * 旧仓 ParsedCommand.ts `import memoize from 'lodash-es/memoize.js'`（lodash-es 不在
 * 新仓依赖面）→ 本地最小面：默认 resolver = 首参为键（与 lodash 一致），`.cache`
 * 面（Map）供测试清除。旧仓本域消费点仅 0 参形态（getTreeSitterAvailable），通用
 * 首参键覆盖之；多参/自定义 resolver 场景前向接缝（出现时扩面，H6 登记）。
 */
export function memoize<A extends unknown[], R>(
  fn: (...args: A) => R,
): ((...args: A) => R) & { cache: Map<unknown, R> } {
  const cache = new Map<unknown, R>()
  const memoized = ((...args: A): R => {
    const key = args[0]
    if (!cache.has(key)) {
      cache.set(key, fn(...args))
    }
    return cache.get(key) as R
  }) as ((...args: A) => R) & { cache: Map<unknown, R> }
  memoized.cache = cache
  return memoized
}
