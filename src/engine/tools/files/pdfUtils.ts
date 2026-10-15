/**
 * engine/tools/files — PDF 辅助面（§8.55 S-C3，旧仓 src/utils/pdfUtils.ts
 * 70L 逐字随迁；delta 仅 getMainLoopModel 重指，函数体逐字不变）。
 *
 * 消费面：Read 本体 PDF 支（S-C5 随迁）isPDFExtension / parsePDFPageRange /
 * isPDFSupported（PDF 块面 vs poppler 页面渲染回退面判别）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - getMainLoopModel（旧 model/model.ts，新仓无）→ ./modelRef
 *    getMainLoopModelName（S-C1 D 组 ① 裁定：modelprovider
 *    getRoleConfig('small').model ?? ''，旧 getMainLoopModel = modelRoles
 *    小角色池头语义）。de-ant（0.1.73 C-3b）：isPDFSupported 原 1P 老 Haiku 模型
 *    poppler 回退子串支随 1P 车道 OOS 删除 → 恒 true（国产面恒不命中 = PDF 块面恒
 *    支持，恒等锚，行为零变更）。
 */

// Document extensions that are handled specially
export const DOCUMENT_EXTENSIONS = new Set(['pdf'])

/**
 * Parse a page range string into firstPage/lastPage numbers.
 * Supported formats:
 * - "5" → { firstPage: 5, lastPage: 5 }
 * - "1-10" → { firstPage: 1, lastPage: 10 }
 * - "3-" → { firstPage: 3, lastPage: Infinity }
 *
 * Returns null on invalid input (non-numeric, zero, inverted range).
 * Pages are 1-indexed.
 */
export function parsePDFPageRange(
  pages: string,
): { firstPage: number; lastPage: number } | null {
  const trimmed = pages.trim()
  if (!trimmed) {
    return null
  }

  // "N-" open-ended range
  if (trimmed.endsWith('-')) {
    const first = parseInt(trimmed.slice(0, -1), 10)
    if (isNaN(first) || first < 1) {
      return null
    }
    return { firstPage: first, lastPage: Infinity }
  }

  const dashIndex = trimmed.indexOf('-')
  if (dashIndex === -1) {
    // Single page: "5"
    const page = parseInt(trimmed, 10)
    if (isNaN(page) || page < 1) {
      return null
    }
    return { firstPage: page, lastPage: page }
  }

  // Range: "1-10"
  const first = parseInt(trimmed.slice(0, dashIndex), 10)
  const last = parseInt(trimmed.slice(dashIndex + 1), 10)
  if (isNaN(first) || isNaN(last) || first < 1 || last < 1 || last < first) {
    return null
  }
  return { firstPage: first, lastPage: last }
}

/**
 * Check if PDF reading is supported with the current model.
 * de-ant（0.1.73 C-3b）：原 1P 老 Haiku 模型 poppler 页面渲染回退子串支随 1P 车道 OOS
 * 删除——国产面（Qwen38/glm/deepseek via IFF）模型名恒不命中该子串 = PDF 块面恒
 * 支持（恒等锚，行为零变更）。
 */
export function isPDFSupported(): boolean {
  return true
}

/**
 * Check if a file extension is a PDF document.
 * @param ext File extension (with or without leading dot)
 */
export function isPDFExtension(ext: string): boolean {
  const normalized = ext.startsWith('.') ? ext.slice(1) : ext
  return DOCUMENT_EXTENSIONS.has(normalized.toLowerCase())
}
