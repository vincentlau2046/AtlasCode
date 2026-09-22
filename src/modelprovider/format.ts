/**
 * 格式化工具 — 从旧仓 utils/format.ts 迁入 modelprovider 域
 *
 * 仅 formatFileSize（modelprovider errorMessaging 消费）。
 * formatFileSize 是纯函数（无 intl 依赖），整函数复制。
 * C 波再下沉 shared。
 */

/**
 * Formats a byte count to a human-readable string (KB, MB, GB).
 * @example formatFileSize(1536) → "1.5KB"
 */
export function formatFileSize(sizeInBytes: number): string {
  const kb = sizeInBytes / 1024
  if (kb < 1) {
    return `${sizeInBytes} bytes`
  }
  if (kb < 1024) {
    return `${kb.toFixed(1).replace(/\.0$/, '')}KB`
  }
  const mb = kb / 1024
  if (mb < 1024) {
    return `${mb.toFixed(1).replace(/\.0$/, '')}MB`
  }
  const gb = mb / 1024
  return `${gb.toFixed(1).replace(/\.0$/, '')}GB`
}
