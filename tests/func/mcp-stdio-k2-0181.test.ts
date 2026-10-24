/**
 * 0.1.81 V3-2 K2 MCP 面 — 连接生命周期簇判别测试（工单 #1/#14，func 层
 * 真 spawn 零模型；fixture idiom 同 mcp-stdio-server-se2b）。
 *
 * 被测能力：
 *   #1 协议协商版本升级：initialize 请求携带 protocolVersion '2026-07-28'
 *       （fake server 把收到的 params.protocolVersion 回显进 serverInfo.name，
 *       断言回显值即证发送值——旧实现发 '2025-03-26'，回显不匹配即红）+
 *       init 结果携带 2026-07-28 协议新增字段（resultType/ttlMs/cacheScope）
 *       不致 failed（容忍面）+ negotiatedProtocolVersion 落位（连接对象可查
 *       协商结果）。
 *   #14 并发连接去重：同 server 并发 connect 复用在飞 attempt（排队不重放）
 *       ——fake server 对 initialize 跨进程计数（共享计数文件）；两并发调用
 *       同结果对象 + 底层 initialize 只发一次（计数 1；旧实现 = 2 次 spawn
 *       各自握手，两结果对象不同即红）。
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getMcpConnectionManager,
  resetMcpConnectionManager,
  type ScopedMcpServerConfig,
} from '../../src/mcp'

// ── fake MCP server 脚本（NDJSON JSON-RPC）────────────────────────────
// 回显面：serverInfo.name = 收到的 params.protocolVersion（证发送值）；
// serverInfo.version = 共享计数文件的全局 initialize 计数（证去重只发一次）；
// result 内含 2026-07-28 协议新增字段（容忍面）。FAKE_K2_DELAY_MS =
// initialize 应答延迟（并发窗口面）。

function writeFakeServer(dir: string): string {
  const path = join(dir, 'fake-k2-server.mjs')
  writeFileSync(
    path,
    `import { appendFileSync, readFileSync } from 'node:fs'
let buf = ''
process.stdin.on('data', (chunk) => {
  buf += chunk.toString('utf8')
  let i
  while ((i = buf.indexOf('\\n')) !== -1) {
    const line = buf.slice(0, i)
    buf = buf.slice(i + 1)
    if (!line.trim()) continue
    const msg = JSON.parse(line)
    if (msg.method === 'initialize') {
      appendFileSync(process.env.FAKE_K2_COUNT_FILE, 'x')
      const count = readFileSync(process.env.FAKE_K2_COUNT_FILE, 'utf8').length
      const reply = () => {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            protocolVersion: msg.params.protocolVersion,
            capabilities: { tools: true },
            serverInfo: { name: msg.params.protocolVersion, version: String(count) },
            instructions: 'k2 fixture',
            resultType: 'cache',
            ttlMs: 5000,
            cacheScope: 'connection',
          },
        }) + '\\n')
      }
      const delay = Number(process.env.FAKE_K2_DELAY_MS || '0')
      if (delay > 0) setTimeout(reply, delay)
      else reply()
    }
  }
})
process.stdin.on('end', () => process.exit(0))
`,
  )
  return path
}

function stdioCfg(
  command: string,
  args: string[],
  env?: Record<string, string>,
): ScopedMcpServerConfig {
  return {
    type: 'stdio',
    command,
    args,
    ...(env ? { env } : {}),
    scope: 'user',
  } as ScopedMcpServerConfig
}

let dir: string
let serverScript: string
let countFile: string
const manager = getMcpConnectionManager()

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-mcp-k2-0181-'))
  serverScript = writeFakeServer(dir)
  countFile = join(dir, 'init-count.txt')
  writeFileSync(countFile, '')
})

afterAll(async () => {
  await resetMcpConnectionManager()
  rmSync(dir, { recursive: true, force: true })
})

describe('K2 #1：协议协商版本 2026-07-28 + init 新字段容忍', () => {
  test('initialize 携带 2026-07-28（回显面）+ 新字段不致 failed + negotiatedProtocolVersion 落位', async () => {
    const conn = await manager.connect(
      'proto',
      stdioCfg(process.execPath, [serverScript], { FAKE_K2_COUNT_FILE: countFile }),
    )
    expect(conn.type).toBe('connected')
    if (conn.type === 'connected') {
      // 回显面：旧实现发 '2025-03-26' → 此断言红
      expect(conn.serverInfo?.name).toBe('2026-07-28')
      // init 结果带 2026-07-28 新字段（resultType/ttlMs/cacheScope）不致 failed
      // （connected 态本身即证容忍；本 server 是首个 initialize → 计数 1）
      expect(conn.serverInfo?.version).toBe('1')
      expect(conn.instructions).toBe('k2 fixture')
      // 协商结果落位（旧实现无此字段 → undefined 红）
      expect(conn.negotiatedProtocolVersion).toBe('2026-07-28')
    }
  })
})

describe('K2 #14：并发连接去重（排队不重放）', () => {
  test('并发 2 connect → 同结果对象 + 底层 initialize 只发一次', async () => {
    const before = readFileSync(countFile, 'utf8').length
    const cfg = stdioCfg(process.execPath, [serverScript], {
      FAKE_K2_COUNT_FILE: countFile,
      FAKE_K2_DELAY_MS: '200', // 并发窗口（应答延迟内第二调用到达）
    })
    const p1 = manager.connect('dedup', cfg)
    const p2 = manager.connect('dedup', cfg)
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1.type).toBe('connected')
    // 去重：两调用复用同一 attempt → 同结果对象（旧实现 2 次 spawn 两对象 → 红）
    expect(r1).toBe(r2)
    // 不重放：底层 initialize 只发一次（计数 +1；旧实现 +2 → 红）
    expect(readFileSync(countFile, 'utf8').length - before).toBe(1)
    if (r1.type === 'connected') {
      expect(r1.serverInfo?.version).toBe(String(before + 1))
    }
  })
})
