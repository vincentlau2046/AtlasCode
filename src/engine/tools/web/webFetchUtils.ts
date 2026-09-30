/**
 * engine/tools/web — WebFetch URL→markdown 管线（S-E2 §8.59 web 族子波）。
 *
 * 旧仓来源（a8af45b）：src/tools/WebFetchTool/utils.ts 537L 逐字随迁多裁
 * （3 错误类→G-3 后 1 类（EgressBlockedError）/ 双缓存→单缓存 / validateURL /
 * 受限重定向 / 二进制落盘 / LRU 缓存 / applyPromptToMarkdown 二级模型面；
 * blocklist 预检面 G-3 §8.74.28 R2 整裁）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 axios 依赖（主 fetch 面；blocklist 预检面 G-3 整裁）→ node 全局
 *    fetch（本面零新依赖，fetch = 全局内建）；
 *    getWithPermittedRedirects：旧 axios maxRedirects:0（3xx 抛错，catch
 *    支读 error.response.headers.location）→ fetch redirect:'manual'（3xx
 *    正常返回，原地读 status/headers，语义等价）；axios timeout 选项 →
 *    AbortSignal.any([调用方 signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)])；
 *    环守卫消息 `Too many redirects (exceeded ${MAX_REDIRECTS})` 逐字
 *    （S-E3 A-M1 订正：S-E2 实施误写 'Too many loops'，已还原旧文案）；
 *    axios maxContentLength → 原地 content-length 头守卫（超 10MB 抛错，
 *    旧 axios 错误消息面差异登记）；边缘登记（S-E3 A-N5）：旧 axios
 *    maxContentLength 下载中强制（含 chunked 传输无 content-length 头
 *    面）→ 新守卫仅带 content-length 头时生效，chunked 响应不受本守卫
 *    约束（URL_CACHE 50MB + MAX_MARKDOWN_LENGTH 100K 截断双兜底）。
 *  ② 旧 lru-cache（LRUCache ×2）→ 域内本地 TtlLruCache（语义对齐消费面：
 *    get/set({size})/has/clear + TTL 惰性过期 + 访问刷新 recency + FIFO
 *    逐出；URL_CACHE 字节上限 50MB + 条目上限 500（lru-cache v10 隐式
 *    max=500 对齐，S-E3 A-N4 补登：S-E2 实施 maxEntries 曾留 undefined）
 *    / 单缓存 URL_CACHE（DOMAIN_CHECK_CACHE 随 G-3 blocklist 预检面整裁，
 *    条数上限 500 逐字保留）。
 *  ③ 旧 turndown 懒单例（~1.4MB 保留堆）整砍（本面零新依赖，不引转换库）
 *    → HTML 内容 raw 透传（旧 turndown 支裁，非 HTML 支逐字；HTML 支
 *    contentBytes 保 Buffer.byteLength(markdown) 语义，缓存逐出核算面
 *    保留）。登记 = HTML→markdown 转换面裁（TUI/增强波复活候选，非本波）。
 *  ④ 旧 getSettings_DEPRECATED().skipWebFetchPreflight 企业 opt-out 支裁
 *    （新仓无 SettingsJson 面——config 功能面恢复位，同 plan 域 delta ③
 *    先例）→ blocklist 预检恒执行（该「恒执行」态随 ⑤ G-3 整裁出局）。
 *  ⑤ G-3（§8.74.28）R2：旧 checkDomainBlocklist + ATLAS_WEB_DOMAIN_CHECK_URL
 *    占位 env 面整裁（端点不建、调用点删）——原 preflight 端点 de-ANT 已
 *    废弃，黑名单面若未来复活 = 独立功能波（带真端点），非本接缝复活。
 *  ⑥ 旧 getWebFetchUserAgent（utils/http.ts:54，atlas/${MACRO.VERSION}
 *    构建宏 + env 段）→ 域内固定 UA 常量（新仓无版本宏，版本段裁登记）；
 *    后缀品牌面 G-3（§8.74.28 R4 升格）换血：support.atlas.ai 虚构域 →
 *    AtlasCode 真实 repo 链接。
 *  ⑦ 旧 isBinaryContentType / persistBinaryContent / extensionForMimeType
 *    （utils/mcpOutputStorage.ts:62-171）→ 域内本地随迁（content-type 判
 *    定 + writeFile + 扩展名表逐字）；旧 getToolResultsDir = 会话目录 +
 *    'tool-results'（session/project 目录面）→ 域内最小形 = ATLAS 临时
 *    目录（getAtlasTempDirName，files/pdf.ts §8.55 S-C3 先例）。
 *  ⑧ 旧 axios data 释放行 `(response as {data:unknown}).data = null`
 *    （GC 回收 axios 持有副本注释）随 ① 裁——fetch arrayBuffer 无副本
 *    语义，动因不成立。
 *  ⑨ 旧 applyPromptToMarkdown options 5 字段（querySource/agents/
 *    isNonInteractiveSession/hasAppendSystemPrompt/mcpTools）→ 新
 *    buildOpenAIParams 消费面（model/toolChoice/extraToolSchemas/
 *    maxOutputTokensOverride/temperatureOverride/effortValue）零命中 →
 *    options {} 传（登记；thinkingConfig {type:'disabled'} 逐字，新
 *    builder 仅消费 'enabled' 支 = no-op 等价）。isNonInteractiveSession
 *    形参保留（签名逐字位，值随 ⑨ 不消费，登记）。InDomainUserMessage
 *    （files 域 interface 无索引签名）→ shared Message[]（带索引签名）
 *    不可直接赋值 → 调用点双 cast（duck 结构匹配，登记；webSearchTool
 *    同面）。
 *  ⑩ 测试缝 setWebFetchTransportForTesting（模块级 transport 引用，缺省
 *    = 全局 fetch 生产零行为差；func 层注入 HTTP fixture 面；先例 =
 *    modelprovider setModelProviderForTesting / plan 域 slugGenerator
 *    缝族）。
 */
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { asSystemPrompt, getAtlasTempDirName, logError, type Message } from '../../../shared'
import { modelProvider, buildOpenAIParams } from '../../../modelprovider'
import { AbortError } from '../bash'
import { createUserMessage } from '../files'
import { isPreapprovedHost } from './preapproved'
import { makeSecondaryModelPrompt } from './webFetchPrompt'

