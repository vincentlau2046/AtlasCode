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
