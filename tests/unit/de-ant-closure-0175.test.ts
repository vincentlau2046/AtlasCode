/**
 * 0.1.75 归整切片① C-2b sessionIngress 1P 远端 session 车道整裁判别单测。
 *
 * 波 = 归整波切片①（f4 规划 docs/2026-10-18-p0-reorg-slice-plan.md §切片①）：
 * C-2b 1P 远端 session 车道（§8.74.29 1P 簇裁 #200 登记残项）整裁——
 * sessionIngress 写入/水合支 + sessionIngressAuth 1P 远端认证支 + 各消费
 * 文件的 1P-remote 分支。C-2c（getOauthProfile）0.1.73 已裁不重复（裁定⑤）。
 *
 * 判别信号（源级锁，读仓库自身 = 确定性，unit 层零重图/零网络/零盘写）：
 *  - 1P 车道任一复活（车道文件 / 车道函数 / 1P 专属 env / 1P 专属符号）
 *    = 立即 RED（de-ant 回归守卫，同 0173/0174 头注纪律）。
 *  - local/generic 恒等锚在场（local session 存储 / generic MCP 车道 /
 *    generic OAuth FD 车道 / attribution local 面 / P3 远程控制面 /
 *    constants/oauth 中性化值）。
 *
 * 判据面 = 活码（env 读 / import 语句 / 函数名 / 型面）；历史审计注释
 * （前向缝登记含 1P 字样）不在判据面。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
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

const SESSION_STORAGE = 'src/tui/utils/sessionStorage.ts'
const MCP_CLIENT = 'src/tui/services/mcp/client.ts'
const MCP_SETTINGS = 'src/tui/components/mcp/MCPSettings.tsx'
const CACHES = 'src/tui/commands/clear/caches.ts'
const ATTRIBUTION = 'src/tui/utils/attribution.ts'
const PRODUCT = 'src/tui/constants/product.ts'
const AUTH_FD = 'src/tui/utils/authFileDescriptor.ts'
const BOOTSTRAP_STATE = 'src/tui/bootstrapState.ts'
const OAUTH = 'src/tui/constants/oauth.ts'
const SDK_TYPES = 'src/tui/entrypoints/agentSdkTypes.ts'

describe('0.1.75 C-2b：1P 远端 session 车道文件整删', () => {
  test('sessionIngress.ts / sessionIngressAuth.ts 文件缺席', () => {
    const root = resolve(import.meta.dir, '../../')
    expect(existsSync(join(root, 'src/tui/services/api/sessionIngress.ts'))).toBe(false)
    expect(existsSync(join(root, 'src/tui/utils/sessionIngressAuth.ts'))).toBe(false)
  })
})

describe('0.1.75 C-2b：src/ 全树 1P 车道符号清零（活码判据面）', () => {
  test('车道 import / 车道函数 0 处', () => {
    const tree = srcTree()
    expect(countOf(tree, "from '../services/api/sessionIngress.js'")).toBe(0)
    expect(countOf(tree, "from '../../utils/sessionIngressAuth.js'")).toBe(0)
    expect(countOf(tree, 'appendSessionLog')).toBe(0)
    expect(countOf(tree, 'getTeleportEvents')).toBe(0)
    expect(countOf(tree, 'getSessionIngressAuthToken')).toBe(0)
    expect(countOf(tree, 'getSessionIngressAuthHeaders')).toBe(0)
    expect(countOf(tree, 'updateSessionIngressAuthToken')).toBe(0)
    expect(countOf(tree, 'CCR_SESSION_INGRESS_TOKEN_PATH')).toBe(0)
    expect(countOf(tree, 'persistToRemote')).toBe(0)
    expect(countOf(tree, 'hydrateRemoteSession')).toBe(0)
    expect(countOf(tree, 'hydrateFromCCRv2InternalEvents')).toBe(0)
    expect(countOf(tree, 'InternalEventWriter')).toBe(0)
    expect(countOf(tree, 'REMOTE_FLUSH_INTERVAL_MS')).toBe(0)
    expect(countOf(tree, 'clearAllSessions')).toBe(0)
  })
  test('1P 专属 env / 远端 URL 族 0 处', () => {
    const tree = srcTree()
    expect(countOf(tree, 'ATLAS_SESSION_ACCESS_TOKEN')).toBe(0)
    expect(countOf(tree, 'ATLAS_WEBSOCKET_AUTH_FILE_DESCRIPTOR')).toBe(0)
    expect(countOf(tree, 'ATLAS_SESSION_INGRESS_TOKEN_FILE')).toBe(0)
    expect(countOf(tree, 'ATLAS_REMOTE_SESSION_ID')).toBe(0)
    expect(countOf(tree, 'SESSION_INGRESS_URL')).toBe(0)
    // TEST_ENABLE_SESSION_PERSISTENCE 是 func 真盘测试守卫（不同变量，保留）。
    expect(countOf(tree, 'process.env.ENABLE_SESSION_PERSISTENCE')).toBe(0)
    expect(countOf(tree, 'getRemoteSessionUrl')).toBe(0)
    expect(countOf(tree, 'isRemoteSessionLocal')).toBe(0)
    expect(countOf(tree, 'CLAUDE_AI_BASE_URL')).toBe(0)
    expect(countOf(tree, 'hasSessionIngressToken')).toBe(0)
    expect(countOf(tree, 'sessionIngressToken')).toBe(0)
    expect(countOf(tree, 'hasSessionAuth')).toBe(0)
  })
  test('AgentTool 1P remote_launched 面 0 处（无生产方，整裁）', () => {
    const tree = srcTree()
    expect(countOf(tree, 'remote_launched')).toBe(0)
    expect(countOf(tree, 'RemoteLaunchedOutput')).toBe(0)
  })
  test('bootstrapState 1P 面 stub 清零', () => {
    const src = srcOf(BOOTSTRAP_STATE)
    expect(src).not.toContain('getSessionIngressToken')
    expect(src).not.toContain('setSessionIngressToken')
  })
})

describe('0.1.75 恒等锚：local/generic 面零扰动（字节级恒等锁）', () => {
  test('sessionStorage local 面在场（Project 类 + 本地写面 + flush 面）', () => {
    const src = srcOf(SESSION_STORAGE)
    expect(src).toContain('class Project')
    expect(src).toContain('insertMessageChain')
    expect(src).toContain('export async function flushSessionStorage')
    expect(src).toContain('getAgentTranscriptPath')
  })
  test('generic MCP 车道在场（sse/http/ws + per-server oauth + 用户级代理）', () => {
    const src = srcOf(MCP_CLIENT)
    expect(src).toContain('getMcpServerHeaders')
    expect(src).toContain('ClaudeAuthProvider')
    expect(src).toContain('getProxyFetchOptions')
    expect(src).toContain('getWebSocketProxyAgent')
  })
  test('MCPSettings generic 认证显示面在场（hasToolsAndConnected）', () => {
    expect(srcOf(MCP_SETTINGS)).toContain('hasToolsAndConnected')
  })
  test('attribution local 面在场（Co-Authored-By 默认行 + PRODUCT_URL 消费）', () => {
    const src = srcOf(ATTRIBUTION)
    expect(src).toContain('Co-Authored-By:')
    expect(src).toContain('getMainLoopModel()')
    expect(src).not.toContain("getClientType() === 'remote'")
  })
  test('product.ts 仅留 PRODUCT_URL（remote URL 族整裁）', () => {
    const src = srcOf(PRODUCT)
    expect(src).toContain("export const PRODUCT_URL = 'https://github.com/vincentlau2046/AtlasCode'")
    expect(src).not.toContain('CLAUDE_AI_BASE_URL')
  })
  test('generic OAuth FD 车道保留（authFileDescriptor 仅裁 1P ingress 常量）', () => {
    const src = srcOf(AUTH_FD)
    expect(src).toContain('export function getOAuthTokenFromFileDescriptor')
    expect(src).toContain('export function getApiKeyFromFileDescriptor')
    expect(src).not.toContain('CCR_SESSION_INGRESS_TOKEN_PATH')
  })
  test('caches /clear local 面恒等（memory 缓存重置 + swarm 回调清理）', () => {
    const src = srcOf(CACHES)
    expect(src).toContain("resetGetMemoryFilesCache('session_start')")
    expect(src).toContain('clearAllPendingCallbacks')
  })
  test('constants/oauth.ts 0.1.73 中性化值恒等（两 undefined 字段）', () => {
    const src = srcOf(OAUTH)
    expect(src).toContain('BASE_API_URL: string | undefined')
    expect(src).toContain('CLAUDE_AI_ORIGIN: string | undefined')
  })
  test('P3 远程控制面保留（agentSdkTypes RemoteControlHandle）', () => {
    expect(srcOf(SDK_TYPES)).toContain('RemoteControlHandle')
  })
})
