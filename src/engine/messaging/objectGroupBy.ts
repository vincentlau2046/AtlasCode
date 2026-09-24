/**
 * messaging 域 — Object.groupBy polyfill（E-7 S-7e d1，§8.50）。
 *
 * 旧仓来源（a8af45b）：src/utils/objectGroupBy.ts 18L 逐字随迁（TC39 提案
 * polyfill；d2 queueManager 消息分组消费）。算法体零 delta。
 */
/**
 * https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-object.groupby
 */
export function objectGroupBy<T, K extends PropertyKey>(
  items: Iterable<T>,
  keySelector: (item: T, index: number) => K,
): Partial<Record<K, T[]>> {
  const result = Object.create(null) as Partial<Record<K, T[]>>
  let index = 0
  for (const item of items) {
    const key = keySelector(item, index++)
    if (result[key] === undefined) {
      result[key] = []
    }
    result[key].push(item)
  }
  return result
}
