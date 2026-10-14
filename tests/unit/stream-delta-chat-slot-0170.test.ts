/**
 * 0.1.70 G-1（composing token 回归波，工单 §0 G-1）：modelProvider.chat
 * onStreamDelta 回调槽判别单测。
 *
 * 被测能力（src/modelprovider/modelprovider.ts OpenAIProvider.chat）：
 *  - onStreamDelta 传入面 = 流式路径（chatWithDelta：复用 streamOneAttempt
 *    per-token 事件面单一事实源，逐 delta 同步转发 delta 类 4 事件，返回完整
 *    assistant message = Promise 契约不变）。
 *  - onStreamDelta 未传面 = 非流式路径原样（stream: false 单发 = 恒等锚，
 *    headless / 测试 fixture / 非 TUI 调用方零行为）。
 *  - 错误契约 = 抛原始错误（与非流式面 create() 抛同族，withTurnRecovery /
 *    shouldRetryModelError 分类语义不变）。
 *  - C4-1 partial 保留面 = interrupted assistant 即该轮内容（不整流重发）。
 *
 * Main 定项（工单 §0 G-1 落码面参考 f4 定因）：① StreamDelta 槽形 = 裸
 * StreamEvent delta 类 4 事件子集（消费方自选，tool 面 0.1.71 候选零改动）
 * ② 调用时序 = 逐 delta 同步（yield 点内，不阻塞流）③ reasoning/thinking
 * delta 不入（事件型不存在，scope 锁外）。
 *
 * 分层纪律：unit 层——fake client（mock.module clients/roles 双身，repo 惯例
 * 全导出面先取再 spread 覆写）+ 构造注入 fake sleep（退避零实睡）——零网络 /
 * 零盘 / 零模型。
 */
import { describe, test, expect, mock } from 'bun:test'

// ---- mock 双身（先取真实全导出面，再 spread 覆写 = mock-module-export-surface 标准对策）----
const realClients = await import('../../src/modelprovider/clients')
const realRoles = await import('../../src/modelprovider/roles')

