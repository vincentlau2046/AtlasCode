/**
 * 0.1.81 V3-2 K2 MCP 面 — #15 判别测试：cd/重载插件后启停态随目录/插件
 * 重载收敛（unit 层：纯函数矩阵 + /cd 命令 fake context，零连接零网络）。
 *
 * 探针结论（修前红基线 d39b4f5，两部分缺陷）：
 *   - 缺陷 A：/cd 只 setCwd（状态面移动），无 reconnect key bump →
 *     useManageMCPConnections 两 effect（initialize-as-pending /
 *     load-and-connect）deps 不变不重跑 → 旧目录 .mcp.json server 挂着、
 *     新目录 server 不启动。plugin-reload 侧已有 pluginReconnectKey bump
 *     （refreshActivePlugins），cd 侧缺同构触发。
 *   - 缺陷 B：excludeStalePluginClients 的 removal case 只对 scope
 *     'dynamic' 生效（`if (!fresh) return c.config.scope === 'dynamic'`，
 *     防 partial reload 误断用户配置 server）。cwd 变更后的缺席是真缺席
 *     （旧目录 .mcp.json 不在新 configs 里）→ 需要 wide stale rule；
 *     plugin reload（同 cwd）保持窄规则。
 *
 * 修面：A = AppState.mcp 新增 cwdReconnectKey（/cd 成功后 bump，两 effect
 * deps 加入）；B = excludeStalePluginClients 加 absentIsStale option（hook
 * 内 lastCwdRef 比较 getCwd() 变化时传 true）。
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setCwdState } from '../../src/bootstrap/state'
import { excludeStalePluginClients } from '../../src/tui/services/mcp/utils'
import { call as cdCall } from '../../src/tui/commands/cd/cd'
import type { ScopedMcpServerConfig } from '../../src/tui/services/mcp/types'
import type { LocalCommandCall } from '../../src/tui/types/command'

const ORIGINAL_CWD = process.cwd()

afterEach(() => {
  setCwdState(ORIGINAL_CWD)
})

// ── fixture helpers ───────────────────────────────────────────────────

function cfg(scope: ScopedMcpServerConfig['scope']): ScopedMcpServerConfig {
  return { type: 'stdio', command: 'srv', args: [], scope }
}

function mcpStateOf(
  clients: Array<{ name: string; scope: ScopedMcpServerConfig['scope'] }>,
) {
  return {
    clients: clients.map(({ name, scope }) => ({
      name,
      type: 'connected' as const,
      client: {},
      config: cfg(scope),
    })),
    tools: [],
    commands: [],
    resources: {},
  }
}

// ── B. excludeStalePluginClients absentIsStale（wide rule）──────────

describe('K2 #15：excludeStalePluginClients 窄/宽 stale rule', () => {
  test('窄规则（缺省，plugin-reload 同 cwd 面）：缺席只对 dynamic 算 stale', () => {
    const mcp = mcpStateOf([
      { name: 'old-project', scope: 'project' },
      { name: 'old-dynamic', scope: 'dynamic' },
    ])
    const { stale } = excludeStalePluginClients(mcp, {})
    // 修前红：project-scope 缺席不算 stale（缺陷 B）
    expect(stale.map(c => c.name)).toEqual(['old-dynamic'])
  })

  test('宽规则（absentIsStale，cwd 变更面）：缺席全 scope 算 stale', () => {
    const mcp = mcpStateOf([
      { name: 'old-project', scope: 'project' },
      { name: 'old-user', scope: 'user' },
      { name: 'old-dynamic', scope: 'dynamic' },
    ])
    const { stale, clients } = excludeStalePluginClients(mcp, {}, {
      absentIsStale: true,
    })
    expect(stale.map(c => c.name)).toEqual([
      'old-project',
      'old-user',
      'old-dynamic',
    ])
    expect(clients).toEqual([])
  })

  test('宽规则下在场 server 仍按 config-hash 判（不误伤未变者）', () => {
    const mcp = mcpStateOf([{ name: 'kept', scope: 'project' }])
    const { stale } = excludeStalePluginClients(
      mcp,
      { kept: cfg('project') },
      { absentIsStale: true },
    )
    expect(stale).toEqual([])
  })
})

// ── A. /cd 成功后 bump cwdReconnectKey ───────────────────────────────

describe('K2 #15：/cd bump cwdReconnectKey', () => {
  function makeContext() {
    const updates: Array<(prev: unknown) => unknown> = []
    const context = {
      setAppState: (f: (prev: never) => never) => {
        updates.push(f)
      },
    }
    return { context, updates }
  }

  const fakeAppState = (overrides?: Record<string, unknown>) => ({
    mcp: {
      clients: [],
      tools: [],
      commands: [],
      resources: {},
      pluginReconnectKey: 0,
      cwdReconnectKey: 0,
      ...overrides,
    },
  })

  test('成功 cd → setAppState updater bump cwdReconnectKey（保 pluginReconnectKey）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wave0181-cd-'))
    try {
      const { context, updates } = makeContext()
      const result = await (
        cdCall as unknown as LocalCommandCall
      )(dir, context as never)
      expect(result).toEqual({
        type: 'text',
        value: expect.stringContaining('changed to'),
      })
      expect(updates.length).toBeGreaterThanOrEqual(1)
      // 应用 updater 到 fake state，验 bump 语义
      const state = updates[0]!(fakeAppState()) as ReturnType<
        typeof fakeAppState
      >
      // 修前红：/cd 不触碰 setAppState → updates 为空
      expect(state.mcp.cwdReconnectKey).toBe(1)
      expect(state.mcp.pluginReconnectKey).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('失败 cd（不存在路径）→ 不 bump（零 setAppState）', async () => {
    const { context, updates } = makeContext()
    const result = await (
      cdCall as unknown as LocalCommandCall
    )('/nonexistent-path-xyz', context as never)
    expect(result).toEqual({
      type: 'text',
      value: expect.stringContaining('cd failed'),
    })
    expect(updates).toEqual([])
  })

  test('无参 cd（状态面）→ 不 bump（零 setAppState）', async () => {
    const { context, updates } = makeContext()
    const result = await (cdCall as unknown as LocalCommandCall)(
      '',
      context as never,
    )
    expect(result).toEqual({
      type: 'text',
      value: expect.stringContaining('Session working directory'),
    })
    expect(updates).toEqual([])
  })
})
