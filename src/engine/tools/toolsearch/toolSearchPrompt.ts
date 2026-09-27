/**
 * engine/tools/toolsearch — ToolSearch prompt 面 + isDeferredTool（S-E2
 * §8.63 MCP+ToolSearch 族子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/ToolSearchTool/prompt.ts 83L 裁剪随迁。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① GB atlas_glacier_2xr gate 裁（§8.63.1.2 ⑰）：新仓 GrowthBook 0-hit →
 *    取 delta-enabled hint 面逐字 'Deferred tools appear by name in
 *    <system-reminder> messages.'；旧 '<available-deferred-tools>'
 *    pre-gate 面裁（新仓 0-hit 消费方，getToolLocationHint 函数面 →
 *    编译期常量）。
 *  ② isDeferredTool：feature('FORK_SUBAGENT') 支裁（§8.63.1.2 ⑯：bun:
 *    bundle feature() 恒 false 死支 + 新仓无 forkSubagent/AGENT_TOOL_NAME
 *    消费）；4 面逐字（alwaysLoad / isMcp / 自身 ToolSearch / shouldDefer，
 *    注释逐字）。
 *  ③ formatDeferredToolLine 裁（裁定 ⑰ 同源：旧消费 = <available-
 *    deferred-tools> user message + getDeferredToolsDelta addedLines 渲染，
 *    新仓 engine 0-hit；复活 = MCP client 波）。
 *  ④ getPrompt() 函数面 → TOOL_SEARCH_PROMPT 常量（HEAD + hint + TAIL，
 *    拼接顺序逐字；hint 为 ① 常量后无运行时 gate 读）。
 *  ⑤ 旧 TOOL_SEARCH_TOOL_NAME re-export（constants.js）→ 新仓单一事实源
 *    toolNames（本模块直引，不重出）。
 */
import { type Tool } from '../../../shared'
import { TOOL_SEARCH_TOOL_NAME } from '../toolNames'

const PROMPT_HEAD = `Fetches full schema definitions for deferred tools so they can be called.

`

// 裁定 ⑰：GB gate 裁，取 delta-enabled hint 面逐字
const TOOL_LOCATION_HINT =
  'Deferred tools appear by name in <system-reminder> messages.'

const PROMPT_TAIL = ` Until fetched, only the name is known — there is no parameter schema, so the tool cannot be invoked. This tool takes a query, matches it against the deferred tool list, and returns the matched tools' complete JSONSchema definitions inside a <functions> block. Once a tool's schema appears in that result, it is callable exactly like any tool defined at the top of the prompt.

Result format: each matched tool appears as one <function>{"description": "...", "name": "...", "parameters": {...}}</function> line inside the <functions> block — the same encoding as the tool list at the top of this prompt.

Query forms:
- "select:Read,Edit,Grep" — fetch these exact tools by name
- "notebook jupyter" — keyword search, up to max_results best matches
- "+slack send" — require "slack" in the name, rank by remaining terms`

export const TOOL_SEARCH_PROMPT = PROMPT_HEAD + TOOL_LOCATION_HINT + PROMPT_TAIL

/**
 * Check if a tool should be deferred (requires ToolSearch to load).
 * A tool is deferred if:
 * - It's an MCP tool (always deferred - workflow-specific)
 * - It has shouldDefer: true
 *
 * A tool is NEVER deferred if it has alwaysLoad: true (MCP tools set this via
 * _meta['anthropic/alwaysLoad']). This check runs first, before any other rule.
 */
export function isDeferredTool(tool: Tool): boolean {
  // Explicit opt-out via _meta['anthropic/alwaysLoad'] — tool appears in the
  // initial prompt with full schema. Checked first so MCP tools can opt out.
  if (tool.alwaysLoad === true) return false

  // MCP tools are always deferred (workflow-specific)
  if (tool.isMcp === true) return true

  // Never defer ToolSearch itself — the model needs it to load everything else
  if (tool.name === TOOL_SEARCH_TOOL_NAME) return false

  // 裁定 ⑯：feature('FORK_SUBAGENT') 支裁（bun:bundle feature() 恒 false
  // 死支 + 新仓无 forkSubagent 消费）

  return tool.shouldDefer === true
}
