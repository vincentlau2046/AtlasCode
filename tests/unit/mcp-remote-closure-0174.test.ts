/**
 * 0.1.74 MCP 远端车道通用化收口波（C-3e 销项）判别单测：
 * D-1 1P hosted-connector（claudeai-proxy）全车道删除 + D-2 CIMD 常量删除
 * （MCP_CLIENT_METADATA_URL）+ D-3 per-server oauth.clientMetadataUrl 字段并入。
 *
 * 用户裁定（原话）：MCP 远端车道 = 配置驱动可配的 http url，不与本地 gateway
 * 绑定，通用产品非本地定制。故本波 = 两条 1P 死车道整裁（claudeai-proxy 型
 * 连接/显示/守卫面 + CIMD 常量）+ per-server clientMetadataUrl 通用配置面并入；
 * 远端 MCP 连接 = sse/http/ws + url + headers + per-server oauth，与 LLM
 * gateway 完全解耦（用户级 HTTPS_PROXY 代理支持保留 = 通用能力）。
 *
 * 判别信号（源级字符串锁，读仓库自身 = 确定性）：
 *  - 1P hosted-connector 型/车道/常量任一复活（z.literal 型面 / 车道函数 /
 *    MCP_PROXY_* / MCP_CLIENT_METADATA_URL）= 立即 RED（de-ant 回归守卫）。
 *  - 通用远端面恒等锚（sse/http/ws 型 + headers + per-server oauth +
 *    clientMetadataUrl 优先级链）在场。
 *
 * 分层纪律：unit 层——源级字符串锁；零 import 重图、零网络 / 零盘写 /
 * 零 PTY / 零 spawn（同 de-ant-closure-0173 头注纪律）。注释面历史登记
 * （0.1.74 marker 注释含 claudeai-proxy 字样）不在判据面（判据面 = 活码：
 * z.literal 型面 + 常量名 + 车道函数名）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'

function srcOf(rel: string): string {
  return readFileSync(resolve(import.meta.dir, '../../', rel), 'utf8')
}
function countOf(haystack: string, needle: string): number {
  let n = 0
  let i = haystack.indexOf(needle)
  while (i !== -1) {
    n++
    i = haystack.indexOf(needle, i + needle.length)
  }
  return n
}
/** src/ 全树 .ts/.tsx 源级锁（读仓库自身，确定性；不读 tests/ —— 判据面 = 活码）。 */
function srcTree(): string {
  const root = resolve(import.meta.dir, '../../src')
  const files: string[] = []
  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) {
        walk(p)
      } else if (/\.(ts|tsx)$/.test(entry)) {
        files.push(readFileSync(p, 'utf8'))
      }
    }
  }
  walk(root)
  return files.join('\n')
}

const TYPES = 'src/tui/services/mcp/types.ts'
const AUTH = 'src/tui/services/mcp/auth.ts'
const CLIENT = 'src/tui/services/mcp/client.ts'
const CORE_SCHEMAS = 'src/tui/entrypoints/sdk/coreSchemas.ts'
const OAUTH = 'src/tui/constants/oauth.ts'
const CLI_HANDLER = 'src/tui/cli/handlers/mcp.tsx'

