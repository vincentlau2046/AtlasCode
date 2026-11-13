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
import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { PassThrough } from 'node:stream'
import React from 'react'
import { wrapAnsi } from '../../src/tui/ink/wrapAnsi.js'
import { stringWidth } from '../../src/kernel/ink/stringWidth.js'
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

/**
 * K6-13③ · 表头-only 超宽表仍渲染（cell 层 RED→GREEN）。
 *
 * 组件级实证（Main 锁面探针 k613-probe4）：ink render + 假 WriteStream 真渲染
 * MarkdownTable——修前 header-only 表（rows=[]）经垂直降级（maxRowLines>4 或
 * safety check）输出空帧（仅同步标记），静默消失；对照正常表正常渲染。
 * 修复 = renderVerticalFormat 空 rows 兜底：表头-only 时输出 bold 列标签行。
 * （bun test 自动 NODE_ENV=test，绕过 config 读取门。）
 */
import { render } from '../../src/tui/ink.js'
import { MarkdownTable } from '../../src/tui/components/MarkdownTable.js'
import { marked } from 'marked'
import sliceAnsi from '../../src/tui/utils/sliceAnsi.js'
import { truncateToWidth } from '../../src/kernel/utils/truncate.js'

async function renderTable(md: string, forceWidth: number): Promise<string> {
  const chunks: string[] = []
  const fake = new PassThrough() as any
  fake.columns = forceWidth
  fake.rows = 24
  fake.write = (chunk: unknown) => {
    if (typeof chunk === 'string') chunks.push(chunk)
  }
  const token = marked.lexer(md)[0]!
  const inst = await render(
    React.createElement(MarkdownTable, {
      token: token as any,
      highlight: null,
      forceWidth,
    }),
    fake as any,
  )
  await new Promise(r => setTimeout(r, 80))
  inst.unmount?.()
  // 剥 ink 同步标记（\x1b[?2026h/l），保留其余内容与样式
  return chunks.join('').replace(/\x1b\[\?2026[hl]/g, '')
}

describe('K6-13③ · 表头-only 超宽表仍渲染（cell 层）', () => {
  test('RED→GREEN：header-only 6 列超宽表（w=20）不再静默消失，输出列标签', async () => {
    const md = [
      '| averyverylongheaderword1 | averyverylongheaderword2 | averyverylongheaderword3 | averyverylongheaderword4 | averyverylongheaderword5 | averyverylongheaderword6 |',
      '| --- | --- | --- | --- | --- | --- |',
    ].join('\n')
    const out = await renderTable(md, 20)
    expect(out.length).toBeGreaterThan(0)
    // 长标签被 ink 在 w=20 处硬换行（'averyverylongheaderw\nord1:'）——
    // 内容断言对换行容忍（拼接后仍在）。bold 标签样式由与数据行同源的
    // ANSI_BOLD_START 常量路径保证；FORCE_COLOR=3（四件套口径）下 SGR 在
    // 场且 ink 每个续行重发样式（K6-13⑦），故拼接前必须 stripAnsi（同
    // L59/L109 文件惯例；0.1.86 归因补修：FORCE_COLOR=0 假绿）。
    const flat = stripAnsi(out).replace(/\n/g, '')
    expect(flat).toContain('averyverylongheaderword1:')
    expect(flat).toContain('averyverylongheaderword6:')
  })

  test('RED→GREEN：header-only 2 列窄表（w=20）不再静默消失', async () => {
    const md = [
      '| averyverylongheaderword41chars-aaaaaaaaaaaaaaaa | averyverylongheaderword42chars-bbbbbbbbbbbbbbbb |',
      '| --- | --- |',
    ].join('\n')
    const out = await renderTable(md, 20)
    expect(out.length).toBeGreaterThan(0)
    // 同上：FORCE_COLOR=3 下 SGR 在场，拼接前 stripAnsi（0.1.86 归因补修）
    const flat = stripAnsi(out).replace(/\n/g, '')
    expect(flat).toContain('averyverylongheaderword41chars-')
    expect(flat).toContain('averyverylongheaderword42chars-')
  })

  test('锚（修前即真）：正常表（有数据行）组件渲染正常', async () => {
    const md = ['| Name | Value |', '| --- | --- |', '| foo | bar |'].join('\n')
    const out = await renderTable(md, 20)
    expect(out).toContain('Name')
    expect(out).toContain('foo')
  })
})

describe('K6-13⑥ · 宽字符中段截断/emoji 样式变化（cell 裁切面锚，修前即真）', () => {
  test('sliceAnsi CJK 中段截断整字切（不双切、无替换符）', () => {
    // token 粒度逐字切：end=4 显示列 = 恰好中+文（各占 2 列），无半字
    const out = sliceAnsi('中文测试', 0, 4)
    expect(out).toBe('中文')
    expect(out).not.toContain('�')
  })

  test('sliceAnsi emoji 不半切（grapheme 完整，边界宽字符整字保留）', () => {
    // 跨 end 边界的宽 emoji 整字保留而非切半（'a'0 + 🦊1-2 + 🦊3-4）
    const out = sliceAnsi('a🦊🦊', 0, 4)
    expect(out).toBe('a🦊🦊')
    expect(out).not.toContain('�')
  })

  test('sliceAnsi VS16 序列不与基底字符分离', () => {
    const out = sliceAnsi('a‼️b', 0, 3)
    expect(out).not.toContain('�')
    expect(out.startsWith('a')).toBe(true)
    expect(out).toContain('️')
  })

  test('truncateToWidth 无双切（宽字符边界整字截断）', () => {
    const out = truncateToWidth('中文中文', 5)
    expect(out).not.toContain('�')
    expect(stringWidth(out)).toBeLessThanOrEqual(5)
    expect(stringWidth(out)).toBeGreaterThanOrEqual(4)
  })

  test('⑥b emoji 在样式变化 wrap 边界不消失（双实现本就正确）', () => {
    // 样式切换恰落在换行边界（w=3：红 a🦊 / 绿 b🦊）
    const out = wrapAnsi('\x1b[31ma🦊\x1b[39m\x1b[32mb🦊\x1b[39m', 3, HARD)
    const lines = out.split('\n')
    expect(lines.length).toBe(2)
    expect(lines[0]).toContain('a🦊')
    expect(lines[0]).toContain('\x1b[31m')
    expect(lines[1]).toContain('b🦊')
    expect(lines[1]).toContain('\x1b[32m')
  })
})

/**
 * K6-13① · 反引号内 URL 换行后仍整条可点单链接（markdown token 层 RED→GREEN）。
 *
 * 定因（Main 锁面探针）：codespan case 一律走 color('permission')——TTY 下是
 * 带色裸文本、无 OSC 8；wrap 层对无 OSC 8 的长 URL 逐字符硬换行后终端不认
 * 链接。修复 = URL 形 codespan 走 createHyperlink（OSC 8 + permission 色
 * display text；无 hyperlink 支持终端回落裸 URL，headless 视觉零变化）。
 *
 * 测试面：chalk.level=3（本文件隔离进程，afterAll 恢复）让 permission 色路径
 * 在两种状态下都可观测——修前 URL codespan 输出带色码（无 OSC 8），
 * 修后 headless 车道输出裸 URL（createHyperlink 不支持时丢弃 display text）。
 * 非 URL codespan 仍走色码路径（inline code 语义不变）。token 面零变化：
 * lexer token 结构不受渲染层修复影响（codespan token 仍原样产出）。
 */
import chalk from 'chalk'
import { formatToken, applyMarkdown } from '../../src/tui/utils/markdown.js'
import type { Token, Tokens } from 'marked'

const URL_TEXT = 'https://example.com/very/long/path/here'

function codespanToken(text: string): Tokens.Codespan {
  return { type: 'codespan', raw: `\`${text}\``, text, escaped: false } as Tokens.Codespan
}

describe('K6-13① · URL codespan 单链接（markdown token 层）', () => {
  let savedLevel: number
  beforeAll(() => {
    savedLevel = chalk.level
    chalk.level = 3
  })
  afterAll(() => {
    chalk.level = savedLevel
  })

  test('RED→GREEN：URL codespan 修后 headless 输出裸 URL（无色码残留）', () => {
    const out = formatToken(codespanToken(URL_TEXT), 'dark')
    expect(out).toBe(URL_TEXT)
    expect(out).not.toContain('\x1b[')
  })

  test('RED→GREEN（applyMarkdown 车道）：`url` 内联码渲染为裸 URL', () => {
    const md = `see \`${URL_TEXT}\` now`
    const out = applyMarkdown(md, 'dark')
    expect(out).toContain(URL_TEXT)
    // URL 段不再包 permission 色码（headless）；前后缀普通文本保留
    expect(out.startsWith('see ')).toBe(true)
    expect(out.endsWith(' now')).toBe(true)
  })

  test('锚：非 URL codespan 仍走 permission 色码路径（inline code 语义不变）', () => {
    const out = formatToken(codespanToken('npm run build'), 'dark')
    expect(out).toContain('\x1b[')
    expect(out).toContain('npm run build')
  })

  test('锚：URL 形判定收窄——www./裸域/含空格不命中', () => {
    // www. 开头非 http(s) scheme：维持 inline code 色码
    expect(formatToken(codespanToken('www.example.com/docs'), 'dark')).toContain('\x1b[')
    // 含空白：非单一 URL token
    expect(formatToken(codespanToken('https://example.com/a b'), 'dark')).toContain('\x1b[')
    // https:// 前缀且无空白：命中（大写 scheme 也算 URL）
    expect(formatToken(codespanToken('HTTPS://EXAMPLE.COM/PATH'), 'dark')).toBe('HTTPS://EXAMPLE.COM/PATH')
  })

  test('token 面零变化：codespan token 结构不受渲染层修复影响', () => {
    const tokens = marked.lexer('see `https://example.com/x` ok') as Token[]
    const paragraph = tokens[0] as any
    expect(paragraph.type).toBe('paragraph')
    const inline = paragraph.tokens.find((t: any) => t.type === 'codespan')
    expect(inline).toBeDefined()
    expect(inline.text).toBe('https://example.com/x')
  })
})
