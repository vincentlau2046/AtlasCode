/**
 * pathUtils — 域本地路径安全化辅助（从旧仓 utils/sessionStoragePortable.ts + hash.ts 收进）
 *
 * charter DEP-3：utils 依赖收进域内。memory 域只需 sanitizePath + djb2Hash。
 */

/**
 * djb2 字符串哈希 — 快速非加密哈希，返回有符号 32 位整数。
 * 跨运行时确定（不像 Bun.hash 用 wyhash）。磁盘稳定输出（缓存目录名）。
 */
export function djb2Hash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return hash
}

export const MAX_SANITIZED_LENGTH = 200

function simpleHash(str: string): string {
  return Math.abs(djb2Hash(str)).toString(36)
}

/**
 * 把字符串安全化为目录/文件名：非字母数字 → 连字符。
 * 超过 255 字节限制时截断并追加哈希后缀保证唯一性。
 */
export function sanitizePath(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9]/g, '-')
  if (sanitized.length <= MAX_SANITIZED_LENGTH) {
    return sanitized
  }
  const hash =
    typeof Bun !== 'undefined' ? Bun.hash(name).toString(36) : simpleHash(name)
  return `${sanitized.slice(0, MAX_SANITIZED_LENGTH)}-${hash}`
}
