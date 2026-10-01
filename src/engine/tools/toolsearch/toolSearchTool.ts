/**
 * engine/tools/toolsearch — ToolSearchTool 本体（S-E2 §8.63 MCP+ToolSearch
 * 族子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/ToolSearchTool/ToolSearchTool.ts 457L
 * 裁剪随迁（旧 buildTool 成员面 → 新 shared Tool 契约对象化，
 * config/askUser face 先例）+ prompt 面经 toolSearchPrompt.ts。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 lodash-es memoize（key = toolName，value Promise<string>）→ 本地
 *    Map memo（descriptionMemo；cache.clear() → Map.clear()，失效语义逐字
 *    含 reject 缓存）；clearToolSearchDescriptionCache 导出 = 测试接缝
 *    （旧仓外部消费 commands/clear/caches.ts 新仓 0-hit，§8.63.1.2 ⑧）。
 *  ② 旧 tool.prompt({getToolPermissionContext, tools, agents: []}) → 新
 *    tool.description(undefined, {isNonInteractiveSession: false,
 *    toolPermissionContext: {}, tools})（新契约无 prompt 成员，§8.63.1.2
 *    ⑨；permission context duck = 旧 async 无参取回面的最小形）。
 *  ③ 旧 findToolByName → pipeline findTool（toolExecution.ts:181「旧仓
 *    findToolByName 的窄 spine 等价物」，name + aliases 语义逐字；值导入
 *    经 pipeline 门面 = tools/agent 型导入零循环先例，§8.63.1.2 ⑩）。
 *  ④ call context 2 参 duck（§8.63.1.2 ㉑）：`{ options?: { tools?: Tools } }`
 *    + `tools ?? []` 缺省（单测零态可跑）；getAppState 面裁 = ⑮ 同源。
 *  ⑤ pending_mcp_servers 面 **S-E2d 回填（§8.68 remote 波）**：旧
 *    appState.mcp.clients filter type==='pending' → 新 mcp 域 manager
 *    pending Set 单一事实源（getMcpConnectionManager().getPendingServerNames()；
 *    注册窗 = 组合根 ⑭ initMcpConnections，连接中态活面）；数据契约面
 *    逐字保留（buildSearchResult 参 + output 可选字段 + mapToolResult
 *    pending 后缀支；空 pending = 字段省略面不变）。§8.63.1.2 ⑮ 原裁
 *    （const 返 undefined）随本波核销。
 *  ⑥ 旧 description()/prompt() 双临 → 新 description() 单面 =
 *    TOOL_SEARCH_PROMPT（house 先例 §8.62 delta ⑧）。
 *  ⑦ mapToolResult tool_reference wire 面保留前向接缝（§8.63.1.2 ⑱：
 *    新仓 shared/pipeline 0-hit，cast `as unknown as ToolResultBlockParam`
 *    逐字；旧 JSDoc 注释逐字；复活 = MCP client 波）。
 *  ⑧ UI 裁：renderToolUseMessage null + userFacingName '' 逐字（旧 def
 *    override 面）；旧 def 无 searchHint/shouldDefer 字段（isDeferredTool
 *    显式自排 TOOL_SEARCH_TOOL_NAME，prompt.ts 逐字面）。
 *  ⑨ buildTool 缺省面显式化：isDestructive `() => false` / checkPermissions
 *    allow 单支 / toAutoClassifierInput `() => ''`（skip-classifier 面，
 *    §8.63.1.2 ㉒）。
 *  ㉐ 旧 lazySchema(zod) → 纯 JSON schema 常量（strict +
 *    additionalProperties 双字段）；max_results .default(5) zod 面 → call
 *    侧 `max_results = 5` 缺省（裁定 ㉒）；output 面 = 本地 Output duck
 *    型（output JSON schema 常量不保留，house 面）。
 *
 * 消费方 = `toolsearch/` 子门面 + `tools/` 门面 re-export + 注册表 49 口径
 * 注册位（§8.63.1：2nd 专属门控槽 = isEnabled = isToolSearchEnabled
 * Optimistic，26/49 → 29/49；本体经 ToolRegistryDeps.baseTools 消费方
 * 注入，注册表机制不变）。
 */
import {
  escapeRegExp,
  logForDebugging,
  type Tool,
  type ToolInputJSONSchema,
  type ToolResult,
  type ToolResultBlockParam,
  type Tools,
} from '../../../shared'
import { getMcpConnectionManager } from '../../../mcp'
import { findTool } from '../../pipeline'
import { TOOL_SEARCH_TOOL_NAME } from '../toolNames'
import { isToolSearchEnabledOptimistic } from './toolSearchGate'
import { isDeferredTool, TOOL_SEARCH_PROMPT } from './toolSearchPrompt'

