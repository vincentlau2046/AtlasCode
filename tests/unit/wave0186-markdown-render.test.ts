/**
 * 0.1.86 K6 · 任务 B · K6-13 Markdown/宽字符 7 件（工单 §B）。
 *
 * 七件逐件独立断言（禁打包）；wrap 层与 cell 层各自判别（工单 Review Focus 1）：
 *   wrap 层（src/tui/ink/wrapAnsi.ts 双实现适配器）= ⑦ bold/italic 跨换行丢样式（RED）
 *     + ⑤ 极窄终端空行（RED）+ ④ 混排最后一行（锚）+ ② wrap 车道 OSC8 重发（锚）；
 *   cell 层（MarkdownTable.tsx / cell 宽度裁切面）= ③ 表头-only 超宽表静默消失（RED）
 *     + ② cell 原语占宽（锚）+ ⑥ 中段截断/emoji 样式（锚，truncate/slice 面）；
 *   markdown token 层（markdown.ts）= ① 反引号内 URL 可点单链接（RED，本文件随任务推进补齐）。
 *
 * 定因（Main 锁面探针实证，2026-11-03）：
 *  - Bun.wrapAnsi 与 wrap-ansi npm 双实现在 hard:true 车道存在两处分歧：
 *    (a) SGR 状态跨行携带丢失——`\x1b[1m\x1b[3m…\x1b[23m` 换行后续行只重发 `\x1b[3m`，
 *        bold（1m）丢失（npm 每行完整重发 `1m+3m` 并成对收尾）；表格 cell 车道同源中招。
 *    (b) cols=1 宽字符产生前导空行（`'\n中'`；npm 直接 `中`）。
 *  - MarkdownTable renderVerticalFormat 以 `token.rows.forEach` 为唯一行源：
 *    表头-only 表（rows=[]）经垂直降级（maxRowLines>4 或 safety check）时输出空串，
 *    组件真实渲染（ink render → fake stream 实证）= 静默消失。
 *
 * 分层纪律：修复不串层——wrap 件只动 wrapAnsi.ts 适配器；cell 件只动 MarkdownTable.tsx；
 * ⑦ 经 cell 车道复现但归因 wrap 层（修一处双车道受益）。
 * 渲染基建：ink render(node, WriteStream) + NODE_ENV=test（bun test 自动）+ forceWidth override。
 */
import { describe, expect, test } from 'bun:test'
import { PassThrough } from 'node:stream'
import React from 'react'
import { wrapAnsi } from '../../src/tui/ink/wrapAnsi.js'
import { stringWidth } from '../../src/tui/ink/stringWidth.js'
import stripAnsi from 'strip-ansi'

const HARD: { hard: boolean; trim: false; wordWrap: true } = {
  hard: true,
  trim: false,
  wordWrap: true,
}

const link = (text: string, url: string) =>
  `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`

describe('K6-13⑦ · bold/italic 嵌套跨换行不丢样式（wrap 层 RED）', () => {
  const STYLED = 'plain \x1b[1m\x1b[3mbolditalic内容很长会换行\x1b[23m\x1b[22m plain'

  test('RED：样式区内每个续行都重发 bold（1m）——Bun 实现只重发 italic 丢 bold', () => {
    const out = wrapAnsi(STYLED, 10, HARD)
    const lines = out.split('\n')
    expect(lines.length).toBeGreaterThan(2)
    // 续行（样式区被 hard break 切开的行）必须重开 [1m
    expect(lines[1]).toContain('\x1b[1m')
    expect(lines[2]).toContain('\x1b[1m')
    // italic 也持续在场
    expect(lines[1]).toContain('\x1b[3m')
  })

  test('GREEN 侧样式收尾：离开样式区后不再有 bold（不倒灌）', () => {
    const out = wrapAnsi(STYLED, 10, HARD)
    const lines = out.split('\n')
    const last = lines[lines.length - 1]!
    // 文本面完整（换行点双实现可能不同，拼接后必须无损）
    const flat = stripAnsi(out).replace(/\n/g, '')
    expect(flat.startsWith('plain ')).toBe(true)
    expect(flat.endsWith(' plain')).toBe(true)
    // 末行不再重开 bold（[23m/[22m 收尾码不算 bold）
    expect(last).not.toContain('\x1b[1m')
  })

  test('cell 车道同源：MarkdownTable.wrapText 复刻面续行 bold 在场（经 wrap 层修复受益）', () => {
    // MarkdownTable wrapText = wrapAnsi(trimEnd, width, {hard, trim:false, wordWrap:true}) + 滤空行
    const cell = '前缀 \x1b[1m\x1b[3mbolditalic内容很长\x1b[23m\x1b[22m 尾'
    const wrapped = wrapAnsi(cell.trimEnd(), 10, HARD)
      .split('\n')
      .filter(l => l.length > 0)
    expect(wrapped.length).toBeGreaterThan(2)
    expect(wrapped[1]).toContain('\x1b[1m')
    expect(wrapped[2]).toContain('\x1b[1m')
  })
})

