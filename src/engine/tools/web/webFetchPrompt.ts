/**
 * engine/tools/web — WebFetch prompt 面（S-E2 §8.59 web 族子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/WebFetchTool/prompt.ts 46L 逐字随迁
 * （WEB_FETCH_TOOL_NAME / DESCRIPTION / makeSecondaryModelPrompt 双变体
 * 指南）+ WebFetchTool.ts prompt() 成员体（auth warning 前缀，prompt
 * cache 注释逐字）→ getWebFetchToolPrompt。
 *
 * delta 登记：
 *  ① 旧 prompt() 成员 → 新契约唯一 prompt 面 description() 体 =
 *    getWebFetchToolPrompt（S-C5 delta ③ 先例）；旧短 description(input)
 *    体（per-input hostname 模板）→ webFetchShortDescription 导出不接线
 *    （TUI 波前向接缝，S-D3 DESCRIPTION 族先例）。
 */

export const WEB_FETCH_TOOL_NAME = 'WebFetch'

export const DESCRIPTION = `
- Fetches content from a specified URL and processes it using an AI model
- Takes a URL and a prompt as input
- Fetches the URL content, converts HTML to markdown
- Processes the content with the prompt using a small, fast model
- Returns the model's response about the content
- Use this tool when you need to retrieve and analyze web content

Usage notes:
  - IMPORTANT: If an MCP-provided web fetch tool is available, prefer using that tool instead of this one, as it may have fewer restrictions.
  - The URL must be a fully-formed valid URL
  - HTTP URLs will be automatically upgraded to HTTPS
  - The prompt should describe what information you want to extract from the page
  - This tool is read-only and does not modify any files
  - Results may be summarized if the content is very large
  - Includes a self-cleaning 15-minute cache for faster responses when repeatedly accessing the same URL
  - When a URL redirects to a different host, the tool will inform you and provide the redirect URL in a special format. You should then make a new WebFetch request with the redirect URL to fetch the content.
  - For GitHub URLs, prefer using the gh CLI via Bash instead (e.g., gh pr view, gh issue view, gh api).
`

export function makeSecondaryModelPrompt(
  markdownContent: string,
  prompt: string,
  isPreapprovedDomain: boolean,
): string {
  const guidelines = isPreapprovedDomain
    ? `Provide a concise response based on the content above. Include relevant details, code examples, and documentation excerpts as needed.`
    : `Provide a concise response based only on the content above. In your response:
 - Enforce a strict 125-character maximum for quotes from any source document. Open Source Software is ok as long as we respect the license.
 - Use quotation marks for exact language from articles; any language outside of the quotation should never be word-for-word the same.
 - You are not a lawyer and never comment on the legality of your own prompts and responses.
 - Never produce or reproduce exact song lyrics.`

  return `
Web page content:
---
${markdownContent}
---

${prompt}

${guidelines}
`
}

/** 旧 WebFetchTool.prompt() 体逐字（auth warning 恒含 + prompt cache 注释）。 */
export function getWebFetchToolPrompt(): string {
  // Always include the auth warning regardless of whether ToolSearch is
  // currently in the tools list. Conditionally toggling this prefix based
  // on ToolSearch availability caused the tool description to flicker
  // between SDK query() calls (when ToolSearch enablement varies due to
  // MCP tool count thresholds), invalidating the Anthropic API prompt
  // cache on each toggle — two consecutive cache misses per flicker event.
  return `IMPORTANT: WebFetch WILL FAIL for authenticated or private URLs. Before using this tool, check if the URL points to an authenticated service (e.g. Google Docs, Confluence, Jira, GitHub). If so, look for a specialized MCP tool that provides authenticated access.
${DESCRIPTION}`
}

/** 旧短 description(input) 体（delta ①：不接线，TUI 波前向接缝）。 */
export function webFetchShortDescription(input: { url?: string }): string {
  const { url } = input
  try {
    const hostname = new URL(url ?? '').hostname
    return `Claude wants to fetch content from ${hostname}`
  } catch {
    return `Claude wants to fetch content from this URL`
  }
}
