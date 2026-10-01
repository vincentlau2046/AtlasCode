/**
 * PromptInput 提交门控（submitGate.shouldHoldSubmitForSuggestions）契约测试。
 *
 * P0-A（#204 B1 / 0405 80/83 STUCK 签名）收口：慢输入 slash 命令时命令下拉自动选中
 * 被重置为无选中态，双门（typeahead handleEnter no-op + onSubmit 早退）静默吞 Enter。
 * 修复 = 命令输入（slash）在下拉可见时也放行提交（走文本面）。本测试锁决策真值表，
 * 防回归把「命令放行」误扩到「file/shell 补全也放行」（Enter 应补全而非提交）。
 * I/O-free（纯函数）→ unit 层。
 */
import { describe, test, expect } from 'bun:test'
import { shouldHoldSubmitForSuggestions } from '../../src/tui/components/PromptInput/submitGate.js'
import type { SuggestionItem } from '../../src/tui/components/PromptInput/PromptInputFooterSuggestions.js'

const cmd = (displayText: string): SuggestionItem => ({ id: `cmd-${displayText}`, displayText })
const dir = (displayText: string): SuggestionItem => ({ id: `dir-${displayText}`, displayText, description: 'directory' })

describe('shouldHoldSubmitForSuggestions（P0-A 提交门控真值表）', () => {
  test('① 无 suggestions（无下拉）→ 放行（不持有）', () => {
    expect(shouldHoldSubmitForSuggestions({ suggestions: [], isSubmittingSlashCommand: false, inputParam: 'hello' })).toBe(false)
  })

  test('② slash 提交路径（typeahead 补全，已显式选中）→ 放行', () => {
    expect(shouldHoldSubmitForSuggestions({
      suggestions: [cmd('/context')],
      isSubmittingSlashCommand: true,
      inputParam: '/context',
    })).toBe(false)
  })

  test('③ 全为目录建议 → 放行（Tab 补全目录，Enter 提交）', () => {
    expect(shouldHoldSubmitForSuggestions({
      suggestions: [dir('/a'), dir('/b')],
      isSubmittingSlashCommand: false,
      inputParam: 'some text',
    })).toBe(false)
  })

  test('④ P0-A 修复：命令输入（slash）+ 命令下拉可见 + 非 slash 提交 → 放行（不再静默 no-op）', () => {
    expect(shouldHoldSubmitForSuggestions({
      suggestions: [cmd('/context'), cmd('/config')],
      isSubmittingSlashCommand: false,
      inputParam: '/context',
    })).toBe(false)
  })

  test('⑤ 回归护栏：非命令输入 + 文件建议可见 + 非 slash 提交 → 持有（早退，Enter 应补全文件）', () => {
    expect(shouldHoldSubmitForSuggestions({
      suggestions: [cmd('/other')],
      isSubmittingSlashCommand: false,
      inputParam: 'plain text',
    })).toBe(true)
  })

  test('⑥ 回归护栏：非命令输入 + 文件建议（非目录）+ 非 slash 提交 → 持有', () => {
    const fileSug: SuggestionItem = { id: 'file-src.ts', displayText: 'src.ts', description: 'file' }
    expect(shouldHoldSubmitForSuggestions({
      suggestions: [fileSug],
      isSubmittingSlashCommand: false,
      inputParam: 'look at src',
    })).toBe(true)
  })

  test('⑦ 命令输入但目录建议混合（非全目录）→ 仍按 slash 放行', () => {
    expect(shouldHoldSubmitForSuggestions({
      suggestions: [dir('/x'), cmd('/add-dir')],
      isSubmittingSlashCommand: false,
      inputParam: '/add-dir /some/path',
    })).toBe(false)
  })
})
