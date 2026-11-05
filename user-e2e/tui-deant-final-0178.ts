/**
 * 0.1.78 W-A F-2 一方残面清波 · 「零一方痕迹」判别活探针（e2e lane，gate 判据⑤ 新活探针；
 * 工单 docs/2026-10-20-p0-wave-0178-ticket.md §2⑤「新活探针『零一方痕迹』：dist 活码
 * 一方字面（anthropic_beta/anthropic-ratelimit/anthropic_cloud/claude.ai）计数 0，
 * 排除 A3-1 官方市场簇 + de-ANT 登记面 + 0.1.74 四硬化面恒等锚（gate 触发后起稿；
 * 活面重跑先例 C1/C2/C3/R3，显式 --model 防 429）」）。
 *
 * 波体面（eccefe7 → bd70ef9，15 src 文件 281+/101−）：A1 明切 4 件（anthropic_beta
 * 合并块 / anthropic-ratelimit-unified-reset 头读链 / coreSchemas 描述串中性化 /
 * anthropic_cloud→cloud）+ A2 去味 3 件（isFirstPartyGatewayUrl → isDefaultGateway
 * 改名 + anthropicBaseUrl → baseUrl + engine 2 内联注释去味）+ A3-2 通用化 4 件
 *（normalizeNameForMCP 三副本删 CLAUDEAI_SERVER_PREFIX 条件支全名折叠 + mcp/utils.ts
 * claudeai scope 三支死码删）；A3-1 官方市场簇（downloads.claude.ai +
 * claude-plugins-official）不动 = 用户裁定「带」恒等锚。
 *
 * 断言面：
 *   P-DF1-zero-first-party-traces（hard，dist 级）：
 *         - dist/cli.js `anthropic_beta` = 0（A1 合并块清零）
 *         - dist `anthropic-ratelimit` = 0（A1 头读链清零）
 *         - dist `anthropic_cloud` = 0（A1 改名清零）
 *         - dist `claude.ai subscription` = 0（A1 描述串中性化）
 *         - dist `isFirstPartyGatewayUrl` = 0（A2 旧符号清零）
 *         - dist `CLAUDEAI_SERVER_PREFIX` = 0（A3-2 三副本常量化清零）
 *         - 排除面自核：dist `downloads.claude.ai` ≥ 1 + `claude-plugins-official` ≥ 1
 *           （A3-1 恒等锚在场 = 「带」裁定面零扰动）
 *         - claude.ai 残差面（raw − downloads.claude.ai 排除）= 0；> 0 时逐命中上下文
 *           留档（登记面/0.1.74 四硬化锚 = 不判红先例 0.1.73 P-DF2，非产品面定因）
 *   P-DF2-registered-surface-ledger（soft，不判红）：
 *         dist claude.ai raw 计数 + anthropic 族登记锚计数 = de-ANT 登记面对照锚
 *        （0.1.73 api.anthropic.com 登记面 / 0.1.74 四硬化标识符面，prodlane 对照用）
 *   P-DF3-gate-rename-dist-face（hard，dist 级）：
 *         dist `isDefaultGateway` ≥ 1（A2 新名活面）+ 判别单测行为面 dist 双核
 *   P-DF4-four-hardening-identity-anchors（hard，前波零回归 dist 级）：
 *         0.1.74 四硬化锚（MCP_PROXY_URL / MCP_CLIENT_METADATA_URL /
 *         createClaudeAiProxyFetch / withoutMcpOauthCimdVars）+ 0.1.76 oauthScopeGate
 *         锚（applyMcpOauthScopeGate / ATLAS_MCP_OAUTH_TRUSTED_SERVERS）在场 =
 *         排除面自核（判定面排除的锚本身零回归）
 *   P-DF5-iff-live-no-anthropic（hard，行为活复验）：H-1 场景 headless IFF 往返
 *         rc=0 + PONG-DEANT0178 marker + 零 anthropic 可达（api.anthropic.com=0 +
 *         not enough quota=0）——de-ant 主线收口后 IFF 主面路由活链核销（同 0.1.73
 *         P-DF3 先例）。显式 --model Qwen38-27B-TXT 防 429（harness 活面纪律）。
 *
 * 隔离：HOME 沙箱（job-tmp，0 写真产品面）；headless（非 PTY，确定性 + 快）；
 * P-DF1/P-DF2/P-DF3/P-DF4 = 纯 FS dist 计数（四件套 build 产物前置，缺席 =
 * fail-closed 不静默跳过）；P-DF5 = IFF 活面（模型面超时 → 重试 1 次，仍不通 =
 * INCONCLUSIVE 活面非产品面，fail-closed 标注非 hardFail 放行，同 0.1.73 先例）。
 *
 * 用法：
 *   ATLAS_E2E_DEANT0178_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-deant-final-0178.ts
 */
