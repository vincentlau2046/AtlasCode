/**
 * 0.1.81 V3-2 K2 #8 判别单测：MCP OAuth 三路径（登录/刷新/登出）带配置
 * headers + headersHelper（纯 unit，零外网；工单
 * `docs/2026-10-25-p0-wave-0181-ticket.md` item 8）。
 *
 * 工单缺口：auth.ts 的 OAuth 请求（metadata discovery / token POST / revoke
 * POST）全部不带 server config 的 headers / headersHelper 动态头 —— 而连接面
 * （transport）已带。改法 = 新 withConfiguredHeaders 包装 FetchLike（合并序
 * = request headers 胜，配置 headers 只加不覆写协议头），三路径注入：
 *  - 登录 performMCPOAuthFlow：metadata fetch 第 4 参 + sdkAuth 两处 fetchFn
 *  - 刷新 ClaudeAuthProvider._doRefresh：authFetch 一次包装覆盖三消费点
 *  - 登出 revokeServerTokens：metadata fetch 第 4 参 + revokeToken extraHeaders
 *
 * 判别（修前红 → 修后绿）：
 *  - withConfiguredHeaders 导出缺席（修前）→ `toBeTypeOf('function')` 红
 *  - sentinel X-Atlas-Probe 出现在三路径的 OAuth 请求头（修前全缺 → 红）
 *  - 合并序：request headers 胜（协议头 Content-Type 不被配置覆写）
 *  - headers 解析失败非致命（passthrough 原引用）；空 headers passthrough
 *
 * 零外网：headersHelper mock.module（恰 2 导出面）+ globalThis.fetch stub
 * （按 URL 分派 metadata/token JSON；127.0.0.1 passthrough 真实 loopback）。
 * 登出面（登出路径）用真实 loopback http server 承接 discovery + axios
 * revoke POST（unit 层先例 6 文件）；刷新面经真实 SDK + stubbed global fetch；
 * 登录面 plain config + skipBrowserOpen + 断言后 abort。
 * 落码裁定（随波补记工单）：XAA 支（xaa.ts）不进本件 scope。
 */
import { describe, test, expect, mock, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const AUTH_SPEC = '../../src/tui/services/mcp/auth.js'
const SENTINEL = { 'X-Atlas-Probe': 'wave0181' }

// ---------------------------------------------------------------------------
// headersHelper mock（完整导出面 = 恰 2 函数；模块级 state 驱动，可变可探测）
// ---------------------------------------------------------------------------
const headersMockState = {
  headers: {} as Record<string, string>,
  shouldThrow: false,
  calls: [] as { serverName: string; hasConfig: boolean }[],
}
mock.module('../../src/tui/services/mcp/headersHelper.js', () => ({
  getMcpHeadersFromHelper: async () => null,
  getMcpServerHeaders: async (serverName: string, config: unknown) => {
    headersMockState.calls.push({ serverName, hasConfig: config !== undefined })
    if (headersMockState.shouldThrow) throw new Error('headersHelper boom')
    return { ...headersMockState.headers }
  },
}))

// ---------------------------------------------------------------------------
// global fetch stub：记录 {url, headers, method} + 按 URL 分派；127.0.0.1
// passthrough 真实 fetch（登出路径 discovery 打 loopback server）。
// ---------------------------------------------------------------------------
const realFetch = (globalThis.fetch as typeof fetch).bind(globalThis)
interface FetchRecord {
  url: string
  headers: Record<string, string>
  method: string
}
let fetchCalls: FetchRecord[] = []

function normalizeHeaders(h: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!h) return out
  if (h instanceof Headers) {
    for (const [k, v] of h.entries()) out[k] = v
    return out
  }
  if (Array.isArray(h)) {
    for (const [k, v] of h as [string, string][]) out[k] = v
    return out
  }
  if (typeof h === 'object') {
    for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
      out[k] = String(v)
    }
  }
  return out
}

function getHeader(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v
  }
  return undefined
}

const AUTH_SERVER_METADATA = {
  issuer: 'https://as.example.com',
  authorization_endpoint: 'https://as.example.com/authorize',
  token_endpoint: 'https://as.example.com/token',
  revocation_endpoint: 'https://as.example.com/revoke',
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['client_secret_basic', 'none'],
}

