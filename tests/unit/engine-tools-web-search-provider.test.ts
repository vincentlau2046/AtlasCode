/**
 * G-2（2026-09-30，§8.74.27）：WebSearch 客户端 provider 层
 * （engine/tools/web/webSearchProvider）unit 面——零盘零真网：
 * HTTP 面经 setWebSearchTransportForTesting 缝注入 fixture，key 面经
 * setWebSearchSettingsKeyProvider 注入，env 三键（WEB_SEARCH_PROVIDER /
 * WEB_SEARCH_ENDPOINT / TAVILY_API_KEY）beforeAll/afterAll 隔离。
 *
 *  - 配置面：resolveWebSearchProvider 缺省/切换/覆盖/非法值回落（se2 P-W5
 *    已覆盖，本文件补 endpoint 覆盖双 provider 变体）+ resolveWebSearchApiKey
 *    env 优先 > settings 键供给方。
 *  - bing 面：SERP fixture 成功解析（含 snippet）/ 反爬 0 命中错误支 /
 *    HTTP 非 2xx 错误支 + 切 tavily 指引。
 *  - tavily 面：JSON fixture 成功映射（content 截断）/ 401 错误支 + key
 *    指引 / settings 键回退（env 无 key 时 Bearer 取 settings 值）/
 *    env key 优先（双源并存取 env）。
 *  - 端到端 runWebSearch：成功结果面（tool_use_id 本地生成 + hits 归一）/
 *    域过滤（allowed 端到端）/ abort 信号透传（fixture 读 init.signal）/
 *    错误串结果面（results[0]，B8 语义）。
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  setWebSearchSettingsKeyProvider,
  setWebSearchTransportForTesting,
  resolveWebSearchApiKey,
  resolveWebSearchProvider,
  runWebSearch,
  type WebSearchHttpResponse,
  type WebSearchTransport,
  type WebSearchTransportInit,
} from '../../src/engine/tools'

// ── env 隔离（3 键）───────────────────────────────────────────────────
const ENV_KEYS = ['WEB_SEARCH_PROVIDER', 'WEB_SEARCH_ENDPOINT', 'TAVILY_API_KEY'] as const
const savedEnv: Record<(typeof ENV_KEYS)[number], string | undefined> = {}

beforeAll(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
})

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  setWebSearchTransportForTesting(null)
  setWebSearchSettingsKeyProvider(() => undefined)
})

// ── fixture transport 构造器 ─────────────────────────────────────────

function htmlRes(html: string, status = 200): WebSearchHttpResponse {
  return { ok: status >= 200 && status < 300, status, text: async () => html }
}

function jsonRes(obj: unknown, status = 200): WebSearchHttpResponse {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(obj) }
}

const BING_SERP_FIXTURE =
  '<html><ol id="b_results">' +
  '<li class="b_algo" data-hid="1"><h2><a href="https://docs.example/cann-op" target="_blank">CANN 算子开发 &amp; 调试指南</a></h2><div class="b_caption"><p>Ascend C 算子开发文档 &lt;官方&gt;</p></div></li>' +
  '<li class="b_algo" data-hid="2"><h2><a href="https://example.org/tiling">Tiling 设计</a></h2><p>tiling 摘要</p></li>' +
  '</ol></html>'

const TAVILY_OK_FIXTURE = {
  answer: null,
  results: [
    {
      title: 'Tavily Hit A',
      url: 'https://t.example/a',
      content: 'x'.repeat(600),
      score: 0.9,
    },
    { title: 'Tavily Hit B', url: 'https://t.example/b', content: 'short', score: 0.7 },
    { title: 'no-url-entry', content: 'dropped' },
  ],
}

/** 捕获入参的 fixture transport（断言 URL/headers/body 用）。 */
function captureTransport(res: WebSearchHttpResponse): {
  transport: WebSearchTransport
  calls: { url: string; init?: WebSearchTransportInit }[]
} {
  const calls: { url: string; init?: WebSearchTransportInit }[] = []
  const transport: WebSearchTransport = (url, init) => {
    calls.push({ url, init })
    return Promise.resolve(res)
  }
  return { transport, calls }
}

// ── 配置面 ───────────────────────────────────────────────────────────

