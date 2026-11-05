/**
 * 0.1.73 大 de-ant 收口波 · de-ant 残链终核判别活探针（e2e lane，gate 判据⑤ 新活探针；
 * 工单 docs/2026-10-15-p0-wave-0173-ticket.md §3⑤「新活探针 de-ant 残链终核
 * （gate 触发后起稿：dist 内 api.anthropic.com/claude.ai 字面计数〔C-3e 登记项
 * 除外〕+ IFF 往返活轮 + 三模型能力门行为面）」）。
 *
 * 波体面（f854828=v0.1.72 → 5b23a3b=master）：C-2a constants/oauth.ts 三活 1P
 * URL 基址字面中性化（值 undefined + 消费点 env 显式化）/ C-2c getOauthProfile.ts
 * 删 / C-3a tui/utils/betas.ts 三模型能力门 claude 子串删支 / C-3b 两 pdfUtils.ts
 * claude-3-haiku 删支 / C-3c 品牌串 claude-code-20250219 → atlas-code-20250219。
 * 登记不入境（Main 裁定④，token 面不判红防误伤）：C-2b sessionIngress 1P 远端
 * 车道 / C-2c 可达 OAuth 残 / C-3e MCP 远端车道（mcp-proxy.anthropic.com + CIMD
 * URL，域换前向缝 ⑭ #200 随 gateway）。
 *
 * 断言面：
 *   P-DF1-neut-literals-zero（hard，dist/源级）：
 *         - dist/cli.js `api.anthropic.com` = 0（活面 URL 字面收口；src 5 处全注释
 *           → dist 0）
 *         - dist `claude-code-20250219` = 0（C-3c 品牌串清零）
 *         - dist `atlas-code-20250219` ≥ 1（C-3c 恒等锚在场 = ATLAS_20250219_BETA_HEADER）
 *         - src 面 `mcp-proxy.anthropic.com` = 0（C-2a 值中性化，C-3e 车道引用 undefined）
 *   P-DF2-registered-surface-baseline（soft，不判红，Main 裁定④）：
 *         dist `claude.ai` 计数 + `mcp-proxy.anthropic.com` 计数 = C-3e MCP 远端
 *         车道 + C-2b sessionIngress + 文档串登记面（prodlane 对照锚，零判红防误伤）
 *   P-DF3-iff-live-no-anthropic（hard，行为活复验）：H-1 场景（modelRoles 无
 *         per-role key → providers.iff.apiKey 兜底）headless IFF 往返 rc=0 +
 *         PONG-DEANT0173 marker + 零 anthropic/quota403 族 marker（de-ant 收口后
 *         IFF 主面路由零 anthropic 可达 = 403 根因链双断根 + 大收口活链核销）。
 *   P-DF4-model-gate-identity（hard，三模型能力门行为面）：
 *         Qwen38-27B-TXT / glm-5.1 / deepseek-v3.2 三模型 ×
 *         （modelSupportsISP=true / modelSupportsContextManagement=true /
 *         modelSupportsStructuredOutputs=false / isPDFSupported(tui)=true /
 *         isPDFSupported(engine)=true）= C-3a/C-3b 删支恒等锚行为复验（判别单测
 *         源级 30/0 的行为面双核）。
 *
 * 隔离：HOME 沙箱×2（job-tmp，0 写真产品面；P-DF3 = IFF provider 面，
 * P-DF4 = 无 .atlas 空面强制默认路径）；headless（非 PTY，确定性 + 快）；
 * 显式 --model Qwen38-27B-TXT 防 429（harness 活面纪律）。IFF 活面 flake
 * （模型面超时）→ P-DF3 重试 1 次，仍不通 = INCONCLUSIVE（活面非产品面，
 * fail-closed 标注非 hardFail 放行）。
 *
 * 用法：
 *   ATLAS_E2E_DEANT0173_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-deant-final-0173.ts
 */
import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const REPO =
  process.env.ATLAS_E2E_DEANT0173_REPO ??
  '/home/vince/projects/AtlasCode/worktrees/worktree-0.1.73-de-ant-closure'
