/**
 * engine/tools/web — WebSearch 客户端化 provider 层（G-2，2026-09-30 R1 裁定）。
 *
 * 背景：旧 WebSearchTool call() = Anthropic 服务端工具车道（web_search_20250305
 * 经 extraToolSchemas 注入 + chatStream 收集 web_search_tool_result 块）——
 * OpenAI 协议车道上恒死（IFF 网关无损转发，无服务端工具执行面）。G-2 改
 * 客户端直接抓取（零新增 npm 依赖，node 运行器安全：global fetch +
 * AbortSignal.any/timeout + randomUUID，仓内先例 webFetchUtils/cronEnv）。
 *
 * provider 面（第三方搜索引擎；env 不加 ATLAS_ 前缀 = R1 用户裁定）：
 *   - bing（默认，无 key）：GET {endpoint}/search?q=…&count=8 抓 SERP HTML
 *     解析 b_algo 块（零依赖正则，fixture 驱动），endpoint 缺省
 *     https://cn.bing.com（国内可达优先）；best-effort——反爬/断网/0 命中
 *     → SearchProviderError 带指引（可切 tavily）。
 *   - tavily（key）：POST {endpoint}/search（缺省 https://api.tavily.com），
 *     Bearer key = env TAVILY_API_KEY 优先 > settings.json
 *     search.tavilyApiKey（组合根注入 settingsKeyProvider 缝）。
 *
 * env 面（第三方引擎语义，非 ATLAS_* 内部命名空间）：
 *   - WEB_SEARCH_PROVIDER=bing|tavily（缺省/非法值 → bing，fail-open 登记）
 *   - WEB_SEARCH_ENDPOINT（当前激活 provider 的 endpoint 覆盖）
 *   - TAVILY_API_KEY（provider 原生命名，Tavily 官方约定）
 *
 * 测试缝（setWebFetchTransportForTesting 先例镜像）：
 *   - setWebSearchTransportForTesting(fn|null)：HTTP transport 注入
 *     （fixture 回放，零网络）
 *   - setWebSearchSettingsKeyProvider(fn)：settings 键供给方（组合根
 *     atlascode/compose.ts 注入 settings.json search.tavilyApiKey 读者）
 *
 * H6 登记（随 G-2 整裁的旧面）：makeToolSchema（web_search_20250305 wire
 * 面）/ makeOutputFromSearchResponse（三块型流解析）/ WebSearchServerToolSchema
 * / SearchContentBlock 型面（webToolInput delta ②）——设计记录 §8.74.27。
 */
import { randomUUID } from 'crypto'
import { logError } from '../../../shared'
import type {
  WebSearchHit,
  WebSearchOutput,
  WebSearchToolInput,
} from './webToolInput'

export type WebSearchProvider = 'bing' | 'tavily'

/** 缺省 endpoint（R1：国内可达优先 = cn.bing.com）。 */
export const BING_DEFAULT_ENDPOINT = 'https://cn.bing.com'
export const TAVILY_DEFAULT_ENDPOINT = 'https://api.tavily.com'

/** 抓取超时（AbortSignal.timeout，仓内先例 webFetchUtils；不持 event loop）。 */
const SEARCH_TIMEOUT_MS = 15_000
/** 命中数上限（旧 web_search max_uses 8 语义随迁）。 */
const MAX_RESULTS = 8

/** 搜索失败（调用方不 catch——runWebSearch 内转字符串结果面，模型可反应）。 */
export class SearchProviderError extends Error {
  /** 处置指引（如「切 tavily：WEB_SEARCH_PROVIDER=tavily + TAVILY_API_KEY」）。 */
  readonly hint?: string
  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'SearchProviderError'
    this.hint = hint
  }
}

// ── HTTP transport（测试缝先例 = webFetchUtils fetchImpl 镜像）──────────

export type WebSearchHttpResponse = {
  ok: boolean
  status: number
  text(): Promise<string>
}

export type WebSearchTransportInit = {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
}

export type WebSearchTransport = (
  url: string,
  init?: WebSearchTransportInit,
) => Promise<WebSearchHttpResponse>

