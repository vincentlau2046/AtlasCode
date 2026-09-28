/**
 * mcp 域 S-E2b（§8.68 R2）func 层（真 spawn 零模型）：stdio 连接生命周期
 * 全链面（fake MCP server = 临时 NDJSON JSON-RPC 脚本 + process.execPath
 * 真 spawn；无网络无 PTY 无 LLM）。
 *
 * 覆盖（旧仓 client.ts stdio 支 L881-1549 波面）：
 *   S-P1 连接面：spawn + initialize 握手（protocolVersion 2025-03-26 /
 *       serverInfo / capabilities 落位）+ connected 态可查
 *   S-P2 供应商面（真 spawn）：fetchToolsForClient tools/list 往返 +
 *       描述符映射 + fetchCommandsForClient prompts/list 名面 +
 *       getPromptForCommand prompts/get 往返（zipObject 配对）
 *   S-P3 drop 面：server 主动退出 → child close → failed 态
 *       'MCP server connection closed' + LRU 失效（重拉 = 早退 []）+
 *       重连重跑生命周期（新 spawn → 再 connected）
 *   S-P4 超时面：MCP_TIMEOUT env 短超时 + 无响应 server →
 *       failed 'connection timed out after Nms'（旧 L995-1025 面）
 *   S-P5 清理面：closeAll 空表 + 单例 reset（子进程不泄漏）
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  fetchCommandsForClient,
  fetchToolsForClient,
  getMcpConnectionManager,
  resetMcpConnectionManager,
  type ConnectedMcpServer,
  type ScopedMcpServerConfig,
} from '../../src/mcp'

// ── fake MCP server 脚本（NDJSON JSON-RPC；env 开关面）──────────────

function writeFakeServer(dir: string): string {
  const path = join(dir, 'fake-mcp-server.mjs')
  writeFileSync(
    path,
    `let buf = ''
process.stdin.on('data', (chunk) => {
  buf += chunk.toString('utf8')
  let i
  while ((i = buf.indexOf('\\n')) !== -1) {
    const line = buf.slice(0, i)
    buf = buf.slice(i + 1)
    if (!line.trim()) continue
    const msg = JSON.parse(line)
    if (msg.method === 'initialize') {
      if (process.env.FAKE_MCP_HANG === '1') return // 无响应（超时面）
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2025-03-26',
          capabilities: { tools: true, prompts: true },
          serverInfo: { name: 'fake-mcp', version: '1.0.0' },
        },
      }) + '\\n')
    } else if (msg.method === 'tools/list') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          tools: [
            {
              name: 'echo_tool',
              description: 'fake echo',
              inputSchema: { type: 'object', properties: { a: { type: 'string' } } },
            },
          ],
        },
      }) + '\\n')
      if (process.env.FAKE_MCP_EXIT_AFTER_LIST === '1') process.exit(0)
    } else if (msg.method === 'prompts/list') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          prompts: [
            { name: 'greet', description: 'fake prompt', arguments: [{ name: 'who' }] },
          ],
        },
      }) + '\\n')
    } else if (msg.method === 'prompts/get') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          messages: [
            {
              type: 'text',
              content: 'hello ' + (msg.params?.arguments?.who ?? 'anon'),
            },
          ],
        },
      }) + '\\n')
    }
  }
})
process.stdin.on('end', () => process.exit(0))
`,
  )
  return path
}

function stdioCfg(command: string, args: string[]): ScopedMcpServerConfig {
  return {
    type: 'stdio',
    command,
    args,
    scope: 'user',
  } as ScopedMcpServerConfig
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

let dir: string
let serverScript: string
let manager = getMcpConnectionManager()

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-mcp-func-'))
  serverScript = writeFakeServer(dir)
})

afterAll(async () => {
  await resetMcpConnectionManager()
  rmSync(dir, { recursive: true, force: true })
})

function connected(name: string): ConnectedMcpServer {
  const c = manager.get(name)
  expect(c?.type).toBe('connected')
  return c as ConnectedMcpServer
}

describe('S-P1 连接面（spawn + initialize 握手）', () => {
  test('connected 态 + serverInfo / capabilities 落位', async () => {
    const conn = await manager.connect('live', stdioCfg(process.execPath, [serverScript]))
    expect(conn.type).toBe('connected')
    if (conn.type === 'connected') {
      expect(conn.serverInfo).toEqual({ name: 'fake-mcp', version: '1.0.0' })
      expect(conn.capabilities.tools).toBe(true)
      expect(conn.capabilities.prompts).toBe(true)
    }
  })

  test('connected 去重：2 连 = 同例（不二次 spawn）', async () => {
    const a = await manager.connect('live', stdioCfg(process.execPath, [serverScript]))
    const b = await manager.connect('live', stdioCfg(process.execPath, [serverScript]))
    expect(a).toBe(b)
  })

  test('pending 表：连接中可查（慢 initialize）', async () => {
    const cfg = stdioCfg(process.execPath, [serverScript])
    const prevHang = process.env.FAKE_MCP_HANG
    process.env.FAKE_MCP_HANG = '1' // initialize 无响应
    const prevTimeout = process.env.MCP_TIMEOUT
    process.env.MCP_TIMEOUT = '1500' // 慢超时窗口内观察 pending
    const p = manager.connect('slow', cfg)
    await sleep(50)
    expect(manager.getPendingServerNames()).toContain('slow')
    const conn = await p
    expect(conn.type).toBe('failed')
    if (conn.type === 'failed') {
      expect(conn.error).toContain(
        'connection timed out after 1500ms',
      )
    }
    expect(manager.getPendingServerNames()).not.toContain('slow')
    // env 还原
    if (prevHang === undefined) delete process.env.FAKE_MCP_HANG
    else process.env.FAKE_MCP_HANG = prevHang
    if (prevTimeout === undefined) delete process.env.MCP_TIMEOUT
    else process.env.MCP_TIMEOUT = prevTimeout
  })
})

describe('S-P2 供应商面（真 spawn 往返）', () => {
  test('fetchToolsForClient：tools/list 往返 + 描述符映射', async () => {
    const c = connected('live')
    const tools = await fetchToolsForClient(c)
    expect(tools).toEqual([
      {
        name: 'echo_tool',
        description: 'fake echo',
        inputJSONSchema: {
          type: 'object',
          properties: { a: { type: 'string' } },
        },
      },
    ])
  })

  test('fetchCommandsForClient：prompts/list 名面 + getPromptForCommand prompts/get 往返', async () => {
    const c = connected('live')
    const cmds = await fetchCommandsForClient(c)
    expect(cmds).toHaveLength(1)
    expect(cmds[0].name).toBe('mcp__live__greet')
    expect(cmds[0].argNames).toEqual(['who'])
    expect(cmds[0].userFacingName()).toBe('live:greet (MCP)')
    // prompts/get 真往返（zipObject 配对：'alice' → {who:'alice'}；
    // 供应商面 = content 块扁平化 delta ④：messages[].content 提取）
    const msgs = await cmds[0].getPromptForCommand('alice')
    expect(msgs).toEqual(['hello alice'])
  })
})

describe('S-P3 drop 面（server 主动退出）', () => {
  test('退出 → failed MCP server connection closed + LRU 失效 + 重连重跑', async () => {
    const prevExit = process.env.FAKE_MCP_EXIT_AFTER_LIST
    process.env.FAKE_MCP_EXIT_AFTER_LIST = '1'
    const conn = await manager.connect('droppy', stdioCfg(process.execPath, [serverScript]))
    expect(conn.type).toBe('connected')
    // tools/list 触发后 server 自退（脚本内 EXIT_AFTER_LIST 面）
    const c = conn as ConnectedMcpServer
    const tools = await fetchToolsForClient(c)
    expect(tools[0].name).toBe('echo_tool')
    // 等 child close → drop 面落位（轮询 failed 态）
    let state = manager.get('droppy')
    for (let i = 0; i < 100 && state?.type !== 'failed'; i++) {
      await sleep(50)
      state = manager.get('droppy')
    }
    expect(state?.type).toBe('failed')
    if (state?.type === 'failed') {
      expect(state.error).toBe('MCP server connection closed')
    }
    // LRU 失效面：重拉 = 非 connected 早退 []
    expect(await fetchToolsForClient(state as ConnectedMcpServer)).toEqual([])
    // 重连重跑生命周期（新 spawn）
    delete process.env.FAKE_MCP_EXIT_AFTER_LIST
    const re = await manager.connect('droppy', stdioCfg(process.execPath, [serverScript]))
    expect(re.type).toBe('connected')
    if (prevExit === undefined) delete process.env.FAKE_MCP_EXIT_AFTER_LIST
    else process.env.FAKE_MCP_EXIT_AFTER_LIST = prevExit
  })
})

describe('S-P4 超时面（MCP_TIMEOUT env 短超时）', () => {
  test('无响应 server → failed 超时文案逐字', async () => {
    const prev = process.env.MCP_TIMEOUT
    const prevHang = process.env.FAKE_MCP_HANG
    process.env.MCP_TIMEOUT = '120'
    process.env.FAKE_MCP_HANG = '1' // server 忽略 initialize（无响应面）
    try {
      const conn = await manager.connect(
        'timeouty',
        stdioCfg(process.execPath, [serverScript]),
      )
      expect(conn.type).toBe('failed')
      if (conn.type === 'failed') {
        expect(conn.error).toBe(
          'MCP server "timeouty" connection timed out after 120ms',
        )
      }
    } finally {
      if (prev === undefined) delete process.env.MCP_TIMEOUT
      else process.env.MCP_TIMEOUT = prev
      if (prevHang === undefined) delete process.env.FAKE_MCP_HANG
      else process.env.FAKE_MCP_HANG = prevHang
    }
  })
})

describe('S-P5 清理面', () => {
  test('closeAll 全关 + 表空（子进程清理阶梯跑完）', async () => {
    const names = manager.list().map(c => c.name)
    await manager.closeAll()
    expect(manager.list()).toEqual([])
    // 关后重连新例可再连（状态机零残留）
    expect(names.length).toBeGreaterThanOrEqual(2)
  })
})