// delta ㉐：旧 lazySchema z.object 面 → 纯 JSON（query 必填 + max_results
// 可选，call 侧缺省 5）
export const TOOL_SEARCH_TOOL_INPUT_SCHEMA: ToolInputJSONSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['query'],
  properties: {
    query: {
      type: 'string',
      description:
        'Query to find deferred tools. Use "select:<tool_name>" for direct selection, or keywords to search.',
    },
    max_results: {
      type: 'number',
      description: 'Maximum number of results to return (default: 5)',
    },
  },
}

export type ToolSearchInput = {
  query: string
  max_results?: number
}

// delta ㉐：output 面 = 本地 duck（旧 outputSchema 成员面）
export type ToolSearchOutput = {
  matches: string[]
  query: string
  total_deferred_tools: number
  pending_mcp_servers?: string[]
}

// delta ④：call context 2 参 duck（getAppState 面裁 = ⑤ 同源）
type ToolSearchContext = {
  options?: { tools?: Tools }
}

// Track deferred tool names to detect when cache should be cleared
let cachedDeferredToolNames: string | null = null

/**
 * Get a cache key representing the current set of deferred tools.
 */
function getDeferredToolsCacheKey(deferredTools: Tools): string {
  return deferredTools
    .map(t => t.name)
    .sort()
    .join(',')
}

// delta ①：旧 lodash-es memoize → 本地 Map memo（key = toolName，value
// Promise<string>；reject 同样缓存 = 旧 memoize 语义）
const descriptionMemo = new Map<string, Promise<string>>()

/**
 * Get tool description, memoized by tool name.
 * Used for keyword search scoring.
 */
async function getToolDescriptionMemoized(
  toolName: string,
  tools: Tools,
): Promise<string> {
  const cached = descriptionMemo.get(toolName)
  if (cached) return cached
  const promise = (async () => {
    // delta ③：旧 findToolByName → pipeline findTool
    const tool = findTool(tools, toolName)
    if (!tool) {
      return ''
    }
    // delta ②：旧 tool.prompt({...}) → 新 description() 契约
    return tool.description(undefined, {
      isNonInteractiveSession: false,
      toolPermissionContext: {},
      tools,
    })
  })()
  descriptionMemo.set(toolName, promise)
  return promise
}

/**
 * Invalidate the description cache if deferred tools have changed.
 */
function maybeInvalidateCache(deferredTools: Tools): void {
  const currentKey = getDeferredToolsCacheKey(deferredTools)
  if (cachedDeferredToolNames !== currentKey) {
    logForDebugging(
      `ToolSearchTool: cache invalidated - deferred tools changed`,
    )
    descriptionMemo.clear()
    cachedDeferredToolNames = currentKey
  }
}

export function clearToolSearchDescriptionCache(): void {
  descriptionMemo.clear()
  cachedDeferredToolNames = null
}

/**
 * Build the search result output structure.
 */
function buildSearchResult(
  matches: string[],
  query: string,
  totalDeferredTools: number,
  pendingMcpServers?: string[],
): { data: ToolSearchOutput } {
  return {
    data: {
      matches,
      query,
      total_deferred_tools: totalDeferredTools,
      ...(pendingMcpServers && pendingMcpServers.length > 0
        ? { pending_mcp_servers: pendingMcpServers }
        : {}),
    },
  }
}

/**
 * Parse tool name into searchable parts.
 * Handles both MCP tools (mcp__server__action) and regular tools (CamelCase).
 */
function parseToolName(name: string): {
  parts: string[]
  full: string
  isMcp: boolean
} {
  // Check if it's an MCP tool
  if (name.startsWith('mcp__')) {
    const withoutPrefix = name.replace(/^mcp__/, '').toLowerCase()
    const parts = withoutPrefix.split('__').flatMap(p => p.split('_'))
    return {
      parts: parts.filter(Boolean),
      full: withoutPrefix.replace(/__/g, ' ').replace(/_/g, ' '),
      isMcp: true,
    }
  }

  // Regular tool - split by CamelCase and underscores
  const parts = name
    .replace(/([a-z])([A-Z])/g, '$1 $2') // CamelCase to spaces
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  return {
    parts,
    full: parts.join(' '),
    isMcp: false,
  }
}

/**
 * Pre-compile word-boundary regexes for all search terms.
 * Called once per search instead of tools×terms×2 times.
 */
function compileTermPatterns(terms: string[]): Map<string, RegExp> {
  const patterns = new Map<string, RegExp>()
  for (const term of terms) {
    if (!patterns.has(term)) {
      patterns.set(term, new RegExp(`\\b${escapeRegExp(term)}\\b`))
    }
  }
  return patterns
}

