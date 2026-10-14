/**
 * 0.1.58 PAC V2-06 loop 鲁棒性波（工单 2026-10-13-p0-wave-0158-ticket §0/§2）—
 * C4-1 mid-stream 部分保留（CC 2.1.199）+ C4-2 ECONNRESET/瞬断退避增量
 * （CC 2.1.198）判别单测。
 *
 * 背景：
 *  - C4-1：流中途服务端错误（5xx/断流）时已收 partial 处理面 = ∅（f4 D1 锚定
 *    「mid-stream ∅」）——partial 内容被静默丢弃。修 = streamOneAttempt 中途错误
 *    时保留 partial 为 assistant 轮次内容（interrupted 语义标记：stop_reason =
 *    'interrupted' + 事件级 interrupted: true），错误走既有错误面（error 事件，
 *    不裸抛吞内容）；零 partial 面（错误在首 token 前）= 既有行为恒等。
 *  - C4-2：provider 重试循环（chat / chatStream）对瞬断类错误（ECONNRESET/socket
 *    hang up 族，既有 shouldRetryModelError 分类面不变）原为**零间隔紧贴重发**
 *    （hammer 抖动网关）→ 增量指数退避（base×2^attempt 封顶，缺省 500ms/8s）；
 *    重试次数 3 与分类面不变，非瞬断类零退避恒等。
 *
 * 判别信号（修前红→绿）：
 *  - C4-1 修前红：mid-stream 错误 → 无 assistant 事件（partial 丢弃）/ 整流重发
 *    双内容；修后绿：partial 在场（interrupted 标记 + error 事件）+ 单发终止
 *    （防双内容）+ 零 partial 面恒等（3 次整流重试 + 尾 error 事件）。
 *  - C4-2 修前红：重试间零退避（sleep 零调用）；修后绿：瞬断类间隔单调递增
 *    + cap + 末次不退避 + 非瞬断零退避（1 调用）。
 *
 * 分层纪律：纯模块面 + fake client（mock.module clients/roles 双身，repo 惯例
 * 全导出面先取再 spread 覆写）——零网络 / 零盘 / 零模型；退避时序经构造注入
 * 录制 fake sleep（缺省面 = 真 signal 感知 sleep，不在此测睡实）。
 */
import { describe, test, expect, mock } from 'bun:test'

// ---- mock 双身（先取真实全导出面，再 spread 覆写 = mock-module-export-surface 标准对策）----
const realClients = await import('../../src/modelprovider/clients')
const realRoles = await import('../../src/modelprovider/roles')

const createCalls: any[] = []
type StreamBehavior = (callIndex: number) => unknown
const defaultStreamBehavior: StreamBehavior = () => ({
  choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1 },
})
let streamBehavior: StreamBehavior = defaultStreamBehavior

const fakeClient = {
  chat: {
    completions: {
      create: async (params: any) => {
        createCalls.push(params)
        return streamBehavior(createCalls.length - 1)
      },
    },
  },
}

const FAKE_ENTRY = {
  provider: 'testprov',
  modelId: 'test-model',
  modelRef: 'testprov/test-model',
  baseURL: 'http://127.0.0.1:9',
  apiKey: 'test-key',
  contextWindow: 32_768,
  maxTokens: 4096,
}

mock.module('../../src/modelprovider/clients', () => ({
  ...realClients,
  getClientForEntry: () => fakeClient,
}))
mock.module('../../src/modelprovider/roles', () => ({
  ...realRoles,
  getRoleModels: () => ['testprov/test-model'],
  getRoleModel: () => 'test-model',
  resolveModel: () => FAKE_ENTRY,
  getRoleConfig: () => ({
    provider: 'openai',
    model: 'test-model',
    baseURL: FAKE_ENTRY.baseURL,
    apiKey: FAKE_ENTRY.apiKey,
  }),
}))

const {
  OpenAIProvider,
  ModelPoolExhaustedError,
  modelRetryBackoffMs,
  MODEL_RETRY_BACKOFF_BASE_MS,
  MODEL_RETRY_BACKOFF_CAP_MS,
} = await import('../../src/modelprovider')

// ---- 流脚本助手 ----
function* fullStream(chunks: any[]) {
  for (const c of chunks) yield c
}
function* partialThenThrow(chunks: any[], thenError: unknown) {
  for (const c of chunks) yield c
  throw thenError
}
function textChunk(text: string) {
  return { choices: [{ delta: { content: text }, finish_reason: null }] }
}
const finishChunk = { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 5 } }

