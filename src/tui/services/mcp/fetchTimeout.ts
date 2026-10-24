/**
 * MCP fetch 超时包装（0.1.81 V3-2 K2 #5 自 client.ts 抽取的零依赖模块）。
 *
 * 抽取动机：client.ts import 图重（MCP SDK / React tools / state /
 * feature('MCP_SKILLS')），判别单测不可直接 import——按本波 mcpPolicy.ts
 * 先例把 fetch 包装面抽为零依赖模块（仅 type import SDK FetchLike），
 * client.ts 改 import 消费（wrapFetchWithTimeout / 两常量零外部消费面，
 * grep 确证后移动）。
 *
 * 既有语义（client.ts 随迁，行为零回归）：
 *   - headers 阶段 60s 请求超时（setTimeout + clearTimeout，防
 *     AbortSignal.timeout 在 Bun 惰性 GC 下 ~2.4KB/请求原生内存滞留，
 *     原注释随迁）；
 *   - Streamable HTTP Accept 归一（SDK Headers 经对象展开有被运行时丢弃
 *     的先例，最后包装面兜底，
 *     anthropics/claude-agent-sdk-typescript#202）；
 *   - GET 豁免（MCP 传输面 GET = 长活 SSE 流，不设超时；auth.ts 的 GET
 *     走独立 createAuthFetch 超时）。
 *
 * 本波修面（工单 #5：HTTP 回复 body 永不结束 → 挂死）：见
 * bindBodyReadDeadline 头注。
 */
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js'

/** 连接超时口径（mcpConnectionManager getConnectionTimeoutMs 同值同源）。 */
export function getMcpConnectionTimeoutMs(): number {
  return parseInt(process.env.MCP_TIMEOUT || '', 10) || 30000
}

/**
 * Default timeout for individual MCP requests (auth, tool calls, etc.)
 */
export const MCP_REQUEST_TIMEOUT_MS = 60000

/**
 * MCP Streamable HTTP spec requires clients to advertise acceptance of both
 * JSON and SSE on every POST. Servers that enforce this strictly reject
 * requests without it (HTTP 406).
 * https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#sending-messages-to-the-server
 */
export const MCP_STREAMABLE_HTTP_ACCEPT = 'application/json, text/event-stream'

/**
 * 0.1.81 V3-2 K2 #5 修面：非 SSE 回复的 body 读侧总期限。
 *
 * 旧缺陷：wrapFetchWithTimeout 只 bound headers 阶段——baseFetch resolve
 * 返回 Response 即 clearTimeout，body 读取无界 → server 永不收尾 body 时
 * 调用方挂死（连接超时 MCP_TIMEOUT||30000 只覆盖 connect 面）。
 *
 * 修面语义：
 *   - 非 SSE（content-type 不含 text/event-stream）且有 body 的回复，body
 *     以 pass-through ReadableStream 包裹，读侧与「回复到达起算的总期限」
 *     Promise.race——总期限（非 per-read idle）：慢滴灌流（逐 read 有数据
 *     但永不收尾）同样到期，per-read 口径对它恒不 fire；
 *   - 期限值 = 连接超时口径（getMcpConnectionTimeoutMs，工单「超时归并
 *     连接超时口径」裁定：POST 回复体 = JSON-RPC 信封，应在连接超时预算
 *     内收尾）；
 *   - 到期 → ctrl.error(TimeoutError) + reader.cancel（读侧快速失败，不
 *     挂死）；正常完成/读出错/消费方 cancel → 清期限；
 *   - SSE 回复（长活流，同 GET 豁免口径）与无 body 回复原样返回。
 */
