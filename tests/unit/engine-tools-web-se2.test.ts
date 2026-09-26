/**
 * engine/tools/web S-E2（§8.59 web 族子波）：WebFetch / WebSearch 两本体
 * unit 面（零盘零真网——HTTP 面经 setWebFetchTransportForTesting 缝注入
 * fixture，model 面 func 层）。
 *
 *  - P-W1 对象面：两本体 name（toolNames 单一事实源同值）/ JSON schema
 *    常量字段转写（required 双字段 / query minLength 2 + domains 双可选
 *    array）/ TOOL_DEFAULTS 逐值（maxResultSizeChars 100_000 / shouldDefer /
 *    strict / isReadOnly / isConcurrencySafe / isDestructive / isEnabled）/
 *    searchHint / userFacingName / toAutoClassifierInput（prompt 有值拼接
 *    双态）/ extractSearchText ''（WebSearch 幻影守卫）。
 *  - P-W2 validateInput：WebFetch ec1 非法 URL 文案逐字 + 合法直通 /
 *    WebSearch ec1 空 query + ec2 双 domains 互斥 + 单域直通。
 *  - P-W3 checkPermissions 真规则面：preapproved host 短路 allow（
 *    decisionReason other 'Preapproved host'）/ deny 规则（
 *    WebFetch(domain:…) 串）→ deny 文案 / ask 规则 → ask + suggestions /
 *    allow 规则 → allow / 无规则 fallback ask + suggestions（addRules
 *    localSettings domain:… 面）/ WebSearch 恒 passthrough + 无
 *    ruleContent 建议面。
 *  - P-W4 rule-content 函数：合法 input → domain:hostname / zod 解析失败
 *    → input: 回退面（逐字 input.toString()）。
 *  - P-W5 makeToolSchema：type/name 字面 + max_uses 8 硬编 + domains 双
 *    透传（undefined 透传）。
 *  - P-W6 makeOutputFromSearchResponse：三块型流解析（text 累积 /
 *    server_tool_use flush / web_search_tool_result array hits / error_code
 *    错误支 / 尾部 trim）。
 *  - P-W7 prompt 面：makeSecondaryModelPrompt 双变体（preapproved 简版 /
 *    非 preapproved 125-char 引用限 + not-a-lawyer 指南）+ getWebFetchToolPrompt
 *    auth-warning 前缀恒含 + getWebSearchPrompt Sources 强制段 + 月年模板
 *    （ATLAS_OVERRIDE_DATE 确定性面）+ 2 短 description 值锚点（不接线）。
 *  - P-W8 URL 工具纯面：validateURL 5 支 / isPermittedRedirect 6 支 /
 *    isPreapprovedHost 段边界（hostname-only / 前缀段 / 前缀段反例 /
 *    异 host）/ isPreapprovedUrl 双态 / isBinaryContentType 8 支 /
 *    extensionForMimeType（charset 剥离 + 未知 → bin）。
 *  - P-W9 重定向管线面（transport 缝注入，零真网）：跨域 3xx →
 *    RedirectInfo（statusCode 4 值透传）/ 同域 3xx 递归跟随 /
 *    MAX_REDIRECTS 环守卫 'Too many loops (exceeded 10)' / 403
 *    x-proxy-error → EgressBlockedError（消息 JSON 面）/ 非代理 403 →
 *    状态码文案 / content-length 超限守卫 / blocklist 预检 fail-open
 *    （env 未设）+ env 已设 can_fetch 双支（缓存命中 transport 零再调）。
 *  - P-W10 mapToolResult 两工具（WebFetch 透传 content / WebSearch
 *    Links + No links + REMINDER + null 条目跳过 + trim）+
 *    renderToolUseMessage 两工具字符串面（verbose 双态 / 缺参 null）。
 *
 * 深度 import（门面归集）：../../src/engine/tools（两本体 + schema 2 +
 * prompt 面 + URL 管线 + 测试缝 + duck 型）。
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test'
import {
  clearWebFetchCache,
  EgressBlockedError,
  isBinaryContentType,
  isPermittedRedirect,
  isPreapprovedHost,
  isPreapprovedUrl,
  makeOutputFromSearchResponse,
  makeSecondaryModelPrompt,
  makeToolSchema,
  WebFetchTool,
  WEB_FETCH_TOOL_NAME,
  webFetchShortDescription,
  webFetchToolInputToPermissionRuleContent,
  WebSearchTool,
  WEB_SEARCH_TOOL_NAME,
  webSearchShortDescription,
  getLocalMonthYear,
  getURLMarkdownContent,
  getWebFetchToolPrompt,
  getWebSearchPrompt,
  getWithPermittedRedirects,
  setWebFetchTransportForTesting,
  WEB_FETCH_TOOL_INPUT_SCHEMA,
  WEB_SEARCH_TOOL_INPUT_SCHEMA,
  extensionForMimeType,
  validateURL,
  type WebFetchHttpResponse,
  type WebFetchTransport,
} from '../../src/engine/tools'
import type { ToolPermissionContext } from '../../src/shared'

// ── 公共夹具（SC4 core-face 同形）────────────────────────────────────────

function makeCtx(
  rules?: {
    allow?: Partial<ToolPermissionContext['alwaysAllowRules']>
    deny?: Partial<ToolPermissionContext['alwaysDenyRules']>
    ask?: Partial<ToolPermissionContext['alwaysAskRules']>
  },
): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: rules?.allow ?? {},
    alwaysDenyRules: rules?.deny ?? {},
    alwaysAskRules: rules?.ask ?? {},
    isBypassPermissionsModeAvailable: true,
  }
}

function makeWebFetchCtx(ctx: ToolPermissionContext) {
  return {
    getAppState: () => ({ toolPermissionContext: ctx }),
    abortController: new AbortController(),
    options: { isNonInteractiveSession: false },
  }
}

function makeWebSearchCtx(ctx: ToolPermissionContext) {
  return {
    getAppState: () => ({ toolPermissionContext: ctx, effortValue: undefined }),
    abortController: new AbortController(),
    options: {},
  }
}

// transport 缝 fixture 构造（headers duck 最小实现）
function headersOf(map: Record<string, string>) {
  const lower: Record<string, string> = {}
  for (const [k, v] of Object.entries(map)) lower[k.toLowerCase()] = v
  return {
    get: (name: string) => lower[name.toLowerCase()] ?? null,
    forEach: (cb: (value: string, key: string) => void) => {
      for (const [k, v] of Object.entries(lower)) cb(v, k)
    },
  }
}

function redirectResponse(
  status: number,
  location: string,
  extraHeaders: Record<string, string> = {},
): WebFetchHttpResponse {
  return {
    status,
    statusText: 'REDIRECT',
    ok: false,
    headers: headersOf({ location, ...extraHeaders }),
    arrayBuffer: async () => new ArrayBuffer(0),
    json: async () => ({}),
  }
}

// blocklist 预检 env 面隔离（fail-open 语义测试确定性）
const DOMAIN_CHECK_ENV_KEY = 'ATLAS_WEB_DOMAIN_CHECK_URL'
let savedDomainCheckEnv: string | undefined
beforeAll(() => {
  savedDomainCheckEnv = process.env[DOMAIN_CHECK_ENV_KEY]
  delete process.env[DOMAIN_CHECK_ENV_KEY]
})
afterAll(() => {
  if (savedDomainCheckEnv === undefined) {
    delete process.env[DOMAIN_CHECK_ENV_KEY]
  } else {
    process.env[DOMAIN_CHECK_ENV_KEY] = savedDomainCheckEnv
  }
  setWebFetchTransportForTesting(null)
})

describe('P-W1 对象面（shared Tool 契约纯对象）', () => {
  test('WebFetchTool 对象 12 成员逐值', () => {
    expect(WebFetchTool.name).toBe(WEB_FETCH_TOOL_NAME)
    expect(WEB_FETCH_TOOL_NAME).toBe('WebFetch')
    expect(WebFetchTool.maxResultSizeChars).toBe(100_000)
    expect(WebFetchTool.shouldDefer).toBe(true)
    expect(WebFetchTool.strict).toBe(true)
    expect(WebFetchTool.isConcurrencySafe(undefined)).toBe(true)
    expect(WebFetchTool.isReadOnly(undefined)).toBe(true)
    expect(WebFetchTool.isDestructive?.(undefined)).toBe(false)
    expect(WebFetchTool.isEnabled()).toBe(true)
    expect(WebFetchTool.userFacingName(undefined)).toBe('Fetch')
    expect(WebFetchTool.searchHint).toBe('fetch and extract content from a URL')
    const input = { url: 'https://a.example/', prompt: 'summarize' }
    expect(WebFetchTool.toAutoClassifierInput(input)).toBe(
      'https://a.example/: summarize',
    )
    expect(WebFetchTool.toAutoClassifierInput({ url: 'https://a.example/' }))
      .toBe('https://a.example/')
  })

  test('WebSearchTool 对象面 + extractSearchText 幻影守卫', () => {
    expect(WebSearchTool.name).toBe(WEB_SEARCH_TOOL_NAME)
    expect(WEB_SEARCH_TOOL_NAME).toBe('WebSearch')
    expect(WebSearchTool.maxResultSizeChars).toBe(100_000)
    expect(WebSearchTool.shouldDefer).toBe(true)
    expect(WebSearchTool.strict).toBe(true)
    expect(WebSearchTool.isConcurrencySafe(undefined)).toBe(true)
    expect(WebSearchTool.isReadOnly(undefined)).toBe(true)
    expect(WebSearchTool.isEnabled()).toBe(true)
    expect(WebSearchTool.userFacingName(undefined)).toBe('Web Search')
    expect(WebSearchTool.searchHint).toBe(
      'search the web for current information',
    )
    expect(
      WebSearchTool.toAutoClassifierInput({ query: 'ascend operator' }),
    ).toBe('ascend operator')
    expect(WebSearchTool.extractSearchText?.({})).toBe('')
  })

  test('JSON schema 常量字段转写面', () => {
    expect(WEB_FETCH_TOOL_INPUT_SCHEMA.type).toBe('object')
    expect(WEB_FETCH_TOOL_INPUT_SCHEMA.required).toEqual(['url', 'prompt'])
    expect(
      (WEB_FETCH_TOOL_INPUT_SCHEMA.properties?.url as { type: string }).type,
    ).toBe('string')
    expect(WEB_SEARCH_TOOL_INPUT_SCHEMA.type).toBe('object')
    expect(WEB_SEARCH_TOOL_INPUT_SCHEMA.required).toEqual(['query'])
    const query = WEB_SEARCH_TOOL_INPUT_SCHEMA.properties?.query as {
      minLength?: number
    }
    expect(query.minLength).toBe(2)
    const allowed = WEB_SEARCH_TOOL_INPUT_SCHEMA.properties
      ?.allowed_domains as { items?: { type: string } }
    expect(allowed.items?.type).toBe('string')
  })
})

describe('P-W2 validateInput', () => {
  test('WebFetch ec1 非法 URL 文案逐字 + 合法直通', async () => {
    const bad = await WebFetchTool.validateInput!(
      { url: 'not a url', prompt: 'p' },
      undefined,
    )
    expect(bad).toEqual({
      result: false,
      message: 'Error: Invalid URL "not a url". The URL provided could not be parsed.',
      errorCode: 1,
    })
    const ok = await WebFetchTool.validateInput!(
      { url: 'https://example.com/x', prompt: 'p' },
      undefined,
    )
    expect(ok).toEqual({ result: true })
  })

  test('WebSearch ec1 空 query / ec2 双域互斥 / 单域直通', async () => {
    const ec1 = await WebSearchTool.validateInput!(
      { query: '' },
      undefined,
    )
    expect(ec1).toEqual({
      result: false,
      message: 'Error: Missing query',
      errorCode: 1,
    })
    const ec2 = await WebSearchTool.validateInput!(
      { query: 'q', allowed_domains: ['a.com'], blocked_domains: ['b.com'] },
      undefined,
    )
    expect(ec2).toEqual({
      result: false,
      message:
        'Error: Cannot specify both allowed_domains and blocked_domains in the same request',
      errorCode: 2,
    })
    const ok = await WebSearchTool.validateInput!(
      { query: 'q', allowed_domains: ['a.com'] },
      undefined,
    )
    expect(ok).toEqual({ result: true })
  })
})

describe('P-W3 checkPermissions 真规则面', () => {
  test('preapproved host 短路 allow（决策理由 other）', async () => {
    const res = await WebFetchTool.checkPermissions(
      { url: 'https://developer.mozilla.org/docs', prompt: 'p' },
      makeWebFetchCtx(makeCtx()),
    )
    expect(res.behavior).toBe('allow')
    expect(
      (
        res as {
          decisionReason?: { type: string; reason?: string }
        }
      ).decisionReason,
    ).toEqual({ type: 'other', reason: 'Preapproved host' })
  })

  test('deny 规则（domain:… 串）→ deny 文案逐字', async () => {
    const res = await WebFetchTool.checkPermissions(
      { url: 'https://example.com/a', prompt: 'p' },
      makeWebFetchCtx(
        makeCtx({ deny: { session: ['WebFetch(domain:example.com)'] } }),
      ),
    )
    expect(res.behavior).toBe('deny')
    expect(
      (res as { message?: string }).message,
    ).toBe('WebFetch denied access to domain:example.com.')
  })

  test('ask 规则 → ask + suggestions / 无规则 fallback ask 双态同面', async () => {
    const askRule = await WebFetchTool.checkPermissions(
      { url: 'https://example.org/b', prompt: 'p' },
      makeWebFetchCtx(
        makeCtx({ ask: { session: ['WebFetch(domain:example.org)'] } }),
      ),
    )
    expect(askRule.behavior).toBe('ask')
    expect(
      (
        askRule as {
          suggestions?: Array<{
            type: string
            destination: string
            rules: Array<{ toolName: string; ruleContent?: string }>
            behavior: string
          }>
        }
      ).suggestions,
    ).toEqual([
      {
        type: 'addRules',
        destination: 'localSettings',
        rules: [{ toolName: 'WebFetch', ruleContent: 'domain:example.org' }],
        behavior: 'allow',
      },
    ])
    const fallback = await WebFetchTool.checkPermissions(
      { url: 'https://example.net/c', prompt: 'p' },
      makeWebFetchCtx(makeCtx()),
    )
    expect(fallback.behavior).toBe('ask')
    expect(
      (fallback as { message?: string }).message,
    ).toBe(
      'Claude requested permissions to use WebFetch, but you haven\'t granted it yet.',
    )
  })

  test('allow 规则 → allow（updatedInput 回传）', async () => {
    const input = { url: 'https://example.io/d', prompt: 'p' }
    const res = await WebFetchTool.checkPermissions(
      input,
      makeWebFetchCtx(
        makeCtx({ allow: { session: ['WebFetch(domain:example.io)'] } }),
      ),
    )
    expect(res.behavior).toBe('allow')
    expect(
      (res as { updatedInput?: unknown }).updatedInput,
    ).toEqual(input)
  })

  test('WebSearch 恒 passthrough + 无 ruleContent 建议面', async () => {
    const res = await WebSearchTool.checkPermissions(
      { query: 'q' },
      makeWebSearchCtx(makeCtx()),
    )
    expect(res.behavior).toBe('passthrough')
    expect((res as { message: string }).message).toBe(
      'WebSearchTool requires permission.',
    )
    expect(
      (
        res as {
          suggestions?: Array<{
            type: string
            rules: Array<{ toolName: string }>
            behavior: string
            destination: string
          }>
        }
      ).suggestions,
    ).toEqual([
      {
        type: 'addRules',
        rules: [{ toolName: 'WebSearch' }],
        behavior: 'allow',
        destination: 'localSettings',
      },
    ])
  })
})

describe('P-W4 rule-content 函数', () => {
  test('合法 input → domain:hostname / 解析失败 → input: 回退', () => {
    expect(
      webFetchToolInputToPermissionRuleContent({
        url: 'https://sub.example.com/x',
        prompt: 'p',
      }),
    ).toBe('domain:sub.example.com')
    const degenerate = webFetchToolInputToPermissionRuleContent({
      url: 'not-a-url',
      prompt: 'p',
    })
    expect(degenerate.startsWith('input:')).toBe(true)
  })
})

describe('P-W5 makeToolSchema wire 面', () => {
  test('type/name 字面 + max_uses 8 硬编 + domains 双透传', () => {
    const full = makeToolSchema({
      query: 'q',
      allowed_domains: ['a.com'],
      blocked_domains: undefined,
    })
    expect(full).toEqual({
      type: 'web_search_20250305',
      name: 'web_search',
      allowed_domains: ['a.com'],
      blocked_domains: undefined,
      max_uses: 8,
    })
    expect(makeToolSchema({ query: 'q' }).max_uses).toBe(8)
  })
})

describe('P-W6 makeOutputFromSearchResponse 三块型流解析', () => {
  test('成功流：hits 归一 + text 累积 + 尾部 trim', () => {
    const out = makeOutputFromSearchResponse(
      [
        { type: 'text', text: 'intro commentary ' },
        { type: 'server_tool_use' },
        {
          type: 'web_search_tool_result',
          tool_use_id: 't1',
          content: [
            { title: 'T1', url: 'https://a.example' },
            { title: 'T2', url: 'https://b.example' },
          ],
        },
        { type: 'text', text: ' mid ' },
        { type: 'text', text: 'tail' },
      ],
      'my query',
      0.5,
    )
    expect(out.query).toBe('my query')
    expect(out.durationSeconds).toBe(0.5)
    expect(out.results).toEqual([
      'intro commentary',
      {
        tool_use_id: 't1',
        content: [
          { title: 'T1', url: 'https://a.example' },
          { title: 'T2', url: 'https://b.example' },
        ],
      },
      // 尾部 textAcc 恒 trim（makeOutputFromSearchResponse 末行面）
      'mid tail',
    ])
  })

  test('错误支：error_code → 字符串结果面', () => {
    const out = makeOutputFromSearchResponse(
      [
        {
          type: 'web_search_tool_result',
          tool_use_id: 't2',
          content: { error_code: 'rate_limited' },
        },
      ],
      'q',
      0.1,
    )
    expect(out.results).toEqual(['Web search error: rate_limited'])
  })
})

describe('P-W7 prompt 面', () => {
  test('makeSecondaryModelPrompt 双变体', () => {
    const pre = makeSecondaryModelPrompt('PAGE', 'What is X?', true)
    expect(pre).toContain('Web page content:')
    expect(pre).toContain('---\nPAGE\n---')
    expect(pre).toContain('Provide a concise response based on the content above.')
    expect(pre).not.toContain('125-character')

    const strict = makeSecondaryModelPrompt('PAGE', 'What is X?', false)
    expect(strict).toContain('based only on the content above')
    expect(strict).toContain('125-character maximum for quotes')
    expect(strict).toContain('not a lawyer')
    expect(strict).toContain('Never produce or reproduce exact song lyrics')
  })

  test('getWebFetchToolPrompt auth-warning 前缀恒含', () => {
    const prompt = getWebFetchToolPrompt()
    expect(prompt.startsWith('IMPORTANT: WebFetch WILL FAIL for authenticated or private URLs.')).toBe(
      true,
    )
    expect(prompt).toContain('- Fetches content from a specified URL and processes it using an AI model')
    expect(prompt).toContain(
      'For GitHub URLs, prefer using the gh CLI via Bash instead',
    )
  })

  test('getWebSearchPrompt Sources 强制段 + 月年模板（env 确定性面）', () => {
    const saved = process.env.ATLAS_OVERRIDE_DATE
    try {
      process.env.ATLAS_OVERRIDE_DATE = '2026-02-10'
      expect(getLocalMonthYear()).toBe('February 2026')
      const prompt = getWebSearchPrompt()
      expect(prompt).toContain('you MUST include a "Sources:" section')
      expect(prompt).toContain('MANDATORY - never skip including sources')
      expect(prompt).toContain('Web search is only available in the US')
      expect(prompt).toContain('The current month is February 2026')
    } finally {
      if (saved === undefined) delete process.env.ATLAS_OVERRIDE_DATE
      else process.env.ATLAS_OVERRIDE_DATE = saved
    }
  })

  test('2 短 description 值锚点（TUI 波不接线）', () => {
    expect(webFetchShortDescription({ url: 'https://h.example/p' })).toBe(
      'Claude wants to fetch content from h.example',
    )
    expect(webFetchShortDescription({ url: 'garbage' })).toBe(
      'Claude wants to fetch content from this URL',
    )
    expect(webSearchShortDescription({ query: 'cann op' })).toBe(
      'Claude wants to search the web for: cann op',
    )
  })

  test('description() 面 = prompt 面同一性（新契约唯一 prompt 面）', async () => {
    expect(await WebFetchTool.description(undefined, {})).toBe(
      getWebFetchToolPrompt(),
    )
    expect(await WebSearchTool.description(undefined, {})).toBe(
      getWebSearchPrompt(),
    )
  })
})

describe('P-W8 URL 工具纯面', () => {
  test('validateURL 5 支', () => {
    expect(validateURL('https://example.com/a')).toBe(true)
    expect(validateURL(`https://example.com/${'a'.repeat(2000)}`)).toBe(
      false,
    )
    expect(validateURL('garbage://')).toBe(false)
    expect(validateURL('https://user:pass@example.com/')).toBe(false)
    expect(validateURL('https://localhost')).toBe(false)
  })

  test('isPermittedRedirect 6 支', () => {
    // 加/去 www + 路径变（同 origin 语义）
    expect(
      isPermittedRedirect('https://example.com/a', 'https://www.example.com/b?x=1'),
    ).toBe(true)
    expect(
      isPermittedRedirect('https://www.example.com/a', 'https://example.com/c'),
    ).toBe(true)
    expect(isPermittedRedirect('https://example.com/a', 'https://other.com/a')).toBe(
      false,
    )
    expect(
      isPermittedRedirect('https://example.com/a', 'http://example.com/a'),
    ).toBe(false)
    expect(
      isPermittedRedirect('https://example.com/a', 'https://example.com:8443/a'),
    ).toBe(false)
    expect(
      isPermittedRedirect('https://example.com/a', 'https://u:p@example.com/a'),
    ).toBe(false)
  })

  test('isPreapprovedHost 段边界 + isPreapprovedUrl 双态', () => {
    expect(isPreapprovedHost('developer.mozilla.org', '/')).toBe(true)
    expect(isPreapprovedHost('github.com', '/anthropics')).toBe(true)
    expect(isPreapprovedHost('github.com', '/anthropics/mcp')).toBe(true)
    // 段边界反例：前缀段不得吃 "-evil" 后缀
    expect(isPreapprovedHost('github.com', '/anthropics-evil/malware')).toBe(
      false,
    )
    expect(isPreapprovedHost('github.com', '/other')).toBe(false)
    expect(isPreapprovedUrl('https://vercel.com/docs/intro')).toBe(true)
    expect(isPreapprovedUrl('https://vercel.com/pricing')).toBe(false)
    expect(isPreapprovedUrl('garbage')).toBe(false)
  })

  test('isBinaryContentType 8 支', () => {
    expect(isBinaryContentType('text/html')).toBe(false)
    expect(isBinaryContentType('application/json')).toBe(false)
    expect(isBinaryContentType('application/vnd.api+json')).toBe(false)
    expect(isBinaryContentType('application/xml')).toBe(false)
    expect(isBinaryContentType('application/javascript')).toBe(false)
    expect(isBinaryContentType('application/x-www-form-urlencoded')).toBe(false)
    expect(isBinaryContentType('application/pdf')).toBe(true)
    expect(isBinaryContentType('application/octet-stream')).toBe(true)
    expect(isBinaryContentType('')).toBe(false)
  })

  test('extensionForMimeType（charset 剥离 + 未知 → bin）', () => {
    expect(extensionForMimeType('application/pdf; charset=binary')).toBe('pdf')
    expect(extensionForMimeType('image/PNG')).toBe('png')
    expect(extensionForMimeType(undefined)).toBe('bin')
    expect(extensionForMimeType('application/x-unknown')).toBe('bin')
  })
})

describe('P-W9 重定向管线面（transport 缝注入，零真网）', () => {
  test('跨域 3xx → RedirectInfo（statusCode 透传，checker 拒绝跟随）', async () => {
    const transport: WebFetchTransport = (_url, _init) =>
      Promise.resolve(redirectResponse(302, 'https://other.example/b'))
    setWebFetchTransportForTesting(transport)
    const res = await getWithPermittedRedirects(
      'https://example.com/a',
      new AbortController().signal,
      isPermittedRedirect,
    )
    expect(res).toEqual({
      type: 'redirect',
      originalUrl: 'https://example.com/a',
      redirectUrl: 'https://other.example/b',
      statusCode: 302,
    })
    setWebFetchTransportForTesting(null)
  })

  test('同域 3xx 递归跟随 + 最终 200 内容面', async () => {
    let calls = 0
    const transport: WebFetchTransport = (_url, _init) => {
      calls++
      if (calls === 1) {
        return Promise.resolve(redirectResponse(301, 'https://example.com/b'))
      }
      return Promise.resolve(
        {
          status: 200,
          statusText: 'OK',
          ok: true,
          headers: headersOf({ 'content-type': 'text/plain' }),
          arrayBuffer: async () => new TextEncoder().encode('hello').buffer,
          json: async () => ({}),
        },
      )
    }
    setWebFetchTransportForTesting(transport)
    const res = await getWithPermittedRedirects(
      'https://example.com/a',
      new AbortController().signal,
      isPermittedRedirect,
    )
    expect('data' in res).toBe(true)
    const data = res as { data: ArrayBuffer; status: number }
    expect(data.status).toBe(200)
    expect(Buffer.from(data.data).toString('utf8')).toBe('hello')
    expect(calls).toBe(2)
    setWebFetchTransportForTesting(null)
  })

  test('MAX_REDIRECTS 环守卫（11 跳抛错，文案逐字）', async () => {
    const transport: WebFetchTransport = (_url, _init) =>
      Promise.resolve(redirectResponse(302, 'https://example.com/loop'))
    setWebFetchTransportForTesting(transport)
    await expect(
      getWithPermittedRedirects(
        'https://example.com/loop',
        new AbortController().signal,
        isPermittedRedirect,
      ),
    ).rejects.toThrow('Too many loops (exceeded 10)')
    setWebFetchTransportForTesting(null)
  })

  test('403 x-proxy-error → EgressBlockedError（消息 JSON 面逐字）', async () => {
    const transport: WebFetchTransport = (_url, _init) =>
      Promise.resolve(
        redirectResponse(403, '', { 'x-proxy-error': 'blocked-by-allowlist' }),
      )
    setWebFetchTransportForTesting(transport)
    try {
      await getWithPermittedRedirects(
        'https://blocked.example/a',
        new AbortController().signal,
        isPermittedRedirect,
      )
      expect.unreachable('should throw EgressBlockedError')
    } catch (e) {
      expect(e).toBeInstanceOf(EgressBlockedError)
      expect((e as EgressBlockedError).domain).toBe('blocked.example')
      expect((e as Error).message).toBe(
        JSON.stringify({
          error_type: 'EGRESS_BLOCKED',
          domain: 'blocked.example',
          message: 'Access to blocked.example is blocked by the network egress proxy.',
        }),
      )
    }
    setWebFetchTransportForTesting(null)
  })

  test('非代理 403 → 状态码文案 / content-length 超限守卫', async () => {
    const notProxyTransport: WebFetchTransport = (_url, _init) =>
      Promise.resolve(redirectResponse(403, '', { 'x-proxy-error': 'other' }))
    setWebFetchTransportForTesting(notProxyTransport)
    await expect(
      getWithPermittedRedirects(
        'https://example.com/a',
        new AbortController().signal,
        isPermittedRedirect,
      ),
    ).rejects.toThrow('Request failed with status code 403')
    setWebFetchTransportForTesting(null)

    const oversizedTransport: WebFetchTransport = (_url, _init) =>
      Promise.resolve({
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: headersOf({ 'content-length': '99999999999' }),
        arrayBuffer: async () => new ArrayBuffer(0),
        json: async () => ({}),
      })
    setWebFetchTransportForTesting(oversizedTransport)
    await expect(
      getWithPermittedRedirects(
        'https://example.com/big',
        new AbortController().signal,
        isPermittedRedirect,
      ),
    ).rejects.toThrow('max content size exceeded')
    setWebFetchTransportForTesting(null)
  })

  test('blocklist 预检 env 未设 fail-open（管线直走主 fetch 支）+ URL_CACHE 命中零再调', async () => {
    clearWebFetchCache()
    const transportCalls: string[] = []
    const transport: WebFetchTransport = (url, _init) => {
      transportCalls.push(url)
      return Promise.resolve({
        status: 200,
        statusText: 'OK',
        ok: true,
        headers: headersOf({ 'content-type': 'text/plain' }),
        arrayBuffer: async () => new TextEncoder().encode('x').buffer,
        json: async () => ({}),
      })
    }
    setWebFetchTransportForTesting(transport)
    const fetched = await getURLMarkdownContent(
      'https://plain.example/a',
      new AbortController(),
    )
    if ('type' in fetched) throw new Error('unexpected redirect')
    expect(fetched.content).toBe('x')
    expect(fetched.code).toBe(200)
    expect(transportCalls).toEqual(['https://plain.example/a'])
    // 2 次同 URL = 缓存命中（URL_CACHE 15-min 面）：transport 零再调
    const again = await getURLMarkdownContent(
      'https://plain.example/a',
      new AbortController(),
    )
    if ('type' in again) throw new Error('unexpected redirect')
    expect(transportCalls).toEqual(['https://plain.example/a'])
    expect(again.content).toBe('x')
    setWebFetchTransportForTesting(null)
  })
})

describe('P-W10 mapToolResult + renderToolUseMessage', () => {
  test('WebFetch mapToolResult 透传 content 面', () => {
    expect(
      WebFetchTool.mapToolResultToToolResultBlockParam(
        {
          bytes: 3,
          code: 200,
          codeText: 'OK',
          result: 'RESULT',
          durationMs: 1,
          url: 'https://x.example',
        },
        'tool-1',
      ),
    ).toEqual({
      tool_use_id: 'tool-1',
      type: 'tool_result',
      content: 'RESULT',
    })
  })

  test('WebSearch mapToolResult：Links + No links + REMINDER + null 跳过 + trim', () => {
    const out = WebSearchTool.mapToolResultToToolResultBlockParam(
      {
        query: 'q',
        results: [
          null,
          'text summary',
          {
            tool_use_id: 't1',
            content: [{ title: 'T', url: 'https://t.example' }],
          },
          { tool_use_id: 't2', content: [] },
          undefined,
        ],
        durationSeconds: 0.3,
      },
      'tool-2',
    )
    expect(out.tool_use_id).toBe('tool-2')
    expect(out.type).toBe('tool_result')
    const content = out.content as string
    expect(content).toContain('Web search results for query: "q"')
    expect(content).toContain('text summary\n\n')
    expect(content).toContain('Links: [')
    expect(content).toContain('"url":"https://t.example"')
    expect(content).toContain('No links found.')
    expect(content).toContain(
      'REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.',
    )
    expect(content.startsWith('Web search results')).toBe(true)
    expect(content.endsWith('hyperlinks.')).toBe(true)
  })

  test('renderToolUseMessage 两工具字符串面', () => {
    expect(WebFetchTool.renderToolUseMessage({}, { verbose: false })).toBe(null)
    expect(
      WebFetchTool.renderToolUseMessage(
        { url: 'https://a.example' },
        { verbose: false },
      ),
    ).toBe('https://a.example')
    expect(
      WebFetchTool.renderToolUseMessage(
        { url: 'https://a.example', prompt: 'p' },
        { verbose: true },
      ),
    ).toBe('url: "https://a.example", prompt: "p"')
    expect(
      WebFetchTool.renderToolUseMessage(
        { url: 'https://a.example' },
        { verbose: true },
      ),
    ).toBe('url: "https://a.example"')

    expect(
      WebSearchTool.renderToolUseMessage({}, { verbose: false }),
    ).toBe(null)
    expect(
      WebSearchTool.renderToolUseMessage({ query: 'cann' }, { verbose: false }),
    ).toBe('"cann"')
    expect(
      WebSearchTool.renderToolUseMessage(
        { query: 'cann', allowed_domains: ['a.com', 'b.com'] },
        { verbose: true },
      ),
    ).toBe('"cann", only allowing domains: a.com, b.com')
  })
})
