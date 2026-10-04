/**
 * P0b② autoCompact 档位接 statusline 熔断预警（docs/tui-differentiation-spec.md
 * §4 P0b 门禁②）：接近 autoCompact 阈值前，statusline 提示"将自动压缩，可 /rewind 回退"。
 *
 * 被测：AutoCompactWarningSegment 渲染谓词——
 *   - 无 context_window / 低用量 → null（不留分隔符）
 *   - 用量进入 autoCompact 阈值预警区（阈值 − 20k 缓冲）+ autoCompact 启用 → 渲染
 *   - autoCompact 关（settings 源缝注入 false）→ null（不会自动压缩，不预警）
 *
 * 数据经 engine 门面 model-string 形（calculateTokenWarningState + isAutoCompactEnabled），
 * 阈值/窗口走默认档（MODEL_CONTEXT_WINDOW_DEFAULT=150k；used=999999 恒落预警区上沿，
 * used=0 恒落预警区下沿，不依赖精确窗口算术）。分层纪律：纯元素谓词（无网络/无盘/无 PTY）。
 */
import { describe, test, expect, afterEach } from 'bun:test'
import * as React from 'react'
import { setAutoCompactSettingsSource } from '../../src/engine'
import { AutoCompactWarningSegment } from '../../src/tui/components/StatusLine/segments/AutoCompactWarningSegment.js'
import type {
  SegmentRenderContext,
  StatusLineCommandInputLike,
} from '../../src/tui/components/StatusLine/segments/types.js'

function makeInput(usedTokens: number, withCw = true): StatusLineCommandInputLike {
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
          used_percentage: 0,
          remaining_percentage: 100,
        }
      : undefined,
  } as StatusLineCommandInputLike
}

function makeCtx(input: StatusLineCommandInputLike): SegmentRenderContext {
  return { input, width: 160, density: 'detailed' }
}

function children(node: React.ReactNode): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(children).join('')
  return children((node as { props?: { children?: React.ReactNode } }).props?.children)
}

afterEach(() => {
  // 复位 settings 源缝（disabled 分支注入的 false 不串味后续测试）
  setAutoCompactSettingsSource(null)
})

describe('P0b② AutoCompactWarningSegment 渲染谓词', () => {
  test('无 context_window → null', () => {
    expect(AutoCompactWarningSegment(makeCtx(makeInput(999_999, false)))).toBeNull()
  })

  test('低用量（预警区下沿外）→ null', () => {
    expect(AutoCompactWarningSegment(makeCtx(makeInput(0)))).toBeNull()
  })

  test('用量进入 autoCompact 阈值预警区 + 启用 → 渲染"将自动压缩，可 /rewind 回退"', () => {
    const node = AutoCompactWarningSegment(makeCtx(makeInput(999_999)))
    expect(React.isValidElement(node)).toBe(true)
    const text = children(node)
    expect(text).toContain('将自动压缩')
    expect(text).toContain('/rewind')
    expect(text).toContain('回退')
  })

  test('autoCompact 关（settings 源缝 false）→ 高用量也不预警', () => {
    setAutoCompactSettingsSource(() => false)
    expect(AutoCompactWarningSegment(makeCtx(makeInput(999_999)))).toBeNull()
  })
})