function bindBodyReadDeadline(response: Response): Response {
  const contentType = response.headers?.get('content-type') ?? ''
  if (contentType.includes('text/event-stream')) {
    return response
  }
  const rawBody = response.body
  if (!rawBody) {
    return response
  }

  const reader = rawBody.getReader()
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    deadlineTimer = setTimeout(
      () =>
        reject(new DOMException('The operation timed out.', 'TimeoutError')),
      getMcpConnectionTimeoutMs(),
    )
    deadlineTimer.unref?.()
  })
  // race 败北侧（读完成/取消后才到期 fire）防未处理 rejection
  deadline.catch(() => {})
  const clearDeadline = () => {
    if (deadlineTimer) {
      clearTimeout(deadlineTimer)
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      try {
        const { done, value } = await Promise.race([reader.read(), deadline])
        if (done) {
          clearDeadline()
          ctrl.close()
        } else {
          ctrl.enqueue(value)
        }
      } catch (error) {
        // 读出错或期限到期：清期限 + 放弃底层 reader（cancel 防资源滞留；
        // 到期后底层 read 仍 pending，cancel 使其结算）
        clearDeadline()
        void reader.cancel().catch(() => {})
        ctrl.error(error)
      }
    },
    cancel(reason) {
      clearDeadline()
      return reader.cancel(reason)
    },
  })

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

/**
 * Wraps a fetch function to apply a fresh timeout signal to each request.
 * This avoids the bug where a single AbortSignal.timeout() created at connection
 * time becomes stale after 60 seconds, causing all subsequent requests to fail
 * immediately with "The operation timed out." Uses a 60-second timeout.
 *
 * Also ensures the Accept header required by the MCP Streamable HTTP spec is
 * present on POSTs. The MCP SDK sets this inside StreamableHTTPClientTransport.send(),
 * but it is attached to a Headers instance that passes through an object spread here,
 * and some runtimes/agents have been observed dropping it before it reaches the wire.
 * See https://github.com/anthropics/claude-agent-sdk-typescript/issues/202.
 * Normalizing here (the last wrapper before fetch()) guarantees it is sent.
 *
 * GET requests are excluded from the timeout since, for MCP transports, they are
 * long-lived SSE streams meant to stay open indefinitely. (Auth-related GETs use
 * a separate fetch wrapper with its own timeout in auth.ts.)
 *
 * @param baseFetch - The fetch function to wrap
 */
export function wrapFetchWithTimeout(baseFetch: FetchLike): FetchLike {
  return async (url: string | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()

    // Skip timeout for GET requests - in MCP transports, these are long-lived SSE streams.
    // (OAuth discovery GETs in auth.ts use a separate createAuthFetch() with its own timeout.)
    if (method === 'GET') {
      return baseFetch(url, init)
    }

    // Normalize headers and guarantee the Streamable-HTTP Accept value. new Headers()
    // accepts HeadersInit | undefined and copies from plain objects, tuple arrays,
    // and existing Headers instances — so whatever shape the SDK handed us, the
    // Accept value survives the spread below as an own property of a concrete object.
    const headers = new Headers(init?.headers)
    if (!headers.has('accept')) {
      headers.set('accept', MCP_STREAMABLE_HTTP_ACCEPT)
    }

    // Use setTimeout instead of AbortSignal.timeout() so we can clearTimeout on
    // completion. AbortSignal.timeout's internal timer is only released when the
    // signal is GC'd, which in Bun is lazy — ~2.4KB of native memory per request
    // lingers for the full 60s even when the request completes in milliseconds.
    const controller = new AbortController()
    const timer = setTimeout(
      c =>
        c.abort(new DOMException('The operation timed out.', 'TimeoutError')),
      MCP_REQUEST_TIMEOUT_MS,
      controller,
    )
    timer.unref?.()

    const parentSignal = init?.signal
    const abort = () => controller.abort(parentSignal?.reason)
    parentSignal?.addEventListener('abort', abort)
    if (parentSignal?.aborted) {
      controller.abort(parentSignal.reason)
    }

    const cleanup = () => {
      clearTimeout(timer)
      parentSignal?.removeEventListener('abort', abort)
    }

    try {
      const response = await baseFetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      })
      cleanup()
      // 0.1.81 K2 #5：headers 阶段清理后，body 读侧接总期限（见
      // bindBodyReadDeadline 头注；SSE/无 body 回复原样返回）
      return bindBodyReadDeadline(response)
    } catch (error) {
      cleanup()
      throw error
    }
  }
}
