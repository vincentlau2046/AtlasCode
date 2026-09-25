/**
 * engine/tools/bash — count（§8.53 S-T2b，旧仓 src/utils/array.ts:5-9 逐字
 * 随迁）。
 *
 * bashPermissions L2145 单消费点（compound 建议非 allow 计数）。lodash 裁剪
 * 先例（§8.53 跨域依赖闭包映射「域内本地实现」）：共享 utils/array 面未
 * 整体随迁，按首消费者落本地；uniq 等其余成员 0 消费不随迁。
 */
export function count<T>(arr: readonly T[], pred: (x: T) => unknown): number {
  let n = 0
  for (const x of arr) n += +!!pred(x)
  return n
}