const defaultTransport: WebSearchTransport = (url, init) =>
  fetch(url, {
    method: init?.method ?? 'GET',
    headers: init?.headers,
    body: init?.body,
    signal: init?.signal,
  })

let transport: WebSearchTransport = defaultTransport

/** 测试缝：注入 HTTP transport（null = 恢复全局 fetch）。 */
export function setWebSearchTransportForTesting(
  fn: WebSearchTransport | null,
): void {
  transport = fn ?? defaultTransport
}

// ── 配置面（env + settings 键供给方）────────────────────────────────────

let settingsKeyProvider: () => string | undefined = () => undefined

/** 组合根注入缝：settings.json search.tavilyApiKey 读者（域内缺省 = 无）。 */
export function setWebSearchSettingsKeyProvider(
  fn: () => string | undefined,
): void {
  settingsKeyProvider = fn
}

/**
 * provider + endpoint 解析。非法 WEB_SEARCH_PROVIDER 值回落缺省 bing
 *（fail-open 登记：搜索不该被拼写错误打死）；WEB_SEARCH_ENDPOINT 覆盖
 * 当前激活 provider 的 endpoint。
 */
export function resolveWebSearchProvider(
  env: Record<string, string | undefined> = process.env,
): { provider: WebSearchProvider; endpoint: string } {
  const raw = (env.WEB_SEARCH_PROVIDER ?? '').trim().toLowerCase()
  const provider: WebSearchProvider = raw === 'tavily' ? 'tavily' : 'bing'
  const endpoint =
    env.WEB_SEARCH_ENDPOINT?.trim() ||
    (provider === 'tavily'
      ? TAVILY_DEFAULT_ENDPOINT
      : BING_DEFAULT_ENDPOINT)
  return { provider, endpoint }
}

/** key 优先级：env TAVILY_API_KEY > settings.json search.tavilyApiKey。 */
export function resolveWebSearchApiKey(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const envKey = env.TAVILY_API_KEY?.trim()
  if (envKey) return envKey
  try {
    const settingsKey = settingsKeyProvider()?.trim()
    return settingsKey || undefined
  } catch {
    return undefined
  }
}

// ── bing SERP 解析（零依赖，fixture 驱动）──────────────────────────────

function decodeEntities(text: string): string {
  // &amp; 恒最后解（避免 &amp;lt; 二重解码）
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

function stripTags(text: string): string {
  return decodeEntities(text.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
}

/**
 * 抓 SERP HTML → 命中面（b_algo 块：h2>a href 取 url + 标题，首个 <p>
 * 取摘要；宽容正则——反爬页/空结果 → 0 命中，上层转错误支）。
 */
export function parseBingResults(html: string): WebSearchHit[] {
  const hits: WebSearchHit[] = []
  const blocks = html
    .split(/<li[^>]+class="[^"]*\bb_algo\b[^"]*"/)
    .slice(1)
  for (const block of blocks) {
    if (hits.length >= MAX_RESULTS) break
    const urlMatch =
      block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"/) ??
      block.match(/<a[^>]+href="(https?:\/\/[^"]+)"/)
    if (!urlMatch) continue
    const url = decodeEntities(urlMatch[1])
    const titleMatch = block.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/)
    const title = titleMatch ? stripTags(titleMatch[1]) : ''
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/)
    const snippet = snippetMatch ? stripTags(snippetMatch[1]).slice(0, 500) : ''
    hits.push({ title, url, snippet: snippet || undefined })
  }
  return hits
}

