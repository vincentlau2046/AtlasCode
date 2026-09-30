/**
 * engine/tools/web 子门面（S-E2 §8.59 web 族子波，STR-1 显式名块纪律）。
 *
 * 覆盖两本体对象（WebFetchTool / WebSearchTool）+ JSON schema 2 常量
 * （WEB_FETCH/WEB_SEARCH_TOOL_INPUT_SCHEMA）+ 型面 9（webToolInput 实
 * 导出 9 型；G-2 客户端化裁 2：WebSearchServerToolSchema / SearchContentBlock
 * 随 Anthropic 服务端工具车道整裁，webToolInput 头注 G-2 登记）：
 * WebFetch/WebSearch 输入输出 + context duck 2 + 进度 duck + Hit/Result/
 * Output 3）+ prompt 面 4 函数（getWebFetchToolPrompt /
 * getWebSearchPrompt / getLocalMonthYear / 2 短 description 不接线导出）+
 * URL 管线 10 面（webFetchUtils：3 错误类 / validateURL /
 * checkDomainBlocklist / isPermittedRedirect / getWithPermittedRedirects /
 * getURLMarkdownContent / applyPromptToMarkdown / 二进制落盘 3 件 /
 * clearWebFetchCache / 测试缝 setWebFetchTransportForTesting）+
 * preapproved 双表 + rule-content 函数 2 + 摘要面（TOOL_SUMMARY_MAX_LENGTH /
 * truncateSummary）+ G-2 客户端 provider 层（webSearchProvider：runWebSearch
 * 主入口 / bing SERP 解析 / tavily API / 域过滤 / env+settings 键解析 /
 * 2 测试缝 + 端点常量 2 + SearchProviderError）。
 *
 * 纪律（tools/index.ts plan 块先例）：逐名显式 re-export，无 `export *`；
 * 各文件头注 delta 登记不随门面重复（单一事实源 = 各模块头注）。
 *
 * 重名登记：无（2 TOOL_NAME 常量值异名异；FetchedContent 唯一定义位 =
 * webFetchUtils；SearchContentBlock/WebSearchHit 唯一定义位 =
 * webToolInput）。
 *
 * 消费方：tools/ 门面 S-E2 re-export 块 + 组合根 baseTools 注入位
 * （CLI 波前向接缝，同 plan 面；web 族无专属门控槽 = 无条件注册面，
 * 49 口径 20/49 → 22/49，§8.59.4）。
 */
export { isPreapprovedHost, PREAPPROVED_HOSTS } from './preapproved'
export {
  clearWebFetchCache,
  EgressBlockedError,
  extensionForMimeType,
  getURLMarkdownContent,
  getWithPermittedRedirects,
  isBinaryContentType,
  isPermittedRedirect,
  isPreapprovedUrl,
  MAX_MARKDOWN_LENGTH,
  persistBinaryContent,
  setWebFetchTransportForTesting,
  validateURL,
  type FetchedContent,
  type PersistBinaryResult,
  type RedirectInfo,
  type WebFetchHttpResponse,
  type WebFetchHttpResult,
  type WebFetchTransport,
  type WebFetchTransportInit,
} from './webFetchUtils'
export { applyPromptToMarkdown } from './webFetchUtils'
export {
  DESCRIPTION,
  getWebFetchToolPrompt,
  makeSecondaryModelPrompt,
  webFetchShortDescription,
  WEB_FETCH_TOOL_NAME,
} from './webFetchPrompt'
export {
  WEB_FETCH_TOOL_INPUT_SCHEMA,
  WebFetchTool,
  webFetchToolInputToPermissionRuleContent,
} from './webFetchTool'
export { WEB_SEARCH_TOOL_INPUT_SCHEMA, WebSearchTool } from './webSearchTool'
export {
  BING_DEFAULT_ENDPOINT,
  TAVILY_DEFAULT_ENDPOINT,
  SearchProviderError,
  filterHitsByDomains,
  parseBingResults,
  resolveWebSearchApiKey,
  resolveWebSearchProvider,
  runWebSearch,
  setWebSearchSettingsKeyProvider,
  setWebSearchTransportForTesting,
  type WebSearchExecutionContext,
  type WebSearchHttpResponse,
  type WebSearchProvider,
  type WebSearchTransport,
  type WebSearchTransportInit,
} from './webSearchProvider'
export {
  getLocalMonthYear,
  getWebSearchPrompt,
  webSearchShortDescription,
  WEB_SEARCH_TOOL_NAME,
} from './webSearchPrompt'
export {
  TOOL_SUMMARY_MAX_LENGTH,
  truncateSummary,
  type WebFetchOutput,
  type WebFetchToolContext,
  type WebFetchToolInput,
  type WebSearchHit,
  type WebSearchOutput,
  type WebSearchProgress,
  type WebSearchResult,
  type WebSearchToolContext,
  type WebSearchToolInput,
} from './webToolInput'
