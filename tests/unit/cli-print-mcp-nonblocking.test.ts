/**
 * AD-49（0.1.48 A-② MCP）：headless 启动 MCP 连接编排（connectMcpStartup）
 * 判别单测（零 spawn：注入 fake manager + 真 buildMcpServerConfigs 纯 parse）。
 *
 * 工单 §2 判据：
 *   ① MCP_CONNECTION_NONBLOCKING=1 → print 启动不等 connect（慢 dynamic 服务器
 *      留 pending 占位，进程不阻塞）—— **修前红**（现恒等 allSettled 阻塞至 30s，
 *      修前 connectMcpStartup 恒阻塞 → 本测挂起超时红）→ 修后绿。
 *   ② --mcp-config dynamic 源慢服务器 → 5s 预算内 settle（连接预算参数化）——
 *      **修前红**（现 30s 缺省 / --mcp-config 源 headless 不消费）→ 修后绿。
 *   ③ 非 --mcp-config 源 30s 行为恒等 + MCP_CONNECTION_NONBLOCKING 缺省时行为
 *      与现一致 —— 零回归（首轮即绿，锁不变量）。
 *
 * 分层纪律：纯编排逻辑（注入 fake manager，无真 spawn / 无网络 / 无 LLM）→ unit 层。
 * fake 仅 McpConnectionManager（connect 记 opts + pending 表 + 慢服务器永不 settle）；
 * buildMcpServerConfigs / createMcpTools / setMcpClientRegistry 走真实面（纯 parse /
 * 空连接安全），隔离进程内无跨文件污染。
 */
import { describe, expect, test } from 'bun:test'
import { connectMcpStartup } from '../../src/cli/print'
import {
  type McpConnectionManager,
  type McpServerConnection,
} from '../../src/mcp'

type ConnectCall = { name: string; opts?: { connectionTimeoutMs?: number } }

/** fake McpConnectionManager：connect 记录 opts + pending 表；slowNames 内
 * 的服务器永不 settle（模拟慢 initialize，非阻塞门才有意义）；其余快服务器
 * settle 到 failed 态（无真 spawn / 无 connected 态 → buildMcpEngineConnections
 * / registry 走空面安全）。 */
function makeFakeManager(
  slowNames: Set<string> = new Set(),
): { manager: McpConnectionManager; calls: ConnectCall[]; pending: Set<string> } {
  const calls: ConnectCall[] = []
  const pending = new Set<string>()
  const manager = {
    async connect(
      name: string,
      config: McpServerConnection extends never ? never : unknown,
      connectOpts?: { connectionTimeoutMs?: number },
    ): Promise<McpServerConnection> {
      calls.push({ name, opts: connectOpts })
      pending.add(name)
      if (slowNames.has(name)) {
        // 慢服务器：initialize 永不完成（永不 settle = 阻塞 await 会挂死）
        return new Promise<McpServerConnection>(() => {})
      }
      // 快服务器：settle 到 failed 态（无真 spawn，list() 恒空 → 引擎连接面安全）
      pending.delete(name)
      return {
        name,
        type: 'failed',
        config: config as McpServerConnection,
        error: 'fake-failed',
      } as McpServerConnection
    },
    get: () => undefined,
    list: () => [],
    close: async () => {},
    closeAll: async () => {},
    getPendingServerNames: () => [...pending],
  } as unknown as McpConnectionManager
  return { manager, calls, pending }
}

function withEnv(
  key: string,
  value: string | undefined,
  fn: () => Promise<void>,
): Promise<void> {
  const prev = process.env[key]
  const saved = prev === undefined
  return (async () => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
    try {
      await fn()
    } finally {
      if (saved) delete process.env[key]
      else process.env[key] = prev
    }
  })()
}

