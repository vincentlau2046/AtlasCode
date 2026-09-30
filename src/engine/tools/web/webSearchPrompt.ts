/**
 * engine/tools/web — WebSearch prompt 面（S-E2 §8.59 web 族子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/WebSearchTool/prompt.ts 34L 逐字随迁
 * （WEB_SEARCH_TOOL_NAME / getWebSearchPrompt 月年模板 + "Sources:" 强制
 * 段 + US-only 措辞逐字保留）+ 依赖 getLocalMonthYear（旧仓
 * constants/common.ts:28，ATLAS_OVERRIDE_DATE 覆写面）→ 域内本地逐字
 * 随迁（新仓无 constants/common 面）。
 *
 * delta 登记：
 *  ① 旧 prompt() 成员 → 新契约唯一 prompt 面 description() 体 =
 *    getWebSearchPrompt（S-C5 delta ③ 先例）；旧短 description(input)
 *    体（`Claude wants to search the web for: ${query}`）→
 *    webSearchShortDescription 导出不接线（TUI 波前向接缝）。
 *  ② 旧 getLocalMonthYear import（src/constants/common.js）→ 域内本地
 *    逐字（新仓无该常量面；ATLAS_OVERRIDE_DATE env 覆写面保留 =
 *    测试确定性缝）。
 */

// 名字常量单一事实源 = toolNames 块 seed（plan 族先例 ../toolNames import；
// S-E3 B-N1 订正：S-E2 实施曾域内双源字面，漂移风险已除）
export { WEB_SEARCH_TOOL_NAME } from '../toolNames'

/**
 * Returns "Month YYYY" (e.g. "February 2026") in the user's local timezone.
 * Changes monthly, not daily — used in tool prompts to minimize cache busting.
 */
export function getLocalMonthYear(): string {
  const date = (process.env.ATLAS_OVERRIDE_DATE)
    ? new Date((process.env.ATLAS_OVERRIDE_DATE))
    : new Date()
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

export function getWebSearchPrompt(): string {
  const currentMonthYear = getLocalMonthYear()
  return `
- Allows Claude to search the web and use the results to inform responses
- Provides up-to-date information for current events and recent data
- Returns search result information formatted as search result blocks, including links as markdown hyperlinks
- Use this tool for accessing information beyond Claude's knowledge cutoff
- Searches are performed client-side (Bing by default, keyless; Tavily when
  configured via TAVILY_API_KEY / settings.json search.tavilyApiKey)

CRITICAL REQUIREMENT - You MUST follow this:
  - After answering the user's question, you MUST include a "Sources:" section at the end of your response
  - In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: [Title](URL)
  - This is MANDATORY - never skip including sources in your response
  - Example format:

    [Your answer here]

    Sources:
    - [Source Title 1](https://example.com/1)
    - [Source Title 2](https://example.com/2)

Usage notes:
  - Domain filtering is supported to include or block specific websites

IMPORTANT - Use the correct year in search queries:
  - The current month is ${currentMonthYear}. You MUST use this year when searching for recent information, documentation, or current events.
  - Example: If the user asks for "latest React docs", search for "React documentation" with the current year, NOT last year
`
}

/** 旧短 description(input) 体（delta ①：不接线，TUI 波前向接缝）。 */
export function webSearchShortDescription(input: { query?: string }): string {
  return `Claude wants to search the web for: ${input.query}`
}
