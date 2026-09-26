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
 *    小角色池头语义）。isPDFSupported 的 claude-3-haiku 子串判逐字，
 *    新模型名恒不命中 = PDF 块面恒支持（保守等价，登记）。
 */
import { getMainLoopModelName } from './modelRef'

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
 * PDF document blocks work on all providers (1P, Vertex, Bedrock, Foundry).
 * Haiku 3 is the only remaining model that predates PDF support; users on
 * it fall back to the page-extraction path (poppler-utils). Substring match
 * covers all provider ID formats (Bedrock prefixes, Vertex @-dates).
 */
export function isPDFSupported(): boolean {
  return !getMainLoopModelName().toLowerCase().includes('claude-3-haiku')
}

/**
 * Check if a file extension is a PDF document.
 * @param ext File extension (with or without leading dot)
 */
export function isPDFExtension(ext: string): boolean {
  const normalized = ext.startsWith('.') ? ext.slice(1) : ext
  return DOCUMENT_EXTENSIONS.has(normalized.toLowerCase())
}