// ── 错误类（逐字）─────────────────────────────────────────────────────

// G-3（§8.74.28）R2：DomainBlockedError / DomainCheckFailedError（blocklist
// 预检 2 错误类）随整预检面裁 —— ATLAS_WEB_DOMAIN_CHECK_URL 不建（原
// preflight 端点 de-ANT 已废弃，国内黑名单服务未就绪）；黑名单面若未来
// 复活 = 独立功能波（带真端点），非本接缝复活。

export class EgressBlockedError extends Error {
  constructor(public readonly domain: string) {
    super(
      JSON.stringify({
        error_type: 'EGRESS_BLOCKED',
        domain,
        message: `Access to ${domain} is blocked by the network egress proxy.`,
      }),
    )
    this.name = 'EgressBlockedError'
  }
}

// ── 本地 LRU（delta ②）───────────────────────────────────────────────

/**
 * 域内 TTL + 上限 LRU（旧 lru-cache 消费面语义对齐：get 刷新 recency /
 * set({size}) 字节核算 / FIFO 逐出 / TTL 惰性过期 / clear）。
 */
type LruEntry<V> = { value: V; expiresAt: number; size: number }

class TtlLruCache<K, V> {
  private readonly entries = new Map<K, LruEntry<V>>()
  private totalSize = 0

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries?: number,
    private readonly maxSizeBytes?: number,
  ) {}

  has(key: K): boolean {
    const e = this.entries.get(key)
    if (!e) return false
    if (Date.now() > e.expiresAt) {
      this.evictKey(key)
      return false
    }
    return true
  }

  get(key: K): V | undefined {
    const e = this.entries.get(key)
    if (!e) return undefined
    if (Date.now() > e.expiresAt) {
      this.evictKey(key)
      return undefined
    }
    // lru-cache 语义：访问刷新 recency（Map 插入序 = recency 序）
    this.entries.delete(key)
    this.entries.set(key, e)
    return e.value
  }

  set(key: K, value: V, opts?: { size?: number }): void {
    const size = Math.max(1, opts?.size ?? 1)
    const existing = this.entries.get(key)
    if (existing) this.totalSize -= existing.size
    this.entries.delete(key)
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs, size })
    this.totalSize += size
    while (
      this.totalSize > (this.maxSizeBytes ?? Infinity) ||
      (this.maxEntries !== undefined && this.entries.size > this.maxEntries)
    ) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.evictKey(oldest)
    }
  }

  clear(): void {
    this.entries.clear()
    this.totalSize = 0
  }

  private evictKey(key: K): void {
    const e = this.entries.get(key)
    if (e) {
      this.entries.delete(key)
      this.totalSize -= e.size
    }
  }
}

