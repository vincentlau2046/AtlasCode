/**
 * @PDF 引用 → provider 投影叶子（0.1.85 Task A / C85-A）。
 *
 * 纯函数、零文件 I/O、零 settings/React/原生依赖——被两面消费：
 *  - modelprovider/params.ts toOpenAIMessages（现役请求链：attachment 型
 *    pdf_reference 消息在此投影为 user 文本，修复 084 Gap A——此前
 *    attachment 型整体落空被丢，f4 新鲜探针证真实 pdf_reference 投影为 []）
 *  - tui/utils/messages.ts normalizeAttachmentForAPI pdf_reference 支
 *    （TUI 车道既有消费，本波起调用同一叶子，双面文本恒等）
 *
 * 文本 = 0.1.84 K5-8 通用引用提示四要素（工单 §1-A：实际绝对 filename 必在
 * 正文；小/大/null 页数提示真实；无 too-large 虚报、无「无 pages 必失败」、
 * 不声称已读、模型无关）。FILE_READ_TOOL_NAME 两侧均为 'Read'
 * （engine/tools/toolNames.ts + tui prompt.ts），叶子不依赖任一面。
 */

import { formatFileSize } from './format'

/** pdf_reference 引用 metadata（产点：tui/utils/attachments.ts
 * PDFReferenceAttachment 同形五字段；D 波持久化白名单同此投影）。 */
export type PDFReferenceMetadata = {
  type: 'pdf_reference'
  filename: string
  /** pdfinfo 页数；pdfinfo 不可用 → null（页数未知，不以 size 估算冒充） */
  pageCount: number | null
  fileSize: number
  /** Path relative to CWD at creation time, for stable display */
  displayPath: string
}

/**
 * full-PDF 原生 document 读不支持（0.1.85-B/C，工单 §1-B/§1-C）：provider
 * 无 document 块映射且过不了补充合法化门（text/image 允许面）——双体
 * FileReadTool 无 pages 读 PDF 整支显式错误。附件/压缩消费面以此判定
 * 回落引用车道（compact → compact_file_reference；at-mention 本就经
 * tryGetPDFReference 分流），不静默丢附件、不虚报已读。message 与 Task B
 * 显式指引文案一致（'current provider' + 'pages parameter'）。
 */
export class FullPDFReadUnsupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FullPDFReadUnsupportedError'
  }
}

export function formatPDFReferenceForModel(reference: PDFReferenceMetadata): string {
  const pagesText =
    reference.pageCount === null
      ? 'page count unknown'
      : `${reference.pageCount} pages`
  return (
    `PDF file: ${reference.filename} (${pagesText}, ${formatFileSize(reference.fileSize)}). ` +
    `The content of this PDF is not attached to this message — only this reference is. ` +
    `Before answering any question about its content, you MUST use the Read tool to read it. ` +
    `You may read a page range with the pages parameter (e.g., pages: "1-5"); up to 20 pages per request. ` +
    `When the page count is large or unknown, start with a small range such as pages: "1-3" and read further ` +
    `page by page as needed. Do not answer questions about this PDF's content from assumptions.`
  )
}

/**
 * D 波（0.1.85-D，工单 §1-D「恢复/压缩仍保引用」）落盘白名单投影：任意
 * attachment 值 → 五字段 PDFReferenceMetadata | null。双 record 车道
 * （engine session/record.ts + tui utils/sessionStorage.ts）落盘前的唯一
 * 通道——**不 spread 原对象**：恶意/意外额外字段（base64/Buffer/content
 * 等正文形字段）一律剥除不落盘；五字段缺一或类型不符 → null（不落盘，
 * 不放宽）。引用≠正文：落盘的只有文件位置与页数/大小元数据，零 PDF
 * bytes；resume 后 params attachment 支（Task A）据此投影四要素必读文本，
 * 模型按本次权限重读（文件替换→新内容；删除/deny→Read 显式失败，无旧
 * 页图假答面）。
 */
export function projectPDFReferenceForRecord(
  att: unknown,
): PDFReferenceMetadata | null {
  if (typeof att !== 'object' || att === null) return null
  const a = att as Record<string, unknown>
  if (a.type !== 'pdf_reference') return null
  if (typeof a.filename !== 'string' || a.filename.length === 0) return null
  // 赋值式窄化（非严格 tsconfig 判别式显式惯例）：复合守卫下 CFA 不收窄，
  // 用赋值支显式定形（null=页数未知；number 须有限值，NaN/±Infinity 拒收）。
  const rawPageCount = a.pageCount
  let pageCount: number | null
  if (rawPageCount === null) {
    pageCount = null
  } else if (
    typeof rawPageCount === 'number' &&
    Number.isFinite(rawPageCount)
  ) {
    pageCount = rawPageCount
  } else {
    return null
  }
  const fileSize = a.fileSize
  if (typeof fileSize !== 'number' || !Number.isFinite(fileSize)) return null
  if (typeof a.displayPath !== 'string') return null
  return {
    type: 'pdf_reference',
    filename: a.filename,
    pageCount,
    fileSize,
    displayPath: a.displayPath,
  }
}

/**
 * R-085-1（0.1.86 H，工单 §H「修法 A」）：从压缩输入消息收集 @PDF 引用
 * 附件（projectPDFReferenceForRecord 五字段白名单投影——与落盘同源，恶意
 * 额外字段剥除；按 filename 去重防重复膨胀，后值覆盖 = 更近的引用获胜）。
 * 压缩吃掉全部历史附件后，post-compact 重建引用（不重建正文），模型按
 * 本次权限 Read（文件替换→新内容；删除/deny→显式失败，无旧页图假答面）。
 *
 * 0.1.85-D 起源 = TUI contextBodies/compact（reactiveCompact 消费面）；
 * R-085-1 迁入 shared 单一事实源：ENGINE compactConversation（富体 manual
 * /compact + auto-compact rich，裁剪 headless）同样在 compact 时重建为
 * 边界后 attachment 记录（buildPostCompactMessages attachments 槽位），
 * JSONL 边界后落盘 → resume 边界截断（sessionStoragePortable in-stream
 * truncate）不再消灭唯一投影来源 → params attachment 支（C85-A）投影。
 * 参数取结构最小形（type/attachment 可选读），TUI/engine 双 Message 并存
 * 面均天然可传入。
 */
export function collectPDFReferenceAttachmentsForCompact(
  messages: readonly { type?: unknown; attachment?: unknown }[],
): PDFReferenceMetadata[] {
  const byFilename = new Map<string, PDFReferenceMetadata>()
  for (const m of messages) {
    if (m.type !== 'attachment') continue
    const projected = projectPDFReferenceForRecord(m.attachment)
    if (projected) {
      byFilename.set(projected.filename, projected)
    }
  }
  return [...byFilename.values()]
}
