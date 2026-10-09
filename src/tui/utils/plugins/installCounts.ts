/**
 * Plugin install counts data layer
 *
 * 0.1.46 三源波 S4（#301）：per-marketplace 可插拔 stats 源注册表（替换旧
 * 单一 1P 硬编码 URL）：
 *   - claude-plugins-official → 1P 官方 stats URL（保留现值，anthropic 生态
 *     兼容，用户明裁「已解决」，本波不动）；
 *   - atlas-plugins / agent-skills（自建/托管）→ 自包含 stats 文件（单文件
 *     计数后端，atlas-plugins 仓 `stats/install-counts.json`，零用户 infra；
 *     文件缺/空 = UI 优雅不显数）；`ATLAS_STATS_ENDPOINT` env 可覆写
 *     （用户自部署计数后端）；
 *   - 其他市场 → 无 stats 源（安装数优雅隐藏，UI「有数据即显示」）。
 * 上报面（客户端装成功 fire-and-forget 上报）= installCountReporter.ts：
 * 仅 `ATLAS_STATS_ENDPOINT` 设真时上报，缺省零外联零阻塞。
 *
 * Cache location: ~/.atlas/plugins/install-counts-cache.json
 * （v2 = per-source 条目 + 24h TTL；v1 单 URL 文件读回时 version 不符 →
 * 丢弃重拉，无迁移）
 *
 * W-opt 可信波 S5（#299）可信清册 D3 豁免注：插件安装数拉取 = 只读（/plugin
 * 打开用户动作 + 24h 缓存，零数据出境），登记豁免。上报 = 用户显式设
 * ATLAS_STATS_ENDPOINT 才外联（用户自配端点 = 用户发起自带许可，B-5 同族）。
 */