const createCalls: Array<{ params: any; stream: boolean }> = []
/** 按 create 调用序脚本化：stream 面 = chunk 生成器（throw = 流中途错误）；非 stream 面 = 单发对象。 */
type StreamScript = () => AsyncGenerator<any, void, unknown>
const streamScripts: Array<StreamScript | undefined> = []
const nonStreamResult: any = {
  choices: [{ message: { content: 'ok-nonstream' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1 },
}

const fakeClient = {
  chat: {
    completions: {
      create: async (params: any) => {
        createCalls.push({ params, stream: !!params.stream })
        const i = createCalls.length - 1
        if (params.stream) {
          const script = streamScripts[i] ?? (() => defaultTextStream('ok-stream'))
          return script()
        }
        return nonStreamResult
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

import type { StreamDelta } from '../../src/modelprovider'
const { OpenAIProvider } = await import('../../src/modelprovider')

// ---- 流脚本助手 ----
function textChunks(texts: string[]) {
  return texts.map(t => ({ choices: [{ delta: { content: t }, finish_reason: null }] }))
}
function defaultTextStream(text: string): AsyncGenerator<any, void, unknown> {
  async function* gen() {
    yield { choices: [{ delta: { content: text }, finish_reason: null }] }
    yield {
      choices: [{ delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    }
  }
  return gen()
}
/** 正常多 token 流（逐 chunk text_delta + finish + usage 尾块）。 */
function multiTextStream(texts: string[]) {
  async function* gen() {
    for (const c of textChunks(texts)) yield c
    yield {
      choices: [{ delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: texts.length },
    }
  }
  return gen()
}
/** 流中途错误（partial chunks 后 throw = C4-1 partial 保留面；零 chunk = 零 partial 面）。 */
function errorAfterStream(chunks: any[], err: unknown) {
  async function* gen() {
    for (const c of chunks) yield c
    throw err
  }
  return gen()
}
/**
 * tool_calls 流（start + args delta + finish → tool_use_end 收口）。
 * 注：chunk 内 name 与 arguments 同现时 provider 面 = start + delta 双事件
 * （streamOneAttempt 映射面），故首 chunk 只带 id+name，第 2 chunk 才送 args
 * （= 三事件序 start/delta/end 的脚本化前提）。
 */
function toolStream() {
  async function* gen() {
    yield {
      choices: [{ delta: { tool_calls: [{ index: 0, id: 'tc-1', function: { name: 'echo' } }] }, finish_reason: null }],
    }
    yield {
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"a":1}' } }] }, finish_reason: null }],
    }
    yield {
      choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    }
  }
  return gen()
}

/** 零实睡 provider（退避注入 fake sleep；maxRetries 3 面不变）。 */
function makeProvider() {
  return new OpenAIProvider(3, 600_000, undefined, {
    baseMs: 1,
    capMs: 2,
    sleep: async () => {},
  })
}
const chatBase = {
  role: 'fast' as const,
  messages: [{ role: 'user', content: 'hi' }] as any,
}

function resetFakeState() {
  createCalls.length = 0
  streamScripts.length = 0
}

describe('G-1 onStreamDelta 传入面 = 流式路径（逐 delta 同步转发）', () => {
  test('多 token 流 → onStreamDelta 逐 delta 回调（顺序保真）+ 返回完整 assistant message', async () => {
    resetFakeState()
    streamScripts.push(() => multiTextStream(['he', 'llo', '!']))
    const provider = makeProvider()
    const deltas: StreamDelta[] = []
    const res = await provider.chat({
      ...chatBase,
      onStreamDelta: d => deltas.push(d),
    })
    expect(deltas).toEqual([
      { type: 'text_delta', text: 'he' },
      { type: 'text_delta', text: 'llo' },
      { type: 'text_delta', text: '!' },
    ])
    // 返回契约 = 非流式面同形（完整 message，Promise 契约不变）
    expect(res.type).toBe('assistant')
    const content = res.message.content as Array<{ type: string; text?: string }>
    expect(content.map(b => b.text).join('')).toBe('hello!')
    expect(res.message.stop_reason).toBe('end_turn')
    // 流式面 create（stream: true + include_usage）
    expect(createCalls[0].stream).toBe(true)
    expect(createCalls[0].params.stream).toBe(true)
  })

  test('tool_calls 流 → tool_use_start / tool_use_delta / tool_use_end 顺序转发 + tool_use 块返回', async () => {
    resetFakeState()
    streamScripts.push(() => toolStream())
    const provider = makeProvider()
    const deltas: StreamDelta[] = []
    const res = await provider.chat({
      ...chatBase,
      onStreamDelta: d => deltas.push(d),
    })
    expect(deltas.map(d => d.type)).toEqual([
      'tool_use_start',
      'tool_use_delta',
      'tool_use_end',
    ])
    expect(res.message.stop_reason).toBe('tool_use')
    const toolBlock = (res.message.content as any[]).find(b => b.type === 'tool_use')
    expect(toolBlock.name).toBe('echo')
    expect(toolBlock.input).toEqual({ a: 1 })
  })

  test('流中途错误（有 partial）= C4-1 interrupted assistant 即该轮内容 + partial delta 已转发', async () => {
    resetFakeState()
    streamScripts.push(() => errorAfterStream(textChunks(['par']), new Error('stream broke')))
    const provider = makeProvider()
    const deltas: StreamDelta[] = []
    const res = await provider.chat({
      ...chatBase,
      onStreamDelta: d => deltas.push(d),
    })
    expect(deltas).toEqual([{ type: 'text_delta', text: 'par' }])
    expect(res.message.stop_reason).toBe('interrupted')
    const text = (res.message.content as Array<{ text?: string }>)
      .map(b => b.text)
      .join('')
    expect(text).toBe('par')
    // 不整流重发（单发终止 = 防双内容）
    expect(createCalls.length).toBe(1)
  })

  test('零 partial 错误 = 抛原始错误（错误契约同非流式面，withTurnRecovery 分类语义不变）', async () => {
    resetFakeState()
    const forbidden = Object.assign(new Error('forbidden'), { status: 403 })
    streamScripts.push(() => errorAfterStream([], forbidden))
    const provider = makeProvider()
    const deltas: StreamDelta[] = []
    await expect(
      provider.chat({ ...chatBase, onStreamDelta: d => deltas.push(d) }),
    ).rejects.toBe(forbidden)
    expect(deltas).toEqual([])
  })
})

describe('G-1 onStreamDelta 未传面 = 非流式路径恒等锚', () => {
  test('未传 onStreamDelta → 非流式单发（stream: false）+ 零回调零开销', async () => {
    resetFakeState()
    const provider = makeProvider()
    const res = await provider.chat({ ...chatBase })
    expect(createCalls.length).toBe(1)
    expect(createCalls[0].stream).toBe(false)
    const content = res.message.content as Array<{ type: string; text?: string }>
    expect(content.some(b => b.type === 'text' && b.text === 'ok-nonstream')).toBe(true)
  })

  test('两路径返回形同构（message 字段面同形，调用方零判别）', async () => {
    resetFakeState()
    const provider = makeProvider()
    const nonStream = await provider.chat({ ...chatBase })
    streamScripts.push(() => multiTextStream(['x']))
    const withDelta = await provider.chat({ ...chatBase, onStreamDelta: () => {} })
    const keys = (m: { message: any }) =>
      Object.keys(m.message).sort().join(',')
    expect(keys(withDelta)).toBe(keys(nonStream))
  })
})
