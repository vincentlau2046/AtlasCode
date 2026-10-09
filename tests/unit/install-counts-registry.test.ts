/**
 * 0.1.46 三源波 S4（#301）· 安装数计数后端自包含判别单测。
 *
 * 判别面（mutation-red）：
 *   - per-marketplace stats 源注册表：官方市场恒 1P 官方 stats URL（anthropic
 *     生态兼容钉死）；自建/托管市场（atlas-plugins/agent-skills）= atlas-
 *     plugins 仓单文件计数后端（零用户 infra），ATLAS_STATS_ENDPOINT 设真
 *     改拉/上报用户自部署后端（基址规范化 + 双固定路径）；无源市场 = null
 *     （UI 优雅不显数）；
 *   - 上报面 fire-and-forget：缺省零外联（no-op）、设真 POST 正确 URL + 载荷、
 *     失败吞掉永不 reject；
 *   - getInstallCounts 市场面取数：全无源市场 = null 且零网络；单源失败
 *     不拖垮其余源（优雅降级）；per-source v2 缓存（v1 文件 → 重拉、新鲜
 *     命中零网络、过期重拉）。
 * 分层纪律：axios mock.module（repo 惯例 = 先真实 import 全导出面再 spread
 * 覆写，避 mock 全导出面泄漏坑）+ ATLAS_PLUGIN_CACHE_DIR 指临时目录（真
 * 缓存 fs，零 mock fs）。
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const CACHE_DIR_ENV = 'ATLAS_PLUGIN_CACHE_DIR'
const STATS_ENDPOINT_ENV = 'ATLAS_STATS_ENDPOINT'
const CACHE_FILE = 'install-counts-cache.json'

type StatsPayload = { plugins: Array<{ plugin: string; unique_installs: number }> }

// ---- axios mock（record + per-URL 可编程行为）----
const getCalls: string[] = []
const postCalls: Array<{ url: string; body: Record<string, unknown> }> = []
let getBehavior: (url: string) => Promise<StatsPayload> = async () => ({
  plugins: [],
})
let postBehavior: () => Promise<unknown> = async () => ({})

// 先取真实 axios 全导出面（default 实例 + 具名导出），再 spread 覆写
// default 的 get/post（其余名/实例面原样透传）。
const realAxios = await import('axios')
mock.module('axios', () => ({
  ...realAxios,
  default: {
    ...(realAxios.default as unknown as Record<string, unknown>),
    get: async (url: string, _config?: unknown) => {
      getCalls.push(url)
      const data = await getBehavior(url)
      return { data }
    },
    post: async (url: string, body?: unknown, _config?: unknown) => {
      postCalls.push({ url, body: body as Record<string, unknown> })
      return postBehavior()
    },
  },
}))

const {
  OFFICIAL_STATS_URL,
  SELF_HOSTED_STATS_URL,
  getAllStatsSourceUrls,
  formatInstallCount,
  getInstallCounts,
  getStatsReportUrl,
  getStatsSourceUrl,
} = await import('../../src/tui/utils/plugins/installCounts.js')
const { reportInstall } = await import(
  '../../src/tui/utils/plugins/installCountReporter.js'
)

let sandbox: string
let prevCacheDir: string | undefined
let prevStatsEnv: string | undefined

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'atlas-install-counts-'))
  prevCacheDir = process.env[CACHE_DIR_ENV]
  process.env[CACHE_DIR_ENV] = sandbox
  prevStatsEnv = process.env[STATS_ENDPOINT_ENV]
  delete process.env[STATS_ENDPOINT_ENV]
  getCalls.length = 0
  postCalls.length = 0
  getBehavior = async () => ({ plugins: [] })
  postBehavior = async () => ({})
})

afterEach(async () => {
  if (prevCacheDir === undefined) delete process.env[CACHE_DIR_ENV]
  else process.env[CACHE_DIR_ENV] = prevCacheDir
  if (prevStatsEnv === undefined) delete process.env[STATS_ENDPOINT_ENV]
  else process.env[STATS_ENDPOINT_ENV] = prevStatsEnv
  await rm(sandbox, { recursive: true, force: true })
})

async function readCache(): Promise<{
  version: number
  entries: Record<string, { fetchedAt: string; counts: StatsPayload['plugins'] }>
} | null> {
  try {
    const raw = await readFile(join(sandbox, CACHE_FILE), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

describe('per-marketplace stats 源注册表（纯函数）', () => {
  test('官方市场恒 1P 官方 stats URL（env 不覆写，anthropic 兼容钉死）', () => {
    expect(getStatsSourceUrl('claude-plugins-official')).toBe(
      OFFICIAL_STATS_URL,
    )
    expect(OFFICIAL_STATS_URL).toContain('anthropics/claude-plugins-official')
    // env 覆写只动自建市场，官方 1P 文件不动
    process.env[STATS_ENDPOINT_ENV] = 'https://stats.example.com'
    expect(getStatsSourceUrl('claude-plugins-official')).toBe(
      OFFICIAL_STATS_URL,
    )
    delete process.env[STATS_ENDPOINT_ENV]
  })

  test('自建/托管市场缺省 = atlas-plugins 仓单文件计数后端（零用户 infra）', () => {
    expect(getStatsSourceUrl('atlas-plugins')).toBe(SELF_HOSTED_STATS_URL)
    expect(getStatsSourceUrl('agent-skills')).toBe(SELF_HOSTED_STATS_URL)
    expect(SELF_HOSTED_STATS_URL).toContain(
      'vincentlau2046/atlas-plugins',
    )
  })

  test('注册表大小写不敏感；未知市场 = null（UI 优雅不显数）', () => {
    expect(getStatsSourceUrl('ATLAS-PLUGINS')).toBe(SELF_HOSTED_STATS_URL)
    expect(getStatsSourceUrl('Agent-Skills')).toBe(SELF_HOSTED_STATS_URL)
    expect(getStatsSourceUrl('some-random-market')).toBeNull()
  })

  test('ATLAS_STATS_ENDPOINT 设真 = 基址规范化（去尾斜杠）+ 固定 stats 路径', () => {
    process.env[STATS_ENDPOINT_ENV] = 'https://stats.example.com/'
    expect(getStatsSourceUrl('atlas-plugins')).toBe(
      'https://stats.example.com/stats/install-counts.json',
    )
    // 两自建市场共享同一 env 端点（去重）
    expect(getAllStatsSourceUrls()).toEqual([
      OFFICIAL_STATS_URL,
      'https://stats.example.com/stats/install-counts.json',
    ])
    delete process.env[STATS_ENDPOINT_ENV]
  })

  test('getAllStatsSourceUrls 缺省 = 官方 + 自建 两源', () => {
    expect(getAllStatsSourceUrls()).toEqual([
      OFFICIAL_STATS_URL,
      SELF_HOSTED_STATS_URL,
    ])
  })

  test('上报 URL：缺省 = null（零外联）；设真 = {base}/stats/report；垃圾值 = null', () => {
    expect(getStatsReportUrl()).toBeNull()
    process.env[STATS_ENDPOINT_ENV] = 'https://stats.example.com///'
    expect(getStatsReportUrl()).toBe('https://stats.example.com/stats/report')
    process.env[STATS_ENDPOINT_ENV] = '///'
    expect(getStatsReportUrl()).toBeNull()
    delete process.env[STATS_ENDPOINT_ENV]
  })
})

describe('reportInstall fire-and-forget（可信清册 D3：缺省零外联）', () => {
  test('ATLAS_STATS_ENDPOINT 缺省 = no-op，零 axios 交互', async () => {
    await reportInstall('my-plugin', 'atlas-plugins')
    expect(postCalls).toEqual([])
  })

  test('设真 = POST {base}/stats/report + 载荷 {plugin, marketplace}', async () => {
    process.env[STATS_ENDPOINT_ENV] = 'https://stats.example.com'
    await reportInstall('my-plugin@atlas-plugins', 'atlas-plugins')
    expect(postCalls).toEqual([
      {
        url: 'https://stats.example.com/stats/report',
        body: { plugin: 'my-plugin@atlas-plugins', marketplace: 'atlas-plugins' },
      },
    ])
  })

  test('上报失败吞掉（永不 reject，不阻塞安装主流程）', async () => {
    process.env[STATS_ENDPOINT_ENV] = 'https://stats.example.com'
    postBehavior = () => Promise.reject(new Error('ECONNRESET'))
    await expect(reportInstall('p', 'atlas-plugins')).resolves.toBeUndefined()
    expect(postCalls.length).toBe(1)
  })
})

describe('getInstallCounts 市场面取数 + 优雅降级', () => {
  test('请求市场全无 stats 源 = null 且零网络（不显误导性零值）', async () => {
    const res = await getInstallCounts(['some-random-market'])
    expect(res).toBeNull()
    expect(getCalls).toEqual([])
  })

  test('指定自建市场 = 只拉该市场源（单一 GET）+ 落 v2 缓存', async () => {
    getBehavior = async () => ({
      plugins: [{ plugin: 'ascend-generate@atlas-plugins', unique_installs: 42 }],
    })
    const res = await getInstallCounts(['atlas-plugins'])
    expect(getCalls).toEqual([SELF_HOSTED_STATS_URL])
    expect(res?.get('ascend-generate@atlas-plugins')).toBe(42)

    const cache = await readCache()
    expect(cache?.version).toBe(2)
    expect(Object.keys(cache?.entries ?? {})).toEqual([SELF_HOSTED_STATS_URL])
    expect(cache?.entries[SELF_HOSTED_STATS_URL].counts).toEqual([
      { plugin: 'ascend-generate@atlas-plugins', unique_installs: 42 },
    ])
  })

  test('新鲜 v2 缓存命中 = 零网络', async () => {
    const fresh = new Date().toISOString()
    await writeFile(
      join(sandbox, CACHE_FILE),
      JSON.stringify({
        version: 2,
        entries: {
          [SELF_HOSTED_STATS_URL]: {
            fetchedAt: fresh,
            counts: [{ plugin: 'x@atlas-plugins', unique_installs: 7 }],
          },
        },
      }),
      'utf-8',
    )
    const res = await getInstallCounts(['atlas-plugins'])
    expect(getCalls).toEqual([]) // 缓存命中，零网络
    expect(res?.get('x@atlas-plugins')).toBe(7)
  })

  test('过期 v2 条目（>24h）= 重拉', async () => {
    const stale = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
    await writeFile(
      join(sandbox, CACHE_FILE),
      JSON.stringify({
        version: 2,
        entries: {
          [SELF_HOSTED_STATS_URL]: { fetchedAt: stale, counts: [] },
        },
      }),
      'utf-8',
    )
    getBehavior = async () => ({
      plugins: [{ plugin: 'x@atlas-plugins', unique_installs: 9 }],
    })
    const res = await getInstallCounts(['atlas-plugins'])
    expect(getCalls).toEqual([SELF_HOSTED_STATS_URL])
    expect(res?.get('x@atlas-plugins')).toBe(9)
  })

  test('v1 遗留缓存文件（无 entries 面）= 版本不符 → 重拉', async () => {
    await writeFile(
      join(sandbox, CACHE_FILE),
      JSON.stringify({
        version: 1,
        fetchedAt: new Date().toISOString(),
        counts: [],
      }),
      'utf-8',
    )
    getBehavior = async () => ({ plugins: [] })
    const res = await getInstallCounts(['atlas-plugins'])
    expect(getCalls).toEqual([SELF_HOSTED_STATS_URL])
    expect(res).toBeInstanceOf(Map) // 拉取成功（空数据 = 空 Map，UI 不显数）
    expect(res?.size).toBe(0)
  })

  test('单源失败不拖垮其余源（优雅降级：官方挂 → 自建数据仍在）', async () => {
    getBehavior = async url => {
      if (url === OFFICIAL_STATS_URL) {
        throw new Error('ECONNRESET')
      }
      return {
        plugins: [{ plugin: 'y@agent-skills', unique_installs: 3 }],
      }
    }
    const res = await getInstallCounts() // 无参 = 全部注册源
    expect(getCalls.length).toBe(2) // 两源都尝试了
    expect(res?.get('y@agent-skills')).toBe(3) // 存活源数据保留
    // 存活源的缓存落盘，失败源无缓存条目
    const cache = await readCache()
    expect(Object.keys(cache?.entries ?? {})).toEqual([SELF_HOSTED_STATS_URL])
  })

  test('全部源失败 = null（UI 隐藏安装数，不显误导性零值）', async () => {
    getBehavior = () => Promise.reject(new Error('ENOTFOUND'))
    const res = await getInstallCounts()
    expect(res).toBeNull()
    expect(getCalls.length).toBe(2)
  })
})

describe('formatInstallCount 既有行为钉死', () => {
  test('原始值 / K / M 三段', () => {
    expect(formatInstallCount(42)).toBe('42')
    expect(formatInstallCount(999)).toBe('999')
    expect(formatInstallCount(1000)).toBe('1K')
    expect(formatInstallCount(1200)).toBe('1.2K')
    expect(formatInstallCount(1_500_000)).toBe('1.5M')
    expect(formatInstallCount(2_000_000)).toBe('2M')
  })
})
