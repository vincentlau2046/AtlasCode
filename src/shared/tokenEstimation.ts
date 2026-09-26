/**
 * 纯函数（services 分流）— rough token 估计族
 *
 * 实现波次: C 波（§8.55 S-C1 占位填充，B18 按需重建先例 = 实质实现非
 * 重占位）。
 *
 * 旧仓来源（a8af45b）：src/services/tokenEstimation.ts 350L 的纯函数
 * 子集逐字（roughTokenCountEstimation / bytesPerTokenForFileType /
 * roughTokenCountEstimationForFileType，L160-198）。裁面登记：
 * countTokensWithAPI / countMessagesTokensWithAPI / countTokensViaHaikuFallback
 * / roughTokenCountEstimationForMessages / roughTokenCountEstimationForMessage
 * 等 API/消息面 8 导出位不迁（本波零消费者；模型 provider token 计数面归
 * D 波，§8.55 C 组登记）。
 */

/**
 * Rough token count estimate: content length / bytesPerToken, rounded.
 * The default 4 bytes/token is a conservative approximation for
 * mixed-language text; file-type-aware callers use
 * {@link bytesPerTokenForFileType} for a tighter ratio.
 */
export function roughTokenCountEstimation(
  content: string,
  bytesPerToken: number = 4,
): number {
  return Math.round(content.length / bytesPerToken)
}

/**
 * Returns an estimated bytes-per-token ratio for a given file extension.
 * Dense JSON has many single-character tokens (`{`, `}`, `:`, `,`, `"`)
 * which makes the real ratio closer to 2 rather than the default 4.
 */
export function bytesPerTokenForFileType(fileExtension: string): number {
  switch (fileExtension) {
    case 'json':
    case 'jsonl':
    case 'jsonc':
      return 2
    default:
      return 4
  }
}

/**
 * Like {@link roughTokenCountEstimation} but uses a more accurate
 * bytes-per-token ratio when the file type is known.
 *
 * This matters when the API-based token count is unavailable (e.g. on
 * Bedrock) and we fall back to the rough estimate — an underestimate can
 * let an oversized tool result slip into the conversation.
 */
export function roughTokenCountEstimationForFileType(
  content: string,
  fileExtension: string,
): number {
  return roughTokenCountEstimation(
    content,
    bytesPerTokenForFileType(fileExtension),
  )
}
