/**
 * lsp 域 — 本地最小 JSON-RPC 2.0 stdio 客户端（§8.67 D 波 S-E2c，delta 登记）。
 *
 * 旧仓 LSPClient 的 JSON-RPC 传输面 = vscode-jsonrpc（StreamMessageReader /
 * StreamMessageWriter / createMessageConnection / Trace）→ 3-dep 违规面
 * （新仓依赖面 = diff/openai/proper-lockfile/shell-quote/zod 五枚）→
 * 本文件本地转写，消费面 = createLSPClient 全调用面：
 *   - sendRequest(method, params) → Promise（id 序列 + pending 表；
 *     error 面 = {code, message, data} 透传 → JsonRpcError.code 供
 *     LSPServerInstance 瞬态重试（-32801）duck-type 判码）
 *   - sendNotification(method, params)（fire-and-forget，无 id）
 *   - onNotification(method, handler)（诊断/进度等 server→client 通知）
 *   - onRequest(method, handler)（server→client 反向请求，
 *     manager 的 workspace/configuration 消费面；响应 id = 请求 id）
 *   - listen() 起读 / onError / onClose / dispose
 *   - trace(level) = no-op Promise（旧仓 trace(Trace.Verbose).catch 调用位
 *     形状保留 → 返回 Promise.resolve()）
 *
 * 帧格式 = LSP base protocol（Content-Length 分帧，双向）：
 *   Content-Length: <byte length>\r\n\r\n<JSON-RPC 消息 UTF-8 字节>
 * 读侧：chunk 累积 → 找 \r\n\r\n 头终止 → 按 Content-Length 取整帧；
 * 头终止符可跨 chunk（单 buffer 累积 + latin1 检索，LSP 流量面够用）。
 */

import type { Readable, Writable } from 'node:stream'

/** JSON-RPC 错误（error 对象 {code, message, data} 的 Error 化；
 * code 面 = LSPServerInstance 瞬态重试 duck-type 判码消费面）。 */
export class JsonRpcError extends Error {
  code: number
  data?: unknown
  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.name = 'JsonRpcError'
    this.code = code
    this.data = data
  }
}

type PendingRequest = {
  resolve: (result: unknown) => void
  reject: (error: JsonRpcError) => void
}