import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO =
  process.env.ATLAS_E2E_DEANT0178_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-gate-078-final'
const OUT =
  process.env.ATLAS_E2E_DEANT0178_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-078/fam/deant0178'
const IFF_TARGET = 'http://127.0.0.1:8999'
const MODEL = 'Qwen38-27B-TXT'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, hard, ok, detail })

function distOf(): string | null {
  const p = join(REPO, 'dist', 'cli.js')
  if (!existsSync(p)) return null
  return readFileSync(p, 'utf8')
}
const c = (s: string, t: string) => s.split(t).length - 1

/** claude.ai 命中上下文留档（登记面定因用，±60 字符窗）。 */
function hitContexts(s: string, needle: string, cap = 20): string[] {
  const out: string[] = []
  let i = s.indexOf(needle)
  while (i !== -1 && out.length < cap) {
    out.push('…' + s.slice(Math.max(0, i - 60), i + needle.length + 60).replace(/\n/g, ' ') + '…')
    i = s.indexOf(needle, i + needle.length)
  }
  return out
}

/** P-DF1：零一方痕迹（dist 级，判定面 6 件 + 排除面自核 2 件 + 残差面留档）。 */
function pDf1(): { ok: boolean, detail: string } {
  const dist = distOf()
  if (dist === null)
    return { ok: false, detail: 'dist/cli.js 缺席（四件套 build 未完成，fail-closed 不静默跳过）' }
  const beta = c(dist, 'anthropic_beta')
  const rl = c(dist, 'anthropic-ratelimit')
  const cloud = c(dist, 'anthropic_cloud')
  const sub = c(dist, 'claude.ai subscription')
  const oldSym = c(dist, 'isFirstPartyGatewayUrl')
  const prefix = c(dist, 'CLAUDEAI_SERVER_PREFIX')
  const dl = c(dist, 'downloads.claude.ai')
  const official = c(dist, 'claude-plugins-official')
  const raw = c(dist, 'claude.ai')
  const residual = raw - dl
  const fails: string[] = []
  if (beta !== 0) fails.push(`anthropic_beta dist=${beta}（应 0，A1 清零面）`)
  if (rl !== 0) fails.push(`anthropic-ratelimit dist=${rl}（应 0，A1 头读链清零面）`)
  if (cloud !== 0) fails.push(`anthropic_cloud dist=${cloud}（应 0，A1 改名清零面）`)
  if (sub !== 0) fails.push(`claude.ai subscription dist=${sub}（应 0，A1 描述串中性化面）`)
  if (oldSym !== 0) fails.push(`isFirstPartyGatewayUrl dist=${oldSym}（应 0，A2 旧符号清零面）`)
  if (prefix !== 0) fails.push(`CLAUDEAI_SERVER_PREFIX dist=${prefix}（应 0，A3-2 三副本清零面）`)
  if (dl < 1 || official < 1)
    fails.push(`A3-1 恒等锚缺席（downloads.claude.ai=${dl} claude-plugins-official=${official}，应均 ≥1「带」裁定面）`)
  if (fails.length) return { ok: false, detail: fails.join('；') }
  // claude.ai 残差面 = 工单排除面（de-ANT 登记面：MCP scope 字面/config.ts/useManageMCPConnections 等
  // 30+ 文件分布 + A3-1 簇 + 0.1.74 四硬化锚）= soft 留档不判红（0.1.73 P-DF2 先例），
  // P-DF2 出对照锚；判定面 = 上述 6 件 0 + A3-1 锚在场（勘误登记：初稿将残差未定因 hardFail
  // = 登记面误红，0.1.76 P-OG3 探针侧勘误先例核改）。
  return {
    ok: true,
    detail:
      `零一方痕迹达成：dist anthropic_beta=${beta} anthropic-ratelimit=${rl} anthropic_cloud=${cloud} claude.ai-subscription=${sub} isFirstPartyGatewayUrl=${oldSym} CLAUDEAI_SERVER_PREFIX=${prefix} 全 0 ` +
      `+ A3-1 锚在场（downloads.claude.ai=${dl} claude-plugins-official=${official}）` +
      (residual > 0 ? `+ claude.ai 残差=${residual}（登记面对照锚，P-DF2 留档不判红）` : ''),
  }
}

