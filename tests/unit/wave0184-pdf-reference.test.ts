/**
 * 0.1.84 V3-5 K5-8 — @PDF 引用提示模板判别（unit 层纯面，零磁盘）。
 *
 * 被测面：normalizeAttachmentForAPI（messages.ts）pdf_reference 支 =
 * messages 规范化 switch `case 'attachment'` 的唯一消费（L2298，API
 * 请求构造路径），其输出文本 = provider 实收。K5-8 判别：
 *  - 通用提示四要素：内容未附上 / 回答前必须 Read / 可指定 pages 且
 *    ≤20 页每次 / 页数多或未知优先小范围逐页。
 *  - 不虚报：无 "too large to read all at once"（小 PDF 也会引用化，
 *    不是因为大）、无 "without the pages parameter ... will fail"
 *    （≤10 页 PDF 无 pages Read 本就成功）、不声称模型已读正文。
 *  - 模型无关：无 provider/品牌分支词（Claude3 同一提示满足）。
 *  - pageCount null（pdfinfo 失败）→ unknown 文案，不打印 "null pages"，
 *    不把 size 估算装作可靠页数。
 *
 * K5-7/8 disposition 分列：本文件锁 K5-8 模板面；K5-7 内存引用化
 * （小/大/未知 PDF 均引用 + spy 不先读后丢）在
 * tests/func/wave0184-pdf-reference-session.test.ts（真盘真二进制）。
 *
 * 分层 ruling：模板/类型/纯 normalizer 面零磁盘 → unit；磁盘与 spy 面
 * → func（先例 wave0180-k1d 同裁定）。AttachmentMessage.tsx 渲染面
 * （pageCount null → "page count unknown"）为显示层，tsc null 处理 +
 * func 面覆盖，不在此重复渲染测试。
 */
import { describe, expect, test } from 'bun:test'
import { normalizeAttachmentForAPI } from '../../src/tui/utils/messages'
import type { PDFReferenceAttachment } from '../../src/tui/utils/attachments'

/** normalizeAttachmentForAPI 输出文本抽取（string / blocks 双形）。 */
function extractText(
  msgs: ReturnType<typeof normalizeAttachmentForAPI>,
): string {
  return msgs
    .map(m => {
      const content = (m as any).message.content
      if (typeof content === 'string') return content
      if (Array.isArray(content)) {
        return content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text ?? '')
          .join('')
      }
      return ''
    })
    .join('\n')
}

function makeRef(
  over: Partial<PDFReferenceAttachment> = {},
): PDFReferenceAttachment {
  return {
    type: 'pdf_reference',
    filename: '/abs/path/report.pdf',
    pageCount: 30,
    fileSize: 1_234_567,
    displayPath: 'report.pdf',
    ...over,
  }
}

describe('K5-8 @PDF 引用提示模板（provider 实收文本）', () => {
  test('已知页数：path + 未附上 + 必读 + pages ≤20 + 逐页指引', () => {
    const text = extractText(normalizeAttachmentForAPI(makeRef()))
    expect(text).toContain('/abs/path/report.pdf')
    // 四要素（工单逐字判据）
    expect(text).toMatch(/not attached/i)
    expect(text).toMatch(/MUST use the Read tool/i)
    expect(text).toMatch(/up to 20 pages per request/i)
    expect(text).toMatch(/page by page/i)
  })

  test('小 PDF 不虚报：无 too large / 无无-pages-必失败 / 不声称已读', () => {
    const text = extractText(
      normalizeAttachmentForAPI(makeRef({ pageCount: 2, fileSize: 2048 })),
    )
    // 修前产品红：旧模板逐字含 "This PDF is too large to read all at
    // once" + "without the pages parameter or it will fail"
    expect(text).not.toMatch(/too large/i)
    expect(text).not.toMatch(/will fail/i)
    expect(text).not.toMatch(/already (been )?read/i)
    // 小 PDF 也是引用化（非「太大才引用」语义）
    expect(text).toMatch(/not attached/i)
  })

  test('页数未知（pdfinfo 失败）：unknown 文案 + 同四要素指令', () => {
    // 修前产品红：旧类型 pageCount: number 无 null 语义（tsc 层即拒）
    const text = extractText(
      normalizeAttachmentForAPI(
        makeRef({ pageCount: null as unknown as number }),
      ),
    )
    expect(text).not.toMatch(/null pages/)
    expect(text).toMatch(/unknown/i)
    expect(text).toMatch(/MUST use the Read tool/i)
    expect(text).toMatch(/up to 20 pages per request/i)
  })

  test('模型无关：无 provider/品牌分支词', () => {
    for (const ref of [
      makeRef(),
      makeRef({ pageCount: 2 }),
      makeRef({ pageCount: null as unknown as number }),
    ]) {
      const text = extractText(normalizeAttachmentForAPI(ref))
      expect(text).not.toMatch(/claude/i)
      expect(text).not.toMatch(/anthropic/i)
      expect(text).not.toMatch(/opus|sonnet|haiku/i)
    }
  })

  test('metadata 不含 base64/Buffer/raw bytes（序列化清白）', () => {
    const ref = makeRef()
    const serialized = JSON.stringify(ref)
    expect(serialized).not.toMatch(/base64/i)
    expect(Object.keys(ref).sort()).toEqual([
      'displayPath',
      'fileSize',
      'filename',
      'pageCount',
      'type',
    ])
  })

  test('isMeta 标记在场（不冒充用户正文）', () => {
    const out = normalizeAttachmentForAPI(makeRef())
    expect(out.length).toBeGreaterThanOrEqual(1)
    expect((out[0] as any).isMeta).toBe(true)
  })
})