type JsonRpcMessage = {
  jsonrpc?: '2.0'
  id?: number
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface JsonRpcClient {
  sendRequest(method: string, params?: unknown): Promise<unknown>
  sendNotification(method: string, params?: unknown): void
  onNotification(
    method: string,
    handler: (params: unknown) => void,
  ): { dispose(): void }
  onRequest(
    method: string,
    handler: (params: unknown) => unknown | Promise<unknown>,
  ): { dispose(): void }
  listen(): void
  onError(callback: (error: Error) => void): void
  onClose(callback: () => void): void
  trace(level?: number): Promise<void>
  dispose(): void
}

const CRLFCRLF = '\r\n\r\n'

/** 本地最小 JSON-RPC 客户端（Content-Length 分帧，stdout 读 / stdin 写）。 */
export function createJsonRpcClient(
  readStream: Readable,
  writeStream: Writable,
): JsonRpcClient {
  let nextId = 1
  const pending = new Map<number, PendingRequest>()
  const notificationHandlers = new Map<string, Set<(params: unknown) => void>>()
  const requestHandlers = new Map<
    string,
    Set<(params: unknown) => unknown | Promise<unknown>>
  >()
  const errorCallbacks = new Set<(error: Error) => void>()
  const closeCallbacks = new Set<() => void>()
  let buffer = Buffer.alloc(0)
  let disposed = false
  let closed = false

  function emitError(error: Error): void {
    for (const cb of errorCallbacks) {
      try {
        cb(error)
      } catch {
        // 消费者回调抛错不拖垮传输面
      }
    }
  }

  function emitClose(): void {
    if (closed) return
    closed = true
    for (const cb of closeCallbacks) {
      try {
        cb()
      } catch {
        // 同上
      }
    }
  }

  function dispatchMessage(message: JsonRpcMessage): void {
    // 响应帧 = 有 id 且无 method
    if (message.id !== undefined && message.method === undefined) {
      const entry = pending.get(message.id)
      if (!entry) return
      pending.delete(message.id)
      if (message.error) {
        entry.reject(
          new JsonRpcError(
            message.error.code,
            message.error.message,
            message.error.data,
          ),
        )
      } else {
        entry.resolve(message.result)
      }
      return
    }
    if (message.method === undefined) return
    if (message.id === undefined) {
      // 通知帧（server → client）
      const handlers = notificationHandlers.get(message.method)
      if (!handlers) return
      for (const handler of handlers) {
        try {
          handler(message.params)
        } catch (e) {
          emitError(e instanceof Error ? e : new Error(String(e)))
        }
      }
      return
    }
    // 反向请求帧（server → client，如 workspace/configuration）
    const handlers = requestHandlers.get(message.method)
    if (!handlers) {
      writeRaw({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: `Method not found: ${message.method}` },
      })
      return
    }
    for (const handler of handlers) {
      Promise.resolve()
        .then(() => handler(message.params))
        .then(
          result => {
            writeRaw({ jsonrpc: '2.0', id: message.id, result: result ?? null })
          },
          error => {
            const code =
              error instanceof JsonRpcError ? error.code : -32603
            const message2 =
              error instanceof Error ? error.message : String(error)
            writeRaw({
              jsonrpc: '2.0',
              id: message.id,
              error: { code, message: message2 },
            })
          },
        )
    }
  }

  function processBuffer(): void {
    while (true) {
      const headerEnd = buffer.toString('latin1', 0, Math.min(buffer.length, 8192)).indexOf(CRLFCRLF)
      if (headerEnd === -1) {
        // 头部未收齐（或 buffer 已 >8KB 仍无终止符 = 畸形流，停止累积防泄漏）
        if (buffer.length > 64 * 1024) {
          buffer = Buffer.alloc(0)
          emitError(new Error('LSP JSON-RPC: malformed stream (oversized header)'))
          return
        }
        return
      }
      const header = buffer.toString('latin1', 0, headerEnd)
      const match = /Content-Length:\s*(\d+)/i.exec(header)
      if (!match) {
        buffer = buffer.subarray(headerEnd + CRLFCRLF.length)
        continue
      }
      const contentLength = parseInt(match[1], 10)
      const bodyStart = headerEnd + CRLFCRLF.length
      if (buffer.length < bodyStart + contentLength) return // 帧体未收齐
      const body = buffer.subarray(bodyStart, bodyStart + contentLength)
      buffer = buffer.subarray(bodyStart + contentLength)
      try {
        dispatchMessage(JSON.parse(body.toString('utf8')) as JsonRpcMessage)
      } catch (e) {
        emitError(e instanceof Error ? e : new Error(String(e)))
      }
    }
  }

  function writeRaw(message: JsonRpcMessage): void {
    if (disposed) return
    const json = JSON.stringify(message)
    const payload = Buffer.from(json, 'utf8')
    const frame = Buffer.concat([
      Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, 'ascii'),
      payload,
    ])
    try {
      writeStream.write(frame)
    } catch (e) {
      emitError(e instanceof Error ? e : new Error(String(e)))
    }
  }

  function onChunk(chunk: Buffer | string): void {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)])
    processBuffer()
  }

  readStream.on('data', onChunk)
  readStream.on('error', (e: Error) => emitError(e))
  readStream.on('end', () => {
    emitClose()
    for (const entry of pending.values()) {
      entry.reject(new JsonRpcError(-32000, 'LSP connection closed'))
    }
    pending.clear()
  })
  writeStream.on('error', (e: Error) => emitError(e))

  return {
    sendRequest(method, params) {
      if (disposed) {
        return Promise.reject(new JsonRpcError(-32000, 'Connection disposed'))
      }
      const id = nextId++
      return new Promise<unknown>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        writeRaw({ jsonrpc: '2.0', id, method, params })
      })
    },
    sendNotification(method, params) {
      if (disposed) return
      writeRaw({ jsonrpc: '2.0', method, params })
    },
    onNotification(method, handler) {
      let set = notificationHandlers.get(method)
      if (!set) {
        set = new Set()
        notificationHandlers.set(method, set)
      }
      set.add(handler)
      return {
        dispose() {
          set?.delete(handler)
        },
      }
    },
    onRequest(method, handler) {
      let set = requestHandlers.get(method)
      if (!set) {
        set = new Set()
        requestHandlers.set(method, set)
      }
      set.add(handler)
      return {
        dispose() {
          set?.delete(handler)
        },
      }
    },
    listen() {
      // 读侧监听已在构造期挂上；listen = 语义锚（旧 createMessageConnection().listen() 位保留）
    },
    onError(callback) {
      errorCallbacks.add(callback)
    },
    onClose(callback) {
      closeCallbacks.add(callback)
      if (closed) callback()
    },
    // trace 面 no-op（旧仓 trace(Trace.Verbose).catch 调用位形状保留）
    trace() {
      return Promise.resolve()
    },
    dispose() {
      if (disposed) return
      disposed = true
      readStream.removeListener('data', onChunk)
      readStream.removeAllListeners()
      for (const entry of pending.values()) {
        entry.reject(new JsonRpcError(-32000, 'Connection disposed'))
      }
      pending.clear()
      notificationHandlers.clear()
      requestHandlers.clear()
      errorCallbacks.clear()
      closeCallbacks.clear()
    },
  }
}