// ── 缓存（常量逐字）──────────────────────────────────────────────────

// Cache for storing fetched URL content
type CacheEntry = {
  bytes: number
  code: number
  codeText: string
  content: string
  contentType: string
  persistedPath?: string
  persistedSize?: number
}

// Cache with 15-minute TTL and 50MB size limit
// LRUCache handles automatic expiration and eviction
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes
const MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024 // 50MB

// delta ②：旧 new LRUCache<string, CacheEntry>({ maxSize, ttl })
const URL_CACHE = new TtlLruCache<string, CacheEntry>(
  CACHE_TTL_MS,
  500, // lru-cache v10 隐式 max=500 对齐（S-E3 A-N4）
  MAX_CACHE_SIZE_BYTES,
)

// G-3（§8.74.28）R2：DOMAIN_CHECK_CACHE（blocklist 预检 host 键缓存）随
// 预检面裁（双缓存 → 单缓存 URL_CACHE）。

export function clearWebFetchCache(): void {
  URL_CACHE.clear()
}

// ── 常量（逐字 + 注释）───────────────────────────────────────────────

// PSR requested limiting the length of URLs to 250 to lower the potential
// for a data exfiltration. However, this is too restrictive for some customers'
// legitimate use cases, such as JWT-signed URLs (e.g., cloud service signed URLs)
// that can be much longer. We already require user approval for each domain,
// which provides a primary security boundary. In addition, Atlas has
// other data exfil channels, and this one does not seem relatively high risk,
// so I'm removing that length restriction. -ab
const MAX_URL_LENGTH = 2000

// Per PSR:
// "Implement resource consumption controls because setting limits on CPU,
// memory, and network usage for the Web Fetch tool can prevent a single
// request or user from overwhelming the system."
const MAX_HTTP_CONTENT_LENGTH = 10 * 1024 * 1024

// Timeout for the main HTTP fetch request (60 seconds).
// Prevents hanging indefinitely on slow/unresponsive servers.
const FETCH_TIMEOUT_MS = 60_000

// Cap same-host redirect hops. Without this a malicious server can return
// a redirect loop (/a → /b → /a …) and the per-request FETCH_TIMEOUT_MS
// resets on every hop, hanging the tool until user interrupt. 10 matches
// common client defaults (axios=5, follow-redirects=21, Chrome=20).
const MAX_REDIRECTS = 10

// Truncate to not spend too many tokens
export const MAX_MARKDOWN_LENGTH = 100_000

// delta ⑥：旧 getWebFetchUserAgent（utils/http.ts:54，版本构建宏 + env 段）
// → 域内固定 UA（版本段裁登记）；G-3（§8.74.28 R4 升格）：原 support.atlas.ai
// 虚构域后缀 → 真实 repo 链接（AtlasCode repo）。
const WEB_FETCH_USER_AGENT = 'Atlas-User (+https://github.com/vincentlau2046/AtlasCode)'

// ── URL 校验（逐字）──────────────────────────────────────────────────

export function isPreapprovedUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    return isPreapprovedHost(parsedUrl.hostname, parsedUrl.pathname)
  } catch {
    return false
  }
}

export function validateURL(url: string): boolean {
  if (url.length > MAX_URL_LENGTH) {
    return false
  }

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  // We don't need to check protocol here, as we'll upgrade http to https when making the request

  // As long as we aren't supporting aiming to cookies or internal domains,
  // we should block URLs with usernames/passwords too, even though these
  // seem exceedingly unlikely.
  if (parsed.username || parsed.password) {
    return false
  }

  // Initial filter that this isn't a privileged, company-internal URL
  // by checking that the hostname is publicly resolvable
  const hostname = parsed.hostname
  const parts = hostname.split('.')
  if (parts.length < 2) {
    return false
  }

  return true
}

