/**
 * 0.1.81 V3-2 K2 MCP 面 — #5 判别测试：HTTP 回复 body 永不结束挂死修复
 *（unit 层零网络：fake baseFetch + ReadableStream fixture）。
 *
 * 探针结论（修前红基线 d39b4f5）：wrapFetchWithTimeout 只 bound headers
 * 阶段——baseFetch resolve 返回 Response 即 cleanup()（clearTimeout），
 * body 读取无界 → server 永不收尾 body 时调用方挂死（MCP_TIMEOUT||30000
 * 连接超时只覆盖 connect 面，读侧无兜底）。修面 = 非 SSE（content-type
 * 不含 text/event-stream）且有 body 的回复，body 以 pass-through
 * ReadableStream 包裹，读侧与「回复到达起算的总期限」race——期限 = 连接
 * 超时口径（MCP_TIMEOUT||30000，工单「超时归并连接超时口径」裁定：POST
 * 回复体 = JSON-RPC 信封应在连接超时预算内收尾，慢滴灌流同样不豁免）；
 * SSE 回复（长活流，同 GET 豁免口径）与无 body 回复原样返回。
 *
 * 挂死防护纪律：所有「修前应挂死」用例的读 promise 与测试侧 2s delay
 * race——修前得 'HANG'（红），修后 rejects TimeoutError（绿）；pending
 * promise 无事件句柄不阻进程退出。
 */
import { afterEach, describe, expect, test } from 'bun:test'
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js'
import {
  MCP_REQUEST_TIMEOUT_MS,
  getMcpConnectionTimeoutMs,
  wrapFetchWithTimeout,
} from '../../src/tui/services/mcp/fetchTimeout'

const ORIGINAL_MCP_TIMEOUT = process.env.MCP_TIMEOUT

afterEach(() => {
  if (ORIGINAL_MCP_TIMEOUT === undefined) {
    delete process.env.MCP_TIMEOUT
  } else {
    process.env.MCP_TIMEOUT = ORIGINAL_MCP_TIMEOUT
  }
})

const encoder = new TextEncoder()

/** 读结果赛跑标签：正文完成 / 出错（错误名）/ 2s 挂死。 */
async function readOutcome(res: Response): Promise<string> {
  return Promise.race([
    res.text().then(
      () => 'COMPLETED',
      (e: Error) => `ERR:${e.name}`,
    ),
    new Promise<string>(r => setTimeout(() => r('HANG'), 2000)),
  ])
}

/** body 永不结束（pull 永不 resolve，零字节零收尾）= 工单挂死面。 */
function neverEndingBody(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    pull: () => new Promise<void>(() => {}),
  })
}

describe('K2 #5：HTTP 回复 body 无收尾挂死修复', () => {
  test('body 永不结束（零字节）→ 读侧 TimeoutError 不挂死（修前红：HANG）', async () => {
    process.env.MCP_TIMEOUT = '100'
    const base: FetchLike = async () =>
      new Response(neverEndingBody(), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    const wrapped = wrapFetchWithTimeout(base)
    const res = await wrapped('https://example.invalid/mcp', {
      method: 'POST',
    })
    expect(await readOutcome(res)).toBe('ERR:TimeoutError')
  })

  test('慢滴灌 body（持续有数据但永不收尾）→ 总期限到期 TimeoutError', async () => {
    // 逐 read 50ms 内 resolve（per-read idle 超时永不 fire）——总期限
    // 语义判别：期限自回复到达起算，滴灌不豁免
    process.env.MCP_TIMEOUT = '150'
    const trickle = new ReadableStream<Uint8Array>({
      async pull(ctrl) {
        ctrl.enqueue(encoder.encode('x'))
        await new Promise(r => setTimeout(r, 50))
      },
    })
    const base: FetchLike = async () =>
      new Response(trickle, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    const wrapped = wrapFetchWithTimeout(base)
    const res = await wrapped('https://example.invalid/mcp', {
      method: 'POST',
    })
    expect(await readOutcome(res)).toBe('ERR:TimeoutError')
  })

  test('正常 body 直通：分块内容完整到达（回归守卫）', async () => {
    process.env.MCP_TIMEOUT = '5000'
    const body = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(encoder.encode('{"jsonrpc"'))
        ctrl.enqueue(encoder.encode(':"2.0"}'))
        ctrl.close()
      },
    })
    const base: FetchLike = async () =>
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    const wrapped = wrapFetchWithTimeout(base)
    const res = await wrapped('https://example.invalid/mcp', {
      method: 'POST',
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.text()).toBe('{"jsonrpc":"2.0"}')
  })

  test('SSE 回复豁免：原样返回不绑期限（identity，长活流口径同 GET）', async () => {
    // 若误绑期限，50ms 后长活 SSE body 会炸 TimeoutError
    process.env.MCP_TIMEOUT = '50'
    const sseBody = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(encoder.encode('data: hi\n\n'))
      },
      // 不 close：长活流
      pull: () => new Promise<void>(() => {}),
    })
    let raw: Response | undefined
    const base: FetchLike = async () => {
      raw = new Response(sseBody, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
      return raw
    }
    const wrapped = wrapFetchWithTimeout(base)
    const res = await wrapped('https://example.invalid/mcp', {
      method: 'POST',
    })
    expect(res).toBe(raw!)
  })
})

describe('K2 #5：既有语义回归守卫（随迁零回归）', () => {
  test('Accept 归一：缺省补 Streamable HTTP 值，显式不覆写', async () => {
    const seen: Array<HeadersInit | undefined> = []
    const base: FetchLike = async (_url, init) => {
      seen.push(init?.headers)
      return new Response(null, { status: 202 })
    }
    const wrapped = wrapFetchWithTimeout(base)
    await wrapped('https://x.example.com/mcp', { method: 'POST' })
    await wrapped('https://x.example.com/mcp', {
      method: 'POST',
      headers: { accept: 'text/custom' },
    })
    expect(new Headers(seen[0]).get('accept')).toBe(
      'application/json, text/event-stream',
    )
    expect(new Headers(seen[1]).get('accept')).toBe('text/custom')
  })

  test('GET 豁免：原样直通不改写；60s headers 常量 + 连接超时缺省口径', async () => {
    expect(MCP_REQUEST_TIMEOUT_MS).toBe(60000)
    expect(getMcpConnectionTimeoutMs()).toBe(30000)
    let raw: Response | undefined
    const base: FetchLike = async (_url, init) => {
      // GET 直通：method 不被改写（缺省 GET 面）
      expect((init?.method ?? 'GET').toUpperCase()).toBe('GET')
      raw = new Response(null, { status: 200 })
      return raw
    }
    const wrapped = wrapFetchWithTimeout(base)
    const res = await wrapped('https://x.example.com/sse', { method: 'GET' })
    expect(res).toBe(raw!)
  })
})
