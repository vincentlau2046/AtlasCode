/**
 * 0.1.81 V3-2 K2 MCP 面 — 策略先行判别测试（工单 #6/#7，unit 层零 spawn：
 * 纯过滤面 + fake manager + 三连接车道注入断言；sse 型 good server 走前向
 * 接缝即时 failed，零网络零子进程）。
 *
 * 探针结论（修前红基线 d39b4f5）：三 engine 连接车道均无企业策略过滤——
 * compose initMcpConnections / print connectMcpStartup 在 buildMcpServerConfigs
 * 后直接全量 connect，cli checkMcpServerHealth 无条件 connect；TUI 域
 * filterMcpServersByPolicy 消费面只有 tui/main.tsx 与 useManageMCPConnections
 * （旧 TUI 面）。修面 = engine 域新 mcpPolicy 纯过滤（deny 优先 / allowlist
 * 三态 / name·command·url 三型条目，TUI isMcpServerAllowedByPolicy 语义
 * 保真转写）+ manager markBlocked（failed 态 + blockedByPolicy 标记，零
 * spawn）+ 三车道 connect 前过滤。
 *
 * 语义保真注（tui/services/mcp/config.ts L340-507 转写）：denylist 绝对
 * 优先；allowlist undefined = 全放行；[] = 全封；hasCommandEntries → stdio
 * 必须匹配 command 条目（否则回落 name 条目）；hasUrlEntries → remote 必须
 * 匹配 URL 条目（否则回落 name 条目）。条目形 = {serverName}|{serverCommand}|
 * {serverUrl} 对象（TUI isMcpServer*Entry 守卫面）；**纯字符串条目按 name
 * 条目处理**（engine 面超集裁定——TUI stub 守卫下字符串条目恒不匹配，engine
 * 面按用户可见文档惯例收编：deny 面更严 = fail-closed，allow 面符合管理员
 * 明示意）。
 */
import { afterEach, describe, expect, test } from 'bun:test'
import {
  createMcpConnectionManager,
  filterMcpServersByPolicy,
  getMcpConnectionManager,
  getMcpPolicyFromSettings,
  resetMcpConnectionManager,
  resetMcpPolicyInput,
  setMcpDiscoveryInput,
  setMcpPolicyInput,
  type McpConnectionManager,
  type ScopedMcpServerConfig,
} from '../../src/mcp'
import { checkMcpServerHealth } from '../../src/cli/handlers/mcp'
import { connectMcpStartup } from '../../src/cli/print'
import { initMcpConnections } from '../../src/atlascode/compose'

// ── fixture helpers ───────────────────────────────────────────────────

function stdioCfg(
  command = 'srv',
  args: string[] = [],
): ScopedMcpServerConfig {
  return { type: 'stdio', command, args, scope: 'user' }
}

function httpCfg(url: string): ScopedMcpServerConfig {
  return { type: 'http', url, scope: 'user' }
}

/** sse 型 good server：manager 前向接缝支即时 failed（零 spawn 零网络）。 */
function seamCfg(): ScopedMcpServerConfig {
  return { type: 'sse', url: 'https://example.invalid/sse', scope: 'user' }
}

/** fake manager（connect + markBlocked 记录器；connect 恒 failed）。 */
function makeRecordingManager(): {
  manager: McpConnectionManager
  connects: string[]
  markBlockedCalls: string[]
} {
  const connects: string[] = []
  const markBlockedCalls: string[] = []
  const manager = {
    async connect(name: string, config: ScopedMcpServerConfig) {
      connects.push(name)
      return { name, type: 'failed' as const, config, error: 'fake-failed' }
    },
    markBlocked(name: string, _config: ScopedMcpServerConfig, reason: string) {
      markBlockedCalls.push(name)
      return {
        name,
        type: 'failed' as const,
        config: stdioCfg(),
        error: `MCP server "${name}" blocked by enterprise policy: ${reason}`,
        blockedByPolicy: true as const,
      }
    },
    get: (_name: string) => undefined,
    list: () => [],
    async close() {},
    async closeAll() {},
    getPendingServerNames: () => [],
  }
  return { manager: manager as unknown as McpConnectionManager, connects, markBlockedCalls }
}

afterEach(() => {
  resetMcpPolicyInput()
  setMcpDiscoveryInput(null)
})

// ── A. 纯过滤矩阵（TUI 语义保真 + 字符串条目超集）────────────────────

