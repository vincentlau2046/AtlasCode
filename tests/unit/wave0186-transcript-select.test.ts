/**
 * 0.1.86 K6 · 任务 D · 全屏 transcript/选择（工单 §D：K6-4/5/6 + K6-16 三件归属）。
 *
 * 件与定因（Main 锁面实证 2026-11-03）：
 *
 * K6-4 双击选词而非折叠 —— 定因：ink 的 DOM onClick 在**第一次 release 即派发**
 * （App.tsx handleMouseEvent release 侧 onClickAt），而多击检测在第二次 **press**
 * （nearLast 500ms/1 格 → selectWordAt 造选区 → release 侧 hasSelection 跳过
 * DOM click）。时序上折叠 toggle 必然先于双击判定发生。修 = **revert 链追踪**
 * （无 timer、单击零延迟）：链首 click 立即 toggle 并记 chainNetToggled；同 key
 * 500ms 内（对齐 App.tsx MULTI_CLICK_TIMEOUT_MS）click2 → 反 toggle 置净零；
 * 链内 click3+ no-op。代价（登记）= 双击期间折叠闪现一次（自恢复）。defer 方案
 * 被否（全单击 500ms 延迟 + press 边界泄漏窗 + unmount 清理）。
 * 测试面 = 纯状态机 foldClickChain.ts（组件级点击派发无既有 harness，交互行为
 * 归 e2e PTY 探针；gate ① 口径：本组 RED 为「无操作脚手架上的行为断言红」，
 * 模块本体为新增面，另列登记）。
 *
 * K6-5 悬停链接下划线 —— 定因：markdown 链接经 createHyperlink 渲染为**单条
 * OSC 8 内联于一个 Ansi 字符串**，非独立 ink 节点 → hit-test 祖先链派发
 * （dispatchHover）到不了 span 级。修 = item 级近似（登记）：LinkHoverContext
 * （VirtualItem 与 TextHoverColorContext 同门控 hovered && !expanded）+
 * MarkdownBody 消费后对格式化串内的 OSC 8 块包 SGR 4/24（在 chalk 色码之外、
 * OSC 8 区之内，色 span 不受扰，下划线格保留超链接归属）。**悬停项内全部链接
 * 下划线**，非光标 span 级；纯文本 URL（findPlainTextUrlAt 点击兜底）可点但不
 * 下划线（无 OSC 8 标记可依——markdown.ts 有意不 linkify 防嵌套）。
 *
 * K6-6 ctrl+o 高亮块缓存 —— 定因：markdown.ts formatToken code 支每次调用跑
 * cli-highlight（昂贵且无内缓存），Markdown.tsx tokenCache 只缓存 lexer 结果。
 * 修 = module 级高亮缓存（镜像 tokenCache：内容 hash + 语言进键、MRU 提升、
 * 上限 500）。**宽度不进键（登记）**：高亮输出宽度由内容决定，wrap 发生在
 * 帧时层（heightCache/columns 层管宽度失效），工单「失效键=内容/宽度变更」的
 * 宽度子句不适用此级。
 *
 * K6-16a 全屏 /compact 重建冻结 —— 归属裁定：与 K6-6 同源（全量消息替换 →
 * 可见 transcript 重渲染，高亮是重渲染成本主项）；K6-6 缓存即修复杠杆
 * （retained 消息 MarkdownBody memo 命中 + 高亮缓存命中，一次性 summary 渲染
 * 成本剩留，登记）。冻结切片语义锚：frozen 长度 > 新数组长度时 slice 钳制回
 * 全量新内容（JS 语义，不另测）。
 *
 * K6-16b 全屏滚动后 /btw 强制跳底 —— 定因：onSubmit 无条件 repinScroll()
 * （REPL.tsx submit 头部），immediate local-jsx 命令（/btw 等 overlay 面，
 * 不落消息 → lastMsgIsHuman 兜底 effect 不触发）把全屏滚动用户拽到底。
 * 修 = repin 移到 immediate 命令分支之后（immediate 命令不 repin；主对话
 * 提交路径行为不变）。组件级 REPL submit 无单测 harness → 行为验证归 e2e
 * PTY 探针（gate ⑤），本文件登记不测。
 *
 * K6-16c agents 视图空行 —— 登记不修（非本任务渲染层同源）：agents 视图 =
 * CustomSelect 索引窗口（visibleFromIndex/To 假定每选项单行高）vs 换行描述
 * 实际多行高 → 滚动/折叠后行错位留空；属选择器窗口层，修复 = 高度感知窗口
 * 重设计 + 仅 PTY 可复现，超出本波面。
 */
