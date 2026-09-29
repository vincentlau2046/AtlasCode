/**
 * mcp 域 S-E2b（§8.68 R2）unit 层：mcpJsonRpc 本地 JSON-RPC 2.0 客户端
 * NDJSON 分帧面（PassThrough 双工对，零网络零 spawn）。
 *
 * 覆盖：
 *   J-P1 分帧面：单行 roundtrip / 单 chunk 多行 / 单行跨 2 chunk /
 *       \r\n 容忍 / 空行跳过 / 坏 JSON 行 → onError 不崩
 *   J-P2 请求响应面：result resolve / error 对象 → McpJsonRpcError
 *       （code/message 透传）/ 未登记 pending id 静默丢
 *   J-P3 通知 + 反向请求面：onNotification 派发 / onRequest 响应写回 /
 *       未登记反向 method → -32601 Method not found
 *   J-P4 生命周期面：read end → onClose + pending 全拒 -32000
 *       'MCP connection closed' / close() 幂等 + 后续 request 拒
 *       'Connection disposed' / reportError 注入通道
 */
import { describe, expect, test } from 'bun:test'
import { PassThrough } from 'node:stream'
import {
  createMcpJsonRpcClient,
  spawnMcpStdioClient,
} from '../../src/mcp'

/** 双工对：client 读 a（server→client 方向）、写 b（client→server 方向）。 */
function duplex() {
  const toClient = new PassThrough()
  const toServer = new PassThrough()
  const client = createMcpJsonRpcClient(toClient, toServer)
  /** 模拟 server 侧：读 toServer 行 → 回响应帧。 */
  const serverSide = (handler: (msg: Record<string, unknown>) => unknown) => {
    let buf = ''
    toServer.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      let i
      while ((i = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, i)
        buf = buf.slice(i + 1)
        if (!line.trim()) continue
        const msg = JSON.parse(line) as Record<string, unknown>
        const out = handler(msg)
        if (out !== undefined) {
          toClient.write(`${JSON.stringify(out)}\n`)
        }
      }
    })
  }
  return { client, toClient, toServer, serverSide }
}

function serverEcho(result: unknown) {
  return (msg: Record<string, unknown>): unknown => ({
    jsonrpc: '2.0',
    id: msg.id,
    result,
  })
}

