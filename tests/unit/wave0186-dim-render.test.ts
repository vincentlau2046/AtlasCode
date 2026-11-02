/**
 * 0.1.86 K6 · 任务 C · K6-14 dim/ANSI 弱化 2 件（工单 §C）。
 *
 * 件 1（填充框 faint + 选中/搜索下保持 faint）+ 件 2（列表描述二级 dim / dim 与正常
 * 可区分 300 号件）。判据口径（Review Focus 5）：渲染输出 escape 序列正确性 = hard 面；
 * 人眼可见性 = soft 登记，不混判。
 *
 * 定因（Main 锁面探针 k614-probe1/2 实证，2026-11-03）：
 *  - 双 dim 车道：① Ansi 通道（<Ansi dimColor> / thinking 块 <Markdown dimColor>）→
 *    span.props.dim → ink Text dim → applyTextStyles chalk.dim = SGR 2（真 faint）；
 *    ② ThemedText 通道（dimColor → theme.inactive 色替换，无 SGR 2——注释明言兼容 bold）。
 *  - 件 1 主判据修前即真（锚）：chalk.level=3 组件级实证 <Ansi dimColor> 与
 *    <Markdown dimColor>（AssistantThinkingMessage 唯一消费链）三色档均产出
 *    `\x1b[2m…\x1b[22m`；cell 级 overlay（StylePool.withInverse / withCurrentMatch /
 *    withSelectionBg）均显式保留 dim（screen.ts "Fg, bold, dim, italic … preserved"）。
 *  - 件 1 探针暴露真 RED：dimColor 通道吞内嵌 bold——混合内容 `\x1b[1mbold\x1b[22m`
 *    经 <Ansi dimColor> 后 bold 段 SGR 1 完全丢失（span.props.dim=true 强制注入后
 *    ink Text 的 bold/dim 互斥丢弃 bold）。thinking 块内 **bold** markdown 全中招。
 *    修 = Ansi.tsx dim 注入门加 `!span.props.bold`（bold 优先于 dim，强调不弱化）。
 *  - 件 2 真 RED（300 号件）：dark-ansi 主题 inactive/subtle = 'ansi:white'（SGR 37）
 *    ——在 16 色终端上 SGR 37 与默认前景几乎同色，dim 文本与正常文本不可区分；
 *    对照 truecolor dark 主题同层为 rgb(153,153,153)（16 色降级 ≈ SGR 90 blackBright）。
 *    修 = darkAnsiTheme inactive/subtle → 'ansi:blackBright'（与 light-ansi 的
 *    blackBright 车道对称）。
 *  - 已知不修（登记）：ThemedText precedence（dimColor 压过显式 color）使
 *    select-input-option.tsx description 的 selected→success / focused→suggestion
 *    色意图为死代码——20+ 消费点（ShellProgress/SpinnerGlyph/AgentsList 等）依赖
 *    「dimColor 压 color」语义，翻转属全局视觉回归，超出本件 scope。
 *
 * 测试面分层：StylePool 纯函数（overlay 保 dim）；组件级 ink render（chalk.level=3
 * 强制——bun test 无 FORCE_COLOR 时 chalk.level=0 剥全部 SGR，beforeAll 设/afterAll 复，
 * --isolate 进程隔离安全）。
 */
import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { PassThrough } from 'node:stream'
import React from 'react'
import chalk from 'chalk'
import type { AnsiCode } from '@alcalzone/ansi-tokenize'

import { StylePool } from '../../src/tui/ink/screen.js'
import { render } from '../../src/tui/ink.js'
import { Ansi } from '../../src/tui/ink/Ansi.js'
import { Markdown } from '../../src/tui/components/Markdown.js'
import { AppStateProvider, getDefaultAppState } from '../../src/tui/state/AppState.js'
import { ThemeProvider } from '../../src/tui/components/design-system/ThemeProvider.js'
import { getTheme } from '../../src/tui/utils/theme.js'