describe('G-2 配置面', () => {
  test('endpoint 覆盖对激活 provider 生效（tavily 变体）', () => {
    expect(
      resolveWebSearchProvider({
        WEB_SEARCH_PROVIDER: 'tavily',
        WEB_SEARCH_ENDPOINT: 'https://proxy.example',
      }),
    ).toEqual({ provider: 'tavily', endpoint: 'https://proxy.example' })
  })

  test('resolveWebSearchApiKey：env 优先 > settings 供给方', () => {
    setWebSearchSettingsKeyProvider(() => 'tvly-from-settings')
    try {
      expect(resolveWebSearchApiKey({})).toBe('tvly-from-settings')
      expect(resolveWebSearchApiKey({ TAVILY_API_KEY: 'tvly-from-env' })).toBe('tvly-from-env')
      // env 空白串 → 回落 settings
      expect(resolveWebSearchApiKey({ TAVILY_API_KEY: '   ' })).toBe('tvly-from-settings')
      // settings 缺省 → undefined
      setWebSearchSettingsKeyProvider(() => undefined)
      expect(resolveWebSearchApiKey({})).toBeUndefined()
    } finally {
      setWebSearchSettingsKeyProvider(() => undefined)
    }
  })

  test('resolveWebSearchApiKey：settings 供给方抛错 → undefined（不炸配置链）', () => {
    setWebSearchSettingsKeyProvider(() => {
      throw new Error('settings not ready')
    })
    expect(resolveWebSearchApiKey({})).toBeUndefined()
  })
})

// ── bing 面 ──────────────────────────────────────────────────────────

describe('G-2 bing 面（fixture 回放，零真网）', () => {
  test('成功：SERP 解析 → results[0].content hits（snippet 面）', async () => {
    setWebSearchTransportForTesting(() => Promise.resolve(htmlRes(BING_SERP_FIXTURE)))
    const out = await runWebSearch(
      { query: 'cann op' },
      { abortController: new AbortController() },
    )
    expect(out.query).toBe('cann op')
    expect(out.results).toHaveLength(1)
    const res = out.results[0]
    expect(typeof res).toBe('object')
    const hit = res as { tool_use_id: string; content: { title: string; url: string; snippet?: string }[] }
    expect(hit.tool_use_id.length).toBeGreaterThan(0)
    expect(hit.content).toEqual([
      {
        title: 'CANN 算子开发 & 调试指南',
        url: 'https://docs.example/cann-op',
        snippet: 'Ascend C 算子开发文档 <官方>',
      },
      { title: 'Tiling 设计', url: 'https://example.org/tiling', snippet: 'tiling 摘要' },
    ])
  })

  test('反爬 0 命中 → 错误串结果面 + 切 tavily 指引', async () => {
    setWebSearchTransportForTesting(() =>
      Promise.resolve(htmlRes('<html><body>consent</body></html>')),
    )
    const out = await runWebSearch(
      { query: 'q' },
      { abortController: new AbortController() },
    )
    expect(out.results).toHaveLength(1)
    expect(out.results[0]).toContain('Web search error (bing)')
    expect(out.results[0]).toContain('WEB_SEARCH_PROVIDER=tavily')
  })

  test('HTTP 非 2xx → 错误串结果面（状态码透传）', async () => {
    setWebSearchTransportForTesting(() => Promise.resolve(htmlRes('forbidden', 403)))
    const out = await runWebSearch(
      { query: 'q' },
      { abortController: new AbortController() },
    )
    expect(out.results[0]).toContain('HTTP 403')
  })

  test('endpoint 覆盖生效（WEB_SEARCH_ENDPOINT → 请求 URL）', async () => {
    const { transport, calls } = captureTransport(htmlRes(BING_SERP_FIXTURE))
    setWebSearchTransportForTesting(transport)
    process.env.WEB_SEARCH_ENDPOINT = 'https://serp.example'
    try {
      await runWebSearch({ query: 'a b' }, { abortController: new AbortController() })
      expect(calls).toHaveLength(1)
      expect(calls[0].url).toBe(
        'https://serp.example/search?q=a%20b&count=8',
      )
    } finally {
      delete process.env.WEB_SEARCH_ENDPOINT
    }
  })
})

// ── tavily 面 ────────────────────────────────────────────────────────

