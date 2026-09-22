/**
 * djb2 字符串哈希（跨域纯叶子，C-Deep 切片 3 T5 下沉）
 *
 * 旧仓来源（a8af45b）: src/utils/hash.ts — djb2Hash 单一事实源。
 * sanitizePath 的 Node 兜底分支消费（Bun.hash 不可用时），跨域纯叶子 →
 * shared 下沉。
 */

/**
 * djb2 字符串哈希——快速非加密哈希，返回有符号 32 位 int。跨运行时确定性
 * （区别于 Bun.hash 的 wyhash）。Bun.hash 不可用或需盘上稳定输出（如须
 * 跨运行时升级存活的缓存目录名）时作兜底。
 */
export function djb2Hash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return hash
}
