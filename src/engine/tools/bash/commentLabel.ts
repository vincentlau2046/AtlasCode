/**
 * engine/tools/bash — Bash 注释 label 提取（Bash 本体纵切子波 §8.54 S-B2 纯叶子本体）。
 *
 * 旧仓来源（a8af45b）: src/tools/BashTool/commentLabel.ts 13L 逐字随迁。
 *
 * 残留守登记（H6，复审勿当遗漏重提）：旧仓唯一消费方 =
 * utils/collapseReadSearch.ts（TUI collapse 组 ⎿ 提示面，React 层域外）
 * → 本波只落函数本体，消费面归 TUI 域外（D 波壳层核查面）；S-B5 的
 * renderToolUseMessage 返回 () => null（AgentTool 先例，TUI 残留守），
 * 不消费本函数。
 */

/**
 * If the first line of a bash command is a `# comment` (not a `#!` shebang),
 * return the comment text stripped of the `#` prefix. Otherwise undefined.
 *
 * Under fullscreen mode this is the non-verbose tool-use label AND the
 * collapse-group ⎿ hint — it's what Claude wrote for the human to read.
 */
export function extractBashCommentLabel(command: string): string | undefined {
  const nl = command.indexOf('\n')
  const firstLine = (nl === -1 ? command : command.slice(0, nl)).trim()
  if (!firstLine.startsWith('#') || firstLine.startsWith('#!')) return undefined
  return firstLine.replace(/^#+\s*/, '') || undefined
}