describe('G-2 tavily 面（fixture 回放，零真网）', () => {
  test('成功：JSON 映射（content 截 500 / 无 url 条目丢弃）', async () => {
    process.env.WEB_SEARCH_PROVIDER = 'tavily'
    process.env.TAVILY_API_KEY = 'tvly-test'
    setWebSearchTransportForTesting(() => Promise.resolve(jsonRes(TAVILY_OK_FIXTURE)))
    try {
      const out = await runWebSearch(
        { query: 'q' },
        { abortController: new AbortController() },
      )
      const res = out.results[0] as {
        content: { title: string; url: string; snippet?: string }[]
      }
      expect(res.content).toHaveLength(2)
      expect(res.content[0].url).toBe('https://t.example/a')
      expect(res.content[0].snippet).toHaveLength(500)
      expect(res.content[1].snippet).toBe('short')
    } finally {
      delete process.env.WEB_SEARCH_PROVIDER
      delete process.env.TAVILY_API_KEY
    }
  })

  test('请求面：POST /search + Bearer key + body 契约', async () => {
    process.env.WEB_SEARCH_PROVIDER = 'tavily'
    process.env.TAVILY_API_KEY = 'tvly-req'
    const { transport, calls } = captureTransport(jsonRes(TAVILY_OK_FIXTURE))
    setWebSearchTransportForTesting(transport)
    try {
      await runWebSearch({ query: 'web search body' }, { abortController: new AbortController() })
      expect(calls).toHaveLength(1)
      expect(calls[0].url).toBe('https://api.tavily.com/search')
      expect(calls[0].init?.method).toBe('POST')
      expect(calls[0].init?.headers?.Authorization).toBe('Bearer tvly-req')
      expect(JSON.parse(String(calls[0].init?.body))).toEqual({
        query: 'web search body',
        max_results: 8,
        include_answer: false,
      })
    } finally {
      delete process.env.WEB_SEARCH_PROVIDER
      delete process.env.TAVILY_API_KEY
    }
  })

  test('key 回退链：env 无 key 时取 settings 供给方（Bearer 面）', async () => {
    process.env.WEB_SEARCH_PROVIDER = 'tavily'
    setWebSearchSettingsKeyProvider(() => 'tvly-settings')
    const { transport, calls } = captureTransport(jsonRes(TAVILY_OK_FIXTURE))
    setWebSearchTransportForTesting(transport)
    try {
      await runWebSearch({ query: 'q' }, { abortController: new AbortController() })
      expect(calls[0].init?.headers?.Authorization).toBe('Bearer tvly-settings')
    } finally {
      delete process.env.WEB_SEARCH_PROVIDER
      setWebSearchSettingsKeyProvider(() => undefined)
    }
  })

  test('401 → 错误串结果面 + key 指引', async () => {
    process.env.WEB_SEARCH_PROVIDER = 'tavily'
    process.env.TAVILY_API_KEY = 'tvly-bad'
    setWebSearchTransportForTesting(() => Promise.resolve(jsonRes({}, 401)))
    try {
      const out = await runWebSearch(
        { query: 'q' },
        { abortController: new AbortController() },
      )
      expect(out.results[0]).toContain('HTTP 401')
      expect(out.results[0]).toContain('TAVILY_API_KEY')
    } finally {
      delete process.env.WEB_SEARCH_PROVIDER
      delete process.env.TAVILY_API_KEY
    }
  })
})

// ── 端到端面 ─────────────────────────────────────────────────────────

describe('G-2 runWebSearch 端到端面', () => {
  test('allowed_domains 客户端过滤（端到端）', async () => {
    setWebSearchTransportForTesting(() => Promise.resolve(htmlRes(BING_SERP_FIXTURE)))
    const out = await runWebSearch(
      { query: 'q', allowed_domains: ['example.org'] },
      { abortController: new AbortController() },
    )
    const res = out.results[0] as { content: { url: string }[] }
    expect(res.content.map(h => h.url)).toEqual(['https://example.org/tiling'])
  })

  test('abort 信号透传（fixture 读 init.signal.aborted → 抛错 → 错误串面）', async () => {
    const controller = new AbortController()
    controller.abort()
    setWebSearchTransportForTesting((url, init) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new Error('aborted'))
      }
      return Promise.resolve(htmlRes(BING_SERP_FIXTURE))
    })
    const out = await runWebSearch(
      { query: 'q' },
      { abortController: controller },
    )
    expect(out.results[0]).toContain('Web search error (bing)')
    expect(out.results[0]).toContain('aborted')
  })

  test('durationSeconds 面（成功 + 失败双支数值）', async () => {
    setWebSearchTransportForTesting(() => Promise.resolve(htmlRes(BING_SERP_FIXTURE)))
    const ok = await runWebSearch({ query: 'q' }, { abortController: new AbortController() })
    expect(ok.durationSeconds).toBeGreaterThanOrEqual(0)
    setWebSearchTransportForTesting(() => Promise.resolve(htmlRes('consent')))
    const err = await runWebSearch({ query: 'q' }, { abortController: new AbortController() })
    expect(err.durationSeconds).toBeGreaterThanOrEqual(0)
  })
})
