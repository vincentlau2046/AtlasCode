/**
 * 0.1.76 归整切片② per-server oauth 块级 scope-gating · 判别活探针（e2e lane，
 * gate 判据⑤ 新活探针「untrusted oauth 块门控」，gate 触发后起稿；工单
 * docs/2026-10-18-p0-wave-0176-ticket.md §判据⑤，基线 0f4835d=v0.1.75 → 被测面 master ea0d294）。
 *
 * 波体面（0f4835d → ea0d294，12 文件 +682/-9）：S-1 块级门控（untrusted scope =
 * project+plugin 的 oauth 块整体默认视为缺席，须 env allowlist 方生效；trusted =
 * user/local+enterprise+env 恒通过恒等锚）+ S-2 allowlist env
 * ATLAS_MCP_OAUTH_TRUSTED_SERVERS（trim+case-insensitive CWE-178；settings 源不计数）
 * + S-3 显示面三处 untrusted-gated 态显形 + S-4 判别单测 29 断言族。
 * 门控先于 0.1.74 CIMD getter 优先级链生效；0.1.74 四硬化面零回归。
 *
 * 断言面（源级字符串锁，同 0176 判别单测口径 = 活码面；注释登记面不判红）：
 *   P-OG1-gate-module-present（hard）：oauthScopeGate.ts 文件在场 + 8 导出面
 *         （MCP_OAUTH_TRUSTED_SERVERS_ENV/parseMcpOauthTrustedServersEnv/
 *         getMcpOauthTrustedServers/isMcpOauthUntrustedScope/isMcpOauthBlockGated/
 *         applyMcpOauthScopeGate/isMcpOauthDisplayGated/mcpOauthGatedMessage）全在场。
 *   P-OG2-untrusted-block-gated（hard）：门控谓词判定面在场（isMcpOauthUntrustedScope
 *         project+plugin 判定 + isMcpOauthBlockGated + applyMcpOauthScopeGate 整块剥离
 *         语义锚〔oauthGated 标记〕）+ 显示谓词 isMcpOauthDisplayGated。
 *   P-OG3-allowlist-true-env-only（hard）：managedEnv withoutMcpOauthTrustedServersVars
 *         剥离层在场（settings 源不可种，对齐 0.1.74 withoutMcpOauthCimdVars 纪律）
 *         + env 常量 ATLAS_MCP_OAUTH_TRUSTED_SERVERS 单一事实源 + 键匹配
 *         case-insensitive（CWE-178 对齐 0.1.74 先例）。
 *   P-OG4-gate-enforcement-points（hard）：choke point 接线在场 = config.ts
 *         addScopeToServers 附着面 + getMcpConfigs 插件面兜底（applyMcpOauthScopeGate
 *         调用 3 面）+ auth.ts performMCPOAuthFlow 函数顶门禁 throw
 *         mcpOauthGatedMessage + 显示面 3 处显形锚（MCPListPanel/MCPRemoteServerMenu
 *         「oauth gated (untrusted scope)」文案 + MCPSettings oauthGated 数据面 +
 *         mcp.tsx CLI 门控支）。
 *   P-OG5-0174-hardening-identity（soft，恒等锚）：0.1.74 四硬化面零回归 =
 *         auth.ts CIMD getter 优先级链（env 部署控制在前）+ env https 验真
 *         （protocol === 'https:'）+ 日志不可逆描述子 + managedEnv MCP_OAUTH_CLIENT_METADATA_URL
 *         case-insensitive 剥离 + types.ts CIMD https-only 锚——门控先于 CIMD 链且不破 0.1.74 面。
 *
 * 用法：
 *   ATLAS_E2E_OAUTHGATE0176_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-mcp-oauth-gate-0176.ts
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO =
  process.env.ATLAS_OAUTHGATE0176_REPO ??
  process.env.ATLAS_E2E_OAUTHGATE0176_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-076-final'
const OUT =
  process.env.ATLAS_E2E_OAUTHGATE0176_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-076/oauthgate0176'

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

function main(): void {
  mkdirSync(OUT, { recursive: true })
  const GATE_REL = 'src/tui/services/mcp/oauthScopeGate.ts'
  const MANAGED_ENV = 'src/tui/utils/managedEnv.ts'
  const CONFIG = 'src/tui/services/mcp/config.ts'
  const AUTH = 'src/tui/services/mcp/auth.ts'
  const TYPES = 'src/tui/services/mcp/types.ts'
  const LIST_PANEL = 'src/tui/components/mcp/MCPListPanel.tsx'
  const REMOTE_MENU = 'src/tui/components/mcp/MCPRemoteServerMenu.tsx'
  const MCP_SETTINGS = 'src/tui/components/mcp/MCPSettings.tsx'
  const MCP_CLI = 'src/tui/cli/handlers/mcp.tsx'

  // P-OG1：门控模块 8 导出面在场
  {
    const fileOk = existsSync(join(REPO, GATE_REL))
    const gate = fileOk ? srcOf(GATE_REL) : ''
    const exports = [
      'export const MCP_OAUTH_TRUSTED_SERVERS_ENV = \'ATLAS_MCP_OAUTH_TRUSTED_SERVERS\'',
      'export function parseMcpOauthTrustedServersEnv',
      'export function getMcpOauthTrustedServers',
      'export function isMcpOauthUntrustedScope',
      'export function isMcpOauthBlockGated',
      'export function applyMcpOauthScopeGate',
      'export function isMcpOauthDisplayGated',
      'export function mcpOauthGatedMessage',
    ]
    const missing = exports.filter((e) => !gate.includes(e))
    const ok = fileOk && missing.length === 0
    push(
      'P-OG1-gate-module-present',
      ok,
      ok
        ? 'oauthScopeGate.ts 在场 + 8 导出面全在场（env 单一事实源常量 + 解析/allowlist/判定/门控/显示谓词/可行动错误文案）'
        : `门控模块面缺失（file=${fileOk} missing=${missing.length ? missing.join(' | ') : 'n/a'}）`,
    )
  }
  // P-OG2：untrusted 块级门控判定面
  {
    const gate = srcOf(GATE_REL)
    const ok =
      gate.includes('isMcpOauthUntrustedScope') &&
      gate.includes("isMcpOauthBlockGated") &&
      gate.includes('applyMcpOauthScopeGate') &&
      gate.includes('oauthGated') &&
      gate.includes('isMcpOauthDisplayGated')
    push(
      'P-OG2-untrusted-block-gated',
      ok,
      ok
        ? 'untrusted 块级门控判定面在场（project+plugin 判定 + 块级谓词 + 整块剥离 applyMcpOauthScopeGate + oauthGated 标记 + 显示谓词 = 块级语义非单字段门控）'
        : '块级门控判定面缺失',
    )
  }
  // P-OG3：allowlist 真 env 专用面（settings 源不计数 + CWE-178）
  {
    const me = srcOf(MANAGED_ENV)
    // 勘误（0.1.76 gate r1 探针侧）：产品面 case-insensitive 匹配走常量引用
    // MCP_OAUTH_TRUSTED_SERVERS_ENV（单一事实源 import 自 oauthScopeGate），非字面量。
    const stripOk =
      me.includes('function withoutMcpOauthTrustedServersVars') &&
      me.includes("import { MCP_OAUTH_TRUSTED_SERVERS_ENV } from '../services/mcp/oauthScopeGate.js'") &&
      me.includes('key.toUpperCase() !== MCP_OAUTH_TRUSTED_SERVERS_ENV')
    const gate = srcOf(GATE_REL)
    const envConstOk = gate.includes("export const MCP_OAUTH_TRUSTED_SERVERS_ENV = 'ATLAS_MCP_OAUTH_TRUSTED_SERVERS'")
    const ok = stripOk && envConstOk
    push(
      'P-OG3-allowlist-true-env-only',
      ok,
      ok
        ? 'allowlist 真 env 专用面核销：managedEnv withoutMcpOauthTrustedServersVars 全源剥离在场 + 键匹配 case-insensitive（CWE-178 对齐 0.1.74 先例）+ env 名单一事实源常量 = settings 种值到不了计数面'
        : `allowlist 通道面漂移（strip=${stripOk} envConst=${envConstOk}）`,
    )
  }
  // P-OG4：门控 choke point 接线 + 消费入口 + 显示面 3 处
  {
    const cfg = srcOf(CONFIG)
    const auth = srcOf(AUTH)
    const listPanel = srcOf(LIST_PANEL)
    const remoteMenu = srcOf(REMOTE_MENU)
    const settings = srcOf(MCP_SETTINGS)
    const cli = srcOf(MCP_CLI)
    const wiring =
      cfg.includes('import { applyMcpOauthScopeGate } from \'./oauthScopeGate.js\'') &&
      countOf(cfg, 'applyMcpOauthScopeGate') >= 3 &&
      cfg.includes('function addScopeToServers')
    const gatePoint =
      auth.includes('mcpOauthGatedMessage') &&
      auth.includes('throw new Error(mcpOauthGatedMessage(serverName))')
    const display =
      listPanel.includes('oauth gated (untrusted scope)') &&
      remoteMenu.includes('oauth gated (untrusted scope)') &&
      countOf(settings, 'oauthGated') >= 2 &&
      cli.includes('oauthGated')
    const ok = wiring && gatePoint && display
    push(
      'P-OG4-gate-enforcement-points',
      ok,
      ok
        ? '门控 choke point 接线核销：config.ts addScopeToServers 附着面 + getMcpConfigs 插件面兜底（applyMcpOauthScopeGate 调用 ≥3）+ auth.ts performMCPOAuthFlow 函数顶门禁 throw 可行动错误 + 显示面 3 处显形（MCPListPanel/MCPRemoteServerMenu 门控态文案 + MCPSettings oauthGated 数据面 ≥2 + /mcp CLI 门控支）'
        : `门控接线面漂移（wiring=${wiring} gatePoint=${gatePoint} display=${display}）`,
    )
  }
  // P-OG5：0.1.74 四硬化面零回归（soft 恒等锚）
  {
    const auth = srcOf(AUTH)
    const me = srcOf(MANAGED_ENV)
    const types = srcOf(TYPES)
    const getterIdx = auth.indexOf('get clientMetadataUrl()')
    const getter = getterIdx !== -1 ? auth.slice(getterIdx) : ''
    const chainOk =
      getter.indexOf('process.env.MCP_OAUTH_CLIENT_METADATA_URL') > -1 &&
      getter.indexOf('process.env.MCP_OAUTH_CLIENT_METADATA_URL') <
        getter.indexOf('this.serverConfig.oauth?.clientMetadataUrl')
    const hardening =
      auth.includes("new URL(override).protocol === 'https:'") &&
      auth.includes('const describe = (raw: string): string =>') &&
      me.includes("key.toUpperCase() !== 'MCP_OAUTH_CLIENT_METADATA_URL'") &&
      types.includes("startsWith('https://'") &&
      types.includes('clientMetadataUrl must use https://')
    const ok = chainOk && hardening
    push(
      'P-OG5-0174-hardening-identity',
      ok,
      ok
        ? '0.1.74 四硬化面零回归恒等锚：CIMD getter 优先级链（env 部署控制在前）+ env https 验真 + 日志不可逆描述子 + managedEnv CIMD case-insensitive 剥离 + types https-only 锚——0.1.76 门控先于 CIMD 链且不破 0.1.74 面'
        : `0.1.74 硬化面漂移（chain=${chainOk} hardening=${hardening}）`,
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
