/**
 * mcp 域 — 本地最小 JSON-RPC 2.0 stdio 客户端（remote 波 S-E2b，§8.68 R2）。
 *
 * 旧仓 MCP stdio 传输 = @modelcontextprotocol/sdk StdioClientTransport
 * （client.ts L881-899 消费面：spawn + stdin/stdout JSON-RPC + stderr pipe）
 * → 3-dep 违规面（新仓依赖面 = diff/openai/proper-lockfile/shell-quote/zod
 * 五枚）→ 本文件本地转写。结构面 = lsp 域 lspJsonRpc delta ① 先例
 * （pending 表 + id 序列 + onNotification/onRequest 双向 + onError/onClose
 * + dispose 拒 pending -32000），帧格式差异：
 *   - LSP base protocol = Content-Length 分帧
 *   - **MCP stdio spec = 换行分隔 JSON（NDJSON）**：每条 JSON-RPC 消息独占
 *     一行（\n 终止），无 Content-Length 头
 * 读侧：stdout chunk 累积 → 按 \n 切完整行（\r 容忍）→ 逐行 JSON.parse；
 * 半行留 buffer 跨 chunk 续接。
 *
 * 消费面 = mcpConnectionManager stdio connect 支（initialize 握手 +
 * tools/list・resources/list・prompts/list 供应商 + callTool 路由）：
 *   - request(method, params) → Promise（id 序列 + pending 表；error 面
 *     {code, message, data} → McpJsonRpcError.code duck-type 判码）
 *   - notify(method, params)（notifications/initialized 等 fire-and-forget）
 *   - onNotification / onRequest（server→client 反向，roots/list 消费面）
 *   - onError / onClose / close（dispose 拒 pending -32000 'MCP connection
 *     closed'，旧 SDK client.close 同语义）
 */

import { spawn, type ChildProcess } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'

/** JSON-RPC 错误（error 对象 {code, message, data} 的 Error 化；
 * code 面 = MCP 协议错误码透传（-32601 method not found / -32603 internal /
 * -32000 连接关闭 自定义段））。 */
export class McpJsonRpcError extends Error {
  code: number
  data?: unknown
  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.name = 'McpJsonRpcError'
    this.code = code
    this.data = data
  }
}

type PendingRequest = {
  resolve: (result: unknown) => void
  reject: (error: McpJsonRpcError) => void
}