describe('K6-13⑤ · 极窄终端单列不产生空行（wrap 层 RED）', () => {
  test('RED：cols=1 CJK 不产生前导空行（Bun 实现 `\\n中`，npm 直接 `中`）', () => {
    const out = wrapAnsi('中文测试', 1, HARD)
    expect(out.startsWith('\n')).toBe(false)
    expect(out.split('\n').every(l => l.length > 0)).toBe(true)
    expect(out.split('\n')).toEqual(['中', '文', '测', '试'])
  })

  test('锚（修前即真）：cols=1 拉丁硬换行本就正确', () => {
    expect(wrapAnsi('ab', 1, HARD)).toBe('a\nb')
  })

  test('锚（修前即真）：cols=2 CJK 逐字换行无空行（Bun 实现此处本就正确）', () => {
    expect(wrapAnsi('中文测试', 2, HARD)).toBe('中\n文\n测\n试')
  })
})

describe('K6-13④ · CJK/emoji+拉丁混排换行不丢最后一行（wrap 层锚，修前即真）', () => {
  test('混排文本换行后最后一行存活且各行宽不超列宽', () => {
    const out = wrapAnsi('中文 abc 日本語テキスト emoji 🦊🦊 tail 終点', 10, HARD)
    const lines = out.split('\n')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines[lines.length - 1]).toBe(' 終点')
    for (const line of lines) {
      expect(stringWidth(line)).toBeLessThanOrEqual(10)
    }
  })

  test('纯 CJK 长文本逐字硬换行，总行覆盖全部内容', () => {
    const text = '这是一段比较长的中文文本用来测试换行'
    const out = wrapAnsi(text, 8, HARD)
    expect(stripAnsi(out).replace(/\n/g, '')).toBe(text)
  })

  test('emoji+拉丁混排最后一行 emoji 存活', () => {
    const out = wrapAnsi('🦊🦊🦊 fox runs faster than dog, wow 🦊', 12, HARD)
    expect(out.split('\n').pop()).toBe('wow 🦊')
  })
})

describe('K6-13② · emoji 起始链接换行占宽正确（wrap 车道锚，修前即真）', () => {
  test('emoji 起始 OSC8 链接 hard 换行后每个续行重发同一 URL 的 OSC8 open', () => {
    const out = wrapAnsi(link('🦊 example.com/xxxxxxxxxxxxx', 'https://example.com/x'), 14, HARD)
    const lines = out.split('\n')
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(line).toContain('\x1b]8;;https://example.com/x\x07')
      expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(14)
    }
  })

  test('普通 OSC8 长链接换行后仍单条可点（每个链接片段行 open+close 成对）', () => {
    const url = 'https://example.com/very/long/path/here'
    const out = wrapAnsi('see ' + link(url, url), 20, HARD)
    const lines = out.split('\n')
    // wordWrap 把整条长链接挪到下一行起排：前缀行无链接内容，断言只对链接片段行
    const fragLines = lines.filter(l => stripAnsi(l).trim() !== 'see')
    expect(fragLines.length).toBeGreaterThanOrEqual(2)
    for (const line of fragLines) {
      // 每个片段行都携带同一 URL 的 OSC8 open+close = 视觉上仍是单条可点链接
      expect(line).toContain(`\x1b]8;;${url}\x07`)
      expect(line).toContain('\x1b]8;;\x07')
      expect(stringWidth(stripAnsi(line))).toBeLessThanOrEqual(20)
    }
  })
})
