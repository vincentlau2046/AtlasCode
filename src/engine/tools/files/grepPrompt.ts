/**
 * engine/tools/files — Grep prompt 面（§8.55 S-C4，旧仓
 * src/tools/GrepTool/prompt.ts 18L 逐字随迁）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - GREP_TOOL_NAME / BASH_TOOL_NAME → ../toolNames + AGENT_TOOL_NAME →
 *    ../agent/constants（engine/tools 单一事实源，值逐字同
 *    'Grep'/'Agent'/'Bash'）。
 *  - 函数名 getDescription → getGrepDescription（旧名过泛，门面 STR-1
 *    全名块 0 重名纪律；模板体逐字不变）。
 */
import { AGENT_TOOL_NAME } from '../agent/constants'
import { BASH_TOOL_NAME, GREP_TOOL_NAME } from '../toolNames'

export function getGrepDescription(): string {
  return `A powerful search tool built on ripgrep

  Usage:
  - ALWAYS use ${GREP_TOOL_NAME} for search tasks. NEVER invoke \`grep\` or \`rg\` as a ${BASH_TOOL_NAME} command. The ${GREP_TOOL_NAME} tool has been optimized for correct permissions and access.
  - Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
  - Filter files with glob parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust")
  - Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts
  - Use ${AGENT_TOOL_NAME} tool for open-ended searches requiring multiple rounds
  - Pattern syntax: Uses ripgrep (not grep) - literal braces need escaping (use \`interface\\{\\}\` to find \`interface{}\` in Go code)
  - Multiline matching: By default patterns match within single lines only. For cross-line patterns like \`struct \\{[\\s\\S]*?field\`, use \`multiline: true\`
`
}