type JsonRpcMessage = {
  jsonrpc?: '2.0'
  id?: number
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface McpJsonRpcClient {
  /** 请求帧（server 回响应；error 对象 → reject McpJsonRpcError）。 */
  request(method: string, params?: unknown): Promise<unknown>
  /** 通知帧（fire-and-forget，无 id，无响应）。 */
  notify(method: string, params?: unknown): void
  /** server→client 通知订阅（MCP notifications/* 面）。 */
  onNotification(
    method: string,
    handler: (params: unknown) => void,
  ): { dispose(): void }
  /** server→client 反向请求订阅（roots/list 消费面；响应 id = 请求 id）。 */
  onRequest(
    method: string,
    handler: (params: unknown) => unknown | Promise<unknown>,
  ): { dispose(): void }
  /** 订阅传输错误（读流 error 等内部 emit；child 'error' 面经
   * reportError 通道注入）。 */
  onError(callback: (error: Error) => void): void
  /** 传输层错误注入通道（spawnMcpStdioClient 挂 child 'error' 用：
   * spawn ENOENT 等冒泡到已注册的 onError 消费者）。 */
  reportError(error: Error): void
  /** 连接关闭（stdout end / child close；pending 全拒 -32000）。 */
  onClose(callback: () => void): void
  /** 释放（拒 pending + 摘监听；幂等）。 */
  close(): void
}

/** 本地最小 JSON-RPC 2.0 客户端（NDJSON 分帧，stdout 读 / stdin 写）。 */
export function createMcpJsonRpcClient(
  readStream: Readable,
  writeStream: Writable,
): McpJsonRpcClient {
  let nextId = 1
  const pending = new Map<number, PendingRequest>()
  const notificationHandlers = new Map<string, Set<(params: unknown) => void>>()
  const requestHandlers = new Map<
    string,
    Set<(params: unknown) => unknown | Promise<unknown>>
  >()
  const errorCallbacks = new Set<(error: Error) => void>()
  const closeCallbacks = new Set<() => void>()
  let lineBuffer = ''
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

  function rejectAllPending(message: string): void {
    for (const entry of pending.values()) {
      entry.reject(new McpJsonRpcError(-32000, message))
    }
    pending.clear()
  }

  function dispatchMessage(message: JsonRpcMessage): void {
    // 响应帧 = 有 id 且无 method
    if (message.id !== undefined && message.method === undefined) {
      const entry = pending.get(message.id)
      if (!entry) return
      pending.delete(message.id)
      if (message.error) {
        entry.reject(
          new McpJsonRpcError(
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
    // 反向请求帧（server → client，如 roots/list）
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
              error instanceof McpJsonRpcError ? error.code : -32603
            const msg =
              error instanceof Error ? error.message : String(error)
            writeRaw({
              jsonrpc: '2.0',
              id: message.id,
              error: { code, message: msg },
            })
          },
        )
    }
  }

  /** NDJSON 读侧：按 \n 切完整行，半行留 buffer 跨 chunk 续接。 */
  function processLineBuffer(): void {
    while (true) {
      const newlineIndex = lineBuffer.indexOf('\n')
      if (newlineIndex === -1) return
      const line = lineBuffer.slice(0, newlineIndex).replace(/\r$/, '')
      lineBuffer = lineBuffer.slice(newlineIndex + 1)
      if (line.length === 0) continue
      try {
        dispatchMessage(JSON.parse(line) as JsonRpcMessage)
      } catch (e) {
        emitError(e instanceof Error ? e : new Error(String(e)))
      }
    }
  }

  function writeRaw(message: JsonRpcMessage): void {
    if (disposed) return
    // MCP stdio = 换行分隔（NDJSON）；行尾 \n 即帧终止
    const payload = JSON.stringify(message)
    try {
      writeStream.write(`${payload}\n`)
    } catch (e) {
      emitError(e instanceof Error ? e : new Error(String(e)))
    }
  }

  function onChunk(chunk: Buffer | string): void {
    lineBuffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    processLineBuffer()
  }

  readStream.on('data', onChunk)
  readStream.on('error', (e: Error) => emitError(e))
  readStream.on('end', () => {
    emitClose()
    rejectAllPending('MCP connection closed')
  })
  writeStream.on('error', (e: Error) => emitError(e))

  return {
    request(method, params) {
      if (disposed) {
        return Promise.reject(new McpJsonRpcError(-32000, 'Connection disposed'))
      }
      const id = nextId++
      return new Promise<unknown>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        writeRaw({ jsonrpc: '2.0', id, method, params })
      })
    },
    notify(method, params) {
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
    onError(callback) {
      errorCallbacks.add(callback)
    },
    reportError(error) {
      emitError(error)
    },
    onClose(callback) {
      closeCallbacks.add(callback)
      if (closed) callback()
    },
    close() {
      if (disposed) return
      disposed = true
      readStream.removeListener('data', onChunk)
      readStream.removeAllListeners()
      rejectAllPending('MCP connection closed')
      notificationHandlers.clear()
      requestHandlers.clear()
      errorCallbacks.clear()
      closeCallbacks.clear()
    },
  }
}

/** stdio spawn 面（旧 StdioClientTransport 构造面转写：spawn + 3 pipe +
 * client 绑 stdout/stdin；stderr 面返回给消费方挂 64MB cap handler）。 */
export function spawnMcpStdioClient(opts: {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
}): {
  client: McpJsonRpcClient
  child: ChildProcess
  stderr: Readable
} {
  const child = spawn(opts.command, opts.args, {
    env: opts.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const client = createMcpJsonRpcClient(
    child.stdout as Readable,
    child.stdin as Writable,
  )
  // spawn 失败（ENOENT 等）= child 'error' 事件（旧 SDK transport.onerror
  // 'spawn ENOENT' 面同语义）→ reportError 通道注入
  child.on('error', (e: Error) => {
    client.reportError(e)
  })
  // child 退出 = 连接关闭（旧 SDK transport.onclose 面）
  child.on('close', () => {
    client.close()
  })
  return { client, child, stderr: child.stderr as Readable }
}