import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { PassThrough } from 'node:stream'
import React from 'react'
import chalk from 'chalk'

import {
  applyFoldClick,
  FOLD_CLICK_CHAIN_WINDOW_MS,
  newFoldClickChainState,
  type FoldClickChainState,
} from '../../src/tui/utils/foldClickChain.js'
import { formatToken } from '../../src/tui/utils/markdown.js'
import {
  createHyperlink,
  OSC8_START,
  OSC8_END,
  underlineOsc8Links,
} from '../../src/tui/utils/hyperlink.js'
import { render } from '../../src/tui/ink.js'
import { Markdown } from '../../src/tui/components/Markdown.js'
import {
  LinkHoverContext,
} from '../../src/tui/components/design-system/ThemedText.js'
import { AppStateProvider, getDefaultAppState } from '../../src/tui/state/AppState.js'
import { ThemeProvider } from '../../src/tui/components/design-system/ThemeProvider.js'

// ---------------------------------------------------------------- K6-4

describe('K6-4 · 双击选词而非折叠（revert 链状态机）', () => {
  test('单击 = toggle（链首，零延迟）', () => {
    const state = newFoldClickChainState()
    const toggled: string[] = []
    applyFoldClick(state, 'a', 1000, k => toggled.push(k))
    expect(toggled).toEqual(['a'])
    expect(state.chainNetToggled).toBe(true)
    expect(state.key).toBe('a')
  })

  test('双击 = 净零（第二次点击反 toggle）', () => {
    const state = newFoldClickChainState()
    const toggled: string[] = []
    applyFoldClick(state, 'a', 1000, k => toggled.push(k))
    applyFoldClick(state, 'a', 1100, k => toggled.push(k))
    // 两次 toggle（先展开再收回），链净效果 = 未变
    expect(toggled).toEqual(['a', 'a'])
    expect(state.chainNetToggled).toBe(false)
  })

  test('三击 = 链内第三击无第三次数果', () => {
    const state = newFoldClickChainState()
    const toggled: string[] = []
    applyFoldClick(state, 'a', 1000, k => toggled.push(k))
    applyFoldClick(state, 'a', 1100, k => toggled.push(k))
    applyFoldClick(state, 'a', 1150, k => toggled.push(k))
    expect(toggled).toEqual(['a', 'a'])
  })

  test('500ms 外 = 新链（再次 toggle）', () => {
    const state = newFoldClickChainState()
    const toggled: string[] = []
    applyFoldClick(state, 'a', 1000, k => toggled.push(k))
    applyFoldClick(state, 'a', 1100, k => toggled.push(k))
    applyFoldClick(state, 'a', 1700, k => toggled.push(k))
    expect(toggled).toEqual(['a', 'a', 'a'])
    expect(state.chainNetToggled).toBe(true)
  })

  test('窗口边界 = 500ms 整不算链内（now - time < 500 严格小于）', () => {
    const state = newFoldClickChainState()
    const toggled: string[] = []
    applyFoldClick(state, 'a', 1000, k => toggled.push(k))
    applyFoldClick(state, 'a', 1000 + FOLD_CLICK_CHAIN_WINDOW_MS, k => toggled.push(k))
    expect(toggled).toEqual(['a', 'a'])
  })

  test('跨 key 快速单击 = 各自 toggle 一次（key 变断链）', () => {
    const state = newFoldClickChainState()
    const toggled: string[] = []
    applyFoldClick(state, 'a', 1000, k => toggled.push(k))
    applyFoldClick(state, 'b', 1050, k => toggled.push(k))
    expect(toggled).toEqual(['a', 'b'])
    expect(state.chainNetToggled).toBe(true)
  })

  test('锚：链窗口对齐 ink 多击检测（500ms）', () => {
    expect(FOLD_CLICK_CHAIN_WINDOW_MS).toBe(500)
  })

  test('锚：跨链状态独立（新 state 首击必 toggle）', () => {
    const state: FoldClickChainState = { key: 'a', time: 9999, chainNetToggled: true }
    const toggled: string[] = []
    applyFoldClick(state, 'b', 10000, k => toggled.push(k))
    expect(toggled).toEqual(['b'])
  })
})

