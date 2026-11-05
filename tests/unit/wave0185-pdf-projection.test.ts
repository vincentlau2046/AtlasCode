/**
 * 0.1.85 Task A（C85-A）— @PDF 引用 provider 投影判别（unit 层纯面，零磁盘）。
 *
 * 根因（工单 §0 C85-A / §0.2 勘误）：toOpenAIMessages 消息 switch 仅认
 * user/assistant/system（params.ts:47–120），attachment 型整体落空被丢——
 * 真实 pdf_reference 附件消息到 provider 投影为 []（f4 新鲜探针复证）。
 * K5-8 四要素提示模板在 TUI messages.ts:3651–3671 存在但非现役请求消费路径。
 *
 * 判别（行为 RED，非 import-error RED——本文件全部 import 在基线 9b62ee5 均存在）：
 *  - ①–④ toOpenAIMessages 对真实 attachment 型 pdf_reference 的投影：
 *    恰一 user 文本、绝对路径在正文、四要素、null 页数 unknown 文案、
 *    零 base64/零 image 块。
 *  - ⑤ 双面文本恒等：params 投影文本 = TUI normalizeAttachmentForAPI
 *    pdf_reference 支展开文本（同一 shared 叶子的两面消费）。
 *  - ⑥ 其它 attachment 族仍丢弃（逐族登记，不随 PDF 修复放行）。
 *  - ⑦ 既有面回归：user/system/assistant/tool_result/裸 role 形态恒等。
 */
import { describe, test, expect } from 'bun:test'
import { toOpenAIMessages } from '../../src/modelprovider/params'
import { normalizeAttachmentForAPI } from '../../src/tui/utils/messages'

function makeRef(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'pdf_reference',
    filename: '/abs/path/report.pdf',
    pageCount: 12,
    fileSize: 2048,
    displayPath: 'report.pdf',
    ...over,
  }
}

function attachMsg(attachment: unknown): Record<string, unknown> {
  return { type: 'attachment', attachment, uuid: 'u-test', timestamp: 1 }
}

function firstProjectionText(messages: unknown[]): string {
  const out = toOpenAIMessages(messages as any)
  if (out.length === 0) return ''
  const msg = out[0] as any
  if (typeof msg.content === 'string') return msg.content
  return JSON.stringify(msg.content)
}

function tuiExpandedText(attachment: unknown): string {
  // normalizeAttachmentForAPI 签名接收单个 Attachment 对象（非消息数组）；
  // pdf_reference 支输出经 wrapMessagesInSystemReminder 包裹——包裹只加
  // <system-reminder> 壳，内容文本逐字不动，故 toContain 恒等判据成立。
  const out = normalizeAttachmentForAPI(attachment as any)
  for (const m of out as any[]) {
    const c = m?.message?.content ?? m?.content
    if (typeof c === 'string') return c
  }
  return ''
}

describe('C85-A toOpenAIMessages pdf_reference 投影（0.1.85 Task A 行为判别）', () => {
  test('① 真实 attachment 型 pdf_reference 投影为恰一 user 文本（绝对路径在正文）', () => {
    const out = toOpenAIMessages([attachMsg(makeRef())] as any)
    expect(out.length).toBe(1)
    const msg = out[0] as any
    expect(msg.role).toBe('user')
    const text =
      typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    expect(text).toContain('/abs/path/report.pdf')
  })

  test('② 四要素：内容未附上 / 必读 Read / pages≤20 / 页数多或未知小范围逐页', () => {
    const text = firstProjectionText([attachMsg(makeRef())] as any)
    expect(text).toMatch(/not attached to this message/i)
    expect(text).toMatch(/MUST use the Read tool/i)
    expect(text).toMatch(/up to 20 pages per request/i)
    expect(text).toMatch(/small range such as pages: "1-3"/)
    expect(text).toMatch(/page by page/i)
  })

  test('③ pageCount null → unknown 文案；小 PDF 同投影且无 too-large 虚报', () => {
    const unknown = firstProjectionText(
      [attachMsg(makeRef({ pageCount: null }))] as any,
    )
    expect(unknown).toMatch(/page count unknown/i)
    expect(unknown).not.toMatch(/null pages/)
    const small = firstProjectionText(
      [attachMsg(makeRef({ pageCount: 2, fileSize: 2048 }))] as any,
    )
    expect(small).toMatch(/not attached/i)
    expect(small).not.toMatch(/too large/i)
    expect(small).not.toMatch(/will fail/i)
  })

  test('④ 投影纯文本：零 base64、零 image 块（引用不携正文）', () => {
    const out = toOpenAIMessages([attachMsg(makeRef())] as any)
    const s = JSON.stringify(out)
    expect(s).not.toContain('base64')
    expect(s).not.toContain('image_url')
    expect(s).not.toContain('data:')
  })

  test('⑤ 双面文本恒等：params 投影文本在 TUI normalizeAttachmentForAPI 展开文本中逐字在场', () => {
    const att = makeRef()
    const prov = firstProjectionText([attachMsg(att)] as any)
    expect(prov).not.toBe('')
    const tui = tuiExpandedText(att)
    expect(tui).toContain(prov)
  })

  test('⑥ 其它 attachment 族处置（0.1.89 任务 B 三段登记式更新本断言：pdf_reference 外非全弃——显式[] 族零产物维持，未知型改 fail-visible marker，禁静默）', () => {
    const out = toOpenAIMessages([
      attachMsg({ type: 'pdf', filename: '/x/a.pdf' }),
      attachMsg({ type: 'already_read_file', filename: '/y.txt', content: {} }),
      attachMsg({ type: 'compact_file_reference', filename: '/z.md' }),
      attachMsg({ type: 'unknown_future_family' }),
    ] as any)
    // 已知显式[] 族（TUI 同叶子决策）：零产物维持
    const dropped = out.filter((m: any) => {
      const t = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      return !t.includes('[attachment ')
    })
    expect(dropped).toEqual([])
    // 未知型（'pdf' / 'unknown_future_family'）：0.1.89 起 fail-visible marker
    const markers = out.filter((m: any) => {
      const t = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      return t.includes('[attachment ')
    })
    expect(markers.length).toBe(2)
    expect(JSON.stringify(markers)).toContain('unknown_future_family')
  })

  test('⑦ 既有面回归：user 文本/system 降级/assistant tool_calls/tool_result/裸 role 恒等', () => {
    // F-1 双形态锚（modelprovider-params.test.ts 同面）
    expect(
      toOpenAIMessages([{ type: 'user', role: 'user', content: 'do the task' }] as any),
    ).toEqual([{ role: 'user', content: 'do the task' }])
    expect(
      toOpenAIMessages([{ type: 'system', role: 'system', content: 'sys-prompt' }] as any),
    ).toEqual([{ role: 'user', content: 'sys-prompt' }])
    // assistant tool_calls + tool_result 面
    const out = toOpenAIMessages([
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'hi' },
            { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/f' } },
          ],
        },
      },
      {
        type: 'user',
        content: [{ type: 'tool_result', tool_use_id: 't1', content: 'file body' }],
      },
    ] as any)
    expect(out[0]).toEqual({
      role: 'assistant',
      content: 'hi',
      tool_calls: [
        {
          id: 't1',
          type: 'function',
          function: { name: 'Read', arguments: '{"file_path":"/f"}' },
        },
      ],
    })
    expect(out[1]).toEqual({ role: 'tool', tool_call_id: 't1', content: 'file body' })
    // 裸 role 透传
    expect(toOpenAIMessages([{ role: 'user', content: 'bare' }] as any)).toEqual([
      { role: 'user', content: 'bare' },
    ])
  })
})
