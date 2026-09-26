/**
 * engine/tools/files — API limits 常量（C 桶 ① 子波 3 §8.55 S-C1）。
 *
 * 旧仓来源（a8af45b）：src/constants/apiLimits.ts 94L **裁面提取 5 常量**
 * （PDF 面全量消费集）；delta 登记（防「以为已全」）：
 *  - IMAGE 4 常量（API_IMAGE_MAX_BASE64_SIZE / IMAGE_TARGET_RAW_SIZE /
 *    IMAGE_MAX_WIDTH / IMAGE_MAX_HEIGHT）随 D-3 图像面裁面不迁（本波
 *    imageProcessor/imageResizer 调用点裁，§8.55 C 组）
 *  - API_PDF_MAX_PAGES / API_MAX_MEDIA_PER_REQUEST 零本波消费者
 *    （5 本体 + pdf/pdfUtils/notebook/file 依赖闭包 grep 零命中）→ 不迁
 *
 * 常量值逐字旧仓（Last verified 2025-12-22，server-side limits 口径）。
 */

/**
 * Maximum raw PDF file size that fits within the API request limit after encoding.
 * The API has a 32MB total request size limit. Base64 encoding increases size by
 * ~33% (4/3), so 20MB raw → ~27MB base64, leaving room for conversation context.
 */
export const PDF_TARGET_RAW_SIZE = 20 * 1024 * 1024 // 20 MB

/**
 * Size threshold above which PDFs are extracted into page images
 * instead of being sent as base64 document blocks. This applies to
 * first-party API only; non-first-party always uses extraction.
 */
export const PDF_EXTRACT_SIZE_THRESHOLD = 3 * 1024 * 1024 // 3 MB

/**
 * Maximum PDF file size for the page extraction path. PDFs larger than
 * this are rejected to avoid processing extremely large files.
 */
export const PDF_MAX_EXTRACT_SIZE = 100 * 1024 * 1024 // 100 MB

/**
 * Max pages the Read tool will extract in a single call with the pages parameter.
 */
export const PDF_MAX_PAGES_PER_READ = 20

/**
 * PDFs with more pages than this get the reference treatment on @ mention
 * instead of being inlined into context.
 */
export const PDF_AT_MENTION_INLINE_THRESHOLD = 10