describe('K2 #6/#7：mcpPolicy 纯过滤面（filterMcpServersByPolicy）', () => {
  test('policy undefined → 全放行（回归守卫）', () => {
    const { allowed, blocked } = filterMcpServersByPolicy({
      a: stdioCfg(),
      b: httpCfg('https://x.example.com'),
    })
    expect(Object.keys(allowed)).toEqual(['a', 'b'])
    expect(blocked).toEqual([])
  })

  test('deny name 对象条目 → 封指定名', () => {
    const { allowed, blocked } = filterMcpServersByPolicy(
      { bad: stdioCfg(), good: stdioCfg() },
      { deniedMcpServers: [{ serverName: 'bad' }] },
    )
    expect(Object.keys(allowed)).toEqual(['good'])
    expect(blocked.length).toBe(1)
    expect(blocked[0]?.name).toBe('bad')
    expect(blocked[0]?.reason).toContain('denied')
  })

  test('deny 绝对优先于 allow', () => {
    const { blocked } = filterMcpServersByPolicy(
      { x: stdioCfg() },
      {
        allowedMcpServers: [{ serverName: 'x' }],
        deniedMcpServers: [{ serverName: 'x' }],
      },
    )
    expect(blocked.map(b => b.name)).toEqual(['x'])
  })

  test('allowlist undefined = 全放行 / [] = 全封', () => {
    const undef = filterMcpServersByPolicy({ a: stdioCfg() }, {})
    expect(undef.blocked).toEqual([])
    const empty = filterMcpServersByPolicy(
      { a: stdioCfg(), b: httpCfg('https://x') },
      { allowedMcpServers: [] },
    )
    expect(Object.keys(empty.allowed)).toEqual([])
    expect(empty.blocked.length).toBe(2)
    expect(empty.blocked[0]?.reason).toContain('allowedMcpServers')
  })

  test('allowlist 有 command 条目 → stdio 必须匹配 command（remote 回落 name）', () => {
    const policy = { allowedMcpServers: [{ serverCommand: ['npx', 'foo'] }] }
    // stdio 匹配 command 条目 → 放行
    const ok = filterMcpServersByPolicy(
      { a: stdioCfg('npx', ['foo']) },
      policy,
    )
    expect(ok.blocked).toEqual([])
    // stdio 不匹配 → 封
    const noMatch = filterMcpServersByPolicy(
      { a: stdioCfg('npx', ['bar']) },
      policy,
    )
    expect(noMatch.blocked.map(b => b.name)).toEqual(['a'])
    // remote 无 url 条目 → 回落 name 条目 → 无 → 封
    const remote = filterMcpServersByPolicy(
      { c: httpCfg('https://x') },
      policy,
    )
    expect(remote.blocked.map(b => b.name)).toEqual(['c'])
  })

  test('allowlist 有 url 条目 → remote 按 URL wildcard 匹配', () => {
    const policy = {
      allowedMcpServers: [{ serverUrl: 'https://*.example.com/*' }],
    }
    const ok = filterMcpServersByPolicy(
      { a: httpCfg('https://api.example.com/v1') },
      policy,
    )
    expect(ok.blocked).toEqual([])
    const noMatch = filterMcpServersByPolicy(
      { a: httpCfg('https://other.org/v1') },
      policy,
    )
    expect(noMatch.blocked.map(b => b.name)).toEqual(['a'])
  })

  test('纯字符串条目 = name 条目（engine 超集裁定）', () => {
    // deny 面：字符串条目封名（比 TUI stub 恒不匹配更严 = fail-closed）
    const denied = filterMcpServersByPolicy(
      { bad: stdioCfg(), good: stdioCfg() },
      { deniedMcpServers: ['bad'] },
    )
    expect(Object.keys(denied.allowed)).toEqual(['good'])
    // allow 面：字符串条目放行名
    const allowed = filterMcpServersByPolicy(
      { good: stdioCfg(), other: stdioCfg() },
      { allowedMcpServers: ['good'] },
    )
    expect(Object.keys(allowed.allowed)).toEqual(['good'])
  })

  test('deny command 数组条目 → 封匹配的 stdio', () => {
    const { blocked, allowed } = filterMcpServersByPolicy(
      { evil: stdioCfg('npx', ['evil']), fine: stdioCfg('npx', ['fine']) },
      { deniedMcpServers: [{ serverCommand: ['npx', 'evil'] }] },
    )
    expect(Object.keys(allowed)).toEqual(['fine'])
    expect(blocked.map(b => b.name)).toEqual(['evil'])
  })

  test('deny url pattern 条目 → 封匹配的 remote', () => {
    const { blocked } = filterMcpServersByPolicy(
      { a: httpCfg('https://evil.com/api'), b: httpCfg('https://ok.com/api') },
      { deniedMcpServers: [{ serverUrl: 'https://evil.com/*' }] },
    )
    expect(blocked.map(b => b.name)).toEqual(['a'])
  })

  test('getMcpPolicyFromSettings：结构提取 + 非结构/null 容忍', () => {
    expect(
      getMcpPolicyFromSettings({
        allowedMcpServers: ['x'],
        deniedMcpServers: ['y'],
      }),
    ).toEqual({ allowedMcpServers: ['x'], deniedMcpServers: ['y'] })
    expect(getMcpPolicyFromSettings(null)).toEqual({})
    expect(getMcpPolicyFromSettings(undefined)).toEqual({})
    expect(getMcpPolicyFromSettings('not-an-object')).toEqual({})
  })
})

// ── B. manager markBlocked（零 spawn failed 态）───────────────────────