describe('AD-49 ① MCP_CONNECTION_NONBLOCKING 非阻塞门（修前红）', () => {
  test('① env=1 → 慢 dynamic 服务器留 pending 占位，进程不阻塞启动', async () => {
    await withEnv('MCP_CONNECTION_NONBLOCKING', '1', async () => {
      const { manager, pending } = makeFakeManager(new Set(['slow']))
      const t0 = Date.now()
      const r = await connectMcpStartup({
        manager,
        discoveryInput: { settingsServers: {}, projectMcpJsonPath: null },
        mcpConfig: ['{"mcpServers":{"slow":{"type":"stdio","command":"x"}}}'],
        strictMcpConfig: false,
      })
      const elapsed = Date.now() - t0
      // 非阻塞：慢服务器在途时启动已返回（远小于 30s 阻塞窗口）
      expect(r.nonBlocking).toBe(true)
      expect(elapsed).toBeLessThan(3000)
      // 慢服务器留 pending 占位（tool 池缺该服务器但进程不阻塞）
      expect(pending.has('slow')).toBe(true)
    })
  })
})

describe('AD-49 ② --mcp-config dynamic 源 5s 预算（修前红）', () => {
  test('② dynamic 源走 5s 预算，settings/.mcp.json 源缺省（零回归）', async () => {
    await withEnv('MCP_CONNECTION_NONBLOCKING', undefined, async () => {
      const { manager, calls } = makeFakeManager()
      await connectMcpStartup({
        manager,
        discoveryInput: {
          settingsServers: { fromsettings: { type: 'stdio', command: 'y' } },
          projectMcpJsonPath: null,
        },
        mcpConfig: ['{"mcpServers":{"dyn":{"type":"stdio","command":"z"}}}'],
        strictMcpConfig: false,
      })
      // dynamic 源（--mcp-config）走 5s 连接预算
      const dyn = calls.find(c => c.name === 'dyn')
      expect(dyn).toBeDefined()
      expect(dyn!.opts).toEqual({ connectionTimeoutMs: 5000 })
      // settings 源缺省（30s 逐字零回归，不传 budget）
      const setc = calls.find(c => c.name === 'fromsettings')
      expect(setc).toBeDefined()
      expect(setc!.opts).toBeUndefined()
    })
  })

  test('②b --strict-mcp-config 仅 dynamic 源（忽略 settings/.mcp.json）', async () => {
    await withEnv('MCP_CONNECTION_NONBLOCKING', undefined, async () => {
      const { manager, calls } = makeFakeManager()
      await connectMcpStartup({
        manager,
        discoveryInput: {
          settingsServers: { fromsettings: { type: 'stdio', command: 'y' } },
          projectMcpJsonPath: null,
        },
        mcpConfig: ['{"mcpServers":{"dyn":{"type":"stdio","command":"z"}}}'],
        strictMcpConfig: true,
      })
      // strict：仅 dynamic 源连接，settings 源被忽略
      const names = calls.map(c => c.name)
      expect(names).toContain('dyn')
      expect(names).not.toContain('fromsettings')
      expect(calls.find(c => c.name === 'dyn')!.opts).toEqual({
        connectionTimeoutMs: 5000,
      })
    })
  })
})

describe('AD-49 ③ 零回归（缺省 = 现行为恒等）', () => {
  test('③ 非阻塞未设 + 无 --mcp-config → 阻塞 + 全源缺省 30s（恒等）', async () => {
    await withEnv('MCP_CONNECTION_NONBLOCKING', undefined, async () => {
      const { manager, calls } = makeFakeManager()
      const r = await connectMcpStartup({
        manager,
        discoveryInput: {
          settingsServers: {
            a: { type: 'stdio', command: '1' },
            b: { type: 'stdio', command: '2' },
          },
          projectMcpJsonPath: null,
        },
        strictMcpConfig: false,
      })
      expect(r.nonBlocking).toBe(false)
      // 全 settings 源 → 缺省预算（不传 budget = 30s 逐字）
      expect(calls.map(c => c.name).sort()).toEqual(['a', 'b'])
      expect(calls.every(c => c.opts === undefined)).toBe(true)
    })
  })
})