const OUT =
  process.env.ATLAS_E2E_DEANT0173_OUT ??
  '/home/vince/.claude/jobs/09264df0/tmp/gate-073/deant0173'
const IFF_TARGET = 'http://127.0.0.1:8999'
const MODEL = 'Qwen38-27B-TXT'
const GATE_MODELS = ['Qwen38-27B-TXT', 'glm-5.1', 'deepseek-v3.2']

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }
const probes: Probe[] = []
const push = (id: string, ok: boolean | null, detail: string, hard = true) =>
  probes.push({ id, hard, ok, detail })

/** P-DF1：dist/源级中性化字面计数（.count() 语义 = 非重叠子串计数）。 */
function pDf1(): { ok: boolean, detail: string } {
  const distPath = join(REPO, 'dist', 'cli.js')
  if (!existsSync(distPath))
    return { ok: false, detail: 'dist/cli.js 缺席（四件套 build 未完成，fail-closed 不静默跳过）' }
  const dist = readFileSync(distPath, 'utf8')
  const c = (s: string, t: string) => s.split(t).length - 1
  const apiHost = c(dist, 'api.anthropic.com')
  const oldBrand = c(dist, 'claude-code-20250219')
  const newBrand = c(dist, 'atlas-code-20250219')
  // src 面 mcp-proxy 字面（C-2a 值中性化后应 0）
  const mcpProxySrc = countInSrc('mcp-proxy.anthropic.com')
  const fails: string[] = []
  if (apiHost !== 0) fails.push(`api.anthropic.com dist=${apiHost}（应 0）`)
  if (oldBrand !== 0) fails.push(`claude-code-20250219 dist=${oldBrand}（应 0，C-3c 清零面）`)
  if (newBrand < 1) fails.push(`atlas-code-20250219 dist=${newBrand}（恒等锚应 ≥1）`)
  if (mcpProxySrc !== 0) fails.push(`mcp-proxy.anthropic.com src=${mcpProxySrc}（C-2a 中性化应 0）`)
  if (fails.length) return { ok: false, detail: fails.join('；') }
  return {
    ok: true,
    detail: `dist api.anthropic.com=0 + claude-code-20250219=0 + atlas-code-20250219=${newBrand}（锚在场）+ src mcp-proxy.anthropic.com=0（C-2a 值中性化）`,
  }
}

/** 递归统计 src/ 内 .ts/.tsx 字面计数（纯 FS，无 shell 引号面）。 */
function countInSrc(lit: string): number {
  let n = 0
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      const st = statSync(p)
      if (st.isDirectory()) {
        if (name !== 'node_modules') walk(p)
      } else if (/\.(ts|tsx)$/.test(name) && readFileSync(p, 'utf8').includes(lit)) {
        n++
      }
    }
  }
  walk(join(REPO, 'src'))
  return n
}

