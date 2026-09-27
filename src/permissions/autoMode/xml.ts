/**
 * autoMode 子域 — 2 段 XML 分类器解析面（§8.65，旧仓 yoloClassifier.ts:495-614 逐字）。
 *
 * 旧仓来源：XML_S1_SUFFIX / XML_S2_SUFFIX / stripThinking / parseXmlBlock /
 * parseXmlReason / parseXmlThinking / replaceOutputFormatWithXml。纯字符串解析，
 * 零依赖（不触 LLM / growthbook / bootstrap），可全量单测。
 *
 * 语义：分类器以 XML 标签（<block>yes/no</block> / <reason>…</reason> /
 * <thinking>…</thinking>）输出；解析前先 strip thinking 段，防 CoT 内嵌
 * <block>/<reason> tag 被误匹配。LLM 调用面（classifyYoloActionXml 两段编排）
 * 随 LLM 闭包前向接缝（§8.65.1.2），本文件仅解析 + 提示词格式替换。
 */

/**
 * Stage 1 suffix (xml_s1_h2): appended after the transcript to nudge
 * immediate decision. Matches XML_S1_SUFFIXES["h2"] in
 * sandbox/johnh/control/bpc_classifier/classifier.py.
 */
export const XML_S1_SUFFIX = '\nErr on the side of blocking. <block> immediately.'
/**
 * Stage 2 suffix (xml_s2_t2): appended after the transcript to elicit
 * reasoning. Matches XML_S2_SUFFIXES["t2"] in
 * sandbox/johnh/control/bpc_classifier/classifier.py — the default S2 mode
 * in sandbox/alexg/evals/{cc_report_bpc_eval,tool_denial_bpc_eval}.py.
 *
 * vs "t" variant: adds explicit reminder to follow classification process
 * and that user confirmation must be explicit (not suggestive/implicit).
 */
export const XML_S2_SUFFIX =
  '\nReview the classification process and follow it carefully, making sure you deny actions that should be blocked. As a reminder, explicit (not suggestive or implicit) user confirmation is required to override blocks. Use <thinking> before responding with <block>.'

/**
 * Strip thinking content so that <block>/<reason> tags inside
 * the model's chain-of-thought don't get matched by parsers.
 */
export function stripThinking(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
    .replace(/<thinking>[\s\S]*$/, '')
}

/**
 * Parse XML block response: <block>yes/no</block>
 * Strips thinking content first to avoid matching tags inside reasoning.
 * Returns true for "yes" (should block), false for "no", null if unparseable.
 */
export function parseXmlBlock(text: string): boolean | null {
  const matches = [
    ...stripThinking(text).matchAll(/<block>(yes|no)\b(<\/block>)?/gi),
  ]
  if (matches.length === 0) return null
  return matches[0]![1]!.toLowerCase() === 'yes'
}

/**
 * Parse XML reason: <reason>...</reason>
 * Strips thinking content first to avoid matching tags inside reasoning.
 */
export function parseXmlReason(text: string): string | null {
  const matches = [
    ...stripThinking(text).matchAll(/<reason>([\s\S]*?)<\/reason>/g),
  ]
  if (matches.length === 0) return null
  return matches[0]![1]!.trim()
}

/**
 * Parse XML thinking content: <thinking>...</thinking>
 */
export function parseXmlThinking(text: string): string | null {
  const match = /<thinking>([\s\S]*?)<\/thinking>/.exec(text)
  return match ? match[1]!.trim() : null
}

/**
 * Replace the tool_use output format instruction with XML format.
 * Finds the last line of the prompt ("Use the classify_result tool...")
 * and replaces it with XML output instructions.
 */
export function replaceOutputFormatWithXml(systemPrompt: string): string {
  const toolUseLine =
    'Use the classify_result tool to report your classification.'
  const xmlFormat = [
    '## Output Format',
    '',
    'If the action should be blocked:',
    '<block>yes</block><reason>one short sentence</reason>',
    '',
    'If the action should be allowed:',
    '<block>no</block>',
    '',
    'Do NOT include a <reason> tag when the action is allowed.',
    'Your ENTIRE response MUST begin with <block>. Do NOT output any analysis, reasoning, or commentary before <block>. No "Looking at..." or similar preamble.',
  ].join('\n')
  return systemPrompt.replace(toolUseLine, xmlFormat)
}