// ---------------------------------------------------------------- K6-6

describe('K6-6 · ctrl+o 高亮块缓存（formatToken code 支）', () => {
  const makeSpyHighlight = () => {
    let calls = 0
    return {
      getCalls: () => calls,
      supportsLanguage: (_lang: string) => true,
      highlight: (text: string, _opts: { language: string }) => {
        calls++
        return `HL[${text}]`
      },
    }
  }

  const codeToken = (text: string, lang: string) =>
    ({ type: 'code', text, lang }) as never

  test('RED→GREEN：同内容同语言二次格式化命中缓存（1 次高亮调用）', () => {
    const hl = makeSpyHighlight()
    const token = codeToken('const a = 1', 'ts')
    formatToken(token, 'dark', 0, null, null, hl as never)
    formatToken(token, 'dark', 0, null, null, hl as never)
    expect(hl.getCalls()).toBe(1)
  })

  test('锚：同内容不同语言不共享缓存（语言进键）', () => {
    const hl = makeSpyHighlight()
    formatToken(codeToken('x = 1', 'ts'), 'dark', 0, null, null, hl as never)
    formatToken(codeToken('x = 1', 'py'), 'dark', 0, null, null, hl as never)
    expect(hl.getCalls()).toBe(2)
  })

  test('锚：同语言不同内容不共享缓存（内容进键）', () => {
    const hl = makeSpyHighlight()
    formatToken(codeToken('a = 1', 'ts'), 'dark', 0, null, null, hl as never)
    formatToken(codeToken('b = 2', 'ts'), 'dark', 0, null, null, hl as never)
    expect(hl.getCalls()).toBe(2)
  })

  test('RED→GREEN：MRU 提升 —— 命中提升后新条目挤出的是最旧未用项', () => {
    const hl = makeSpyHighlight()
    // 填满 500 条
    for (let i = 0; i < 500; i++) {
      formatToken(codeToken(`code-${i}`, 'ts'), 'dark', 0, null, null, hl as never)
    }
    expect(hl.getCalls()).toBe(500)
    // 重访第 0 条（命中 + MRU 提升）
    formatToken(codeToken('code-0', 'ts'), 'dark', 0, null, null, hl as never)
    expect(hl.getCalls()).toBe(500)
    // 第 501 条进来 → 挤出第 1 条（第 0 条已提升保留）
    formatToken(codeToken('code-500', 'ts'), 'dark', 0, null, null, hl as never)
    expect(hl.getCalls()).toBe(501)
    // 第 0 条仍在缓存
    formatToken(codeToken('code-0', 'ts'), 'dark', 0, null, null, hl as never)
    expect(hl.getCalls()).toBe(501)
  })

  test('锚：highlight=null 直通（无缓存干扰）', () => {
    const out = formatToken(codeToken('plain code', 'ts'), 'dark', 0, null, null, null)
    expect(out).toBe('plain code\n')
  })
})

// ---------------------------------------------------------------- K6-5

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
  return chunks.join('').replace(/\x1b\[\?2026[hl]/g, '')
}

const withProviders = (node: React.ReactNode, themeSetting?: string) =>
  React.createElement(
    AppStateProvider,
    { initialState: getDefaultAppState() },
    React.createElement(ThemeProvider, themeSetting ? { initialState: themeSetting } : {}, node),
  )

