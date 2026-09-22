/**
 * 字节大小格式化（C1 叶子下沉，复制自旧仓 utils/format.ts 的 formatFileSize）。
 *
 * 纯函数无 intl 依赖。旧仓消费者：modelprovider（PDF 尺寸回传）/
 * memory（readFileInRange 超限提示）/ shell（输出统计）——跨 ≥2 域，归 shared。
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
