/**
 * 0.1.75 归整切片① C-2b sessionIngress 1P 远端 session 车道整裁 · /mcp 面同族判别活探针
 *（e2e lane，gate 判据⑤ 新活探针，gate 触发后起稿；规划源 docs/2026-10-18-p0-reorg-slice-plan.md
 * §切片①，基线 4d007bd=v0.1.74 → 被测面 master 2d98f91）。
 *
 * 波体面（4d007bd → 2d98f91，18 文件 +190/−1112）：C-2b 登记项销项 =
 * 1P 远端 session 车道整裁（sessionIngress.ts/sessionIngressAuth.ts 文件删 + 9 消费文件
 * 1P-only 支裁 + AgentTool remote_launched 无生产方整裁 + bootstrapState 1P stub 清零）；
 * 恒等锚零扰动 = local/generic session 存储 + generic MCP 车道 + attribution local +
 * constants/oauth 0.1.73 中性化值 + generic OAuth FD 车道 + caches /clear + P3 远程控制面。
 *
 * 断言面（源级字符串锁，同 0175 判别单测口径 = 活码面；注释登记面不判红）：
 *   P-C2B1-1p-lane-files-absent（hard）：sessionIngress.ts / sessionIngressAuth.ts 文件缺席。
 *   P-C2B2-1p-symbols-absent（hard）：src/ 全树活码 0 处 = 车道函数族（appendSessionLog/
 *         getTeleportEvents/getSessionIngressAuthToken/getSessionIngressAuthHeaders/
 *         updateSessionIngressAuthToken/persistToRemote/hydrateRemoteSession/
 *         hydrateFromCCRv2InternalEvents/InternalEventWriter/REMOTE_FLUSH_INTERVAL_MS/
 *         clearAllSessions）+ 1P env/远端 URL 族（ATLAS_SESSION_ACCESS_TOKEN/
 *         ATLAS_SESSION_INGRESS_TOKEN_FILE/ATLAS_REMOTE_SESSION_ID/SESSION_INGRESS_URL/
 *         CLAUDE_AI_BASE_URL/getRemoteSessionUrl/hasSessionIngressToken/sessionIngressToken/
 *         hasSessionAuth）+ AgentTool 1P 面（remote_launched/RemoteLaunchedOutput）+
 *         车道 import 行 全 0。
 *   P-C2B3-local-session-identity（hard）：sessionStorage local 面在场
 *         （class Project + insertMessageChain + flushSessionStorage + getAgentTranscriptPath）。
 *   P-C2B4-generic-mcp-identity（hard）：generic MCP 车道零扰动
 *         （getMcpServerHeaders + ClaudeAuthProvider + getProxyFetchOptions +
 *         getWebSocketProxyAgent + MCPSettings hasToolsAndConnected）。
 *   P-C2B5-multi-anchor-identity（soft，恒等锚族）：attribution local（Co-Authored-By 行 +
 *         无 remote 支）+ product.ts 仅留 PRODUCT_URL + generic OAuth FD 车道 2 函数在场
 *         （1P ingress 常量缺席）+ caches /clear local 面 + constants/oauth 0.1.73 中性化
 *         undefined 双字段 + P3 RemoteControlHandle。
 *
 * 用法：
 *   ATLAS_E2E_DEANT0175_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-deant-c2b-0175.ts
 */
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const REPO =
  process.env.ATLAS_E2E_DEANT0175_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-075-final'
const OUT =
  process.env.ATLAS_E2E_DEANT0175_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-075/deant0175'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, hard, ok, detail })

function srcOf(rel: string): string {
  return readFileSync(join(REPO, rel), 'utf8')
}
function countOf(hay: string, needle: string): number {
  let n = 0
  let i = hay.indexOf(needle)
  while (i !== -1) {
    n++
    i = hay.indexOf(needle, i + needle.length)
  }
  return n
}
/** src/ 全树 .ts/.tsx（判据面 = 活码，不读 tests/ 注释登记面）。 */
function srcTree(): string {
  const root = join(REPO, 'src')
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(name)) files.push(readFileSync(p, 'utf8'))
    }
  }
  walk(root)
  return files.join('\n')
}

