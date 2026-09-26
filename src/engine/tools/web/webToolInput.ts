/**
 * engine/tools/web — web 族 duck 型面（S-E2 §8.59 web 族子波）。
 *
 * 旧仓来源（a8af45b）：WebFetchTool.ts / WebSearchTool.ts 的 zod
 * input/output schema 推断型 + UI.tsx 进度型 + ToolDef 泛参 → 新 shared Tool
 * 契约 2 参 call 的 duck 型承载（readTool delta ⑧ 先例：context duck 局部
 * 化，零跨域 import）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  ① 旧 zod inputSchema（z.strictObject）→ 纯 JSON schema 对象
 *    （WEB_FETCH_TOOL_INPUT_SCHEMA / WEB_SEARCH_TOOL_INPUT_SCHEMA 各工具
 *    文件内，ToolInputJSONSchema 宽骨架面，S-C5 ① 先例）；本文件仅承载
 *    推断型面（WebFetchToolInput / WebSearchToolInput）。
 *  ② 旧 zod outputSchema（z.infer 推断 Output）→ TS 型承载
 *    （WebFetchOutput / WebSearchOutput，引擎侧无 wire outputSchema
 *    消费者，D 波前向接缝，S-D2b delta ① 同面）。
 *  ③ 旧 WebSearchProgress = 旧仓 types/tools.ts 编译 any-stub
 *    （H6 纪律：stub 不当真行为）→ 域内结构 duck 双变体 union（旧 UI.tsx
 *    renderToolUseProgressMessage switch 消费面实证：query_update /
 *    search_results_received 两型）。
 *  ④ 旧 call 5 参签名（_canUseTool / _parentMessage / onProgress 体零
 *    消费，WebSearchTool.ts L233 声明实证）→ 新 2 参声明（readTool
 *    delta ⑧ 先例）。
 *  ⑤ 旧 UI.tsx getToolUseSummary（truncate 宽感知 ink/stringWidth +
 *    TOOL_SUMMARY_MAX_LENGTH=50）→ 域内本地 50 字符面（截断 + '…'，
 *    宽感知面裁登记）。
 */
import type { ToolPermissionContext, ThinkingConfig } from '../../../shared'

// ── WebFetch ─────────────────────────────────────────────────────────────

export type WebFetchToolInput = {
  url: string
  prompt: string
}

/** 旧 WebFetchTool.ts outputSchema z.infer（delta ②）。 */
export type WebFetchOutput = {
  bytes: number
  code: number
  codeText: string
  result: string
  durationMs: number
  url: string
}

/** WebFetch call/checkPermissions 消费面 context duck（delta ④）。 */
export interface WebFetchToolContext {
  abortController: AbortController
  options: { isNonInteractiveSession: boolean }
  getAppState(): { toolPermissionContext: ToolPermissionContext }
}

// ── WebSearch ────────────────────────────────────────────────────────────

export type WebSearchToolInput = {
  query: string
  allowed_domains?: string[]
  blocked_domains?: string[]
}

/** 旧 searchResultSchema 命中条目（z.infer 面，delta ②）。 */
export type WebSearchHit = {
  title: string
  url: string
}

/** 旧 SearchResult（searchResultSchema z.infer，delta ②）。 */
export type WebSearchResult = {
  tool_use_id: string
  content: WebSearchHit[]
}

/** 旧 WebSearchTool.ts outputSchema z.infer（delta ②）。 */
export type WebSearchOutput = {
  query: string
  results: (WebSearchResult | string)[]
  durationSeconds: number
}

/** 旧 WebSearchProgress 结构 duck（delta ③，旧 any-stub 面恢复）。 */
export type WebSearchProgress =
  | { type: 'query_update'; query: string }
  | { type: 'search_results_received'; query: string; resultCount: number }

/** WebSearch call 消费面 context duck（delta ④）。 */
export interface WebSearchToolContext {
  abortController: AbortController
  options: {
    thinkingConfig?: ThinkingConfig
    isNonInteractiveSession?: boolean
  }
  agentId?: string
  getAppState(): {
    toolPermissionContext: ToolPermissionContext
    effortValue?: unknown
  }
}

/**
 * 旧 BetaWebSearchTool20250305（types/atlas.ts 旧 SDK 型）→ 域内结构型
 * （makeToolSchema 返回值，extraToolSchemas 注入面）。
 */
export type WebSearchServerToolSchema = {
  type: 'web_search_20250305'
  name: 'web_search'
  allowed_domains?: string[]
  blocked_domains?: string[]
  max_uses: number
}

/**
 * 旧 BetaContentBlock[]（流收集面）→ 域内结构 duck：makeOutputFromSearchResponse
 * 三块型消费面（server_tool_use / web_search_tool_result（成功 array +
 * 失败 error_code 双形态）/ text）。
 */
export type SearchContentBlock =
  | { type: 'server_tool_use' }
  | {
      type: 'web_search_tool_result'
      tool_use_id: string
      content: WebSearchHit[] | { error_code?: string }
    }
  | { type: 'text'; text: string }

// ── 摘要面（delta ⑤）───────────────────────────────────────────────────

/** 旧 constants/toolLimits.ts TOOL_SUMMARY_MAX_LENGTH 值随迁。 */
export const TOOL_SUMMARY_MAX_LENGTH = 50

/** 旧 truncate 宽感知（ink/stringWidth）→ 本地 50 字符面（截断 + '…'）。 */
export function truncateSummary(text: string): string {
  return text.length > TOOL_SUMMARY_MAX_LENGTH
    ? text.slice(0, TOOL_SUMMARY_MAX_LENGTH - 1) + '…'
    : text
}