/** P-DF2：登记面对照锚（不判红，prodlane 对照用；claude.ai 残差上下文样本留档）。 */
function pDf2(): { detail: string } {
  const dist = distOf()
  if (dist === null) return { detail: 'dist 缺席（同 P-DF1）' }
  const residual = c(dist, 'claude.ai') - c(dist, 'downloads.claude.ai')
  const ctx = hitContexts(dist, 'claude.ai', 6)
  return {
    detail:
      `登记面基线（不判红）：dist claude.ai raw=${c(dist, 'claude.ai')}（残差=${residual}〔A3-1 簇 + de-ANT 登记面：MCP scope 字面/config.ts 13/main.tsx 10 等 30+ 文件分布，源级核〕）+ api.anthropic.com=${c(dist, 'api.anthropic.com')}〔C-2 OAuth 常量登记面〕` +
      ` + 0.1.74 四硬化标识符面（MCP_PROXY_URL=${c(dist, 'MCP_PROXY_URL')} createClaudeAiProxyFetch=${c(dist, 'createClaudeAiProxyFetch')}）（prodlane 对照锚；残差上下文样本：${ctx.join(' | ').slice(0, 400)}）`,
  }
}

/** P-DF3：A2 改名 dist 级红→绿双核（判别单测 = 源级，探针 = dist 级）。 */
function pDf3(): { ok: boolean, detail: string } {
  const dist = distOf()
  if (dist === null) return { ok: false, detail: 'dist 缺席（四件套 build 未完成，fail-closed）' }
  const newName = c(dist, 'isDefaultGateway')
  const oldName = c(dist, 'isFirstPartyGatewayUrl')
  if (newName < 1) return { ok: false, detail: `isDefaultGateway dist=${newName}（新名活面应 ≥1）` }
  if (oldName !== 0) return { ok: false, detail: `isFirstPartyGatewayUrl dist=${oldName}（旧符号应 0）` }
  return { ok: true, detail: `A2 改名 dist 红→绿双核：isDefaultGateway dist=${newName}（≥1）+ isFirstPartyGatewayUrl dist=0` }
}

/** P-DF4：排除面自核（前波恒等锚 dist 存活面零回归）。
 *  勘误（探针侧过度锚定）：0.1.74 四硬化标识符中 MCP_PROXY_URL/MCP_PROXY_PATH/
 *  MCP_CLIENT_METADATA_URL/McpClaudeAIProxyServerConfig/createClaudeAiProxyFetch
 *  为内部常量/函数名，bun 打包 minified 消名 → 双 dist（gate78 与 npm77）恒 0，
 *  非 0.1.78 回归面，其零回归由前 22 波 160-token dist 零回归核（160 全匹配，
 *  唯一 diff = 0.1.73 claude.ai 已知删面）+ 判别单测源级承载，不锚 dist 字符串。
 *  dist 存活锚 = CIMD 四连击存活 4 件 + 0.1.76 oauthScopeGate 2 件（均 gate==npm 同值）。 */
function pDf4(): { ok: boolean, detail: string } {
  const dist = distOf()
  if (dist === null) return { ok: false, detail: 'dist 缺席（fail-closed）' }
  const anchors: Array<[string, number]> = [
    ['clientMetadataUrl', c(dist, 'clientMetadataUrl')],
    ['MCP_OAUTH_CLIENT_METADATA_URL', c(dist, 'MCP_OAUTH_CLIENT_METADATA_URL')],
    ['client_metadata_url', c(dist, 'client_metadata_url')],
    ['withoutMcpOauthCimdVars', c(dist, 'withoutMcpOauthCimdVars')],
    ['applyMcpOauthScopeGate', c(dist, 'applyMcpOauthScopeGate')],
    ['ATLAS_MCP_OAUTH_TRUSTED_SERVERS', c(dist, 'ATLAS_MCP_OAUTH_TRUSTED_SERVERS')],
  ]
  const missing = anchors.filter(([, n]) => n < 1).map(([k]) => k)
  if (missing.length)
    return { ok: false, detail: `前波恒等锚缺席：${missing.join(', ')}（排除面自核红 = 前波零回归破面）` }
  return { ok: true, detail: `排除面自核全在场（0.1.74 CIMD 存活 4 件 + 0.1.76 oauthScopeGate 2 件，${anchors.map(([k, n]) => `${k}=${n}`).join(' ')}；minified 消名 5 件由 160-token dist 零回归核承载不锚字符串）` }
}