/** #271 #4 形状（SDK 面）：ECONNRESET 在 cause.code，顶层固定文案 → 可重试族。 */
function sdkConnError(errno: string) {
  return {
    name: 'APIConnectionError',
    message: 'Connection error.',
    cause: Object.assign(new Error(`read ${errno}`), { code: errno }),
  }
}

function makeProvider(
  maxRetries = 3,
  backoff?: { baseMs?: number; capMs?: number; sleeps?: number[] },
) {
  const provider = new OpenAIProvider(maxRetries, 600_000, undefined, {
    baseMs: backoff?.baseMs,
    capMs: backoff?.capMs,
    sleep: backoff?.sleeps ? async (ms) => { backoff.sleeps!.push(ms) } : undefined,
  })
  return { provider, sleeps: backoff?.sleeps }
}

const chatArgs = () => ({ role: 'fast' as const, messages: [{ role: 'user', content: 'hi' }] as any })
const streamArgs = () => ({ role: 'fast' as const, messages: [{ role: 'user', content: 'hi' }] as any })

/** 模块级 fake client 状态跨测试隔离：清调用计数 + 流脚本复位缺省。 */
function resetFakeState() {
  createCalls.length = 0
  streamBehavior = defaultStreamBehavior
}

describe('C4-2 退避时序纯面（base×2^attempt 封顶）', () => {
  test('缺省 500/8000：单调递增 + cap', () => {
    expect(MODEL_RETRY_BACKOFF_BASE_MS).toBe(500)
    expect(MODEL_RETRY_BACKOFF_CAP_MS).toBe(8_000)
    expect(modelRetryBackoffMs(0)).toBe(500)
    expect(modelRetryBackoffMs(1)).toBe(1_000)
    expect(modelRetryBackoffMs(2)).toBe(2_000)
    expect(modelRetryBackoffMs(3)).toBe(4_000)
    expect(modelRetryBackoffMs(4)).toBe(8_000) // cap 生效
    expect(modelRetryBackoffMs(5)).toBe(8_000) // cap 恒等
  })
  test('自定义 base/cap 注入面（测试短基）', () => {
    expect(modelRetryBackoffMs(0, 100, 500)).toBe(100)
    expect(modelRetryBackoffMs(1, 100, 500)).toBe(200)
    expect(modelRetryBackoffMs(2, 100, 500)).toBe(400)
    expect(modelRetryBackoffMs(3, 100, 500)).toBe(500) // cap
  })
})