describe('0.1.74 D-1：1P hosted-connector 型面全车道删除', () => {
  test('src/ 全树：活码 z.literal 型面 0 处（注释登记不在判据面）', () => {
    expect(countOf(srcTree(), "z.literal('claudeai-proxy')")).toBe(0)
    expect(countOf(srcTree(), 'z.literal("claudeai-proxy")')).toBe(0)
  })
  test('src/ 全树：型 schema / 型名 / 车道函数 0 处', () => {
    const tree = srcTree()
    expect(countOf(tree, 'McpClaudeAIProxyServerConfig')).toBe(0)
    expect(countOf(tree, 'createClaudeAiProxyFetch')).toBe(0)
  })
  test('types.ts：union = 7 型（stdio/sse/sse-ide/ws-ide/http/ws/sdk，1P 型缺席）', () => {
    const src = srcOf(TYPES)
    expect(countOf(src, "z.literal('stdio')")).toBe(1)
    expect(countOf(src, "z.literal('sse')")).toBe(1)
    expect(countOf(src, "z.literal('sse-ide')")).toBe(1)
    expect(countOf(src, "z.literal('ws-ide')")).toBe(1)
    expect(countOf(src, "z.literal('http')")).toBe(1)
    expect(countOf(src, "z.literal('ws')")).toBe(1)
    expect(countOf(src, "z.literal('sdk')")).toBe(1)
    expect(src).not.toContain('McpClaudeAIProxyServerConfigSchema')
  })
  test('coreSchemas.ts：1P 型 schema 缺席（SDK 状态面 = 通用 transport 面）', () => {
    expect(srcOf(CORE_SCHEMAS)).not.toContain(
      'McpClaudeAIProxyServerConfigSchema',
    )
  })
  test('client.ts：远端 auth 失败处理 = sse/http 双型（1P 型出 union）', () => {
    const src = srcOf(CLIENT)
    expect(src).toContain("transportType: 'sse' | 'http'")
    expect(src).not.toContain('createClaudeAiProxyFetch')
  })
})

describe('0.1.74 D-2：CIMD 常量删除（per-server 配置驱动取代内置默认）', () => {
  test('src/ 全树：MCP_PROXY_URL / MCP_PROXY_PATH / MCP_CLIENT_METADATA_URL 0 处', () => {
    const tree = srcTree()
    expect(countOf(tree, 'MCP_PROXY_URL')).toBe(0)
    expect(countOf(tree, 'MCP_PROXY_PATH')).toBe(0)
    expect(countOf(tree, 'MCP_CLIENT_METADATA_URL')).toBe(0)
  })
  test('oauth.ts：OauthConfig 仅剩 1P REST 基址 + web origin 双字段', () => {
    const src = srcOf(OAUTH)
    expect(src).toContain('BASE_API_URL: string | undefined')
    expect(src).toContain('CLAUDE_AI_ORIGIN: string | undefined')
    expect(src).not.toContain('MCP_PROXY_URL')
  })
})

describe('0.1.74 D-3：per-server oauth.clientMetadataUrl 字段并入', () => {
  test('types.ts：McpOAuthConfigSchema 含 clientMetadataUrl（https-only url）', () => {
    const src = srcOf(TYPES)
    expect(src).toContain('clientMetadataUrl must use https://')
    expect(src).toContain("startsWith('https://'")
  })
  test('auth.ts：getter 优先级链 per-server → env → undefined（DCR 兜底）', () => {
    const src = srcOf(AUTH)
    expect(src).toContain('this.serverConfig.oauth?.clientMetadataUrl')
    expect(src).toContain('process.env.MCP_OAUTH_CLIENT_METADATA_URL')
    expect(src).toContain('get clientMetadataUrl(): string | undefined')
  })
  test('CLI /mcp 面：oauth client_metadata_url 展示行在场（sse+http 双支）', () => {
    const src = srcOf(CLI_HANDLER)
    expect(countOf(src, 'client_metadata_url')).toBe(2)
  })
})

describe('0.1.74 通用远端面恒等锚（零回归：配置驱动 sse/http/ws 面零扰动）', () => {
  test('types.ts：sse/http 型 = url + headers + headersHelper + per-server oauth', () => {
    const src = srcOf(TYPES)
    expect(countOf(src, 'headersHelper: z.string().optional()')).toBe(3)
    expect(countOf(src, 'oauth: McpOAuthConfigSchema().optional()')).toBe(2)
  })
  test('client.ts：用户级 HTTPS_PROXY 代理支持保留（通用能力，非 1P 车道）', () => {
    const src = srcOf(CLIENT)
    expect(src).toContain('getProxyFetchOptions')
    expect(src).toContain('getWebSocketProxyAgent')
    expect(src).toContain('getWebSocketProxyUrl')
  })
})
