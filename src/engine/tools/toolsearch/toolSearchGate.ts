/**
 * engine/tools/toolsearch — ToolSearch 门控面（S-E2 §8.63 MCP+ToolSearch
 * 族子波）。
 *
 * 旧仓来源（a8af45b）：src/utils/toolSearch.ts 714L 门控面子集逐字随迁
 * （§8.63.1.2 ⑬：4 函数 = parseAutoPercentage/isAutoToolSearchMode 模块
 * 私有 + getToolSearchMode + ToolSearchMode 型 + isToolSearchEnabled
 * Optimistic 含 loggedOptimistic once-log 3 支）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① env 改名 ENABLE_TOOL_SEARCH → ATLAS_ENABLE_TOOL_SEARCH（house 单一
 *    ATLAS_ 前缀规则，§8.63.1.2 ⑬）；log 文案中变量名同步改名（逐字面，
 *    仅变量名变化）；ATLAS_DISABLE_EXPERIMENTAL_BETAS kill-switch 逐字
 *    （issue-20031 注释逐字）。cosmetic 括号删减 2 处登记（S-E3 A 路
 *    F-1/F-2，输出逐字节不变）：旧 L174 `isEnvTruthy((process.env.X))`
 *    内层冗余双括号 → 新单层；旧 L297 模板插值 `${(process.env.
 *    OPENAI_BASE_URL)}` 括号 → 新 `${process.env.OPENAI_BASE_URL}`。
 *  ② 旧 isFirstPartyGatewayUrl()（utils/model/providers.js，新仓 0-hit）
 *    内联 = `!!process.env.OPENAI_BASE_URL` 取反（裁定 ⑬：IFF 网关语义
 *    「OPENAI_BASE_URL 设真即非 first-party host」）；gh-31936/CC-457
 *    proxy 回归注释逐字。
 *  ③ engine 面裁（裁定 ⑭，新仓 engine 0-hit 不复活登记）：
 *    getAutoToolSearchCharThreshold / getAutoToolSearchTokenThreshold /
 *    getDeferredToolTokenCount（token-count API + CHARS_PER_TOKEN）/
 *    modelSupportsToolReference + GB atlas_tool_search_unsupported_models /
 *    isToolSearchEnabled（含 checkAutoThreshold）/ isToolReferenceBlock /
 *    extractDiscoveredToolNames / DeferredToolsDelta 族 /
 *    getAutoToolSearchPercentage + DEFAULT_AUTO_TOOL_SEARCH_PERCENTAGE
 *    辅助（消费方全随裁）——复活登记 = MCP client 波（tool_reference
 *    wire 面 ⑱）/ auto-mode 波（阈值判定消费）。
 *  ④ lodash-es memoize + GrowthBook 依赖裁：本面 4 函数零消费（旧仓仅
 *    isToolSearchEnabled 链消费，随 ③ 裁）；parseAutoPercentage 仅依赖
 *    logForDebugging（shared/debug 无 op 面）。
 *
 * 消费方 = toolSearchTool.isEnabled（§8.63.1.3 门控槽：ToolSearch = 2nd
 * 专属门控槽，IFF env 常态 OPENAI_BASE_URL 设真 → 默认 gate OFF = 旧语义
 * 忠实，非新增门）+ tools/ 门面 re-export + 门控面测试。
 */
import { isEnvDefinedFalsy, isEnvTruthy, logForDebugging } from '../../../shared'

/**
 * Parse auto:N syntax from ATLAS_ENABLE_TOOL_SEARCH env var.
 * Returns the percentage clamped to 0-100, or null if not auto:N format or
 * not a number.
 */
function parseAutoPercentage(value: string): number | null {
  if (!value.startsWith('auto:')) return null

  const percentStr = value.slice(5)
  const percent = parseInt(percentStr, 10)

  if (isNaN(percent)) {
    logForDebugging(
      `Invalid ATLAS_ENABLE_TOOL_SEARCH value "${value}": expected auto:N where N is a number.`,
    )
    return null
  }

  // Clamp to valid range
  return Math.max(0, Math.min(100, percent))
}

/**
 * Check if ATLAS_ENABLE_TOOL_SEARCH is set to auto mode (auto or auto:N).
 */
function isAutoToolSearchMode(value: string | undefined): boolean {
  if (!value) return false
  return value === 'auto' || value.startsWith('auto:')
}

/**
 * Tool search mode. Determines how deferrable tools (MCP + shouldDefer) are
 * surfaced:
 *   - 'tst': Tool Search Tool — deferred tools discovered via ToolSearchTool (always enabled)
 *   - 'tst-auto': auto — tools deferred only when they exceed threshold
 *   - 'standard': tool search disabled — all tools exposed inline
 */
export type ToolSearchMode = 'tst' | 'tst-auto' | 'standard'

