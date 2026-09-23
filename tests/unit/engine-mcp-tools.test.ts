/**
 * engine/tools MCP 工具构建 契约测试（§8.25 E-2 T-5a）。
 *
 * 被测能力 = createMcpTools 把（连接层预取的）MCPServerConnection 构造成一等 Tool：
 *   - 名字归一（buildMcpToolName / normalizeNameForMCP / getMcpPrefix）
 *   - call 真路由（透传短工具名 + args + signal 到 port.callTool，非全名，非 tautology）
 *   - 结果映射（content→data，_meta/structuredContent→mcpMeta）
 *   - mcpInfoFromString 的 `__` 边界 + 非 MCP 名不受影响
 *   - findMcpServerConnection 两侧归一比对（E-4 scope 查找纯函数）
 * 非 tautology：fake 连接记录真实调用，断言路由行为。I/O-free（无盘 / 无网络 / 无 PTY）→ unit 层。
 */
import { describe, test, expect } from 'bun:test'
import {
  buildMcpToolName,
  createMcpTools,
  findMcpServerConnection,
  getMcpPrefix,
  mcpInfoFromString,
  normalizeNameForMCP,
  type McpToolDescriptor,
  type MCPServerConnection,
} from '../../src/engine'
import type { AssistantMessage } from '../../src/shared'

const ASSISTANT = {
  type: 'assistant',
  uuid: 'u-1',
  timestamp: '2026-09-23T00:00:00Z',
  message: { id: 'm-1', role: 'assistant', content: [], stop_reason: 'tool_calls' },
} as unknown as AssistantMessage

type CallRecord = { toolName: string; args: Record<string, unknown>; signal?: AbortSignal }

function makeConnection(
  name: string,
  tools?: McpToolDescriptor[],
  opts?: { content?: unknown; _meta?: Record<string, unknown>; structuredContent?: Record<string, unknown> },
) {
  const calls: CallRecord[] = []
  const conn: MCPServerConnection = {
    name,
    tools,
    client: {
      callTool: async (toolName, args, signal) => {
        calls.push({ toolName, args, signal })
        return {
          content: opts?.content ?? `mcp-content:${toolName}`,
          ...(opts?._meta ? { _meta: opts._meta } : {}),
          ...(opts?.structuredContent ? { structuredContent: opts.structuredContent } : {}),
        }
      },
    },
  }
  return { conn, calls }
}

describe('normalizeNameForMCP / getMcpPrefix / buildMcpToolName（名字归一）', () => {
  test('① 合法字符（字母/数字/下划线/连字符）保持不变', () => {
    expect(normalizeNameForMCP('my-server')).toBe('my-server')
    expect(normalizeNameForMCP('a1_b2')).toBe('a1_b2')
  })

  test('② 非法字符（点/空格/冒号）→ 下划线', () => {
    expect(normalizeNameForMCP('my.server')).toBe('my_server')
    expect(normalizeNameForMCP('do:thing')).toBe('do_thing')
  })

  test('③ getMcpPrefix = mcp__<normalized>__', () => {
    expect(getMcpPrefix('my.server')).toBe('mcp__my_server__')
  })

  test('④ buildMcpToolName server+tool 均归一', () => {
    expect(buildMcpToolName('my.server', 'do:thing')).toBe('mcp__my_server__do_thing')
  })
})

describe('mcpInfoFromString（`__` 边界 + 非 MCP 名）', () => {
  test('① 标准 mcp__server__tool', () => {
    expect(mcpInfoFromString('mcp__srv__tool')).toEqual({ serverName: 'srv', toolName: 'tool' })
  })

  test('② tool 段含 `__` → join 回', () => {
    expect(mcpInfoFromString('mcp__srv__a__b')).toEqual({ serverName: 'srv', toolName: 'a__b' })
  })

  test('③ 无 tool 段 → toolName undefined', () => {
    expect(mcpInfoFromString('mcp__srv')).toEqual({ serverName: 'srv', toolName: undefined })
  })

  test('④ 非 mcp 前缀 / 空 server → null', () => {
    expect(mcpInfoFromString('echo')).toBeNull()
    expect(mcpInfoFromString('mcp__')).toBeNull()
  })
})

