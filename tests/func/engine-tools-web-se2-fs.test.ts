/**
 * engine/tools/web S-E2（§8.59 web 族子波）：func 层真 I/O ——
 * WebFetch / WebSearch 本体 call 全管线（WebFetch = HTTP fixture 缝 + model
 * 假；WebSearch = G-2 客户端 provider 面〔§8.74.27〕transport fixture，
 * 零模型；零真网零真模；persistBinaryContent 真盘落读 = func 层独占面）。
 *
 * 分层纪律（plan-se2-fs 同族）：--isolate 每文件独立进程，三注入缝
 * 窗口（setWebFetchTransportForTesting / setModelProviderForTesting /
 * setWebSearchTransportForTesting）不跨文件泄漏；afterAll 全复位。
 *
 *  - F-W1 WebFetch.call HTML 非 preapproved → 二级模型摘要支（fake chat
 *    计数 1，result = 固定 completion）。
 *  - F-W2 WebFetch.call 异域重定向 statusText 双支（302 Found / 301
 *    Moved Permanently；307/308 文案支未测登记，S-E3 B-N4）+ 零模型调用。
 *  - F-W3 WebFetch.call preapproved text/markdown 直通支（零模型调用，
 *    result = raw 内容）。
 *  - F-W4 WebFetch.call 二进制落盘支（application/pdf 真盘写 + 存在性
 *    真读 + result 注记面 + afterAll 清理）。
 *  - F-W5 applyPromptToMarkdown 截断面（>100K 内容 → 二级模型收到的
 *    messages 带截断标记且长度封顶，经 fake chat 捕获 args 观测）。
 *  - F-W6 WebSearch.call 客户端成功支（G-2 §8.74.27：transport fixture
 *    全管线 → results 归一 + mapToolResult Links 面 + 零模型调用）。
 *  - F-W7 WebSearch.call 客户端错误支（G-2 §8.74.27：HTTP 非 2xx /
 *    0 命中反爬页 → results[0] 错误串结果面，B8 语义随迁）。
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { rmSync } from 'fs'
import { stat } from 'fs/promises'
import {
  WebFetchTool,
  WebSearchTool,
  clearWebFetchCache,
  setWebFetchTransportForTesting,
  setWebSearchTransportForTesting,
  MAX_MARKDOWN_LENGTH,
  type WebFetchHttpResponse,
  type WebFetchTransport,
} from '../../src/engine/tools'
import {
  resetModelProviderForTesting,
  setModelProviderForTesting,
  type ModelProvider,
} from '../../src/modelprovider'

// ── 响应 fixture 构造 ────────────────────────────────────────────────────

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

function bodyResponse(
  status: number,
  body: string,
  contentType: string,
): WebFetchHttpResponse {
  const buf = Buffer.from(body)
  return {
    status,
    statusText: status === 200 ? 'OK' : 'ERR',
    ok: status >= 200 && status < 300,
    headers: headersOf({ 'content-type': contentType }),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    json: async () => ({}),
  }
}

function locationResponse(
  status: number,
  location: string,
): WebFetchHttpResponse {
  return {
    status,
    statusText: 'REDIRECT',
    ok: false,
    headers: headersOf({ location }),
    arrayBuffer: async () => new ArrayBuffer(0),
    json: async () => ({}),
  }
}

function fixTransport(handler: (url: string) => WebFetchHttpResponse): WebFetchTransport {
  return (url) => Promise.resolve(handler(url))
}

// ── fake modelprovider（b6-func 同形；chat 计数 + args 捕获）───────────
const MOCK_FETCH_SUMMARY = 'MOCK-FETCH-SUMMARY'
let chatCallCount = 0
let lastChatArgs: { role: string; openaiParams: Record<string, unknown> } | null =
  null

function createFakeModelProvider(): ModelProvider {
  const notExercised = async () => {
    throw new Error('fake ModelProvider: 方法未被 web-se2 func 消费')
  }
  return {
    chat: async (args) => {
      chatCallCount++
      lastChatArgs = {
        role: args.role,
        openaiParams: (args.openaiParams ?? {}) as Record<string, unknown>,
      }
      return {
        type: 'assistant',
        uuid: 'fake-uuid',
        timestamp: new Date().toISOString(),
        message: {
          id: 'fake-msg',
          model: 'fake-model',
          role: 'assistant',
          content: [{ type: 'text', text: MOCK_FETCH_SUMMARY }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      }
    },
    // G-2（§8.74.27）：WebSearch 客户端化后零模型调用，WebFetch 管线
    // 亦不消费 chatStream（grep 验证零消费）——抛错守卫：车道复活误走
    // 即炸（防空洞纪律）。
    chatStream: async function* () {
      throw new Error(
        'fake ModelProvider: chatStream 未被 web-se2 func 消费（G-2 WebSearch 客户端化）',
      )
    },
    healthCheck: notExercised,
    countTokens: notExercised,
    listModels: async () => [],
    transcribeAudio: notExercised,
    synthesizeSpeech: notExercised,
    verifyKey: notExercised,
  }
}

function makeFetchCtx() {
  return {
    abortController: new AbortController(),
    options: { isNonInteractiveSession: false },
    getAppState: () => ({ toolPermissionContext: {} }),
  }
}

function makeSearchCtx() {
  return {
    abortController: new AbortController(),
    options: { thinkingConfig: { type: 'disabled' } },
    getAppState: () => ({ effortValue: undefined }),
  }
}

const persistedFiles: string[] = []

// G-2 SERP fixture（F-W6/F-W7 消费；entity 解码面 &amp; 随迁断言）
const BING_SERP_FIXTURE =
  '<html><ol id="b_results">' +
  '<li class="b_algo" data-hid="1"><h2><a href="https://docs.example/cann-op" target="_blank">CANN 算子开发 &amp; 指南</a></h2><div class="b_caption"><p>Ascend C 算子开发文档</p></div></li>' +
  '</ol></html>'

// blocklist 预检 env 面隔离（与 unit 面同族）：若宿主环境设了
// ATLAS_WEB_DOMAIN_CHECK_URL，checkDomainBlocklist 会对 fixture transport
// 发预检请求（json {} → check_failed 全管线炸）→ 确定性 fail-open
const DOMAIN_CHECK_ENV_KEY = 'ATLAS_WEB_DOMAIN_CHECK_URL'
let savedDomainCheckEnv: string | undefined
// G-2（§8.74.27）：web search provider env 面隔离（宿主设了
// WEB_SEARCH_PROVIDER=tavily + 无 key 时 F-W6/F-W7 会走 tavily 错误支 →
// 非确定性；与 unit 面 engine-tools-web-search-provider 同族同式）
const WEB_SEARCH_ENV_KEYS = [
  'WEB_SEARCH_PROVIDER',
  'WEB_SEARCH_ENDPOINT',
  'TAVILY_API_KEY',
] as const
const savedWebSearchEnv: Record<(typeof WEB_SEARCH_ENV_KEYS)[number], string | undefined> = {}
beforeAll(() => {
  savedDomainCheckEnv = process.env[DOMAIN_CHECK_ENV_KEY]
  delete process.env[DOMAIN_CHECK_ENV_KEY]
  for (const k of WEB_SEARCH_ENV_KEYS) {
    savedWebSearchEnv[k] = process.env[k]
    delete process.env[k]
  }
  setModelProviderForTesting(createFakeModelProvider())
  clearWebFetchCache()
})
afterAll(() => {
  if (savedDomainCheckEnv === undefined) {
    delete process.env[DOMAIN_CHECK_ENV_KEY]
  } else {
    process.env[DOMAIN_CHECK_ENV_KEY] = savedDomainCheckEnv
  }
  for (const k of WEB_SEARCH_ENV_KEYS) {
    if (savedWebSearchEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedWebSearchEnv[k]
  }
  setWebFetchTransportForTesting(null)
  setWebSearchTransportForTesting(null)
  resetModelProviderForTesting()
  for (const f of persistedFiles) {
    rmSync(f, { force: true })
  }
})

describe('F-W1 WebFetch.call 二级模型摘要支', () => {
  test('HTML 非 preapproved → fake chat 摘要（计数 1 + 面逐字）', async () => {
    setWebFetchTransportForTesting(
      fixTransport(() =>
        bodyResponse(200, '<html><body>hi</body></html>', 'text/html'),
      ),
    )
    chatCallCount = 0
    const { data } = await WebFetchTool.call(
      { url: 'https://docs.example/a', prompt: 'summarize' },
      makeFetchCtx(),
    )
    expect(data.code).toBe(200)
    expect(data.codeText).toBe('OK')
    expect(data.url).toBe('https://docs.example/a')
    expect(data.result).toBe(MOCK_FETCH_SUMMARY)
    expect(chatCallCount).toBe(1)
    expect(lastChatArgs?.role).toBe('fast')
    expect(data.bytes).toBe(Buffer.byteLength('<html><body>hi</body></html>'))
  })
})

describe('F-W2 WebFetch.call 异域重定向支', () => {
  test('302 → statusText Found + REDIRECT 消息面 + 零模型', async () => {
    setWebFetchTransportForTesting(
      fixTransport(() => locationResponse(302, 'https://other.example/b')),
    )
    chatCallCount = 0
    const { data } = await WebFetchTool.call(
      { url: 'https://redir.example/a', prompt: 'p' },
      makeFetchCtx(),
    )
    expect(data.code).toBe(302)
    expect(data.codeText).toBe('Found')
    expect(data.result).toContain('REDIRECT DETECTED')
    expect(data.result).toContain(
      'Original URL: https://redir.example/a',
    )
    expect(data.result).toContain('Redirect URL: https://other.example/b')
    expect(data.result).toContain('Status: 302 Found')
    expect(chatCallCount).toBe(0)
  })

  test('301 → statusText Moved Permanently', async () => {
    setWebFetchTransportForTesting(
      fixTransport(() => locationResponse(301, 'https://other.example/b')),
    )
    const { data } = await WebFetchTool.call(
      { url: 'https://redir.example/c', prompt: 'p' },
      makeFetchCtx(),
    )
    expect(data.code).toBe(301)
    expect(data.codeText).toBe('Moved Permanently')
  })
})

describe('F-W3 WebFetch.call preapproved 直通支', () => {
  test('text/markdown preapproved → raw 直通零模型', async () => {
    setWebFetchTransportForTesting(
      fixTransport(() => bodyResponse(200, 'MD-RAW', 'text/markdown')),
    )
    chatCallCount = 0
    const { data } = await WebFetchTool.call(
      {
        url: 'https://developer.mozilla.org/docs/web',
        prompt: 'p',
      },
      makeFetchCtx(),
    )
    expect(data.result).toBe('MD-RAW')
    expect(chatCallCount).toBe(0)
  })
})

describe('F-W4 WebFetch.call 二进制落盘支（真盘）', () => {
  test('application/pdf → 真盘写 + 存在性读回 + result 注记面', async () => {
    const pdfBytes = '%PDF-1.4 fake'
    setWebFetchTransportForTesting(
      fixTransport(() =>
        bodyResponse(200, pdfBytes, 'application/pdf'),
      ),
    )
    const { data } = await WebFetchTool.call(
      { url: 'https://pdf.example/file.pdf', prompt: 'p' },
      makeFetchCtx(),
    )
    // 二进制支恒走二级模型（preapproved 直通仅 text/markdown 面）
    expect(data.result.startsWith(MOCK_FETCH_SUMMARY)).toBe(true)
    expect(data.result).toContain('[Binary content (application/pdf')
    expect(data.result).toContain('also saved to')
    // formatFileSize 小值面 = `${n} bytes`（shared/format.ts:20）
    const m = data.result.match(/\[Binary content \(application\/pdf, \d+ bytes\) also saved to (\S+)\]/)
    expect(m).not.toBeNull()
    const persistedPath = m![1]
    // func 层独占面：真盘存在性读回（persistBinaryContent 真 writeFile）
    const st = await stat(persistedPath)
    expect(st.size).toBe(Buffer.byteLength(pdfBytes))
    persistedFiles.push(persistedPath)
  })
})

describe('F-W5 applyPromptToMarkdown 截断面', () => {
  test('>100K 内容 → 二级模型 messages 带截断标记且长度封顶', async () => {
    const big = 'x'.repeat(MAX_MARKDOWN_LENGTH + 10)
    setWebFetchTransportForTesting(
      fixTransport(() => bodyResponse(200, big, 'text/plain')),
    )
    await WebFetchTool.call(
      { url: 'https://big.example/a', prompt: 'p' },
      makeFetchCtx(),
    )
    const params = lastChatArgs?.openaiParams
    expect(params).not.toBeNull()
    const messages = params!.messages as Array<{
      content: string
    }>
    const content = messages[0].content
    const marker = '[Content truncated due to length...]'
    expect(content).toContain(marker)
    // 截断发生在 MAX 切点（完整 100K 前缀保留，标记位于 MAX 之后 =
    // 截断而非全量透传面；包壳 = 模板 + 非 preapproved 长指南，长度面
    // 上限 +1000 容差）
    expect(content.indexOf(marker)).toBeGreaterThan(MAX_MARKDOWN_LENGTH)
    expect(content.length).toBeLessThanOrEqual(MAX_MARKDOWN_LENGTH + 1000)
  })
})

describe('F-W6 WebSearch.call 客户端成功支（G-2 §8.74.27）', () => {
  test('transport fixture 全管线 → results 归一 + Links 面 + 零模型', async () => {
    setWebSearchTransportForTesting(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: async () => BING_SERP_FIXTURE,
      }),
    )
    chatCallCount = 0
    const { data } = await WebSearchTool.call(
      { query: 'cann op' },
      makeSearchCtx(),
    )
    expect(data.query).toBe('cann op')
    expect(typeof data.durationSeconds).toBe('number')
    // G-2：单结果块（tool_use_id 本地 randomUUID + hits 归一，entity 解码）
    expect(data.results).toHaveLength(1)
    const hitBlock = data.results[0] as {
      tool_use_id: string
      content: { title: string; url: string; snippet?: string }[]
    }
    expect(hitBlock.tool_use_id.length).toBeGreaterThan(0)
    expect(hitBlock.content).toEqual([
      {
        title: 'CANN 算子开发 & 指南',
        url: 'https://docs.example/cann-op',
        snippet: 'Ascend C 算子开发文档',
      },
    ])
    const block =
      WebSearchTool.mapToolResultToToolResultBlockParam(data, 'tu-1')
    expect(block.tool_use_id).toBe('tu-1')
    expect(block.type).toBe('tool_result')
    expect(block.content).toContain('Links: [')
    expect(block.content).toContain('"url":"https://docs.example/cann-op"')
    // 客户端 lane 核心语义回归守卫：零模型调用（旧服务端工具车道已裁）
    expect(chatCallCount).toBe(0)
  })
})

describe('F-W7 WebSearch.call 客户端错误支（G-2 B8 错误串面）', () => {
  test('HTTP 非 2xx → results[0] 错误串（状态码透传 + 切 tavily 指引）', async () => {
    setWebSearchTransportForTesting(() =>
      Promise.resolve({ ok: false, status: 403, text: async () => 'forbidden' }),
    )
    const { data } = await WebSearchTool.call({ query: 'q' }, makeSearchCtx())
    expect(data.results).toHaveLength(1)
    expect(typeof data.results[0]).toBe('string')
    expect(data.results[0]).toContain('Web search error (bing)')
    expect(data.results[0]).toContain('HTTP 403')
  })

  test('0 命中（反爬页）→ 错误串面 + 切 tavily 指引', async () => {
    setWebSearchTransportForTesting(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: async () => '<html><body>consent</body></html>',
      }),
    )
    const { data } = await WebSearchTool.call({ query: 'q' }, makeSearchCtx())
    expect(data.results).toHaveLength(1)
    expect(data.results[0]).toContain('Web search error (bing)')
    expect(data.results[0]).toContain('WEB_SEARCH_PROVIDER=tavily')
  })
})