// ── G-3（§8.74.28）R2：blocklist 预检整面裁（原 delta ⑤ checkDomainBlocklist
// 逐字面 + ATLAS_WEB_DOMAIN_CHECK_URL 占位 env + DomainCheckResult 型 +
// DOMAIN_CHECK_CACHE + 10s 超时常量）—— 端点不建、调用点删；原 preflight
// 端点 de-ANT 已废弃，黑名单面若未来复活 = 独立功能波。 ──

// ── 受限重定向（判定函数逐字，fetch 化）─────────────────────────────

/**
 * Check if a redirect is safe to follow
 * Allows redirects that:
 * - Add or remove "www." in the hostname
 * - Keep the origin the same but change path/query params
 * - Or both of the above
 */
export function isPermittedRedirect(
  originalUrl: string,
  redirectUrl: string,
): boolean {
  try {
    const parsedOriginal = new URL(originalUrl)
    const parsedRedirect = new URL(redirectUrl)

    if (parsedRedirect.protocol !== parsedOriginal.protocol) {
      return false
    }

    if (parsedRedirect.port !== parsedOriginal.port) {
      return false
    }

    if (parsedRedirect.username || parsedRedirect.password) {
      return false
    }

    // Now check hostname conditions
    // 1. Adding www. is allowed: example.com -> www.example.com
    // 2. Removing www. is allowed: www.example.com -> example.com
    // 3. Same host (with or without www.) is allowed: paths can change
    const stripWww = (hostname: string) => hostname.replace(/^www\./, '')
    const originalHostWithoutWww = stripWww(parsedOriginal.hostname)
    const redirectHostWithoutWww = stripWww(parsedRedirect.hostname)
    return originalHostWithoutWww === redirectHostWithoutWww
  } catch (_error) {
    return false
  }
}

// ── HTTP transport 缝（delta ⑩）─────────────────────────────────────

/** HTTP 响应 duck 面（node undici Response 结构满足；测试 fixture 可纯对象构造）。 */
export type WebFetchHttpResponse = {
  status: number
  statusText: string
  ok: boolean
  headers: {
    get(name: string): string | null
    forEach(cb: (value: string, key: string) => void): void
  }
  arrayBuffer(): Promise<ArrayBuffer>
  json(): Promise<unknown>
}

export type WebFetchTransportInit = {
  signal?: AbortSignal
  redirect?: 'manual'
  headers?: Record<string, string>
}

export type WebFetchTransport = (
  url: string,
  init?: WebFetchTransportInit,
) => Promise<WebFetchHttpResponse>

let fetchImpl: WebFetchTransport = (url, init) => fetch(url, init)

/**
 * 测试缝：注入 HTTP transport（null = 恢复全局 fetch）。
 * 先例 = modelprovider setModelProviderForTesting / plan 域
 * setPlanSlugGeneratorForTesting 缝族。
 */
export function setWebFetchTransportForTesting(
  fn: WebFetchTransport | null,
): void {
  fetchImpl = fn ?? ((url, init) => fetch(url, init))
}

/** fetch 化响应面（delta ①：旧 AxiosResponse<ArrayBuffer> 消费面等价）。 */
export type WebFetchHttpResult = {
  data: ArrayBuffer
  status: number
  statusText: string
  headers: Record<string, string>
}

function headersToRecord(headers: WebFetchHttpResponse['headers']): Record<
  string,
  string
> {
  const record: Record<string, string> = {}
  headers.forEach((v, k) => {
    record[k] = v
  })
  return record
}

/**
 * Helper function to handle fetching URLs with custom redirect handling
 * Recursively follows redirects if they pass the redirectChecker function
 *
 * Per PSR:
 * "Do not automatically follow redirects because following redirects could
 * allow for an attacker to exploit an open redirect vulnerability in a
 * trusted domain to force a user to make a request to a malicious domain
 * unknowingly"
 */
export type RedirectInfo = {
  type: 'redirect'
  originalUrl: string
  redirectUrl: string
  statusCode: number
}

