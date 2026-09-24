/**
 * messaging 域 — content block 文本提取（E-7 S-7e d1，§8.50）。
 *
 * 旧仓来源（a8af45b）：src/utils/messages.ts:2897-2907 extractTextContent 9L
 * 逐字随迁（自含签名——旧签名 `readonly { readonly type: string }[]` 结构型，
 * 无 ContentBlock 依赖，零 delta）。shell 消息域余面（getContentText 等）不
 * 随迁。
 */

/**
 * Extract text from an array of content blocks, joining text blocks with the
 * given separator. Works with ContentBlock, ContentBlockParam, BetaContentBlock,
 * and their readonly/DeepImmutable variants via structural typing.
 */
export function extractTextContent(
  blocks: readonly { readonly type: string }[],
  separator = '',
): string {
  return blocks
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map(b => b.text)
    .join(separator)
}
