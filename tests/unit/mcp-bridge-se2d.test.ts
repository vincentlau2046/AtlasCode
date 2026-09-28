/**
 * §8.68 remote 波 S-E2d unit 层：组合根 MCP 桥 4 面 + mcp 域发现输入窗
 * （零模型零盘；fake manager / fake client / fake prompt 命令，
 * STR-1 经 atlascode 根门面 + mcp 域门面导入）。
 *
 * 覆盖：
 *   B-P1 发现输入窗：未注册 null / set / get / 清（null 复位）
 *   B-P2 bridgeMcpToolClient：tools/call 请求面（params 形状 + 3 段
 *       结果映射）+ 缺结果 content [] 缺省面
 *   B-P3 mapMcpPromptCommands：engine Command 映射面（保真 6 面 +
 *       默认值补 4 面 + getPromptForCommand 真执行）
 *   B-P4 buildMcpEngineConnections：4 态过滤（仅 connected）+ 描述符
 *       预取面（fake client tools/list）+ callTool 桥活面
 *   B-P5 syncMcpClientRegistry：connected 条目（listResources 剥 server
 *       字段 + readResource 直取面）/ pending 占位条目 / failed·disabled
 *       不进注册表 + 注册窗覆写面
 *   B-P6 collectMcpPromptCommands：connected 面 prompts 命令收集 +
 *       非 connected 早退面
 *
 * 运行口径注：mcpFetch LRU 键 = 服务器名（模块级缓存）→ 各测唯一
 * 服务器名 + afterEach resetMcpFetchCaches 对称清。
 */
import { afterEach, describe, expect, test } from 'bun:test'
import {
  bridgeMcpToolClient,
  buildMcpEngineConnections,
  collectMcpPromptCommands,
  mapMcpPromptCommands,
  syncMcpClientRegistry,
} from '../../src/atlascode'
import {
  getMcpClientRegistry,
  resetMcpClientRegistry,
  type Command,
} from '../../src/engine'
import {
  getMcpDiscoveryInput,
  resetMcpFetchCaches,
  setMcpDiscoveryInput,
  type ConnectedMcpServer,
  type McpConnectionManager,
  type McpJsonRpcClient,
  type McpPromptCommand,
  type McpServerConnection,
} from '../../src/mcp'

// ── fake 面构造器 ──────────────────────────────────────────────────

/** fake JSON-RPC 客户端（request 按 method 分派；其余成员空实现）。 */
function fakeJsonRpc(byMethod: Record<string, unknown>): McpJsonRpcClient {
  return {
    request: async (method: string) => byMethod[method],
    notify: () => {},
    onNotification: () => {},
    onRequest: () => {},
    onError: () => {},
    onClose: () => {},
    close: () => {},
  } as unknown as McpJsonRpcClient
}

/** fake connected 连接（4 态 union 的 connected 臂最小形）。 */
function fakeConnected(
  name: string,
  client: McpJsonRpcClient,
  capabilities: {
    tools?: boolean
    resources?: boolean
    prompts?: boolean
  },
): McpServerConnection {
  return {
    name,
    type: 'connected',
    client,
    capabilities,
    config: { type: 'stdio', command: 'fake', scope: 'user' },
    cleanup: async () => {},
  } as unknown as ConnectedMcpServer
}

/** fake manager（仅 list 面消费）。 */
function fakeManager(conns: McpServerConnection[]): McpConnectionManager {
  return {
    list: () => conns,
    connect: async () => {
      throw new Error('not exercised')
    },
    get: () => undefined,
    close: async () => {},
    closeAll: async () => {},
    getPendingServerNames: () => [],
  } as unknown as McpConnectionManager
}

/** fake mcp 域 prompt 命令（delta ④ 扁平 content 面：string | 块对象，
 *  与 mcpFetch 真形态一致——非引擎块面，映射归桥）。 */
function fakePromptCmd(name: string): McpPromptCommand {
  return {
    type: 'prompt',
    name,
    description: 'fake prompt',
    argNames: ['who'],
    userFacingName: () => `${name} (MCP)`,
    getPromptForCommand: async (args: string) => [
      `hi ${args}`,
      { type: 'text', content: `block ${args}` },
    ],
  }
}

afterEach(() => {
  resetMcpFetchCaches()
  resetMcpClientRegistry()
  setMcpDiscoveryInput(null)
})