const TOKEN_RESPONSE = {
  access_token: 'a2',
  refresh_token: 'r2',
  token_type: 'Bearer',
  expires_in: 3600,
}

function installFetchStub() {
  fetchCalls = []
  globalThis.fetch = (async (input: any, init?: any) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : String(input?.url ?? input)
    const headers = normalizeHeaders(init?.headers ?? input?.headers)
    const method = String(init?.method ?? input?.method ?? 'GET').toUpperCase()
    fetchCalls.push({ url, headers, method })
    // loopback passthrough 必须最先判（登出 discovery 的 127.0.0.1 URL 也含
    // .well-known 子串，不能被远程分派截走）。
    if (url.startsWith('http://127.0.0.1')) return realFetch(input, init)
    if (url.includes('.well-known/oauth-authorization-server')) {
      return new Response(JSON.stringify(AUTH_SERVER_METADATA), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.includes('/token')) {
      return new Response(JSON.stringify(TOKEN_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
}

async function waitUntil(cond: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil timeout')
    await new Promise(r => setTimeout(r, 10))
  }
}

// ---------------------------------------------------------------------------
// 环境隔离：单文件单一 temp ATLAS_CONFIG_DIR（getSecureStorage 可能 memoize，
// beforeAll 一次设定供全文件；serverKey 按 config 区分互不污染）。
// ---------------------------------------------------------------------------
let cfgDir: string
let savedCfgDir: string | undefined

beforeAll(() => {
  cfgDir = mkdtempSync(join(tmpdir(), 'atlas-0181-oauth-'))
  savedCfgDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = cfgDir
})

afterAll(() => {
  if (savedCfgDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = savedCfgDir
  rmSync(cfgDir, { recursive: true, force: true })
})

beforeEach(() => {
  headersMockState.headers = {}
  headersMockState.shouldThrow = false
  headersMockState.calls = []
  installFetchStub()
})

afterEach(() => {
  globalThis.fetch = realFetch as typeof fetch
})

/** 种子：saveClientInformation 补 clientId/clientSecret（saveTokens 不写）+
 * saveTokens expires_in: -60（负值 truthy 不落 3600 fallback → expiresAt
 * 在过去，避开 refreshAuthorization 的 >300s 缓存短路）。 */
async function seedProviderStorage(serverName: string, serverConfig: unknown) {
  const { ClaudeAuthProvider } = await import(AUTH_SPEC)
  const provider = new (ClaudeAuthProvider as new (
    ...args: unknown[]
  ) => any)(serverName, serverConfig)
  await provider.saveClientInformation({
    client_id: 'wave0181-client',
    client_secret: 'wave0181-secret',
  } as never)
  await provider.saveTokens({
    access_token: 'a1',
    refresh_token: 'r1',
    token_type: 'Bearer',
    expires_in: -60,
  } as never)
}

describe('K2 #8 纯 helper 面：withConfiguredHeaders', () => {
  const serverConfig = {
    type: 'http',
    url: 'https://mcp.example.com/mcp',
  }

  function makeRecordingFetch() {
    const seen: { url: string; headers: Record<string, string> }[] = []
    const fn = async (url: unknown, init?: { headers?: unknown }) => {
      seen.push({ url: String(url), headers: normalizeHeaders(init?.headers) })
      return new Response('{}', { status: 200 })
    }
    return { fn, seen }
  }

  test('导出在场 + sentinel 注入 + 合并序 = request headers 胜（协议头不覆写）', async () => {
    const auth = (await import(AUTH_SPEC)) as Record<string, unknown>
    const withConfiguredHeaders = auth.withConfiguredHeaders as
      | ((fetchLike: unknown, serverName: string, serverConfig: unknown) => Promise<unknown>)
      | undefined
    expect(withConfiguredHeaders, 'withConfiguredHeaders 导出缺席（修前红）').toBeTypeOf('function')

    headersMockState.headers = { ...SENTINEL, 'Content-Type': 'config-ct' }
    const { fn, seen } = makeRecordingFetch()
    const wrapped = (await withConfiguredHeaders!(fn, 'wave0181-helper', serverConfig)) as (
      url: unknown,
      init?: { method?: string; headers?: Record<string, string> }
    ) => Promise<unknown>
    expect(wrapped, '非空配置 headers 必须包一层').not.toBe(fn)
    await wrapped('https://as.example.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'req-ct', Accept: 'application/json' },
    })
    expect(seen[0]!.headers['X-Atlas-Probe']).toBe('wave0181')
    // 落码裁定①：合并序 = request headers 胜（SDK 协议头不被配置覆写）
    expect(seen[0]!.headers['Content-Type']).toBe('req-ct')
    expect(seen[0]!.headers.Accept).toBe('application/json')
  })

  test('headersHelper 解析失败非致命（落码裁定③）：passthrough 原引用', async () => {
    const auth = (await import(AUTH_SPEC)) as Record<string, unknown>
    const withConfiguredHeaders = auth.withConfiguredHeaders as (
      fetchLike: unknown,
      serverName: string,
      serverConfig: unknown,
    ) => Promise<unknown>
    headersMockState.shouldThrow = true
    const { fn } = makeRecordingFetch()
    const wrapped = await withConfiguredHeaders(fn, 'wave0181-helper', serverConfig)
    expect(wrapped, '解析失败必须返回原 fetchLike 引用（OAuth 流照走）').toBe(fn)
  })

  test('空配置 headers = passthrough 原引用（不包空层）', async () => {
    const auth = (await import(AUTH_SPEC)) as Record<string, unknown>
    const withConfiguredHeaders = auth.withConfiguredHeaders as (
      fetchLike: unknown,
      serverName: string,
      serverConfig: unknown,
    ) => Promise<unknown>
    headersMockState.headers = {}
    const { fn } = makeRecordingFetch()
    const wrapped = await withConfiguredHeaders(fn, 'wave0181-helper', serverConfig)
    expect(wrapped).toBe(fn)
  })
})

describe('K2 #8 刷新路径：refreshAuthorization token POST 带配置 headers', () => {
  test('configuredMetadataUrl 分支 → POST /token 头含 sentinel + Content-Type + Basic', async () => {
    headersMockState.headers = { ...SENTINEL }
    const serverConfig = {
      type: 'http',
      url: 'https://mcp.example.com/mcp',
      oauth: {
        authServerMetadataUrl: 'https://as.example.com/.well-known/oauth-authorization-server',
      },
    }
    await seedProviderStorage('wave0181-refresh', serverConfig)
    const { ClaudeAuthProvider } = await import(AUTH_SPEC)
    const provider = new (ClaudeAuthProvider as new (
      ...args: unknown[]
    ) => any)('wave0181-refresh', serverConfig)
    const tokens = await provider.refreshAuthorization('r1')
    expect((tokens as { access_token?: string })?.access_token).toBe('a2')

    const tokenPost = fetchCalls.find(
      c => c.url.includes('/token') && c.method === 'POST',
    )
    expect(tokenPost, 'token POST 未发生（刷新链未走通）').toBeDefined()
    expect(getHeader(tokenPost!.headers, 'X-Atlas-Probe')).toBe('wave0181')
    expect(getHeader(tokenPost!.headers, 'Content-Type')).toContain(
      'application/x-www-form-urlencoded',
    )
    expect(getHeader(tokenPost!.headers, 'Authorization')).toMatch(/^Basic /)
  })
})

describe('K2 #8 登出路径：revokeServerTokens revoke POST 带配置 headers', () => {
  test('loopback discovery + axios revoke POST 头含 sentinel + Content-Type', async () => {
    headersMockState.headers = { ...SENTINEL }
    interface LoopbackRecord {
      url: string
      headers: Record<string, string>
      method: string
    }
    const recorded: LoopbackRecord[] = []
    let port = 0
    const server: Server = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString()
      })
      req.on('end', () => {
        const url = req.url ?? ''
        recorded.push({
          url,
          headers: { ...(req.headers as Record<string, string>) },
          method: req.method ?? '',
        })
        if (url.includes('.well-known/oauth-protected-resource')) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(
            JSON.stringify({
              resource: `http://127.0.0.1:${port}/mcp`,
              authorization_servers: [`http://127.0.0.1:${port}`],
            }),
          )
        } else if (url.includes('.well-known/oauth-authorization-server')) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(
            JSON.stringify({
              issuer: `http://127.0.0.1:${port}`,
              authorization_endpoint: `http://127.0.0.1:${port}/authorize`,
              token_endpoint: `http://127.0.0.1:${port}/token`,
              revocation_endpoint: `http://127.0.0.1:${port}/revoke`,
              response_types_supported: ['code'],
              grant_types_supported: ['authorization_code', 'refresh_token'],
              code_challenge_methods_supported: ['S256'],
              token_endpoint_auth_methods_supported: ['client_secret_basic', 'none'],
            }),
          )
        } else if (url.includes('/revoke')) {
          res.writeHead(200)
          res.end()
        } else {
          res.writeHead(404)
          res.end()
        }
      })
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    port = (server.address() as AddressInfo).port
    try {
      // saveTokens 不写 discoveryState → asUrl 回落 serverConfig.url（loopback）
      const serverConfig = { type: 'http', url: `http://127.0.0.1:${port}/mcp` }
      await seedProviderStorage('wave0181-logout', serverConfig)
      const { revokeServerTokens } = await import(AUTH_SPEC)
      await (revokeServerTokens as (n: string, c: unknown) => Promise<void>)(
        'wave0181-logout',
        serverConfig,
      )

      const revokeReq = recorded.find(r => r.url.includes('/revoke'))
      expect(revokeReq, 'revoke POST 未到达 loopback（登出链未走通）').toBeDefined()
      expect(getHeader(revokeReq!.headers, 'x-atlas-probe')).toBe('wave0181')
      expect(getHeader(revokeReq!.headers, 'content-type')).toContain(
        'application/x-www-form-urlencoded',
      )
      // 次断言：discovery GET（fetch 面）也带 sentinel（落码裁定④）
      const discovery = fetchCalls.find(c =>
        c.url.includes('.well-known/oauth-protected-resource'),
      )
      expect(discovery, 'PRM discovery 未发生').toBeDefined()
      expect(getHeader(discovery!.headers, 'X-Atlas-Probe')).toBe('wave0181')
    } finally {
      await new Promise<void>(r => server.close(() => r()))
    }
  })
})