describe('createMcpTools（连接 → 一等 Tool）', () => {
  test('① Tool 名字归一 + isMcp + mcpInfo 一等字段', () => {
    const { conn } = makeConnection('my.server', [{ name: 'do:thing' }])
    const [t] = createMcpTools([conn])
    expect(t!.name).toBe('mcp__my_server__do_thing')
    expect(t!.isMcp).toBe(true)
    expect(t!.mcpInfo).toEqual({ serverName: 'my.server', toolName: 'do:thing' })
  })

  test('② call 真路由：透传短工具名 + args + signal 到 port.callTool（非全名）', async () => {
    const { conn, calls } = makeConnection('srv', [{ name: 'get_thing' }])
    const [t] = createMcpTools([conn])
    const signal = new AbortController().signal
    const res = await t!.call({ a: 1 }, { signal }, undefined, ASSISTANT)
    expect(calls).toHaveLength(1)
    expect(calls[0].toolName).toBe('get_thing') // 短名，非 mcp__srv__get_thing
    expect(calls[0].args).toEqual({ a: 1 })
    expect(calls[0].signal).toBe(signal)
    expect(res.data).toBe('mcp-content:get_thing')
  })

  test('③ 结果映射：_meta / structuredContent → mcpMeta', async () => {
    const { conn } = makeConnection('srv', [{ name: 'x' }], {
      content: 'C',
      _meta: { k: 'v' },
      structuredContent: { s: 1 },
    })
    const [t] = createMcpTools([conn])
    const res = await t!.call({}, {}, undefined, ASSISTANT)
    expect(res.data).toBe('C')
    expect(res.mcpMeta).toEqual({ _meta: { k: 'v' }, structuredContent: { s: 1 } })
  })

  test('④ 无 _meta/structuredContent → 无 mcpMeta 键（非 undefined 占位）', async () => {
    const { conn } = makeConnection('srv', [{ name: 'x' }])
    const [t] = createMcpTools([conn])
    const res = await t!.call({}, {}, undefined, ASSISTANT)
    expect('mcpMeta' in res).toBe(false)
  })

  test('⑤ 连接无 tools（未物化 tools 段）→ 不产工具', () => {
    const { conn } = makeConnection('empty')
    expect(createMcpTools([conn])).toEqual([])
  })

  test('⑥ 多连接多工具 → 展开成 Tool 列表（名字含各 server 归一）', () => {
    const a = makeConnection('s1', [{ name: 'a' }, { name: 'b' }])
    const b = makeConnection('s2', [{ name: 'c' }])
    const tools = createMcpTools([a.conn, b.conn])
    expect(tools.map((t) => t!.name)).toEqual([
      'mcp__s1__a',
      'mcp__s1__b',
      'mcp__s2__c',
    ])
  })

  test('⑦ 描述符 hint → Tool 语义（readOnlyHint→isReadOnly/isConcurrencySafe，destructiveHint→isDestructive）', () => {
    const ro = makeConnection('srv', [{ name: 'read', readOnlyHint: true }])
    const [tRo] = createMcpTools([ro.conn])
    expect(tRo!.isReadOnly()).toBe(true)
    expect(tRo!.isConcurrencySafe()).toBe(true) // 只读工具并发安全
    expect(tRo!.isDestructive()).toBe(false)

    const de = makeConnection('srv', [{ name: 'rm', readOnlyHint: false, destructiveHint: true }])
    const [tDe] = createMcpTools([de.conn])
    expect(tDe!.isReadOnly()).toBe(false)
    expect(tDe!.isDestructive()).toBe(true)

    // 无 hint 描述符 → 全 false（?? false 兜底）
    const none = makeConnection('srv', [{ name: 'x' }])
    const [tNone] = createMcpTools([none.conn])
    expect(tNone!.isReadOnly()).toBe(false)
    expect(tNone!.isDestructive()).toBe(false)
    expect(tNone!.isConcurrencySafe()).toBe(false)
  })
})

describe('findMcpServerConnection（两侧归一比对，E-4 scope 查找）', () => {
  test('① 非 mcp__ 前缀 → undefined', () => {
    const { conn } = makeConnection('srv', [{ name: 'x' }])
    expect(findMcpServerConnection('echo', [conn])).toBeUndefined()
  })

  test('② 归一后命中（client.name 原名 my.server ↔ 工具名归一 my_server）', () => {
    const { conn } = makeConnection('my.server', [{ name: 'x' }])
    const hit = findMcpServerConnection('mcp__my_server__x', [conn])
    expect(hit).toBe(conn)
  })

  test('③ 无匹配 server → undefined', () => {
    const { conn } = makeConnection('srv', [{ name: 'x' }])
    expect(findMcpServerConnection('mcp__other__x', [conn])).toBeUndefined()
  })
})