// ── B-P1 发现输入窗 ────────────────────────────────────────────────
describe('B-P1 发现输入窗（LSP setLspServerSource 先例同型）', () => {
  test('未注册 = null / set / get / 清复位', () => {
    expect(getMcpDiscoveryInput()).toBeNull()
    setMcpDiscoveryInput({
      settingsServers: { alpha: { type: 'stdio', command: 'a' } },
    })
    expect(getMcpDiscoveryInput()?.settingsServers).toEqual({
      alpha: { type: 'stdio', command: 'a' },
    })
    setMcpDiscoveryInput(null)
    expect(getMcpDiscoveryInput()).toBeNull()
  })
})

// ── B-P2 McpToolClient 桥 ──────────────────────────────────────────
describe('B-P2 bridgeMcpToolClient（tools/call 请求面）', () => {
  test('3 段结果映射（content + structuredContent + _meta）+ 请求面形状', async () => {
    const calls: Array<[string, unknown]> = []
    const client = {
      request: async (m: string, p?: unknown) => {
        calls.push([m, p])
        return {
          content: 'ok',
          structuredContent: { a: 1 },
          _meta: { b: 2 },
        }
      },
    } as unknown as McpJsonRpcClient
    const res = await bridgeMcpToolClient(client).callTool('t2', { x: 1 })
    // 请求面：method + params 形状（name + arguments）
    expect(calls).toEqual([
      [
        'tools/call',
        { name: 't2', arguments: { x: 1 } },
      ],
    ])
    expect(res).toEqual({
      content: 'ok',
      structuredContent: { a: 1 },
      _meta: { b: 2 },
    })
  })

  test('缺结果面 = content [] 缺省（不携 structuredContent/_meta 键）', async () => {
    const tc = bridgeMcpToolClient(fakeJsonRpc({}))
    const res = await tc.callTool('t', {})
    expect(res).toEqual({ content: [] })
    expect('structuredContent' in res).toBe(false)
    expect('_meta' in res).toBe(false)
  })
})

// ── B-P3 MCP prompt 命令映射面 ─────────────────────────────────────
describe('B-P3 mapMcpPromptCommands（engine Command 映射）', () => {
  test('保真 6 面 + 默认值补 4 面 + 提示词真执行', async () => {
    const cmds = mapMcpPromptCommands([fakePromptCmd('mcp__srv__p')])
    expect(cmds).toHaveLength(1)
    const c = cmds[0] as Command
    // 保真面（mcp 域原始字段）
    expect(c.name).toBe('mcp__srv__p')
    expect(c.description).toBe('fake prompt')
    expect(c.argNames).toEqual(['who'])
    expect(c.type).toBe('prompt')
    expect(c.userFacingName?.()).toBe('mcp__srv__p (MCP)')
    // MCP 语义面
    expect(c.isMcp).toBe(true)
    expect(c.loadedFrom).toBe('mcp')
    expect(c.source).toBe('mcp')
    // engine 型字段默认值补（mcp 门面头注预声明映射面）
    expect(c.contentLength).toBe(0)
    expect(c.progressMessage).toBe('mcp__srv__p')
    // 提示词真执行面（mcp 扁平面 → 引擎块面映射：string → text 块，
    // 块对象透传〔旧仓 transformResultContent 语义〕）
    const blocks = await c.getPromptForCommand('x', {} as never)
    expect(blocks).toEqual([
      { type: 'text', content: 'hi x' },
      { type: 'text', content: 'block x' },
    ])
  })
})

// ── B-P4 连接面（4 态过滤 + 描述符预取）────────────────────────────
describe('B-P4 buildMcpEngineConnections（connected 过滤 + 预取）', () => {
  test('仅 connected 态产连接 + 描述符预取 + callTool 桥活面', async () => {
    const toolClient = fakeJsonRpc({
      'tools/list': {
        tools: [
          {
            name: 'ping',
            description: 'd',
            inputSchema: { type: 'object' },
            annotations: { readOnlyHint: true },
          },
        ],
      },
      'tools/call': { content: 'pong' },
    })
    const connected = fakeConnected('srv-a', toolClient, { tools: true })
    const failed: McpServerConnection = {
      name: 'srv-b',
      type: 'failed',
      config: { type: 'stdio', command: 'b', scope: 'user' },
      error: 'boom',
    } as unknown as McpServerConnection
    const pending: McpServerConnection = {
      name: 'srv-c',
      type: 'pending',
      config: { type: 'stdio', command: 'c', scope: 'user' },
    } as unknown as McpServerConnection

    const conns = await buildMcpEngineConnections(
      fakeManager([connected, failed, pending]),
    )
    expect(conns).toHaveLength(1)
    expect(conns[0]!.name).toBe('srv-a')
    // 描述符预取面（mcpFetch 供应商映射：name/description/schema/hint）
    expect(conns[0]!.tools).toEqual([
      {
        name: 'ping',
        description: 'd',
        inputJSONSchema: { type: 'object' },
        readOnlyHint: true,
      },
    ])
    // callTool 桥活面（engine port McpToolClient 消费形态）
    const res = await conns[0]!.client.callTool('ping', {})
    expect(res.content).toBe('pong')
  })

  test('capabilities.tools 缺省 = 描述符 []（供应商门控面）', async () => {
    const client = fakeJsonRpc({})
    const conn = fakeConnected('srv-nocaps', client, {})
    const conns = await buildMcpEngineConnections(fakeManager([conn]))
    expect(conns).toHaveLength(1)
    expect(conns[0]!.tools).toEqual([])
  })
})