export async function getWithPermittedRedirects(
  url: string,
  signal: AbortSignal,
  redirectChecker: (originalUrl: string, redirectUrl: string) => boolean,
  depth = 0,
): Promise<WebFetchHttpResult | RedirectInfo> {
  if (depth > MAX_REDIRECTS) {
    throw new Error(`Too many redirects (exceeded ${MAX_REDIRECTS})`)
  }
  // delta ①：旧 axios.get（maxRedirects:0 → 3xx 抛错，catch 支读
  // error.response.headers.location / x-proxy-error）→ fetch redirect:'manual'
  // （3xx 正常返回，原地读 status/headers，语义等价；递归抛错（Egress/
  // Location 缺失/Too many）自然穿透，旧 catch 重抛面同效）
  const response = await fetchImpl(url, {
    signal: AbortSignal.any([
      signal,
      AbortSignal.timeout(FETCH_TIMEOUT_MS),
    ]),
    redirect: 'manual',
    headers: {
      Accept: 'text/markdown, text/html, */*',
      'User-Agent': WEB_FETCH_USER_AGENT,
    },
  })

  if ([301, 302, 307, 308].includes(response.status)) {
    const redirectLocation = response.headers.get('location')
    if (!redirectLocation) {
      throw new Error('Redirect missing Location header')
    }

    // Resolve relative URLs against the original URL
    const redirectUrl = new URL(redirectLocation, url).toString()

    if (redirectChecker(url, redirectUrl)) {
      // Recursively follow the permitted redirect
      return getWithPermittedRedirects(
        redirectUrl,
        signal,
        redirectChecker,
        depth + 1,
      )
    } else {
      // Return redirect information to the caller
      return {
        type: 'redirect',
        originalUrl: url,
        redirectUrl,
        statusCode: response.status,
      }
    }
  }

  // Detect egress proxy blocks: the proxy returns 403 with
  // X-Proxy-Error: blocked-by-allowlist when egress is restricted
  if (
    response.status === 403 &&
    response.headers.get('x-proxy-error') === 'blocked-by-allowlist'
  ) {
    const hostname = new URL(url).hostname
    throw new EgressBlockedError(hostname)
  }

  if (!response.ok) {
    // delta ①：axios 4xx/5xx 抛错面 → fetch 原地守卫（错误消息面差异登记）
    throw new Error(`Request failed with status code ${response.status}`)
  }

  // delta ①：旧 axios maxContentLength → content-length 头原地守卫
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_HTTP_CONTENT_LENGTH) {
    throw new Error(
      `max content size exceeded (limit ${MAX_HTTP_CONTENT_LENGTH})`,
    )
  }

  const data = await response.arrayBuffer()
  return {
    data,
    status: response.status,
    statusText: response.statusText,
    headers: headersToRecord(response.headers),
  }
}

function isRedirectInfo(
  response: WebFetchHttpResult | RedirectInfo,
): response is RedirectInfo {
  return 'type' in response && response.type === 'redirect'
}

// ── 二进制落盘（delta ⑦，mcpOutputStorage 面逐字）───────────────────

export type FetchedContent = {
  content: string
  bytes: number
  code: number
  codeText: string
  contentType: string
  persistedPath?: string
  persistedSize?: number
}

/**
 * Map a mime type to a file extension. Conservative: known types get their
 * proper extension; unknown types get 'bin'. The extension matters because
 * the Read tool dispatches on it (PDFs, images, etc. need the right ext).
 */
export function extensionForMimeType(mimeType: string | undefined): string {
  if (!mimeType) return 'bin'
  // Strip any charset/boundary parameter
  const mt = (mimeType.split(';')[0] ?? '').trim().toLowerCase()
  switch (mt) {
    case 'application/pdf':
      return 'pdf'
    case 'application/json':
      return 'json'
    case 'text/csv':
      return 'csv'
    case 'text/plain':
      return 'txt'
    case 'text/html':
      return 'html'
    case 'text/markdown':
      return 'md'
    case 'application/zip':
      return 'zip'
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx'
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return 'xlsx'
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return 'pptx'
    case 'application/msword':
      return 'doc'
    case 'application/vnd.ms-excel':
      return 'xls'
    case 'audio/mpeg':
      return 'mp3'
    case 'audio/wav':
      return 'wav'
    case 'audio/ogg':
      return 'ogg'
    case 'video/mp4':
      return 'mp4'
    case 'video/webm':
      return 'webm'
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'image/svg+xml':
      return 'svg'
    default:
      return 'bin'
  }
}

