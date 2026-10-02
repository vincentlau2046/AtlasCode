/**
 * S2（感知面反馈波）：thinking 折叠支一句话预览提取（thinkingFirstLinePreview
 * 纯函数判别单测，零渲染）。
 *
 * 被测能力 = 折叠支默认屏渲染的预览行内容——修前折叠支 thinking 内容 0 字
 * （AssistantThinkingMessage 折叠支 JSX 只输出静态 "∴ Thinking <CtrlOToExpand>"
 * 标记，内容变量零引用）；修后 label 后渲染首个非空行（80 字截断）。
 * 提取逻辑全部集中在纯函数（编译态 .tsx 最小插入只消费本函数），故单测
 * 即判别。
 */
import { describe, expect, test } from 'bun:test'
import { thinkingFirstLinePreview } from '../../src/tui/components/messages/thinkingPreview'

describe('thinkingFirstLinePreview（S2 折叠支一句话预览）', () => {
  test('单行短内容原样返回', () => {
    expect(thinkingFirstLinePreview('先分析需求')).toBe('先分析需求')
  })

  test('首个非空行（跳过头部空行/纯空白行，行内 trim）', () => {
    expect(thinkingFirstLinePreview('\n\n   \n  第二步开始  ')).toBe(
      '第二步开始',
    )
  })

  test('超 80 字截断 + 省略号（默认 maxLen）', () => {
    const line = 'x'.repeat(100)
    const out = thinkingFirstLinePreview(line)
    expect(out).toBe('x'.repeat(80) + '…')
    expect(out.length).toBe(81)
  })

  test('恰好 80 字不截断（边界）', () => {
    const line = 'y'.repeat(80)
    expect(thinkingFirstLinePreview(line)).toBe(line)
  })

  test('自定义 maxLen', () => {
    expect(thinkingFirstLinePreview('abcdef', 3)).toBe('abc…')
  })

  test('全空白 thinking → 空串（调用方回落原 label 渲染）', () => {
    expect(thinkingFirstLinePreview('\n  \n\t\n')).toBe('')
    expect(thinkingFirstLinePreview('')).toBe('')
  })
})
