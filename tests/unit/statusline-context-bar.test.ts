/**
 * 2026-10-05 §4b B2（f4 批准，P0b② 持续监控）：autoCompact 熔断预警折入
 * context-bar 段（独立 auto-compact-warning segment 删除）+ 色阶改
 * cyan→黄 70%→红 90%。
 *
 * 被测：
 *   - contextColorForPercentage 新色阶：null→gray / <70 cyan / 70-90 黄 / >90 红
 *   - ContextBarSegment 渲染谓词：
 *     - 无 context_window → null
 *     - 正常用量（pct 36）→ 无 ▲，段色 cyan
 *     - 用量进 autoCompact 阈值预警区（阈值 − 20k 缓冲）+ 启用 → 尾部黄 ▲
 *     - autoCompact 关（settings 源缝注入 false）→ 高用量也无 ▲
 *     - 低用量（used=0，预警区下沿外）→ 无 ▲
 *
 * ▲ 谓词与被删 AutoCompactWarningSegment 同源：engine 门面 model-string 形
 * （calculateTokenWarningState + isAutoCompactEnabled 0 参形），阈值/窗口走
 * 默认档（used=999999 恒落预警区上沿，used=0 恒落下沿，不依赖精确窗口算术）。
 * 分层纪律：纯元素谓词（无网络 / 无盘 / 无 PTY）。
 */
import { describe, test, expect, afterEach } from 'bun:test'
import * as React from 'react'
import { setAutoCompactSettingsSource } from '../../src/engine'
import { ContextBarSegment } from '../../src/tui/components/StatusLine/segments/ContextBarSegment.js'
import {
  contextColorForPercentage,
  type SegmentRenderContext,
  type StatusLineCommandInputLike,
} from '../../src/tui/components/StatusLine/segments/types.js'

function makeInput(
  usedTokens: number,
  pct: number,
  withCw = true,
): StatusLineCommandInputLike {
  return {
    model: { id: 'test-model', display_name: 'Test Model' },
    exceeds_200k_tokens: false,
    version: '0.0.0',
    context_window: withCw
      ? {
          total_input_tokens: usedTokens,
          total_output_tokens: 0,
          context_window_size: 150_000,
          current_usage: {
            input_tokens: usedTokens,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          used_percentage: pct,
          remaining_percentage: 100 - pct,
        }
      : undefined,
  } as StatusLineCommandInputLike
}

function makeCtx(input: StatusLineCommandInputLike): SegmentRenderContext {
  return { input, width: 160, density: 'detailed' }
}

function flatten(node: React.ReactNode): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flatten).join('')
  return flatten(
    (node as { props?: { children?: React.ReactNode } }).props?.children,
  )
}

/** 顶层子节点中 color=yellow 的嵌套 Text 文本（▲ 尾标 = 独立黄字，§4.3 色阶） */
function yellowSuffix(node: React.ReactNode): string {
  const kids = (node as { props?: { children?: React.ReactNode } })
    .props?.children
  const list = Array.isArray(kids) ? kids : kids == null ? [] : [kids]
  return list
    .filter(
      c =>
        React.isValidElement(c) &&
        (c as { props?: { color?: string } }).props?.color === 'yellow',
    )
    .map(c =>
      flatten(
        (c as { props?: { children?: React.ReactNode } }).props?.children,
      ),
    )
    .join('')
}

afterEach(() => {
  // 复位 settings 源缝（disabled 分支注入的 false 不串味后续测试）
  setAutoCompactSettingsSource(null)
})

describe('B2 contextColorForPercentage 新色阶（cyan→黄 70%→红 90%）', () => {
  test('null → gray（无数据）', () => {
    expect(contextColorForPercentage(null)).toBe('gray')
  })

  test('<70 → cyan（正常态）', () => {
    expect(contextColorForPercentage(30)).toBe('cyan')
    expect(contextColorForPercentage(69.9)).toBe('cyan')
  })

  test('70-90 → yellow（预警）', () => {
    expect(contextColorForPercentage(70)).toBe('yellow')
    expect(contextColorForPercentage(90)).toBe('yellow')
  })

  test('>90 → red（危险）', () => {
    expect(contextColorForPercentage(95)).toBe('red')
  })
})