import axios from 'axios'
import { randomBytes } from 'crypto'
import { readFile, rename, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { logForDebugging } from '../debug.js'
import { errorMessage, getErrnoCode } from '../errors.js'
import { getFsImplementation } from '../fsOperations.js'
import { logError } from '../log.js'
import { jsonParse, jsonStringify } from '../slowOperations.js'
import { classifyFetchError, logPluginFetch } from './fetchTelemetry.js'
import { OFFICIAL_MARKETPLACE_NAME } from './officialMarketplace.js'
import { getPluginsDirectory } from './pluginDirectories.js'

const INSTALL_COUNTS_CACHE_VERSION = 2
const INSTALL_COUNTS_CACHE_FILENAME = 'install-counts-cache.json'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

/**
 * 1P 官方 stats URL（既有 anthropic 生态兼容，用户明裁保留，本波不动）。
 */
export const OFFICIAL_STATS_URL =
  'https://raw.githubusercontent.com/anthropics/claude-plugins-official/refs/heads/stats/stats/plugin-installs.json'

/**
 * 自建/托管市场 stats 文件（单文件计数后端，atlas-plugins 仓，零用户
 * infra）。文件缺/条目缺 = 该市场不显安装数（优雅隐藏，非错误）。
 */
export const SELF_HOSTED_STATS_URL =
  'https://raw.githubusercontent.com/vincentlau2046/atlas-plugins/master/stats/install-counts.json'

/**
 * 用户自部署计数后端基址（D3 端点策略裁定）。设真 = 自建/托管市场的
 * 显数面改拉 `{base}/stats/install-counts.json`、上报面 POST
 * `{base}/stats/report`（两条固定路径，用户后端按此实现）；未设 = 显数面
 * 回落 SELF_HOSTED_STATS_URL（缺数据即不显数）、上报面零外联（no-op）。
 */
export const STATS_ENDPOINT_ENV = 'ATLAS_STATS_ENDPOINT'

/**
 * 端点基址规范化（去尾斜杠）：`https://stats.example.com/` →
 * `https://stats.example.com`。空串/纯斜杠视为未设。
 */
function normalizeStatsBase(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.replace(/\/+$/, '')
  return trimmed.length > 0 ? trimmed : null
}

/**
 * 由自建仓托管 stats 文件的市场（agent-skills = Ascend 官方市场，
 * 「要数就在 atlas-plugins 仓替它托管一份」裁定；放不了 = 不显数）。
 */
const SELF_HOSTED_MARKETPLACES: ReadonlySet<string> = new Set([
  'atlas-plugins',
  'agent-skills',
])

/**
 * Per-marketplace 可插拔 stats 源注册表：市场名 → stats URL（无源 = null，
 * UI 摘掉官方市场硬门控 → 「有数据即显示」）。
 *
 * @param marketplaceName - marketplace registry key（大小写不敏感）
 * @returns stats 源 URL，或该市场无计数源（优雅隐藏安装数）
 */
export function getStatsSourceUrl(marketplaceName: string): string | null {
  const name = marketplaceName.toLowerCase()
  if (name === OFFICIAL_MARKETPLACE_NAME) {
    // 1P 官方市场 = 既有 anthropic 生态兼容，恒用官方 stats 文件（env 不覆写）
    return OFFICIAL_STATS_URL
  }
  if (SELF_HOSTED_MARKETPLACES.has(name)) {
    const base = normalizeStatsBase(process.env[STATS_ENDPOINT_ENV])
    return base
      ? `${base}/stats/install-counts.json`
      : SELF_HOSTED_STATS_URL
  }
  return null
}

/**
 * 上报面 URL（installCountReporter 消费）：仅 `ATLAS_STATS_ENDPOINT` 设真
 * 时返回 `{base}/stats/report`；缺省 = 不上报（零外联零阻塞）。
 */
export function getStatsReportUrl(): string | null {
  const base = normalizeStatsBase(process.env[STATS_ENDPOINT_ENV])
  return base ? `${base}/stats/report` : null
}

/**
 * 全部已注册 stats 源（无参 getInstallCounts 的取数范围；env 覆写时
 * 两自建市场共享同一端点 → 去重）。
 */
export function getAllStatsSourceUrls(): string[] {
  const urls = new Set<string>()
  const official = getStatsSourceUrl(OFFICIAL_MARKETPLACE_NAME)
  if (official) urls.add(official)
  for (const mkt of SELF_HOSTED_MARKETPLACES) {
    const url = getStatsSourceUrl(mkt)
    if (url) urls.add(url)
  }
  return [...urls]
}

/**
 * Structure of the install counts cache file (v2: per-source entries)
 */
type StatsCountEntry = {
  plugin: string // "pluginName@marketplace"
  unique_installs: number
}

type InstallCountsCacheEntry = {
  fetchedAt: string // ISO timestamp
  counts: StatsCountEntry[]
}

type InstallCountsCache = {
  version: number
  entries: Record<string, InstallCountsCacheEntry> // keyed by source URL
}

/**
 * Expected structure of the stats response (1P 官方文件与自建文件同形)
 */
type GitHubStatsResponse = {
  plugins: Array<{
    plugin: string
    unique_installs: number
  }>
}

/**
 * Get the path to the install counts cache file
 */
function getInstallCountsCachePath(): string {
  return join(getPluginsDirectory(), INSTALL_COUNTS_CACHE_FILENAME)
}

/**
 * Load the install counts cache from disk.
 * Returns null if the file doesn't exist or is invalid. Stale (per-source,
 * >24h) entries are left in place so callers can merge fresh fetches over
 * still-valid siblings; version mismatch (legacy v1) → null (re-fetch).
 */
async function loadInstallCountsCache(): Promise<InstallCountsCache | null> {
  const cachePath = getInstallCountsCachePath()

  try {
    const content = await readFile(cachePath, { encoding: 'utf-8' })
    const parsed = jsonParse(content) as unknown

    // Validate basic structure
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('version' in parsed) ||
      !('entries' in parsed)
    ) {
      logForDebugging('Install counts cache has invalid structure')
      return null
    }

    const cache = parsed as {
      version: unknown
      entries: unknown
    }

    if (cache.version !== INSTALL_COUNTS_CACHE_VERSION) {
      logForDebugging(
        `Install counts cache version mismatch (got ${cache.version}, expected ${INSTALL_COUNTS_CACHE_VERSION})`,
      )
      return null
    }

    const entries = cache.entries as Record<string, unknown>
    const validated: Record<string, InstallCountsCacheEntry> = {}
    for (const [url, rawEntry] of Object.entries(entries)) {
      const entry = rawEntry as {
        fetchedAt?: unknown
        counts?: unknown
      }
      if (
        typeof entry.fetchedAt !== 'string' ||
        Number.isNaN(new Date(entry.fetchedAt).getTime()) ||
        !Array.isArray(entry.counts)
      ) {
        continue // skip malformed entry, keep the valid siblings
      }
      const counts = (entry.counts as Array<Record<string, unknown>>).filter(
        (c): c is StatsCountEntry =>
          typeof c.plugin === 'string' && typeof c.unique_installs === 'number',
      )
      validated[url] = { fetchedAt: entry.fetchedAt, counts }
    }

    return { version: INSTALL_COUNTS_CACHE_VERSION, entries: validated }
  } catch (error) {
    const code = getErrnoCode(error)
    if (code !== 'ENOENT') {
      logForDebugging(
        `Failed to load install counts cache: ${errorMessage(error)}`,
      )
    }
    return null
  }
}

/**
 * Save the install counts cache to disk atomically.
 * Uses a temp file + rename pattern to prevent corruption.
 */