describe('K2 #6/#7：manager markBlocked（failed 态 + blockedByPolicy）', () => {
  test('markBlocked → failed + blockedByPolicy + error 文案，零 connect', () => {
    const manager = createMcpConnectionManager()
    const conn = manager.markBlocked(
      'bad',
      stdioCfg(),
      'denied by policy (deniedMcpServers)',
    )
    expect(conn.type).toBe('failed')
    if (conn.type === 'failed') {
      expect(conn.blockedByPolicy).toBe(true)
      expect(conn.error).toContain('blocked by enterprise policy')
      expect(conn.error).toContain('denied by policy (deniedMcpServers)')
    }
    expect(manager.get('bad')).toBe(conn)
  })
})

// ── C. checkMcpServerHealth 策略先行（工单 #7：mcp list/get 不启动被封者）──

describe('K2 #7：checkMcpServerHealth 策略先行', () => {
  test('被封 server → ✗ Blocked 不 connect（旧实现无条件 connect → 红）', async () => {
    const { manager, connects } = makeRecordingManager()
    setMcpPolicyInput({ deniedMcpServers: ['bad'] })
    const result = await checkMcpServerHealth(manager, 'bad', stdioCfg())
    expect(result).toBe('✗ Blocked by enterprise policy')
    expect(connects).toEqual([])
  })

  test('未封 server → 照常 connect（回归守卫）', async () => {
    const { manager, connects } = makeRecordingManager()
    setMcpPolicyInput({}) // 显式空 policy（零 settings 读取，hermetic）
    const result = await checkMcpServerHealth(manager, 'ok', stdioCfg())
    expect(result).toBe('✗ Failed to connect')
    expect(connects).toEqual(['ok'])
  })
})

// ── D. connectMcpStartup 车道（headless/SDK，工单 #6）────────────────

describe('K2 #6：connectMcpStartup 策略先行', () => {
  test('settings/.mcp.json 源被封者 → markBlocked 不 connect，放行者照常', async () => {
    const { manager, connects, markBlockedCalls } = makeRecordingManager()
    setMcpPolicyInput({ deniedMcpServers: ['bad'] })
    const { mcpConnections } = await connectMcpStartup({
      manager,
      discoveryInput: {
        settingsServers: { bad: { type: 'stdio', command: 'x' }, good: seamCfg() },
        projectMcpJsonPath: null,
      },
    })
    // 旧实现：bad 也被 connect（无条件全量）→ 红
    expect(connects).toEqual(['good'])
    expect(markBlockedCalls).toEqual(['bad'])
    // blocked = failed 态 → 不进 engine 连接面（buildMcpEngineConnections
    // 只收 connected，同 connect-failure 先例）；「可查」面 = manager 表
    // （组 B/E 真 manager 断言覆盖），非 engine mcpConnections
    expect(
      mcpConnections.find(c => (c as { name?: string }).name === 'bad'),
    ).toBeUndefined()
  })

  test('--mcp-config dynamic 源同受策略面（strict 模式全量 = dynamic 集）', async () => {
    const { manager, connects, markBlockedCalls } = makeRecordingManager()
    setMcpPolicyInput({ deniedMcpServers: ['dyn-bad'] })
    await connectMcpStartup({
      manager,
      discoveryInput: { settingsServers: {}, projectMcpJsonPath: null },
      mcpConfig: [
        JSON.stringify({
          mcpServers: {
            'dyn-bad': { type: 'stdio', command: 'x' },
            'dyn-good': { type: 'sse', url: 'https://example.invalid/sse' },
          },
        }),
      ],
      strictMcpConfig: true,
    })
    expect(connects).toEqual(['dyn-good'])
    expect(markBlockedCalls).toEqual(['dyn-bad'])
  })
})

// ── E. initMcpConnections 车道（组合根，工单 #6；真单例 manager）──────

describe('K2 #6：initMcpConnections 策略先行（真单例）', () => {
  afterEach(async () => {
    await resetMcpConnectionManager()
  })

  test('被封 stdio → failed+blockedByPolicy 零 spawn；放行 sse → 走 connect 撞接缝', async () => {
    await resetMcpConnectionManager()
    setMcpDiscoveryInput({
      settingsServers: {
        bad: { type: 'stdio', command: 'never-spawned' },
        ok: { type: 'sse', url: 'https://example.invalid/sse' },
      },
      projectMcpJsonPath: null,
    })
    setMcpPolicyInput({ deniedMcpServers: ['bad'] })
    await initMcpConnections()
    const manager = getMcpConnectionManager()
    const bad = manager.get('bad')
    // 旧实现：bad 被真 connect（spawn never-spawned）→ 红
    expect(bad?.type).toBe('failed')
    if (bad?.type === 'failed') {
      expect(bad.blockedByPolicy).toBe(true)
      expect(bad.error).toContain('blocked by enterprise policy')
    }
    const ok = manager.get('ok')
    // ok 走 connect 路径撞前向接缝（failed 但非 policy 封 = 证过滤只拦被封者）
    expect(ok?.type).toBe('failed')
    if (ok?.type === 'failed') {
      expect(ok.blockedByPolicy).toBeUndefined()
      expect(ok.error).toContain('前向接缝')
    }
  })
})