describe('K2 #8 登录路径：performMCPOAuthFlow metadata fetch 带配置 headers', () => {
  test('plain config（oauth 无 scope → display gate 恒过）→ metadata fetch 头含 sentinel', async () => {
    headersMockState.headers = { ...SENTINEL }
    const serverConfig = {
      type: 'http',
      url: 'https://mcp.example.com/mcp',
      oauth: {
        authServerMetadataUrl: 'https://as.example.com/.well-known/oauth-authorization-server',
      },
    }
    const auth = (await import(AUTH_SPEC)) as {
      performMCPOAuthFlow: (
        serverName: string,
        serverConfig: unknown,
        onAuthorizationUrl: (url: string) => void,
        abortSignal?: AbortSignal,
        options?: { skipBrowserOpen?: boolean },
      ) => Promise<void>
    }
    const controller = new AbortController()
    const flowPromise = auth.performMCPOAuthFlow(
      'wave0181-login',
      serverConfig,
      () => {},
      controller.signal,
      { skipBrowserOpen: true },
    )
    // 防未处理 rejection（流程可能在断言前就因缺 registration endpoint 拒绝）
    flowPromise.catch(() => {})
    try {
      await waitUntil(() => fetchCalls.some(c => c.url.includes('as.example.com')))
      const metadataCall = fetchCalls.find(c =>
        c.url.includes('.well-known/oauth-authorization-server'),
      )
      expect(metadataCall, 'metadata fetch 未发生（登录链未走通）').toBeDefined()
      expect(getHeader(metadataCall!.headers, 'X-Atlas-Probe')).toBe('wave0181')
    } finally {
      controller.abort()
      await flowPromise.catch(() => {})
    }
  })
})