/**
 * Keyword-based search over tool names and descriptions.
 * Handles both MCP tools (mcp__server__action) and regular tools (CamelCase).
 *
 * The model typically queries with:
 * - Server names when it knows the integration (e.g., "slack", "github")
 * - Action words when looking for functionality (e.g., "read", "list", "create")
 * - Tool-specific terms (e.g., "notebook", "shell", "kill")
 */
async function searchToolsWithKeywords(
  query: string,
  deferredTools: Tools,
  tools: Tools,
  maxResults: number,
): Promise<string[]> {
  const queryLower = query.toLowerCase().trim()

  // Fast path: if query matches a tool name exactly, return it directly.
  // Handles models using a bare tool name instead of select: prefix (seen
  // from subagents/post-compaction). Checks deferred first, then falls back
  // to the full tool set — selecting an already-loaded tool is a harmless
  // no-op that lets the model proceed without retry churn.
  const exactMatch =
    deferredTools.find(t => t.name.toLowerCase() === queryLower) ??
    tools.find(t => t.name.toLowerCase() === queryLower)
  if (exactMatch) {
    return [exactMatch.name]
  }

  // If query looks like an MCP tool prefix (mcp__server), find matching tools.
  // Handles models searching by server name with mcp__ prefix.
  if (queryLower.startsWith('mcp__') && queryLower.length > 5) {
    const prefixMatches = deferredTools
      .filter(t => t.name.toLowerCase().startsWith(queryLower))
      .slice(0, maxResults)
      .map(t => t.name)
    if (prefixMatches.length > 0) {
      return prefixMatches
    }
  }

  const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 0)

  // Partition into required (+prefixed) and optional terms
  const requiredTerms: string[] = []
  const optionalTerms: string[] = []
  for (const term of queryTerms) {
    if (term.startsWith('+') && term.length > 1) {
      requiredTerms.push(term.slice(1))
    } else {
      optionalTerms.push(term)
    }
  }

  const allScoringTerms =
    requiredTerms.length > 0 ? [...requiredTerms, ...optionalTerms] : queryTerms
  const termPatterns = compileTermPatterns(allScoringTerms)

  // Pre-filter to tools matching ALL required terms in name or description
  let candidateTools = deferredTools
  if (requiredTerms.length > 0) {
    const matches = await Promise.all(
      deferredTools.map(async tool => {
        const parsed = parseToolName(tool.name)
        const description = await getToolDescriptionMemoized(tool.name, tools)
        const descNormalized = description.toLowerCase()
        const hintNormalized = tool.searchHint?.toLowerCase() ?? ''
        const matchesAll = requiredTerms.every(term => {
          const pattern = termPatterns.get(term)!
          return (
            parsed.parts.includes(term) ||
            parsed.parts.some(part => part.includes(term)) ||
            pattern.test(descNormalized) ||
            (hintNormalized && pattern.test(hintNormalized))
          )
        })
        return matchesAll ? tool : null
      }),
    )
    candidateTools = matches.filter((t): t is Tool => t !== null)
  }

  const scored = await Promise.all(
    candidateTools.map(async tool => {
      const parsed = parseToolName(tool.name)
      const description = await getToolDescriptionMemoized(tool.name, tools)
      const descNormalized = description.toLowerCase()
      const hintNormalized = tool.searchHint?.toLowerCase() ?? ''

      let score = 0
      for (const term of allScoringTerms) {
        const pattern = termPatterns.get(term)!

        // Exact part match (high weight for MCP server names, tool name parts)
        if (parsed.parts.includes(term)) {
          score += parsed.isMcp ? 12 : 10
        } else if (parsed.parts.some(part => part.includes(term))) {
          score += parsed.isMcp ? 6 : 5
        }

        // Full name fallback (for edge cases)
        if (parsed.full.includes(term) && score === 0) {
          score += 3
        }

        // searchHint match — curated capability phrase, higher signal than prompt
        if (hintNormalized && pattern.test(hintNormalized)) {
          score += 4
        }

        // Description match - use word boundary to avoid false positives
        if (pattern.test(descNormalized)) {
          score += 2
        }
      }

      return { name: tool.name, score }
    }),
  )

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(item => item.name)
}