function main(): void {
  mkdirSync(OUT, { recursive: true })
  const tree = srcTree()
  const SESSION_STORE = 'src/tui/utils/sessionStorage.ts'
  const MCP_CLIENT = 'src/tui/services/mcp/client.ts'
  const MCP_SETTINGS = 'src/tui/components/mcp/MCPSettings.tsx'
  const ATTRIBUTION = 'src/tui/utils/attribution.ts'
  const PRODUCT = 'src/tui/constants/product.ts'
  const AUTH_FD = 'src/tui/utils/authFileDescriptor.ts'
  const CACHES = 'src/tui/commands/clear/caches.ts'
  const OAUTH = 'src/tui/constants/oauth.ts'
  const SDK_TYPES = 'src/tui/entrypoints/agentSdkTypes.ts'

  // P-C2B1：1P 车道文件缺席
  {
    const f1 = existsSync(join(REPO, 'src/tui/services/api/sessionIngress.ts'))
    const f2 = existsSync(join(REPO, 'src/tui/utils/sessionIngressAuth.ts'))
    push(
      'P-C2B1-1p-lane-files-absent',
      !f1 && !f2,
      !f1 && !f2
        ? 'sessionIngress.ts / sessionIngressAuth.ts 车道本体文件双缺席（整删）'
        : `车道文件在场（ingress=${f1} auth=${f2}，应双 false）`,
    )
  }
  // P-C2B2：1P 活码符号族 0 锁
  {
    const fails: string[] = []
    for (const sym of [
      'appendSessionLog',
      'getTeleportEvents',
      'getSessionIngressAuthToken',
      'getSessionIngressAuthHeaders',
      'updateSessionIngressAuthToken',
      'persistToRemote',
      'hydrateRemoteSession',
      'hydrateFromCCRv2InternalEvents',
      'InternalEventWriter',
      'REMOTE_FLUSH_INTERVAL_MS',
      'clearAllSessions',
      'ATLAS_SESSION_ACCESS_TOKEN',
      'ATLAS_SESSION_INGRESS_TOKEN_FILE',
      'ATLAS_REMOTE_SESSION_ID',
      'SESSION_INGRESS_URL',
      'CLAUDE_AI_BASE_URL',
      'getRemoteSessionUrl',
      'hasSessionIngressToken',
      'sessionIngressToken',
      'hasSessionAuth',
      'remote_launched',
      'RemoteLaunchedOutput',
      "from '../services/api/sessionIngress.js'",
      "from '../../utils/sessionIngressAuth.js'",
    ]) {
      const c = countOf(tree, sym)
      if (c !== 0) fails.push(`${sym}=${c}（应 0）`)
    }
    push(
      'P-C2B2-1p-symbols-absent',
      fails.length === 0,
      fails.length
        ? fails.join('；')
        : 'src/ 全树 1P 远端 session 车道活码 0 处（车道函数族+1P env/远端 URL 族+AgentTool 1P 面+import 行 24 锁全 0；注释登记面不判红）',
    )
  }
  // P-C2B3：local session 存储恒等锚
  {
    const src = srcOf(SESSION_STORE)
    const ok =
      src.includes('class Project') &&
      src.includes('insertMessageChain') &&
      src.includes('export async function flushSessionStorage') &&
      src.includes('getAgentTranscriptPath')
    push(
      'P-C2B3-local-session-identity',
      ok,
      ok
        ? 'sessionStorage local 面在场（Project 类+本地写面+flush 面+agent transcript path）= local session 存储零扰动'
        : 'local session 存储恒等锚漂移',
    )
  }
  // P-C2B4：generic MCP 车道恒等锚
  {
    const src = srcOf(MCP_CLIENT)
    const settings = srcOf(MCP_SETTINGS)
    const ok =
      src.includes('getMcpServerHeaders') &&
      src.includes('ClaudeAuthProvider') &&
      src.includes('getProxyFetchOptions') &&
      src.includes('getWebSocketProxyAgent') &&
      settings.includes('hasToolsAndConnected')
    push(
      'P-C2B4-generic-mcp-identity',
      ok,
      ok
        ? 'generic MCP 车道零扰动（sse/http/ws 头+per-server oauth+用户级代理 4 函数 + MCPSettings generic 认证显示面）'
        : 'generic MCP 车道恒等锚漂移',
    )
  }
  // P-C2B5：多锚恒等族（soft）
  {
    const checks: Array<[string, boolean]> = [
      ['attribution-local', srcOf(ATTRIBUTION).includes('Co-Authored-By:') && !srcOf(ATTRIBUTION).includes("getClientType() === 'remote'")],
      ['product-url', srcOf(PRODUCT).includes("export const PRODUCT_URL = 'https://github.com/vincentlau2046/AtlasCode'") && !srcOf(PRODUCT).includes('CLAUDE_AI_BASE_URL')],
      ['oauth-fd', srcOf(AUTH_FD).includes('export function getOAuthTokenFromFileDescriptor') && srcOf(AUTH_FD).includes('export function getApiKeyFromFileDescriptor') && !srcOf(AUTH_FD).includes('CCR_SESSION_INGRESS_TOKEN_PATH')],
      ['caches-clear', srcOf(CACHES).includes("resetGetMemoryFilesCache('session_start')") && srcOf(CACHES).includes('clearAllPendingCallbacks')],
      ['oauth-neutral', srcOf(OAUTH).includes('BASE_API_URL: string | undefined') && srcOf(OAUTH).includes('CLAUDE_AI_ORIGIN: string | undefined')],
      ['p3-remote-control', srcOf(SDK_TYPES).includes('RemoteControlHandle')],
    ]
    const bad = checks.filter(([, ok]) => !ok).map(([k]) => k)
    push(
      'P-C2B5-multi-anchor-identity',
      bad.length === 0,
      bad.length ? `恒等锚漂移：${bad.join('、')}` : '恒等锚族 6 件全在场（attribution local/product 仅 URL/OAuth FD 车道/caches /clear/oauth 中性化 undefined/P3 远程控制面）',
      false,
    )
  }

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const inconclusive = probes.filter((p) => p.ok === null).length
  const verdict = hardFail > 0 ? 'FAIL' : inconclusive > 0 ? 'INCONCLUSIVE' : 'PASS'
  const result = {
    verdict,
    hardFail,
    inconclusive,
    probes: probes.map((p) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : '?'}] ${p.id}: ${p.detail}`).join(' || '),
    repo: REPO,
  }
  writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  console.log(`${verdict} → ${OUT}`)
  process.exit(verdict === 'FAIL' ? 1 : 0)
}

main()
