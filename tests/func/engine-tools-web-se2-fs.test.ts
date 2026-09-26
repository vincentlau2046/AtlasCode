/**
 * engine/tools/web S-E2（§8.59 web 族子波）：func 层真 I/O ——
 * WebFetch / WebSearch 本体 call 全管线（HTTP fixture 缝 + model 双假，
 * 零真网零真模；persistBinaryContent 真盘落读 = func 层独占面）。
 *
 * 分层纪律（plan-se2-fs 同族）：--isolate 每文件独立进程，双注入缝
 * 窗口（setWebFetchTransportForTesting / setModelProviderForTesting）
 * 不跨文件泄漏；afterAll 全复位。
 *
 *  - F-W1 WebFetch.call HTML 非 preapproved → 二级模型摘要支（fake chat
 *    计数 1，result = 固定 completion）。
 *  - F-W2 WebFetch.call 异域重定向 4 支 statusText（302 Found / 301
 *    Moved Permanently）+ 零模型调用。
 *  - F-W3 WebFetch.call preapproved text/markdown 直通支（零模型调用，
 *    result = raw 内容）。
 *  - F-W4 WebFetch.call 二进制落盘支（application/pdf 真盘写 + 存在性
 *    真读 + result 注记面 + afterAll 清理）。
 *  - F-W5 applyPromptToMarkdown 截断面（>100K 内容 → 二级模型收到的
 *    messages 带截断标记且长度封顶，经 fake chat 捕获 args 观测）。
 *  - F-W6 WebSearch.call 流成功支（三块型流 → results 归一 + mapToolResult
 *    Links 面）。
 *  - F-W7 WebSearch.call 流错误支（B8 error 事件 message 透传 + 缺 message
 *    文案模板面）。
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { rmSync } from 'fs'
import { stat } from 'fs/promises'
import {
  WebFetchTool,
  WebSearchTool,
  clearWebFetchCache,
  setWebFetchTransportForTesting,
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

// ── fake modelprovider（b6-func 同形；chat 计数 + args 捕获 /
//     chatStream 事件流可配）────────────────────────────────────────────
const MOCK_FETCH_SUMMARY = 'MOCK-FETCH-SUMMARY'
type SearchStreamEvent =
  | {
      type: 'assistant'
      message: { content: Array<Record<string, unknown>> }
    }
  | {
      type: 'error'
      message?: string
      code?: string
      retryable?: boolean
    }
let searchStreamEvents: SearchStreamEvent[] = []
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
    chatStream: async function* () {
      for (const ev of searchStreamEvents) {
        yield ev
      }
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

// blocklist 预检 env 面隔离（与 unit 面同族）：若宿主环境设了
// ATLAS_WEB_DOMAIN_CHECK_URL，checkDomainBlocklist 会对 fixture transport
// 发预检请求（json {} → check_failed 全管线炸）→ 确定性 fail-open
const DOMAIN_CHECK_ENV_KEY = 'ATLAS_WEB_DOMAIN_CHECK_URL'
let savedDomainCheckEnv: string | undefined
beforeAll(() => {
  savedDomainCheckEnv = process.env[DOMAIN_CHECK_ENV_KEY]
  delete process.env[DOMAIN_CHECK_ENV_KEY]
  setModelProviderForTesting(createFakeModelProvider())
  clearWebFetchCache()
})
afterAll(() => {
  if (savedDomainCheckEnv === undefined) {
    delete process.env[DOMAIN_CHECK_ENV_KEY]
  } else {
    process.env[DOMAIN_CHECK_ENV_KEY] = savedDomainCheckEnv
  }
  setWebFetchTransportForTesting(null)
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

describe('F-W6 WebSearch.call 流成功支', () => {
  test('三块型流 → results 归一 + mapToolResult Links 面', async () => {
    searchStreamEvents = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'intro commentary ' },
            { type: 'server_tool_use' },
            {
              type: 'web_search_tool_result',
              tool_use_id: 't1',
              content: [{ title: 'T', url: 'https://t.example' }],
            },
            { type: 'text', text: 'tail' },
          ],
        },
      },
    ]
    const { data } = await WebSearchTool.call(
      { query: 'cann op' },
      makeSearchCtx(),
    )
    expect(data.query).toBe('cann op')
    expect(typeof data.durationSeconds).toBe('number')
    // text 累积 → server_tool_use flush（trim）/ hits 归一 / 尾部 trim
    expect(data.results).toEqual([
      'intro commentary',
      {
        tool_use_id: 't1',
        content: [{ title: 'T', url: 'https://t.example' }],
      },
      'tail',
    ])
    const block =
      WebSearchTool.mapToolResultToToolResultBlockParam(data, 'tu-1')
    expect(block.tool_use_id).toBe('tu-1')
    expect(block.type).toBe('tool_result')
    expect(block.content).toContain('Links: [')
    expect(block.content).toContain('"url":"https://t.example"')
  })
})

describe('F-W7 WebSearch.call 流错误支（B8）', () => {
  test('error 事件 message 透传支', async () => {
    searchStreamEvents = [
      {
        type: 'error',
        message: 'provider boom',
        code: 'boom_code',
        retryable: false,
      },
    ]
    const { data } = await WebSearchTool.call(
      { query: 'q' },
      makeSearchCtx(),
    )
    expect(data.results).toContain('provider boom')
  })

  test('缺 message → 文案模板面（code/retryable 逐字）', async () => {
    searchStreamEvents = [
      { type: 'error', code: 'boom_code', retryable: false },
    ]
    const { data } = await WebSearchTool.call({ query: 'q' }, makeSearchCtx())
    expect(data.results).toContain(
      'Web search provider error (code: boom_code, retryable: false)',
    )
  })
})