describe('J-P1 NDJSON 分帧面', () => {
  test('单行 request → result roundtrip', async () => {
    const { client, serverSide } = duplex()
    serverSide(serverEcho({ ok: true }))
    const res = (await client.request('ping')) as { ok: boolean }
    expect(res.ok).toBe(true)
    client.close()
  })

  test('单 chunk 多行：同帧 2 个响应按 id 各归其位', async () => {
    const { client, toClient } = duplex()
    const p1 = client.request('a')
    const p2 = client.request('b')
    // server 侧两个响应挤一个 chunk
    toClient.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'one' })}\n${JSON.stringify({ jsonrpc: '2.0', id: 2, result: 'two' })}\n`,
    )
    expect(await p1).toBe('one')
    expect(await p2).toBe('two')
    client.close()
  })

  test('单行跨 2 chunk：半行留 buffer 续接', async () => {
    const { client, toClient } = duplex()
    const p = client.request('split')
    const full = JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'joined' })
    const half = Math.floor(full.length / 2)
    toClient.write(full.slice(0, half))
    // 半行未到齐：pending 不 resolve
    await new Promise(r => setTimeout(r, 10))
    toClient.write(full.slice(half) + '\n')
    expect(await p).toBe('joined')
    client.close()
  })

  test('\\r\\n 行尾容忍（\\r 剥除后 JSON 有效）', async () => {
    const { client, toClient } = duplex()
    const p = client.request('crlf')
    toClient.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'x' })}\r\n`)
    expect(await p).toBe('x')
    client.close()
  })

  test('空行跳过（不崩不派发）', () => {
    const { client, toClient } = duplex()
    toClient.write('\n\n')
    client.close()
  })

  test('坏 JSON 行 → onError 抛错面（不崩、不吞后续行）', async () => {
    const { client, toClient } = duplex()
    const errors: Error[] = []
    client.onError(e => errors.push(e))
    toClient.write('not-json{\n')
    const p = client.request('after')
    toClient.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'still-alive' })}\n`)
    expect(await p).toBe('still-alive')
    expect(errors.length).toBe(1)
    client.close()
  })
})

describe('J-P2 请求响应面', () => {
  test('error 对象 → McpJsonRpcError（code/message 透传）', async () => {
    const { client, serverSide } = duplex()
    serverSide(msg => ({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: 'Method not found: tools/list' },
    }))
    await expect(client.request('tools/list')).rejects.toMatchObject({
      name: 'McpJsonRpcError',
      code: -32601,
      message: 'Method not found: tools/list',
    })
    client.close()
  })

  test('未登记 id 的响应帧静默丢弃（不 throw 不拒）', () => {
    const { client, toClient } = duplex()
    toClient.write(`${JSON.stringify({ jsonrpc: '2.0', id: 999, result: 'x' })}\n`)
    client.close()
  })
})

describe('J-P3 通知 + 反向请求面', () => {
  test('server→client 通知 → onNotification 派发（params 透传）', () => {
    const { client, toClient } = duplex()
    const seen: unknown[] = []
    client.onNotification('notifications/tools/list_changed', p =>
      seen.push(p),
    )
    toClient.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/tools/list_changed', params: { v: 1 } })}\n`,
    )
    expect(seen).toEqual([{ v: 1 }])
    client.close()
  })

  test('server→client 反向请求 → handler 响应写回（id 对应）', async () => {
    const { client, toClient, toServer } = duplex()
    client.onRequest('roots/list', () => ({ roots: [{ uri: 'file:///w' }] }))
    toClient.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 50, method: 'roots/list' })}\n`,
    )
    // 读回 client 写的响应帧
    await new Promise(r => setTimeout(r, 10))
    const out = toServer.read().toString('utf8')
    const frame = JSON.parse(out.trim().split('\n').pop()!)
    expect(frame.id).toBe(50)
    expect(frame.result).toEqual({ roots: [{ uri: 'file:///w' }] })
    client.close()
  })

  test('未登记反向 method → -32601 Method not found 帧', async () => {
    const { client, toClient, toServer } = duplex()
    toClient.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 51, method: 'no/such' })}\n`,
    )
    await new Promise(r => setTimeout(r, 10))
    const out = toServer.read().toString('utf8')
    const frame = JSON.parse(out.trim().split('\n').pop()!)
    expect(frame.error.code).toBe(-32601)
    expect(frame.error.message).toBe('Method not found: no/such')
    client.close()
  })
})

describe('J-P4 生命周期面', () => {
  test('read end → onClose + pending 全拒 -32000 MCP connection closed', async () => {
    const { client, toClient } = duplex()
    let closed = false
    client.onClose(() => {
      closed = true
    })
    const p = client.request('dangling')
    toClient.end()
    await expect(p).rejects.toMatchObject({
      name: 'McpJsonRpcError',
      code: -32000,
      message: 'MCP connection closed',
    })
    expect(closed).toBe(true)
  })

  test('close() 幂等 + 后续 request 拒 Connection disposed', async () => {
    const { client } = duplex()
    client.close()
    client.close() // 幂等
    await expect(client.request('late')).rejects.toMatchObject({
      code: -32000,
      message: 'Connection disposed',
    })
  })

  test('reportError 注入通道（spawn ENOENT 面）', () => {
    const { client } = duplex()
    const seen: Error[] = []
    client.onError(e => seen.push(e))
    client.reportError(new Error('spawn ENOENT'))
    expect(seen[0].message).toBe('spawn ENOENT')
    client.close()
  })

  test('spawn 不存在命令 → onError spawn 失败面（真 spawn 零网络；Node ENOENT / Bun Executable-not-found 双文案断言 = 语义面保真，词面 delta 登记）', async () => {
    const { client } = spawnMcpStdioClient({
      command: 'definitely-not-a-real-binary-xyz',
      args: [],
      env: process.env,
    })
    const seen: Error[] = []
    client.onError(e => seen.push(e))
    await new Promise<void>(resolve => {
      const t = setTimeout(() => {
        // 超时 = spawn 面没报 ENOENT（不应发生）
        resolve()
      }, 3000)
      client.onError(() => {
        clearTimeout(t)
        resolve()
      })
    })
    expect(seen.length).toBeGreaterThanOrEqual(1)
    // 双运行器文案面（Bun: 'Executable not found in $PATH: ...'；
    // Node: 'spawn ENOENT'）
    expect(seen[0].message).toMatch(/ENOENT|Executable not found/)
    client.close()
  })
})
