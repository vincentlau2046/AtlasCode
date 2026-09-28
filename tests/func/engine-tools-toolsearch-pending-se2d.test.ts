/**
 * §8.68 remote 波 S-E2d func 层（真 spawn 零模型）：ToolSearch delta ⑤
 * getPendingServerNames 回填面（旧 appState.mcp.clients 裁面随 mcp 域
 * 落盘核销：pending 活面 = manager pending Set 单一事实源）。
 *
 * 判别信号（防 H6 空洞等价）：
 *   T-1 连接中服务器名进 pending Set（connect 起始同步 add，立即可观测）
 *       → ToolSearch call 无匹配支 pending_mcp_servers 面真回传（非旧
 *       常量 undefined 面）
 *   T-2 settle 面：MCP_TIMEOUT 短超时 → failed 文案逐字 + pending 清空
 *       → 无匹配支字段省略面（空 pending = 数据契约面不变）
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ToolSearchTool } from '../../src/engine/tools'
import {
  getMcpConnectionManager,
  resetMcpConnectionManager,
  type FailedMcpServer,
  type ScopedMcpServerConfig,
} from '../../src/mcp'

// 无响应 fake server（initialize 不答 → 连接停留 pending 至超时）
function writeHangServer(dir: string): string {
  const path = join(dir, 'hang-mcp-server.mjs')
  writeFileSync(
    path,
    `process.stdin.on('data', () => {})
process.stdin.on('end', () => process.exit(0))
`,
  )
  return path
}

let dir: string
let serverScript: string
let origTimeout: string | undefined

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-toolsearch-pending-'))
  serverScript = writeHangServer(dir)
  origTimeout = process.env.MCP_TIMEOUT
  // 短超时定化：settle 面 1.5s 内到达（测体远快于超时 = pending 窗内断言）
  process.env.MCP_TIMEOUT = '1500'
})

afterAll(async () => {
  await resetMcpConnectionManager()
  if (origTimeout === undefined) delete process.env.MCP_TIMEOUT
  else process.env.MCP_TIMEOUT = origTimeout
  rmSync(dir, { recursive: true, force: true })
})

describe('ToolSearch delta ⑤ pending 回填面（§8.68 S-E2d）', () => {
  test('T-1 连接中服务器名进 pending 面（call 无匹配支真回传）', async () => {
    const manager = getMcpConnectionManager()
    const connPromise = manager.connect(
      'slow-fake',
      {
        type: 'stdio',
        command: process.execPath,
        args: [serverScript],
        scope: 'user',
      } as ScopedMcpServerConfig,
    )
    // pending Set 于 connect 起始同步 add → 立即可观测（非恒 undefined 面）
    expect(manager.getPendingServerNames()).toContain('slow-fake')
    const res = await ToolSearchTool.call(
      { query: 'zzz-no-match' },
      { options: { tools: [] } },
    )
    expect(res.data.pending_mcp_servers).toEqual(['slow-fake'])

    // settle 面（MCP_TIMEOUT=1500 → failed 超时文案逐字 + pending 清空）
    const settled = (await connPromise) as FailedMcpServer
    expect(settled.type).toBe('failed')
    expect(settled.error).toContain(
      'MCP server "slow-fake" connection timed out after 1500ms',
    )
    expect(manager.getPendingServerNames()).toEqual([])
  })

  test('T-2 settle 后无匹配支字段省略面（空 pending 数据契约不变）', async () => {
    const res = await ToolSearchTool.call(
      { query: 'zzz-no-match' },
      { options: { tools: [] } },
    )
    expect(res.data.pending_mcp_servers).toBeUndefined()
    expect(res.data.matches).toEqual([])
  })
})