/**
 * Determines the tool search mode from ATLAS_ENABLE_TOOL_SEARCH.
 *
 *   ATLAS_ENABLE_TOOL_SEARCH    Mode
 *   auto / auto:1-99      tst-auto
 *   true / auto:0         tst
 *   false / auto:100      standard
 *   (unset)               tst (default: always defer MCP and shouldDefer tools)
 */
export function getToolSearchMode(): ToolSearchMode {
  // ATLAS_DISABLE_EXPERIMENTAL_BETAS is a kill switch for beta API
  // features. Tool search emits defer_loading on tool definitions and
  // tool_reference content blocks — both require the API to accept a beta
  // header. When the kill switch is set, force 'standard' so no beta shapes
  // reach the wire, even if ATLAS_ENABLE_TOOL_SEARCH is also set. This is the
  // explicit escape hatch for proxy gateways that the heuristic in
  // isToolSearchEnabledOptimistic doesn't cover.
  // upstream issue 20031（原仓注释溯源，旧仓链接失效已裁，G-3 §8.74.28 R4）
  if (isEnvTruthy(process.env.ATLAS_DISABLE_EXPERIMENTAL_BETAS)) {
    return 'standard'
  }

  const value = process.env.ATLAS_ENABLE_TOOL_SEARCH

  // Handle auto:N syntax - check edge cases first
  const autoPercent = value ? parseAutoPercentage(value) : null
  if (autoPercent === 0) return 'tst' // auto:0 = always enabled
  if (autoPercent === 100) return 'standard'
  if (isAutoToolSearchMode(value)) {
    return 'tst-auto' // auto or auto:1-99
  }

  if (isEnvTruthy(value)) return 'tst'
  if (isEnvDefinedFalsy(process.env.ATLAS_ENABLE_TOOL_SEARCH)) return 'standard'
  return 'tst' // default: always defer MCP and shouldDefer tools
}

/**
 * Check if tool search *might* be enabled (optimistic check).
 *
 * Returns true if tool search could potentially be enabled, without checking
 * dynamic factors like model support or threshold. Use this for:
 * - Including ToolSearchTool in base tools (so it's available if needed)
 * - Preserving tool_reference fields in messages (can be stripped later)
 * - Checking if ToolSearchTool should report itself as enabled
 *
 * Returns false only when tool search is definitively disabled (standard mode).
 */
let loggedOptimistic = false

export function isToolSearchEnabledOptimistic(): boolean {
  const mode = getToolSearchMode()
  if (mode === 'standard') {
    if (!loggedOptimistic) {
      loggedOptimistic = true
      logForDebugging(
        `[ToolSearch:optimistic] mode=${mode}, ATLAS_ENABLE_TOOL_SEARCH=${process.env.ATLAS_ENABLE_TOOL_SEARCH}, result=false`,
      )
    }
    return false
  }

  // tool_reference is a beta content type that third-party API gateways
  // (OPENAI_BASE_URL proxies) typically don't support. When the provider
  // is 'firstParty' but the base URL points elsewhere, the proxy will reject
  // tool_reference blocks with a 400. Vertex/Bedrock/Foundry are unaffected —
  // they have their own endpoints and beta headers.
  // upstream issue 30912（原仓注释溯源，旧仓链接失效已裁，G-3 §8.74.28 R4）
  //
  // HOWEVER: some proxies DO support tool_reference (LiteLLM passthrough,
  // Cloudflare AI Gateway, corp gateways that forward beta headers). The
  // blanket disable breaks defer_loading for those users — all MCP tools
  // loaded into main context instead of on-demand (gh-31936 / CC-457,
  // likely the real cause of CC-330 "v2.1.70 defer_loading regression").
  // This gate only applies when ATLAS_ENABLE_TOOL_SEARCH is unset/empty (default
  // behavior). Setting any non-empty value — 'true', 'auto', 'auto:N' —
  // means the user is explicitly configuring tool search and asserts their
  // setup supports it. The falsy check (rather than === undefined) aligns
  // with getToolSearchMode(), which also treats "" as unset.
  // provider 恒为 'firstParty'（IFF 网关），原 3P 条件已删。
  // delta ②：isFirstPartyGatewayUrl() 内联 = !OPENAI_BASE_URL（IFF 语义）
  if (!process.env.ATLAS_ENABLE_TOOL_SEARCH && !!process.env.OPENAI_BASE_URL) {
    if (!loggedOptimistic) {
      loggedOptimistic = true
      logForDebugging(
        `[ToolSearch:optimistic] disabled: OPENAI_BASE_URL=${process.env.OPENAI_BASE_URL} is not a first-party host. Set ATLAS_ENABLE_TOOL_SEARCH=true (or auto / auto:N) if your proxy forwards tool_reference blocks.`,
      )
    }
    return false
  }

  if (!loggedOptimistic) {
    loggedOptimistic = true
    logForDebugging(
      `[ToolSearch:optimistic] mode=${mode}, ATLAS_ENABLE_TOOL_SEARCH=${process.env.ATLAS_ENABLE_TOOL_SEARCH}, result=true`,
    )
  }
  return true
}