async function bingSearch(
  query: string,
  endpoint: string,
  signal: AbortSignal,
): Promise<WebSearchHit[]> {
  const url = `${endpoint}/search?q=${encodeURIComponent(query)}&count=${MAX_RESULTS}`
  const res = await transport(url, {
    headers: {
      'User-Agent': 'atlas-websearch',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    signal,
  })
  if (!res.ok) {
    throw new SearchProviderError(
      `WebSearch(bing): HTTP ${res.status}`,
      '可换 tavily：WEB_SEARCH_PROVIDER=tavily + TAVILY_API_KEY',
    )
  }
  const hits = parseBingResults(await res.text())
  if (hits.length === 0) {
    throw new SearchProviderError(
      'WebSearch(bing): 未解析到搜索结果（可能被反爬拦截或网络受限）',
      '稍后重试，或切 tavily：WEB_SEARCH_PROVIDER=tavily + TAVILY_API_KEY',
    )
  }
  return hits
}

// ── tavily 官方 API（POST /search，Bearer key）─────────────────────────

async function tavilySearch(
  query: string,
  endpoint: string,
  key: string | undefined,
  signal: AbortSignal,
): Promise<WebSearchHit[]> {
  if (!key) {
    throw new SearchProviderError(
      'WebSearch(tavily): 未配置 API key',
      '设置 env TAVILY_API_KEY 或 settings.json search.tavilyApiKey（模板见 settings.template.json）',
    )
  }
  const res = await transport(`${endpoint}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query,
      max_results: MAX_RESULTS,
      include_answer: false,
    }),
    signal,
  })
  if (!res.ok) {
    throw new SearchProviderError(
      `WebSearch(tavily): HTTP ${res.status}`,
      res.status === 401 || res.status === 403
        ? 'API key 无效或额度耗尽——检查 TAVILY_API_KEY / settings.json search.tavilyApiKey'
        : '可回落 bing：WEB_SEARCH_PROVIDER=bing（无 key）',
    )
  }
  const body = JSON.parse(await res.text()) as {
    results?: { title?: string; url?: string; content?: string }[]
  }
  return (body.results ?? [])
    .filter(r => r.url)
    .slice(0, MAX_RESULTS)
    .map(r => ({
      title: (r.title ?? '').slice(0, 300),
      url: r.url as string,
      snippet: (r.content ?? '').slice(0, 500) || undefined,
    }))
}

// ── 域过滤（客户端面：旧服务端 allowed/blocked_domains 语义随迁）──────

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** host === domain 或 *.domain（子域感知）。 */
function matchDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase()
  const d = domain.toLowerCase()
  return h === d || h.endsWith(`.${d}`)
}

export function filterHitsByDomains(
  hits: WebSearchHit[],
  input: Pick<WebSearchToolInput, 'allowed_domains' | 'blocked_domains'>,
): WebSearchHit[] {
  let out = hits
  if (input.allowed_domains?.length) {
    const allowed = input.allowed_domains
    out = out.filter(h => allowed.some(d => matchDomain(hostOf(h.url), d)))
  }
  if (input.blocked_domains?.length) {
    const blocked = input.blocked_domains
    out = out.filter(h => !blocked.some(d => matchDomain(hostOf(h.url), d)))
  }
  return out
}

// ── 主入口（双工具面共享：engine webSearchTool + tui WebSearchTool）────

export type WebSearchExecutionContext = {
  abortController: AbortController
}

/**
 * 客户端搜索主入口。语义（旧 B8 面随迁）：错误不 throw——results[0] =
 * 错误串（含 provider + 处置指引），模型可反应；成功 = 单 WebSearchResult
 *（tool_use_id = randomUUID 本地生成，旧服务端 id 位等价面）。
 */
export async function runWebSearch(
  input: WebSearchToolInput,
  ctx: WebSearchExecutionContext,
): Promise<WebSearchOutput> {
  const startTime = performance.now()
  const { provider, endpoint } = resolveWebSearchProvider()
  const signal = AbortSignal.any([
    ctx.abortController.signal,
    AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  ])
  try {
    const rawHits =
      provider === 'tavily'
        ? await tavilySearch(
            input.query,
            endpoint,
            resolveWebSearchApiKey(),
            signal,
          )
        : await bingSearch(input.query, endpoint, signal)
    const hits = filterHitsByDomains(rawHits, input)
    return {
      query: input.query,
      results: [
        {
          tool_use_id: randomUUID(),
          content: hits,
        },
      ],
      durationSeconds: (performance.now() - startTime) / 1000,
    }
  } catch (error) {
    const hint = error instanceof SearchProviderError ? error.hint : undefined
    const message = error instanceof Error ? error.message : String(error)
    logError(error)
    return {
      query: input.query,
      results: [
        `Web search error (${provider}): ${message}${hint ? `（${hint}）` : ''}`,
      ],
      durationSeconds: (performance.now() - startTime) / 1000,
    }
  }
}
