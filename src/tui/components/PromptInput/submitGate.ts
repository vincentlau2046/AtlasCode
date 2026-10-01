/**
 * PromptInput 提交门控决策（P0-A / #204 B1 收口）：suggestions 下拉可见时是否
 * 「持有提交」（早退不提交）。
 *
 * 纯叶子函数（无 React / 无 I/O），供 PromptInput onSubmit 消费 + 单测。
 *
 * 背景（0405 80/83 sweep STUCK 签名，P0-A 双门吞 Enter）：
 *   慢输入 slash 命令时，命令下拉自动选中被后续更新分支重置为 selectedSuggestion=-1，
 *   useTypeahead handleEnter（门 1）对无选中命令建议静默 no-op；PromptInput onSubmit
 *   （门 2）见「下拉可见 + 非 slash 提交」早退（"user needs to clear suggestions first"）。
 *   两门叠加 → 按 Enter 无任何反应、输入框滞留，命令不执行。
 *
 * 决策（返回 true = 应早退持有；false = 放行提交）：
 *   放行（不持有）——任一成立：
 *     · 无 suggestions（无下拉）
 *     · isSubmittingSlashCommand（typeahead 命令补全路径，已显式选中）
 *     · 全为目录建议（Tab 用于补全目录，Enter 提交）
 *     · 命令输入（slash，isCommandInput）—— P0-A 兜底：命令下拉可见但无显式选中时，
 *       Enter 走文本面提交（onSubmitProp 识别 leading / 路由命令），不再静默 no-op
 *   否则（file/shell/agent/slack 建议可见且非 slash 提交）→ 持有（早退，Enter 应补全）
 */
import { isCommandInput } from '../../utils/suggestions/commandSuggestions.js'
import type { SuggestionItem } from './PromptInputFooterSuggestions.js'

export function shouldHoldSubmitForSuggestions(args: {
  suggestions: SuggestionItem[]
  isSubmittingSlashCommand: boolean
  inputParam: string
}): boolean {
  const { suggestions, isSubmittingSlashCommand, inputParam } = args
  if (suggestions.length === 0) return false
  if (isSubmittingSlashCommand) return false
  const hasDirectorySuggestions = suggestions.every(s => s.description === 'directory')
  if (hasDirectorySuggestions) return false
  if (isCommandInput(inputParam)) return false
  return true
}
