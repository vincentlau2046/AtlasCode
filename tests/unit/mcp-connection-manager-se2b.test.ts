/**
 * mcp 域 S-E2b（§8.68 R2）unit 层：mcpConnectionManager 状态面。
 *
 * 覆盖（零 spawn 面；真 spawn 生命周期面在 tests/func/mcp-stdio-server-se2b）：
 *   M-P1 terminal error 判定面：9 子串全命中 + 良性消息不命中
 *   M-P2 前向接缝登记面：sse/http/ws → failed + 登记文案（G-3 ⑩ D3 型面 8→4：
 *       sse-ide/ws-ide/sdk/claudeai-proxy 4 型随 engine 型面裁除，原 4 型
 *       断言支删除——分发兜底落 stdio 支，schema 解析面不产出 4 裁型）
 *   M-P3 状态机面：failed 态重跑生命周期（去重仅 connected 生效）/
 *       close 移除 failed 登记 / closeAll 空表 no-op / pending 表落定后空
 *   M-P4 单例注入窗：getMcpConnectionManager 同例 / reset 后新例 +
 *       全关语义
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  createMcpConnectionManager,
  getMcpConnectionManager,
  isTerminalConnectionError,
  resetMcpConnectionManager,
  type ScopedMcpServerConfig,
} from '../../src/mcp'

function cfg(over: Record<string, unknown>): ScopedMcpServerConfig {
  return {
    type: 'sse',
    url: 'http://localhost:1',
    scope: 'user',
    ...over,
  } as ScopedMcpServerConfig
}

const SEAM_TYPES = ['sse', 'http', 'ws'] as const

describe('M-P1 terminal error 判定面（旧 L1178-1191 9 子串逐字）', () => {
  const hits = [
    'socket hang up ECONNRESET',
    'request timed out ETIMEDOUT',
    'write EPIPE',
    'getaddrinfo EHOSTUNREACH',
    'connect ECONNREFUSED 127.0.0.1:9',
    'Body Timeout Error',
    'stream was terminated',
    'SSE stream disconnected',
    'Failed to reconnect SSE stream',
  ]
  test.each(hits)('%s → true', msg => {
    expect(isTerminalConnectionError(msg)).toBe(true)
  })

  test('良性消息 → false', () => {
    expect(isTerminalConnectionError('connection error')).toBe(false)
    expect(isTerminalConnectionError('')).toBe(false)
  })
})

describe('M-P2 前向接缝登记面（§8.68 R2 裁定）', () => {
  let manager: ReturnType<typeof createMcpConnectionManager>

  beforeAll(() => {
    manager = createMcpConnectionManager()
  })
  afterAll(async () => {
    await manager.closeAll()
  })

  test.each(SEAM_TYPES)('%s → failed + 前向接缝登记文案', async t => {
    const conn = await manager.connect(`${t}-server`, cfg({ type: t }))
    expect(conn.type).toBe('failed')
    if (conn.type === 'failed') {
      expect(conn.error).toContain('前向接缝登记')
      expect(conn.authFailure).toBeUndefined()
    }
    // 登记面 = 落态可查（list 含 failed 登记）
    expect(manager.list().some(c => c.name === `${t}-server` && c.type === 'failed')).toBe(true)
  })

  // G-3（§8.74.28 ⑩ D3 8→4）: 原 'sdk → Unsupported server type' +
  // 'claudeai-proxy → authFailure 标记' 两测试随 4 裁型断言面删除——
  // manager 分发支已随型面裁除（未知 type 兜底落 stdio 支）；4 型残面
  // 归 TUI 域（IDE 型）/ 域外登记（SDK 型）/ 1P 车道已删（claudeai）。
})

describe('M-P3 状态机面（零 spawn）', () => {
  let manager: ReturnType<typeof createMcpConnectionManager>

  beforeAll(() => {
    manager = createMcpConnectionManager()
  })
  afterAll(async () => {
    await manager.closeAll()
  })

  test('failed 态重跑生命周期：去重仅 connected 生效（2 连 = 2 次 fail 落态）', async () => {
    const first = await manager.connect('flaky', cfg({ type: 'sse' }))
    expect(first.type).toBe('failed')
    // 去重面：非 connected 态 connect 重跑（重新 fail，非短路返回）
    const second = await manager.connect('flaky', cfg({ type: 'sse' }))
    expect(second.type).toBe('failed')
    // 落态唯一（Map 覆盖，list 无重名）
    const flaky = manager.list().filter(c => c.name === 'flaky')
    expect(flaky.length).toBe(1)
  })

  test('close 移除 failed 登记（非 connected 态无 cleanup 面）', async () => {
    await manager.connect('gone', cfg({ type: 'sse' }))
    expect(manager.get('gone')).toBeDefined()
    await manager.close('gone')
    expect(manager.get('gone')).toBeUndefined()
    // 幂等：二次 close 无抛
    await manager.close('gone')
  })

  test('closeAll 空表 no-op + pending 表落定后空', async () => {
    await manager.closeAll()
    expect(manager.list()).toEqual([])
    await manager.connect('x', cfg({ type: 'sse' }))
    expect(manager.getPendingServerNames()).toEqual([])
    await manager.closeAll()
  })
})

describe('M-P4 单例注入窗', () => {
  test('getMcpConnectionManager 同例（??= lazy-init）', () => {
    expect(getMcpConnectionManager()).toBe(getMcpConnectionManager())
  })

  test('reset 后新例 + 旧例登记清空（全关语义）', async () => {
    const a = getMcpConnectionManager()
    await a.connect('solo', cfg({ type: 'sse' }))
    expect(a.get('solo')).toBeDefined()
    await resetMcpConnectionManager()
    const b = getMcpConnectionManager()
    expect(b).not.toBe(a)
    // 全关语义：旧例登记已清（closeAll 于 reset 内跑）
    expect(a.get('solo')).toBeUndefined()
    // 新例从零态
    expect(b.list()).toEqual([])
  })
})