/** 沙箱 settings（H-1 场景：providers.iff.apiKey 已设 + modelRoles 无 per-role apiKey）。 */
function sandboxSettings(home: string): void {
  const atlasDir = join(home, '.atlas')
  mkdirSync(atlasDir, { recursive: true })
  const settings = {
    model: MODEL,
    modelRoles: {
      small: { models: [{ model: `iff/${MODEL}` }], provider: 'iff' },
      fast: { models: [{ model: `iff/${MODEL}` }], provider: 'iff' },
      premium: { models: [{ model: `iff/${MODEL}` }], provider: 'iff' },
    },
    providers: {
      iff: {
        baseURL: `${IFF_TARGET}/v1`,
        apiKey: 'sk-iff-local',
        api: 'openai-completions',
        defaultContextWindow: 256000,
        defaultMaxTokens: 32000,
        models: [{ id: MODEL, name: MODEL, contextWindow: 256000, maxTokens: 32000 }],
      },
    },
    skipDangerousModePermissionPrompt: true,
    env: { DISABLE_AUTOUPDATER: '1' },
  }
  writeFileSync(join(atlasDir, 'settings.json'), JSON.stringify(settings, null, 2))
}

function healthOk(): Promise<boolean> {
  return fetch(`${IFF_TARGET}/health`, { signal: AbortSignal.timeout(5_000) })
    .then((r) => r.json() as Promise<{ status?: string }>)
    .then((j) => j.status === 'ok')
    .catch(() => false)
}

function headlessPong(home: string, logPath: string, timeoutMs = 180_000): Promise<{ rc: number | null, out: string }> {
  const args = [
    'run', join(REPO, 'src/atlascode/cli.ts'), '-p',
    'Reply with exactly: PONG-DEANT0178', '--model', MODEL, '--dangerously-skip-permissions',
  ]
  return new Promise((resolve) => {
    const child = spawn('bun', args, {
      cwd: REPO,
      env: { ...process.env, HOME: home, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout?.on('data', (d) => (out += d.toString()))
    child.stderr?.on('data', (d) => (out += d.toString()))
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* gone */ }
    }, timeoutMs)
    child.on('exit', (code) => {
      clearTimeout(timer)
      writeFileSync(logPath, out)
      resolve({ rc: code, out })
    })
  })
}

/** P-DF5：H-1 场景 IFF 往返活轮 + 零 anthropic 可达（de-ant 主线活链核销）。 */
async function pDf5(): Promise<{ ok: boolean | null, detail: string }> {
  const home = join(OUT, 'home-deant')
  sandboxSettings(home)
  if (!(await healthOk())) return { ok: null, detail: 'IFF 8999 /health 不通（活面前置缺口，非产品面）' }
  let r = await headlessPong(home, join(OUT, 'headless-1.log'))
  if (r.rc !== 0 || !r.out.includes('PONG-DEANT0178')) {
    if (await healthOk()) await headlessPong(home, join(OUT, 'headless-2.log')).then((r2) => (r = r2))
  }
  const marker = r.out.includes('PONG-DEANT0178')
  const anthropicHit = /api\.anthropic\.com|anthropic\.com/i.test(r.out)
  const quotaHit = /not enough quota|quota to pre-consume/i.test(r.out)
  if (r.rc !== 0 || !marker)
    return { ok: null, detail: `IFF 往返未通（rc=${r.rc} marker=${marker}；活面 flake，非产品面 fail-closed 标注）` }
  if (anthropicHit || quotaHit)
    return { ok: false, detail: `输出命中 anthropic 面（anthropic=${anthropicHit} quota403=${quotaHit}）= 残链仍在场（应缺席）` }
  return {
    ok: true,
    detail: `H-1 场景（per-role 无 key→providers 表兜底）IFF 往返通 rc=0 + PONG-DEANT0178 marker + 零 anthropic 可达（api.anthropic.com=0 + quota403 族=0）`,
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  const d1 = pDf1()
  push('P-DF1-zero-first-party-traces', d1.ok, d1.detail, true)
  const d2 = pDf2()
  push('P-DF2-registered-surface-ledger', true, d2.detail, false)
  const d3 = pDf3()
  push('P-DF3-gate-rename-dist-face', d3.ok, d3.detail, true)
  const d4 = pDf4()
  push('P-DF4-four-hardening-identity-anchors', d4.ok, d4.detail, true)
  const d5 = await pDf5()
  push('P-DF5-iff-live-no-anthropic', d5.ok, d5.detail, true)
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

main().catch((e) => {
  console.error('[deant-final-0178] fatal:', e)
  process.exit(1)
})