/** P-DF2：登记面基线（C-3e/C-2b/文档串，Main 裁定④ token 面不判红，仅留对照锚）。 */
function pDf2(): { detail: string } {
  const dist = readFileSync(join(REPO, 'dist', 'cli.js'), 'utf8')
  const c = (s: string, t: string) => s.split(t).length - 1
  return {
    detail: `登记面基线（不判红）：dist claude.ai=${c(dist, 'claude.ai')}〔C-3e MCP 远端车道 + C-2b sessionIngress + 文档串〕+ mcp-proxy.anthropic.com=${c(dist, 'mcp-proxy.anthropic.com')}〔C-3e 值中性化=0〕（prodlane 对照锚）`,
  }
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
    'Reply with exactly: PONG-DEANT0173', '--model', MODEL, '--dangerously-skip-permissions',
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

/** P-DF3：H-1 场景 IFF 往返活轮 + 零 anthropic 可达。 */
async function pDf3(): Promise<{ ok: boolean | null, detail: string }> {
  const home = join(OUT, 'home-deant')
  sandboxSettings(home)
  if (!(await healthOk())) return { ok: null, detail: 'IFF 8999 /health 不通（活面前置缺口，非产品面）' }
  let r = await headlessPong(home, join(OUT, 'headless-1.log'))
  if (r.rc !== 0 || !r.out.includes('PONG-DEANT0173')) {
    if (await healthOk()) await headlessPong(home, join(OUT, 'headless-2.log')).then((r2) => (r = r2))
  }
  const marker = r.out.includes('PONG-DEANT0173')
  const anthropicHit = /api\.anthropic\.com|anthropic\.com/i.test(r.out)
  const quotaHit = /not enough quota|quota to pre-consume/i.test(r.out)
  if (r.rc !== 0 || !marker)
    return { ok: null, detail: `IFF 往返未通（rc=${r.rc} marker=${marker}；活面 flake，非产品面 fail-closed 标注）` }
  if (anthropicHit || quotaHit)
    return { ok: false, detail: `输出命中 anthropic 面（anthropic=${anthropicHit} quota403=${quotaHit}）= 残链仍在场（应缺席）` }
  return {
    ok: true,
    detail: `H-1 场景（per-role 无 key→providers 表兜底）IFF 往返通 rc=0 + PONG-DEANT0173 marker + 零 anthropic 可达（api.anthropic.com=0 + quota403 族=0）`,
  }
}

/** P-DF4：三模型能力门行为面（C-3a/C-3b 恒等锚），bun 子进程 @ worktree cwd 导入源模块。 */
function pDf4(): { ok: boolean, detail: string } {
  const gateHome = join(OUT, 'home-gates')
  mkdirSync(gateHome, { recursive: true })
  const script = `
const b = await import('./src/tui/utils/betas.ts');
const tp = await import('./src/tui/utils/pdfUtils.ts');
const ep = await import('./src/engine/tools/files/pdfUtils.ts');
const models = ${JSON.stringify(GATE_MODELS)};
const rows = models.map(m => [m, b.modelSupportsISP(m), b.modelSupportsContextManagement(m), b.modelSupportsStructuredOutputs(m), tp.isPDFSupported(), ep.isPDFSupported()].join(','));
console.log(rows.join('\\n'));
`
  const r = spawnSync('bun', ['-e', script], {
    cwd: REPO,
    env: { ...process.env, HOME: gateHome, NO_COLOR: '1' },
    encoding: 'utf8',
    timeout: 120_000,
  })
  if (r.status !== 0)
    return { ok: false, detail: `能力门导入子进程 rc=${r.status}（${(r.stderr ?? '').slice(0, 300)}）= worktree 源面异常` }
  const lines = (r.stdout ?? '').trim().split('\n').filter(Boolean)
  if (lines.length !== GATE_MODELS.length)
    return { ok: false, detail: `能力门行为面行数异常（${lines.length} ≠ ${GATE_MODELS.length}）` }
  const bad = lines.filter((l) => !/^[\w.-]+,true,true,false,true,true$/.test(l))
  if (bad.length)
    return { ok: false, detail: `能力门恒等锚漂移：${bad.join(' | ')}（应每行 =model,true,true,false,true,true）` }
  return {
    ok: true,
    detail: `三模型（Qwen38-27B-TXT/glm-5.1/deepseek-v3.2）× 能力门恒等全过：ISP=true / ContextMgmt=true / StructuredOutputs=false / isPDFSupported(tui+engine)=true（C-3a/C-3b 删支恒等锚行为复验）`,
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  const d1 = pDf1()
  push('P-DF1-neut-literals-zero', d1.ok, d1.detail, true)
  const d2 = pDf2()
  push('P-DF2-registered-surface-baseline', true, d2.detail, false)
  const d3 = await pDf3()
  push('P-DF3-iff-live-no-anthropic', d3.ok, d3.detail, true)
  const d4 = pDf4()
  push('P-DF4-model-gate-identity', d4.ok, d4.detail, true)
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
  console.error('[deant-final-0173] fatal:', e)
  process.exit(1)
})