/**
 * Heuristic for whether a content-type header indicates binary content that
 * should be saved to disk rather than put into the model context.
 * Text-ish types (text/*, json, xml, form data) are treated as non-binary.
 */
export function isBinaryContentType(contentType: string): boolean {
  if (!contentType) return false
  const mt = (contentType.split(';')[0] ?? '').trim().toLowerCase()
  if (mt.startsWith('text/')) return false
  // Structured text formats delivered with an application/ type. Use suffix
  // or exact match rather than substring so 'openxmlformats' (docx/xlsx) stays binary.
  if (mt.endsWith('+json') || mt === 'application/json') return false
  if (mt.endsWith('+xml') || mt === 'application/xml') return false
  if (mt.startsWith('application/javascript')) return false
  if (mt === 'application/x-www-form-urlencoded') return false
  return true
}

export type PersistBinaryResult =
  | { filepath: string; size: number; ext: string }
  | { error: string }

// delta ⑦：旧 getToolResultsDir = 会话目录 + 'tool-results'（session/
// project 目录面）→ 域内最小形 = ATLAS 临时目录（files/pdf.ts 先例）
const TOOL_RESULTS_SUBDIR = 'tool-results'
function getToolResultsDir(): string {
  return join(getAtlasTempDirName(), TOOL_RESULTS_SUBDIR)
}

async function ensureToolResultsDir(): Promise<void> {
  try {
    await mkdir(getToolResultsDir(), { recursive: true })
  } catch {
    // Directory may already exist
  }
}

/**
 * Write raw binary bytes to the tool-results directory with a mime-derived
 * extension. Unlike persistToolResult (which stringifies), this writes the
 * bytes as-is so the resulting file can be opened with native tools (Read
 * for PDFs, pandas for xlsx, etc.).
 */
export async function persistBinaryContent(
  bytes: Buffer,
  mimeType: string | undefined,
  persistId: string,
): Promise<PersistBinaryResult> {
  await ensureToolResultsDir()
  const ext = extensionForMimeType(mimeType)
  const filepath = join(getToolResultsDir(), `${persistId}.${ext}`)

  try {
    await writeFile(filepath, bytes)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logError(err)
    return { error: err.message }
  }

  // mime type and extension are safe fixed-vocabulary strings (not paths/code)
  return { filepath, size: bytes.length, ext }
}

// ── 主 fetch 管线（fetch 化 + 多裁）─────────────────────────────────

