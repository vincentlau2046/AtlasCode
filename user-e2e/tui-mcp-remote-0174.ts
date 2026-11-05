/**
 * 0.1.74 MCP 远端车道通用化收口波（C-3e 销项）· /mcp 面抽验判别活探针（e2e lane，
 * gate 判据③ 新活探针，gate 触发后起稿；工单 docs/2026-10-18-mcp-remote-wave-0174-ticket.md
 * §1 D-1~D-3）。
 *
 * 波体面（5d8a809=v0.1.73 → 终态 34307b7）：D-1 1P hosted-connector
 * （claudeai-proxy）全车道整裁（型面/连接车道/TUI/CLI）+ D-2 CIMD 常量
 * MCP_CLIENT_METADATA_URL 整删 + D-3 per-server oauth.clientMetadataUrl 字段
 * 并入（https-only；getter 优先级链 env MCP_OAUTH_CLIENT_METADATA_URL →
 * per-server → undefined DCR 兜底）+ 安全 review 修波三连击（1st：getter env
 * 部署控制优先于 per-server；2nd：env 值 https 验真 + settings.env 全源剥离
 * 〔managedEnv withoutMcpOauthCimdVars〕；3rd：CWE-178 剥离键匹配
 * case-insensitive）。通用远端 sse/http/ws 面零扰动恒等（配置驱动取代内置
 * 默认；与 LLM gateway 完全解耦）。
 *
 * 断言面（源级字符串锁，同 0174 判别单测口径 = 活码面；注释登记面〔src/mcp/* +
 * se2b 测试头注 claudeai-proxy 裁除记录〕不判红）：
 *   P-MR1-claudeai-proxy-live-code-absent（hard）：src/ 全树活码 0 处 =
 *         z.literal('claudeai-proxy') 双引号形式 + McpClaudeAIProxyServerConfig
 *         （型名/schema 名同锁）+ createClaudeAiProxyFetch（车道函数）+
 *         MCP_PROXY_URL / MCP_PROXY_PATH / MCP_CLIENT_METADATA_URL（常量）全 0。
 *   P-MR2-client-metadata-url-https（hard）：types.ts McpOAuthConfigSchema 含
 *         clientMetadataUrl + https-only 纪律（startsWith('https://') + 校验消息）。
 *   P-MR3-getter-priority-chain（hard）：auth.ts getter 顺序锁 =
 *         env MCP_OAUTH_CLIENT_METADATA_URL 读取排在 per-server 之前
 *         （CIMD URL 承载 OAuth 客户端身份，repo 提交 per-server 值不得压过
 *         operator 控制 = 安全裁定顺序，0174 单测 D-3 行为双核）。
 *   P-MR4-mcp-oauth-display-both（hard）：CLI /mcp 面 oauth client_metadata_url
 *         展示行 sse+http 双支在场（count=2）。
 *   P-MR5-gateway-decoupled（soft，恒等锚）：client.ts 用户级 HTTPS_PROXY 通用
 *         能力在场（getProxyFetchOptions/getWebSocketProxyAgent/getWebSocketProxyUrl）
 *         + types.ts 7 型 union 完整（z.literal stdio/sse/sse-ide/ws-ide/http/ws/sdk
 *         各 1）= 通用远端 MCP 面零扰动。
 *   P-MR6-security-hardening（hard，修波三连击面）：managedEnv.ts
 *         withoutMcpOauthCimdVars 剥离函数在场 + 键匹配 case-insensitive
 *         （CWE-178：key.toUpperCase() 对齐 Windows process.env 大小写不敏感
 *         语义）+ auth.ts getter env 值 https 验真（new URL(override).protocol
 *         === 'https:'，畸形/非 https 值忽略不 steering 客户端身份）。
 *
 * 用法：
 *   ATLAS_E2E_MCP0174_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-mcp-remote-0174.ts
 */
import { writeFileSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const REPO =
  process.env.ATLAS_E2E_MCP0174_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-0.1.74-mcp-remote'
const OUT =
  process.env.ATLAS_E2E_MCP0174_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-074/mcp0174'

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
  const TYPES = srcOf('src/tui/services/mcp/types.ts')
  const AUTH = srcOf('src/tui/services/mcp/auth.ts')
  const CLIENT = srcOf('src/tui/services/mcp/client.ts')
  const CLI_HANDLER = srcOf('src/tui/cli/handlers/mcp.tsx')

  // P-MR1：1P hosted-connector 活码 0 面
  {
    const fails: string[] = []
    for (const lit of [
      "z.literal('claudeai-proxy')",
      'z.literal("claudeai-proxy")',
      'McpClaudeAIProxyServerConfig',
      'createClaudeAiProxyFetch',
      'MCP_PROXY_URL',
      'MCP_PROXY_PATH',
      'MCP_CLIENT_METADATA_URL',
    ]) {
      const c = countOf(tree, lit)
      if (c !== 0) fails.push(`${lit}=${c}（应 0）`)
    }
    push(
      'P-MR1-claudeai-proxy-live-code-absent',
      fails.length === 0,
      fails.length
        ? fails.join('；')
        : 'src/ 全树 1P hosted-connector 活码 0 处（型面/车道函数/常量 7 锁全 0；注释登记面不判红）',
    )
  }
  // P-MR2：clientMetadataUrl https-only
  {
    const ok =
      TYPES.includes('clientMetadataUrl must use https://') &&
      TYPES.includes("startsWith('https://'")
    push(
      'P-MR2-client-metadata-url-https',
      ok,
      ok
        ? 'types.ts McpOAuthConfigSchema clientMetadataUrl 在场 + https-only 纪律（startsWith https:// + 校验消息）'
        : 'clientMetadataUrl https-only 面缺失',
    )
  }
  // P-MR3：getter 优先级链（env → per-server → undefined）
  {
    const gIdx = AUTH.indexOf('get clientMetadataUrl()')
    const ok = gIdx !== -1
    let detail = 'auth.ts getter 缺席'
    if (ok) {
      const getter = AUTH.slice(gIdx)
      const envIdx = getter.indexOf('process.env.MCP_OAUTH_CLIENT_METADATA_URL')
      const perIdx = getter.indexOf('this.serverConfig.oauth?.clientMetadataUrl')
      const chainOk = envIdx > -1 && perIdx > envIdx
      detail = chainOk
        ? 'getter 顺序锁核销：env MCP_OAUTH_CLIENT_METADATA_URL 读取在前（部署控制）→ per-server 在后（repo 值不压 operator）→ undefined DCR 兜底'
        : `getter 顺序锁漂移（envIdx=${envIdx} perIdx=${perIdx}，应 per>env>−1）`
      push('P-MR3-getter-priority-chain', chainOk, detail)
    } else {
      push('P-MR3-getter-priority-chain', false, detail)
    }
  }
  // P-MR4：/mcp OAuth 行展示双支
  {
    const c = countOf(CLI_HANDLER, 'client_metadata_url')
    push(
      'P-MR4-mcp-oauth-display-both',
      c === 2,
      c === 2
        ? 'CLI /mcp 面 oauth client_metadata_url 展示行 sse+http 双支在场（count=2）'
        : `client_metadata_url 展示行 count=${c}（应 2 双支）`,
    )
  }
  // P-MR5：通用远端面恒等锚（soft）
  {
    const unionOk =
      countOf(TYPES, "z.literal('stdio')") === 1 &&
      countOf(TYPES, "z.literal('sse')") === 1 &&
      countOf(TYPES, "z.literal('sse-ide')") === 1 &&
      countOf(TYPES, "z.literal('ws-ide')") === 1 &&
      countOf(TYPES, "z.literal('http')") === 1 &&
      countOf(TYPES, "z.literal('ws')") === 1 &&
      countOf(TYPES, "z.literal('sdk')") === 1
    const proxyOk =
      CLIENT.includes('getProxyFetchOptions') &&
      CLIENT.includes('getWebSocketProxyAgent') &&
      CLIENT.includes('getWebSocketProxyUrl')
    const ok = unionOk && proxyOk
    push(
      'P-MR5-gateway-decoupled',
      ok,
      ok
        ? '通用远端 MCP 面零扰动恒等：7 型 union 完整（stdio/sse/sse-ide/ws-ide/http/ws/sdk）+ 用户级 HTTPS_PROXY 通用能力在场（3 函数）= 与 LLM gateway 解耦'
        : `恒等锚漂移（union7=${unionOk} httpsProxy=${proxyOk}）`,
      false,
    )
  }

  // P-MR6：安全修波三连击面（env 通道 https 验真 + settings.env 全源剥离 case-insensitive）
  {
    const MANAGED_ENV = srcOf('src/tui/utils/managedEnv.ts')
    const stripOk =
      MANAGED_ENV.includes('withoutMcpOauthCimdVars') &&
      MANAGED_ENV.includes("key.toUpperCase() !== 'MCP_OAUTH_CLIENT_METADATA_URL'")
    const httpsOk =
      AUTH.includes("new URL(override).protocol === 'https:'")
    const ok = stripOk && httpsOk
    push(
      'P-MR6-security-hardening',
      ok,
      ok
        ? '修波三连击活码面核销：managedEnv withoutMcpOauthCimdVars 全源剥离在场 + 键匹配 case-insensitive（CWE-178 对齐 Windows env 语义）+ getter env 值 https 验真（畸形/非 https 忽略）'
        : `安全硬化面漂移（strip=${stripOk} https=${httpsOk}）`,
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