describe('K6-5 · 悬停链接下划线（OSC 8 块 SGR 4 包裹）', () => {
  let savedLevel: number
  let savedTermProgram: string | undefined
  beforeAll(() => {
    savedLevel = chalk.level
    chalk.level = 3
    // createHyperlink 经 supportsHyperlinks() 探测 —— bun test stdout 非 TTY，
    // 强制命中 ADDITIONAL_HYPERLINK_TERMINALS 白名单拿 OSC 8 输出。
    savedTermProgram = process.env.TERM_PROGRAM
    process.env.TERM_PROGRAM = 'iTerm.app'
  })
  afterAll(() => {
    chalk.level = savedLevel
    if (savedTermProgram === undefined) delete process.env.TERM_PROGRAM
    else process.env.TERM_PROGRAM = savedTermProgram
  })

  test('锚（修前即真）：Markdown 链接渲染为 OSC 8', async () => {
    const out = await renderToText(withProviders(
      React.createElement(Markdown, {}, '[Atlas](https://example.com/docs)'),
    ))
    // 组件级 open 由 ink 层重写（termio/osc.ts link() 自动加 id= 参数）；裸形
    // 只在 formatToken 字符串层。params 组不锁定（勘误登记：首版锚误锁裸形）。
    expect(out).toMatch(/\x1b\]8;[^;\x07]*;https:\/\/example\.com\/docs\x07/)
    expect(out).toContain('Atlas')
  })

  test('RED→GREEN：悬停（LinkHoverContext=true）时链接文本带 SGR 4 下划线', async () => {
    const out = await renderToText(withProviders(
      React.createElement(
        LinkHoverContext.Provider,
        { value: true },
        React.createElement(Markdown, {}, '[Atlas](https://example.com/docs)'),
      ),
    ))
    expect(out).toContain('\x1b[4m')
    // SGR 4 落在 OSC 8 区内（open 与 close 之间；ink 样式归一化会把色码提到
    // 下划线前，故不锁紧邻位置），下划线格保留超链接归属
    const region = out.match(/\x1b\]8;[^;\x07]*;https:\/\/example\.com\/docs\x07([\s\S]*?)\x1b\]8;;\x07/)
    expect(region).not.toBeNull()
    expect(region![1]).toContain('\x1b[4m')
    // 链接文本与闭合仍在
    expect(out).toContain('Atlas')
    expect(out).toContain(`${OSC8_START}${OSC8_END}`)
  })

  test('锚：未悬停（默认 false）不出现 SGR 4', async () => {
    const out = await renderToText(withProviders(
      React.createElement(Markdown, {}, '[Atlas](https://example.com/docs)'),
    ))
    expect(out).not.toContain('\x1b[4m')
  })

  test('RED→GREEN：underlineOsc8Links 纯函数 —— OSC 8 块内文本包 SGR 4/24', () => {
    const inStr =
      `pre ${OSC8_START}https://x${OSC8_END}\x1b[34mlabel\x1b[39m${OSC8_START}${OSC8_END} post`
    const out = underlineOsc8Links(inStr)
    expect(out).toBe(
      `pre ${OSC8_START}https://x${OSC8_END}\x1b[4m\x1b[34mlabel\x1b[39m\x1b[24m${OSC8_START}${OSC8_END} post`,
    )
  })

  test('锚：无 OSC 8 的串原样返回', () => {
    expect(underlineOsc8Links('plain \x1b[34mtext\x1b[39m')).toBe('plain \x1b[34mtext\x1b[39m')
  })

  test('锚：多个 OSC 8 块全部包裹（全局替换）', () => {
    const block = (url: string, text: string) =>
      `${OSC8_START}${url}${OSC8_END}\x1b[34m${text}\x1b[39m${OSC8_START}${OSC8_END}`
    const out = underlineOsc8Links(`${block('https://a', 'A')} mid ${block('https://b', 'B')}`)
    expect(out).toContain(`${OSC8_START}https://a${OSC8_END}\x1b[4m`)
    expect(out).toContain(`${OSC8_START}https://b${OSC8_END}\x1b[4m`)
    expect(out.match(/\x1b\[4m/g)).toHaveLength(2)
  })

  test('锚：createHyperlink 输出即合法包裹输入（端到端形状）', () => {
    const link = createHyperlink('https://example.com', 'site', { supportsHyperlinks: true })
    const wrapped = underlineOsc8Links(link)
    expect(wrapped).toBe(
      `${OSC8_START}https://example.com${OSC8_END}\x1b[4m\x1b[34msite\x1b[39m\x1b[24m${OSC8_START}${OSC8_END}`,
    )
  })
})