describe('B2 ContextBarSegment ▲ 预警谓词（熔断预警折入 context-bar）', () => {
  test('无 context_window → null', () => {
    expect(
      ContextBarSegment(makeCtx(makeInput(999_999, 0, false))),
    ).toBeNull()
  })

  test('正常用量（pct 36）→ 无 ▲，段色 cyan', () => {
    const node = ContextBarSegment(makeCtx(makeInput(54_000, 36)))
    expect(React.isValidElement(node)).toBe(true)
    expect(flatten(node)).toBe('▤ 54k/150k tok (36%)')
    expect((node as { props: { color: string } }).props.color).toBe('cyan')
    expect(yellowSuffix(node)).toBe('')
  })

  test('用量进 autoCompact 阈值预警区 + 启用 → 尾部黄 ▲', () => {
    const node = ContextBarSegment(makeCtx(makeInput(999_999, 66)))
    expect(flatten(node)).toBe('▤ 1000k/150k tok (66%) ▲')
    expect(yellowSuffix(node)).toBe(' ▲')
  })

  test('autoCompact 关（settings 源缝 false）→ 高用量也无 ▲', () => {
    setAutoCompactSettingsSource(() => false)
    const node = ContextBarSegment(makeCtx(makeInput(999_999, 66)))
    expect(flatten(node)).toBe('▤ 1000k/150k tok (66%)')
    expect(yellowSuffix(node)).toBe('')
  })

  test('低用量（used=0，预警区下沿外）→ autoCompact 启用也无 ▲', () => {
    const node = ContextBarSegment(makeCtx(makeInput(0, 1)))
    expect(flatten(node)).toBe('▤ 0/150k tok (1%)')
  })
})

/**
 * SL-1a（0.1.49 · 用户 2026-10-10 裁定：纯数字式，ctx 统计恒显，不恢复进度条）
 * render fixture 2 件（工单 §2）：
 * ① 有 usage → 数字式（3 色阶分支断言）—— 零回归（恒绿：数字式逻辑不动，
 *    setAutoCompactSettingsSource(false) 排除 ▲ 尾标干扰）
 * ② 无 usage（pct==null）→ dim 占位非 null（`<Text dimColor>▤ —/{total} tok</Text>`）
 *    —— 修前红（现 return null = 整段隐藏）→ 修后绿
 */
describe('SL-1a render fixture（①数字式 3 色阶零回归 / ②dim 占位恒显）', () => {
  test('① 有 usage → 数字式 3 色阶分支（<70 cyan / 70-90 yellow / >90 red）', () => {
    setAutoCompactSettingsSource(() => false)
    const cyan = ContextBarSegment(makeCtx(makeInput(54_000, 36)))
    expect(flatten(cyan)).toBe('▤ 54k/150k tok (36%)')
    expect((cyan as { props: { color: string } }).props.color).toBe('cyan')
    const yellow = ContextBarSegment(makeCtx(makeInput(99_999, 85)))
    expect(flatten(yellow)).toBe('▤ 100k/150k tok (85%)')
    expect((yellow as { props: { color: string } }).props.color).toBe(
      'yellow',
    )
    const red = ContextBarSegment(makeCtx(makeInput(142_500, 95)))
    expect(flatten(red)).toBe('▤ 143k/150k tok (95%)')
    expect((red as { props: { color: string } }).props.color).toBe('red')
  })

  test('② 无 usage（pct==null）→ dim 占位非 null（修前红：现 return null 整段隐藏）', () => {
    const node = ContextBarSegment(
      makeCtx({
        model: { id: 'test-model', display_name: 'Test Model' },
        exceeds_200k_tokens: false,
        version: '0.0.0',
        context_window: {
          total_input_tokens: 0,
          total_output_tokens: 0,
          context_window_size: 150_000,
          current_usage: null,
          used_percentage: null,
          remaining_percentage: null,
        },
      } as StatusLineCommandInputLike),
    )
    expect(node).not.toBeNull()
    expect(React.isValidElement(node)).toBe(true)
    const el = node as {
      props: { dimColor?: boolean; children?: React.ReactNode }
    }
    // dimColor 设计系惯用法（ThemedText 解析 → theme.inactive，随主题明暗自适应）
    expect(el.props.dimColor).toBe(true)
    // 占位 = `▤ —/{formatK(total)} tok`（total 动态 = context_window_size）
    expect(flatten(node)).toBe('▤ —/150k tok')
  })
})