export const ToolSearchTool = {
  name: TOOL_SEARCH_TOOL_NAME,
  inputSchema: TOOL_SEARCH_TOOL_INPUT_SCHEMA,
  inputJSONSchema: TOOL_SEARCH_TOOL_INPUT_SCHEMA,
  strict: true,
  maxResultSizeChars: 100_000,
  // §8.63.1.3 门控槽（2nd 专属门控槽）：默认 env 常态 OPENAI_BASE_URL 设真
  // → 默认 gate OFF（旧语义忠实，非新增门）
  isEnabled: () => isToolSearchEnabledOptimistic(),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  // delta ⑨：旧 buildTool 缺省面显式化
  isDestructive: () => false,
  // delta ⑧：旧 def override 面逐字
  userFacingName: () => '',
  toAutoClassifierInput: () => '',

  // delta ⑨：旧 buildTool 缺省 allow 面显式化
  async checkPermissions(input: unknown) {
    return {
      behavior: 'allow' as const,
      updatedInput: input as ToolSearchInput,
    }
  },

  // delta ⑥：旧 description()/prompt() 双临 → 新 description() 单面
  async description(): Promise<string> {
    return TOOL_SEARCH_PROMPT
  },

  async call(
    input: unknown,
    context: unknown,
  ): Promise<ToolResult<ToolSearchOutput>> {
    const { query, max_results = 5 } = input as ToolSearchInput

    // delta ④：context 2 参 duck（tools ?? [] 缺省）
    const tools = (context as ToolSearchContext).options?.tools ?? []

    const deferredTools = tools.filter(isDeferredTool)
    maybeInvalidateCache(deferredTools)

    // delta ⑤ S-E2d 回填（§8.68）：旧 appState.mcp.clients pending 面 →
    // mcp 域 manager pending Set（连接中态活面；空 = buildSearchResult
    // 字段省略面不变）
    function getPendingServerNames(): string[] {
      return getMcpConnectionManager().getPendingServerNames()
    }

    // Helper to log search outcome（no-op 逐字；参名 _ 前缀 = 新仓
    // eslint no-unused-vars 适配，调用面逐字不变）
    function logSearchOutcome(
      _matches: string[],
      _queryType: 'select' | 'keyword',
    ): void {}

    // Check for select: prefix — direct tool selection.
    // Supports comma-separated multi-select: `select:A,B,C`.
    // If a name isn't in the deferred set but IS in the full tool set,
    // we still return it — the tool is already loaded, so "selecting" it
    // is a harmless no-op that lets the model proceed without retry churn.
    const selectMatch = query.match(/^select:(.+)$/i)
    if (selectMatch) {
      const requested = selectMatch[1]!
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      const found: string[] = []
      const missing: string[] = []
      for (const toolName of requested) {
        // delta ③：旧 findToolByName → pipeline findTool
        const tool =
          findTool(deferredTools, toolName) ?? findTool(tools, toolName)
        if (tool) {
          if (!found.includes(tool.name)) found.push(tool.name)
        } else {
          missing.push(toolName)
        }
      }

      if (found.length === 0) {
        logForDebugging(
          `ToolSearchTool: select failed — none found: ${missing.join(', ')}`,
        )
        logSearchOutcome([], 'select')
        const pendingServers = getPendingServerNames()
        return buildSearchResult(
          [],
          query,
          deferredTools.length,
          pendingServers,
        )
      }

      if (missing.length > 0) {
        logForDebugging(
          `ToolSearchTool: partial select — found: ${found.join(', ')}, missing: ${missing.join(', ')}`,
        )
      } else {
        logForDebugging(`ToolSearchTool: selected ${found.join(', ')}`)
      }
      logSearchOutcome(found, 'select')
      return buildSearchResult(found, query, deferredTools.length)
    }

    // Keyword search
    const matches = await searchToolsWithKeywords(
      query,
      deferredTools,
      tools,
      max_results,
    )

    logForDebugging(
      `ToolSearchTool: keyword search for "${query}", found ${matches.length} matches`,
    )

    logSearchOutcome(matches, 'keyword')

    // Include pending server info when search finds no matches
    if (matches.length === 0) {
      const pendingServers = getPendingServerNames()
      return buildSearchResult(
        matches,
        query,
        deferredTools.length,
        pendingServers,
      )
    }

    return buildSearchResult(matches, query, deferredTools.length)
  },

  // delta ⑧：旧 def override 面逐字
  renderToolUseMessage() {
    return null
  },

  /**
   * Returns a tool_result with tool_reference blocks.
   * This format works on 1P/Foundry. Bedrock/Vertex may not support
   * client-side tool_reference expansion yet.
   */
  // delta ⑦：tool_reference wire 面保留前向接缝（cast 逐字，复活 = MCP
  // client 波）
  mapToolResultToToolResultBlockParam(
    content: ToolSearchOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    if (content.matches.length === 0) {
      let text = 'No matching deferred tools found'
      if (
        content.pending_mcp_servers &&
        content.pending_mcp_servers.length > 0
      ) {
        text += `. Some MCP servers are still connecting: ${content.pending_mcp_servers.join(', ')}. Their tools will become available shortly — try searching again.`
      }
      return {
        type: 'tool_result',
        tool_use_id: toolUseID,
        content: text,
      }
    }
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: content.matches.map(name => ({
        type: 'tool_reference' as const,
        tool_name: name,
      })),
    } as unknown as ToolResultBlockParam
  },
} satisfies Tool