async function saveInstallCountsCache(
  cache: InstallCountsCache,
): Promise<void> {
  const cachePath = getInstallCountsCachePath()
  const tempPath = `${cachePath}.${randomBytes(8).toString('hex')}.tmp`

  try {
    // Ensure the plugins directory exists
    const pluginsDir = getPluginsDirectory()
    await getFsImplementation().mkdir(pluginsDir)

    // Write to temp file
    const content = jsonStringify(cache, null, 2)
    await writeFile(tempPath, content, {
      encoding: 'utf-8',
      mode: 0o600,
    })

    // Atomic rename
    await rename(tempPath, cachePath)
    logForDebugging('Install counts cache saved successfully')
  } catch (error) {
    logError(error)
    // Clean up temp file if it exists
    try {
      await unlink(tempPath)
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Fetch install counts from one stats source (1P 官方文件与自建文件同形：
 * `{plugins: [{plugin, unique_installs}]}`)
 */
async function fetchStatsFromUrl(url: string): Promise<StatsCountEntry[]> {
  logForDebugging(`Fetching install counts from ${url}`)

  const started = performance.now()
  try {
    const response = await axios.get<GitHubStatsResponse>(url, {
      timeout: 10000,
    })

    if (!response.data?.plugins || !Array.isArray(response.data.plugins)) {
      throw new Error('Invalid response format from install counts API')
    }

    logPluginFetch('install_counts', url, 'success', performance.now() - started)
    return response.data.plugins
  } catch (error) {
    logPluginFetch(
      'install_counts',
      url,
      'failure',
      performance.now() - started,
      classifyFetchError(error),
    )
    throw error
  }
}

/**
 * Get plugin install counts as a Map.
 *
 * - No arg (or empty) = all registered stats sources (cross-market 发现面)；
 *   arg = 仅请求市场中有 stats 源者（全无源 → null，UI 不显数）。
 * - Per-source 24h 缓存；单源失败不影响其余源（优雅降级）；全部源无数据
 *   → null（UI 隐藏安装数，不显误导性零值）。
 *
 * @returns Map of plugin ID (name@marketplace) to install count, or null if unavailable
 */
export async function getInstallCounts(
  marketplaceNames?: string[],
): Promise<Map<string, number> | null> {
  // Resolve the stats sources to consult (deduped by URL — env 覆写时
  // 自建市场共享同一端点)
  const urls = new Set<string>()
  if (marketplaceNames && marketplaceNames.length > 0) {
    for (const name of marketplaceNames) {
      const url = getStatsSourceUrl(name)
      if (url) urls.add(url)
    }
    if (urls.size === 0) {
      // None of the requested marketplaces have a stats source — hide counts
      // gracefully (no fetch, no misleading zeros)
      return null
    }
  } else {
    for (const url of getAllStatsSourceUrls()) {
      urls.add(url)
    }
  }

  const cache = await loadInstallCountsCache()
  const map = new Map<string, number>()
  let gotData = false

  for (const url of urls) {
    // Fresh (≤24h) cached entry → use it without a network round-trip
    const cached = cache?.entries[url]
    if (
      cached &&
      Date.now() - new Date(cached.fetchedAt).getTime() <= CACHE_TTL_MS
    ) {
      logPluginFetch('install_counts', url, 'cache_hit', 0)
      for (const entry of cached.counts) {
        map.set(entry.plugin, entry.unique_installs)
      }
      if (cached.counts.length > 0) gotData = true
      continue
    }

    try {
      const counts = await fetchStatsFromUrl(url)
      for (const entry of counts) {
        map.set(entry.plugin, entry.unique_installs)
      }
      gotData = true
      // Persist the fresh entry alongside still-valid siblings
      const nextCache = cache ?? {
        version: INSTALL_COUNTS_CACHE_VERSION,
        entries: {},
      }
      nextCache.entries[url] = {
        fetchedAt: new Date().toISOString(),
        counts,
      }
      await saveInstallCountsCache(nextCache)
    } catch (error) {
      // One source failing must not hide the others (graceful degradation);
      // if every source fails the map stays empty → null below
      logError(error)
      logForDebugging(
        `Failed to fetch install counts from ${url}: ${errorMessage(error)}`,
      )
    }
  }

  return gotData ? map : null
}

/**
 * Format an install count for display.
 *
 * @param count - The raw install count
 * @returns Formatted string:
 *   - <1000: raw number (e.g., "42")
 *   - >=1000: K suffix with 1 decimal (e.g., "1.2K", "36.2K")
 *   - >=1000000: M suffix with 1 decimal (e.g., "1.2M")
 */
export function formatInstallCount(count: number): string {
  if (count < 1000) {
    return String(count)
  }

  if (count < 1000000) {
    const k = count / 1000
    // Use toFixed(1) but remove trailing .0
    const formatted = k.toFixed(1)
    return formatted.endsWith('.0')
      ? `${formatted.slice(0, -2)}K`
      : `${formatted}K`
  }

  const m = count / 1000000
  const formatted = m.toFixed(1)
  return formatted.endsWith('.0')
    ? `${formatted.slice(0, -2)}M`
    : `${formatted}M`
}