describe('C4-2 chat() 重试循环退避面（fake client 时序断言）', () => {
  test('瞬断类 503：重试间退避单调递增 + 末次不退避（次数 3 不变）', async () => {
    resetFakeState()
    const sleeps: number[] = []
    let calls = 0
    streamBehavior = () => {
      calls += 1
      if (calls < 3) throw { status: 503, name: 'APIError', message: 'Service Unavailable' }
      return {
        choices: [{ message: { content: 'recovered' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }
    }
    const { provider, sleeps: rec } = makeProvider(3, { baseMs: 10, capMs: 40, sleeps })
    void rec
    const res = await provider.chat(chatArgs())
    expect(res.message.content).toEqual([{ type: 'text', text: 'recovered' }])
    expect(createCalls.length).toBe(3) // 重试次数 3 不变
    // attempt0→base 10；attempt1→20；attempt2（末次）后无后续 attempt = 不退避
    expect(sleeps).toEqual([10, 20])
  })

  test('退避 cap 面：base 10/cap 40 × 6 次 → [10,20,40,40,40]（末次不退避；终抛 = 0.1.71 A-1 聚合）', async () => {
    resetFakeState()
    const sleeps: number[] = []
    streamBehavior = () => {
      throw { status: 503, name: 'APIError', message: 'Service Unavailable' }
    }
    const { provider } = makeProvider(6, { baseMs: 10, capMs: 40, sleeps })
    // A-1 新契约：池全败（单 ref 503 × 6 次重试耗尽）→ 聚合错误（无 .status 面，
    // 分类标签 api_error_503 进 .failures；退避时序断言不受聚合影响 = C4-2 面不变）
    const err = await provider.chat(chatArgs()).catch(e => e)
    expect(err).toBeInstanceOf(ModelPoolExhaustedError)
    expect(err.failures).toEqual([
      { ref: 'testprov/test-model', code: 'api_error_503', raw: 'Service Unavailable' },
    ])
    expect(createCalls.length).toBe(6)
    expect(sleeps).toEqual([10, 20, 40, 40, 40])
  })

  test('非瞬断类 403 零退避（1 调用 + 无退避恒等；终抛 = 0.1.71 A-1 聚合 auth_error）', async () => {
    resetFakeState()
    const sleeps: number[] = []
    streamBehavior = () => {
      throw { status: 403, name: 'APIError', message: 'Forbidden' }
    }
    const { provider } = makeProvider(3, { baseMs: 10, capMs: 40, sleeps })
    // A-1 新契约：403 非瞬断零重试（1 调用恒等）+ 池全败 → 聚合错误
    // （泛 403 非配额签名 = auth_error 子型，A-2 单一事实源）
    const err = await provider.chat(chatArgs()).catch(e => e)
    expect(err).toBeInstanceOf(ModelPoolExhaustedError)
    expect(err.role).toBe('fast')
    expect(err.failures).toEqual([
      { ref: 'testprov/test-model', code: 'auth_error', raw: 'Forbidden' },
    ])
    expect(createCalls.length).toBe(1)
    expect(sleeps).toEqual([])
  })

  test('ECONNRESET SDK 形状（瞬断族主诉面）走退避支（可重试 → 退避后续试）', async () => {
    resetFakeState()
    const sleeps: number[] = []
    let calls = 0
    streamBehavior = () => {
      calls += 1
      if (calls < 2) throw sdkConnError('ECONNRESET')
      return {
        choices: [{ message: { content: 'back' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }
    }
    const { provider } = makeProvider(3, { baseMs: 10, capMs: 40, sleeps })
    const res = await provider.chat(chatArgs())
    expect(res.message.content).toEqual([{ type: 'text', text: 'back' }])
    expect(createCalls.length).toBe(2)
    expect(sleeps).toEqual([10]) // 仅 attempt0 后退避一次
  })
})

describe('C4-1 chatStream() mid-stream partial 保留面（fake 流脚本）', () => {
  test('mid-stream 错误 → partial 保留（assistant 轮次内容 + interrupted 标记 + 既有错误面）+ 单发终止', async () => {
    resetFakeState()
    streamBehavior = () =>
      partialThenThrow([textChunk('Hel'), textChunk('lo')], sdkConnError('ECONNRESET'))
    const { provider } = makeProvider()
    const events: any[] = []
    for await (const ev of provider.chatStream(streamArgs())) events.push(ev)

    const types = events.map((e) => e.type)
    expect(types).toEqual(['text_delta', 'text_delta', 'message_stop', 'assistant', 'error'])
    // interrupted 语义标记面（Main 裁定标记面）
    expect(events[2].stopReason).toBe('interrupted')
    const assistant = events[3]
    expect(assistant.interrupted).toBe(true)
    expect(assistant.message.stop_reason).toBe('interrupted')
    // partial 内容在场（assistant 轮次内容不丢）
    const textBlock = assistant.message.content.find((b: any) => b.type === 'text')
    expect(textBlock.text).toBe('Hello')
    // 后续错误处理 = 既有错误面（error 事件；ECONNRESET 族 retryable 判定面不变）
    expect(events[4].type).toBe('error')
    expect(events[4].retryable).toBe(true)
    // 单发终止（partial 已作该轮内容 → 不整流重发 = 防双内容）
    expect(createCalls.length).toBe(1)
  })

  test('零 partial 面（错误在首 token 前）= 既有行为恒等（整流重试 3 次 + 尾 error 事件，无 assistant 事件）', async () => {
    resetFakeState()
    streamBehavior = () => {
      throw { status: 503, name: 'APIError', message: 'Service Unavailable' }
    }
    const { provider } = makeProvider(3, { baseMs: 10, capMs: 40, sleeps: undefined })
    const events: any[] = []
    for await (const ev of provider.chatStream(streamArgs())) events.push(ev)

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('error')
    expect(events[0].code).toBe('API_ERROR')
    expect(events.some((e) => e.type === 'assistant')).toBe(false)
    expect(createCalls.length).toBe(3) // 次数 3 不变
  })

  test('成功路径恒等（无 interrupted 标记 / 无 error 事件 / 完整终态）', async () => {
    resetFakeState()
    streamBehavior = () => fullStream([textChunk('Hi '), textChunk('there'), finishChunk])
    const { provider } = makeProvider()
    const events: any[] = []
    for await (const ev of provider.chatStream(streamArgs())) events.push(ev)

    expect(events.map((e) => e.type)).toEqual([
      'text_delta',
      'text_delta',
      'message_stop',
      'assistant',
    ])
    const assistant = events[3]
    expect(assistant.interrupted).toBeUndefined()
    expect(assistant.message.stop_reason).toBe('end_turn')
    expect(assistant.message.content).toEqual([{ type: 'text', text: 'Hi there' }])
    expect(createCalls.length).toBe(1)
  })
})
