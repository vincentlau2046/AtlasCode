/**
 * shared/pdfPageImages — PDF 页图有界读取（0.1.85-C，工单 §1-C）。
 *
 * PDF pages 参数读交付路径（extractPDFPages 渲染产物 → 模型媒体交付），
 * 双体 FileReadTool（engine readTool + TUI FileReadTool）共用。层界依据：
 * tui 不 import engine/tools（零先例），共享 helper 落 shared 层
 * （boundedImageRead 双面共用先例同位）。
 *
 * 硬判据（工单 §1-C）：
 *  - 与 engine 同一原始 JPEG 交付路径：字节原样 base64，不 resize/downsample
 *    （TUI pages 支 sharp 原生 resize 硬依赖裁除——发布包等效无原生模块条件）。
 *  - 每图及每次 Read 累计均以 134217728B（128MiB）为硬上限；逐图有界读取 +
 *    累计核算，超限明确错误不交付部分成功（无部分图片泄漏）。base64 开销
 *    不计入原始字节口径。
 *  - 顺序读取（非 Promise.all 无界并发）；使用既有有界读原语
 *    readBoundedFileBytes（O_NONBLOCK + fstat 类型/大小双验 + 读累计帽），
 *    stat 前置判定 + 读取期双验（stat 后文件增长不绕过）。
 *  - 页号数值排序（pdftoppm 零填充文件名跨 9/10 正序）。
 *  - 零页图输出明确失败（不静默空交付）；读取页输出限于本次安全目录
 *    （extractPDFPages mkdtemp 叶——readdir 非递归，仅直挂 .jpg）。
 *
 * 纯叶子：仅 node fs/path + boundedImageRead 依赖（无 settings/工具/UI）。
 */
import { readdir, stat } from 'fs/promises'
import * as path from 'path'
import { readBoundedFileBytes } from './boundedImageRead'

/** 页图字节上限：单图与单次 Read 累计同帽 128 MiB。 */
export const PDF_PAGE_IMAGE_MAX_BYTES = 128 * 1024 * 1024 // 134217728

/** 页图块形：原始 JPEG base64（pdftoppm -jpeg 输出恒 image/jpeg）。 */
export type PDFPageImageBlock = {
  type: 'image'
  source: {
    type: 'base64'
    media_type: 'image/jpeg'
    data: string
  }
}

/** 从 pdftoppm 命名（<prefix>-<N>.jpg，零填充与否不限）取尾页号。 */
function pageNumber(fileName: string): number | null {
  const m = /(\d+)\.jpg$/.exec(fileName)
  return m ? Number(m[1]) : null
}

export async function readPDFPageImages(
  outputDir: string,
  opts?: {
    maxBytesPerImage?: number
    maxTotalBytes?: number
    signal?: AbortSignal
  },
): Promise<{ blocks: PDFPageImageBlock[]; totalBytes: number }> {
  const perCap = opts?.maxBytesPerImage ?? PDF_PAGE_IMAGE_MAX_BYTES
  const totalCap = opts?.maxTotalBytes ?? PDF_PAGE_IMAGE_MAX_BYTES
  const signal = opts?.signal

  const entries = await readdir(outputDir)
  const imageFiles = entries
    .filter(f => f.endsWith('.jpg'))
    .sort((a, b) => {
      const na = pageNumber(a)
      const nb = pageNumber(b)
      if (na !== null && nb !== null && na !== nb) return na - nb
      return a < b ? -1 : a > b ? 1 : 0
    })
  if (imageFiles.length === 0) {
    throw new Error(
      `PDF page rendering produced no page images (no .jpg files in ` +
        `'${outputDir}'). The PDF may have no renderable pages or the ` +
        `rendering tool failed — no content is delivered.`,
    )
  }

  const blocks: PDFPageImageBlock[] = []
  let totalBytes = 0
  for (const f of imageFiles) {
    signal?.throwIfAborted()
    const imgPath = path.join(outputDir, f)
    // 前置判定（读取前拒，零部分交付）：单图帽 + 累计帽（stat 口径 =
    // 原始字节；base64 开销不计入）。
    const size = (await stat(imgPath)).size
    if (size > perCap) {
      throw new Error(
        `PDF page image '${f}' is too large: ${size} bytes exceeds the ` +
          `per-image byte limit of ${perCap} bytes. No page images are ` +
          `delivered on limit violation.`,
      )
    }
    if (totalBytes + size > totalCap) {
      throw new Error(
        `PDF page images for this Read would exceed the cumulative byte ` +
          `limit: ${totalBytes + size} bytes > ${totalCap} bytes ` +
          `('${f}' included). Read fewer pages in this call — no page ` +
          `images are delivered on limit violation.`,
      )
    }
    // 读取期有界（既有原语：O_NONBLOCK + fstat 类型/大小双验 + 读累计
    // 帽）——stat 后文件增长不绕过。顺序读，无并发。
    const buf = await readBoundedFileBytes(imgPath, perCap, signal)
    if (buf.length === 0) {
      throw new Error(
        `PDF page image '${f}' is empty (0 bytes) — no content is delivered.`,
      )
    }
    totalBytes += buf.length
    if (totalBytes > totalCap) {
      // 读取期累计复核（stat 与读之间批量增长不绕过）。
      throw new Error(
        `PDF page images for this Read exceeded the cumulative byte ` +
          `limit: ${totalBytes} bytes > ${totalCap} bytes. No page images ` +
          `are delivered on limit violation.`,
      )
    }
    blocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: buf.toString('base64'),
      },
    })
  }
  return { blocks, totalBytes }
}