export async function getURLMarkdownContent(
  url: string,
  abortController: AbortController,
): Promise<FetchedContent | RedirectInfo> {
  if (!validateURL(url)) {
    throw new Error('Invalid URL')
  }

  // Check cache (LRUCache handles TTL automatically)
  const cachedEntry = URL_CACHE.get(url)
  if (cachedEntry) {
    return {
      bytes: cachedEntry.bytes,
      code: cachedEntry.code,
      codeText: cachedEntry.codeText,
      content: cachedEntry.content,
      contentType: cachedEntry.contentType,
      persistedPath: cachedEntry.persistedPath,
      persistedSize: cachedEntry.persistedSize,
    }
  }

  let parsedUrl: URL
  let upgradedUrl = url

  try {
    parsedUrl = new URL(url)

    // Upgrade http to https if needed
    if (parsedUrl.protocol === 'http:') {
      parsedUrl.protocol = 'https:'
      upgradedUrl = parsedUrl.toString()
    }

    // G-3（§8.74.28）R2：blocklist 预检面裁后，本块仅剩 URL 解析 +
    // http→https 升级；delta ④（skipWebFetchPreflight 企业 opt-out 支裁，
    // 预检恒执行）随预检面整体出局，登记收口。
  } catch (e) {
    logError(e)
  }

  const response = await getWithPermittedRedirects(
    upgradedUrl,
    abortController.signal,
    isPermittedRedirect,
  )

  // Check if we got a redirect response
  if (isRedirectInfo(response)) {
    return response
  }

  const rawBuffer = Buffer.from(response.data)
  // delta ⑧：旧 axios 副本释放行（GC 动因注释）随 fetch 化裁
  const contentType = response.headers['content-type'] ?? ''

  // Binary content: save raw bytes to disk with a proper extension so Claude
  // can inspect the file later. We still fall through to the utf-8 decode +
  // Haiku path below — for PDFs in particular the decoded string has enough
  // ASCII structure (/Title, text streams) that Haiku can summarize it, and
  // the saved file is a supplement rather than a replacement.
  let persistedPath: string | undefined
  let persistedSize: number | undefined
  if (isBinaryContentType(contentType)) {
    const persistId = `webfetch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const result = await persistBinaryContent(rawBuffer, contentType, persistId)
    if (!('error' in result)) {
      persistedPath = result.filepath
      persistedSize = result.size
    }
  }

  const bytes = rawBuffer.length
  const htmlContent = rawBuffer.toString('utf-8')

  let markdownContent: string
  let contentBytes: number
  if (contentType.includes('text/html')) {
    // delta ③：旧 (await getTurndownService()).turndown(htmlContent) 转换
    // 面裁 → raw 透传（contentBytes 保 byteLength 语义，缓存核算面保留）
    markdownContent = htmlContent
    contentBytes = Buffer.byteLength(markdownContent)
  } else {
    // It's not HTML - just use it raw. The decoded string's UTF-8 byte
    // length equals rawBuffer.length (modulo U+FFFD replacement on invalid
    // bytes — negligible for cache eviction accounting), so skip the O(n)
    // Buffer.byteLength scan.
    markdownContent = htmlContent
    contentBytes = bytes
  }

  // Store the fetched content in cache. Note that it's stored under
  // the original URL, not the upgraded or redirected URL.
  const entry: CacheEntry = {
    bytes,
    code: response.status,
    codeText: response.statusText,
    content: markdownContent,
    contentType,
    persistedPath,
    persistedSize,
  }
  // lru-cache requires positive integers; clamp to 1 for empty responses.
  URL_CACHE.set(url, entry, { size: Math.max(1, contentBytes) })
  return entry
}

// ── 二级模型 prompt 应用（delta ⑨ 面）───────────────────────────────

export async function applyPromptToMarkdown(
  prompt: string,
  markdownContent: string,
  signal: AbortSignal,
  isNonInteractiveSession: boolean,
  isPreapprovedDomain: boolean,
): Promise<string> {
  // Truncate content to avoid "Prompt is too long" errors from the secondary model
  const truncatedContent =
    markdownContent.length > MAX_MARKDOWN_LENGTH
      ? markdownContent.slice(0, MAX_MARKDOWN_LENGTH) +
        '\n\n[Content truncated due to length...]'
      : markdownContent

  const modelPrompt = makeSecondaryModelPrompt(
    truncatedContent,
    prompt,
    isPreapprovedDomain,
  )
  // InDomainUserMessage（files 域 interface，无索引签名）→ shared Message[]
  //（带 [key:string]:unknown 索引签名）不可直接赋值（interface 缺索引签名
  // 面）→ 本地双 cast（duck 结构匹配：type/uuid/timestamp/message 均
  // Message 成员，登记）
  const messages = [createUserMessage({ content: modelPrompt })] as unknown as Message[]
  const thinkingConfig = { type: 'disabled' as const }
  // delta ⑨：旧 options 7 字段（querySource/agents/isNonInteractiveSession/
  // hasAppendSystemPrompt/mcpTools）新 buildOpenAIParams 消费面零命中 →
  // options {} 传（isNonInteractiveSession 形参保留为签名逐字位，值不消费）
  const params = await buildOpenAIParams(
    {
      messages,
      systemPrompt: asSystemPrompt([]),
      thinkingConfig,
      tools: [],
      options: {},
    },
    'fast',
  )
  const assistantMessage = await modelProvider.chat({
    role: 'fast',
    signal,
    openaiParams: params,
    options: {},
  })

  // We need to bubble this up, so that the tool call throws, causing us to return
  // an is_error tool_use block to the server, and render a red dot in the UI.
  if (signal.aborted) {
    throw new AbortError()
  }

  const { content } = assistantMessage.message
  if (content.length > 0) {
    const contentBlock = content[0]
    if (contentBlock && 'text' in contentBlock) {
      return contentBlock.text
    }
  }
  return 'No response from model'
}