// ── B-P5 registry 供给面 ───────────────────────────────────────────
describe('B-P5 syncMcpClientRegistry（实填 + 4 态过滤）', () => {
  test('connected 条目（listResources 剥 server + readResource 直取）+ pending 占位 + failed 不进', async () => {
    const client = fakeJsonRpc({
      'resources/list': {
        resources: [
          { uri: 'file:///a', name: 'a', mimeType: 'text/plain' },
        ],
      },
      'resources/read': {
        contents: [{ uri: 'file:///a', mimeType: 'text/plain', text: 'A' }],
      },
    })
    const connected = fakeConnected('srv-r', client, { resources: true })
    const failed: McpServerConnection = {
      name: 'srv-f',
      type: 'failed',
      config: { type: 'stdio', command: 'f', scope: 'user' },
      error: 'x',
    } as unknown as McpServerConnection
    const pending: McpServerConnection = {
      name: 'srv-p',
      type: 'pending',
      config: { type: 'stdio', command: 'p', scope: 'user' },
    } as unknown as McpServerConnection

    syncMcpClientRegistry(fakeManager([connected, failed, pending]))
    const { clients } = getMcpClientRegistry()
    // failed 不进注册表（engine 条目型 union 仅 connected|pending）
    expect(clients.map(c => c.name)).toEqual(['srv-r', 'srv-p'])
    const entry = clients.find(c => c.name === 'srv-r')!
    expect(entry.type).toBe('connected')
    expect(entry.capabilities).toEqual({ resources: true })
    // listResources 实填面（剥 server 字段 = engine 工具侧再 attach）
    const items = await entry.listResources?.()
    expect(items).toEqual([
      { uri: 'file:///a', name: 'a', mimeType: 'text/plain' },
    ])
    // readResource 直取面（resources/read 请求 + contents 面）
    const read = await entry.readResource?.('file:///a')
    expect(read?.contents).toEqual([
      { uri: 'file:///a', mimeType: 'text/plain', text: 'A' },
    ])
    // pending 占位条目（无 listResources/readResource 方法面）
    const pEntry = clients.find(c => c.name === 'srv-p')!
    expect(pEntry.type).toBe('pending')
    expect(pEntry.listResources).toBeUndefined()
  })

  test('空态 = 空 client 集（注册窗覆写幂等面）', () => {
    syncMcpClientRegistry(fakeManager([]))
    expect(getMcpClientRegistry().clients).toEqual([])
    // 覆写面：二次 sync 换内容
    const client = fakeJsonRpc({})
    syncMcpClientRegistry(
      fakeManager([fakeConnected('srv-x', client, {})]),
    )
    expect(getMcpClientRegistry().clients.map(c => c.name)).toEqual(['srv-x'])
  })
})

// ── B-P6 prompt 命令收集面 ─────────────────────────────────────────
describe('B-P6 collectMcpPromptCommands（connected 收集 + 早退面）', () => {
  test('connected 面收集 + 非 connected 早退', async () => {
    const client = fakeJsonRpc({
      'prompts/list': {
        prompts: [{ name: 'greet', description: 'g', arguments: [] }],
      },
    })
    const connected = fakeConnected('srv-p6', client, { prompts: true })
    const failed: McpServerConnection = {
      name: 'srv-p6f',
      type: 'failed',
      config: { type: 'stdio', command: 'x', scope: 'user' },
      error: 'x',
    } as unknown as McpServerConnection
    const cmds = await collectMcpPromptCommands(
      fakeManager([connected, failed]),
    )
    expect(cmds.map(c => c.name)).toEqual(['mcp__srv-p6__greet'])
    expect(cmds[0]!.description).toBe('g')
  })

  test('capabilities.prompts 缺省 = []（供应商门控面）', async () => {
    const conn = fakeConnected('srv-p6b', fakeJsonRpc({}), {})
    const cmds = await collectMcpPromptCommands(fakeManager([conn]))
    expect(cmds).toEqual([])
  })
})