// SGR 2 dim —— 与 chalk.dim / applyTextStyles 产出一致；endCode 22m（与 bold 共享）
const DIM: AnsiCode = { code: '\x1b[2m', endCode: '\x1b[22m' } as AnsiCode
const BOLD: AnsiCode = { code: '\x1b[1m', endCode: '\x1b[22m' } as AnsiCode
const hasCode = (styles: AnsiCode[], code: string) => styles.some(s => s.code === code)

async function renderToText(node: React.ReactNode): Promise<string> {
  const chunks: string[] = []
  const fake = new PassThrough() as any
  fake.columns = 80
  fake.rows = 24
  fake.write = (chunk: unknown) => {
    if (typeof chunk === 'string') chunks.push(chunk)
  }
  const inst = await render(node, fake as any)
  await new Promise(r => setTimeout(r, 80))
  inst.unmount?.()
  // 剥 ink 同步标记（\x1b[?2026h/l），保留其余内容与样式
  return chunks.join('').replace(/\x1b\[\?2026[hl]/g, '')
}

const withProviders = (node: React.ReactNode, themeSetting?: string) =>
  React.createElement(
    AppStateProvider,
    { initialState: getDefaultAppState() },
    React.createElement(ThemeProvider, themeSetting ? { initialState: themeSetting } : {}, node),
  )

describe('K6-14件1 · 填充框 faint（Ansi 通道 SGR 2）', () => {
  let savedLevel: number
  beforeAll(() => {
    savedLevel = chalk.level
    chalk.level = 3
  })
  afterAll(() => {
    chalk.level = savedLevel
  })

  test('锚（修前即真）：<Ansi dimColor> 纯文本产出 \\x1b[2m faint', async () => {
    const out = await renderToText(withProviders(React.createElement(Ansi, { dimColor: true }, 'plaindimtext')))
    expect(out).toContain('\x1b[2m')
    expect(out).toContain('plaindimtext')
  })

  test('锚（修前即真）：<Markdown dimColor>（thinking 块链路）整段 \\x1b[2m', async () => {
    const out = await renderToText(
      withProviders(React.createElement(Markdown, { dimColor: true }, 'thinking plain sentence here')),
    )
    expect(out).toContain('\x1b[2m')
    expect(out).toContain('thinking plain sentence here')
  })

  test('RED→GREEN：dimColor 通道内嵌 bold 不被吞（bold 段保留 \\x1b[1m）', async () => {
    const out = await renderToText(
      withProviders(
        React.createElement(Ansi, { dimColor: true }, 'plain \x1b[1mboldpart\x1b[22m tail'),
      ),
    )
    // bold 段保住 SGR 1（修前被互斥丢弃）
    expect(out).toContain('\x1b[1m')
    expect(out).toContain('boldpart')
    // 其余文本仍 dim
    expect(out).toContain('\x1b[2m')
  })

  test('锚：dimColor + colored span 共存（red span 与 dim 叠加不互斥）', async () => {
    const out = await renderToText(
      withProviders(React.createElement(Ansi, { dimColor: true }, 'a \x1b[31mred\x1b[39m b')),
    )
    expect(out).toContain('\x1b[31m')
    expect(out).toContain('\x1b[2m')
  })
})

describe('K6-14件1 · 选中/搜索高亮下保持 faint（StylePool cell 级 overlay）', () => {
  test('锚：withInverse（选中反显）保留 dim', () => {
    const pool = new StylePool()
    const dimId = pool.intern([DIM])
    const overlaid = pool.get(pool.withInverse(dimId))
    expect(hasCode(overlaid, '\x1b[2m')).toBe(true)
    expect(hasCode(overlaid, '\x1b[7m')).toBe(true)
  })

  test('锚：withCurrentMatch（当前搜索匹配）保留 dim 且不误加 bold', () => {
    const pool = new StylePool()
    const dimId = pool.intern([DIM])
    const overlaid = pool.get(pool.withCurrentMatch(dimId))
    expect(hasCode(overlaid, '\x1b[2m')).toBe(true)
    // dim 的 endCode 22m 使 withCurrentMatch 的 bold 守卫跳过加粗（不加 \x1b[1m）
    expect(hasCode(overlaid, '\x1b[1m')).toBe(false)
    expect(hasCode(overlaid, '\x1b[7m')).toBe(true)
  })

  test('锚：withSelectionBg（实色选区）保留 dim', () => {
    const pool = new StylePool()
    pool.setSelectionBg({ code: '\x1b[48;5;237m', endCode: '\x1b[49m' } as AnsiCode)
    const dimId = pool.intern([DIM])
    const overlaid = pool.get(pool.withSelectionBg(dimId))
    expect(hasCode(overlaid, '\x1b[2m')).toBe(true)
    expect(hasCode(overlaid, '\x1b[48;5;237m')).toBe(true)
  })

  test('锚：dim+bold 基础样式经 withSelectionBg 双双保留', () => {
    const pool = new StylePool()
    pool.setSelectionBg({ code: '\x1b[48;5;237m', endCode: '\x1b[49m' } as AnsiCode)
    const id = pool.intern([DIM, BOLD])
    const overlaid = pool.get(pool.withSelectionBg(id))
    expect(hasCode(overlaid, '\x1b[2m')).toBe(true)
    expect(hasCode(overlaid, '\x1b[1m')).toBe(true)
  })
})

describe('K6-14件2 · dim 与正常文本 escape 序列可区分（300 号件）', () => {
  let savedLevel: number
  beforeAll(() => {
    savedLevel = chalk.level
    chalk.level = 3
  })
  afterAll(() => {
    chalk.level = savedLevel
  })

  test('RED→GREEN：dark-ansi 主题 inactive = ansi:blackBright（修前 ansi:white 不可区分）', () => {
    const theme = getTheme('dark-ansi')
    expect(theme.inactive).toBe('ansi:blackBright')
    expect(theme.subtle).toBe('ansi:blackBright')
  })

  test('RED→GREEN：dark-ansi 组件级 dimColor 输出 SGR 90（修前 SGR 37）', async () => {
    const { Text } = await import('../../src/tui/ink.js')
    const out = await renderToText(
      withProviders(
        React.createElement(Text, { dimColor: true }, 'dimdesc'),
        'dark-ansi',
      ),
    )
    expect(out).toContain('dimdesc')
    expect(out).toContain('\x1b[90m')
    // 不可区分根因码（SGR 37 ansi:white）不再出现
    expect(out).not.toContain('\x1b[37m')
  })

  test('锚（修前即真）：其余 5 主题 inactive 与 text 值可区分（层级健全）', () => {
    for (const name of ['dark', 'light', 'light-daltonized', 'dark-daltonized', 'light-ansi'] as const) {
      const theme = getTheme(name)
      expect(theme.inactive).not.toBe(theme.text)
    }
    // dark-ansi 修后同样满足
    const darkAnsi = getTheme('dark-ansi')
    expect(darkAnsi.inactive).not.toBe(darkAnsi.text)
  })

  test('锚（修前即真）：truecolor dark 主题 dimColor 输出 153 灰真彩码（与默认前景可区分）', async () => {
    const { Text } = await import('../../src/tui/ink.js')
    const out = await renderToText(
      withProviders(React.createElement(Text, { dimColor: true }, 'dimdesc'), 'dark'),
    )
    expect(out).toContain('\x1b[38;2;153;153;153m')
  })

  // soft 登记（Review Focus 5）：16 色档下 SGR 90（blackBright 灰）与默认前景的人眼
  // 区分度依终端调色板而异，不进 hard 断言——本文件只锁 escape 序列正确性。
})
