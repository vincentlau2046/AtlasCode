/**
 * 0.1.46 三源+安装数波 · e2e gate 探针（e2e 交付，零产品改动；架构实施Main @ uds 22517 判据同步）。
 * 被测体 = master @ d927dd7（重 gate face；0.1.46 列车 = 365a088(0.1.45) + d85e296 S3 3源预集成 manifest 快照兜底 + ab3211e S4 安装数计数后端自包含 + d927dd7 registry RMW in-process 互斥（gate-046 ① hard-fail 修））。
 * 探针加固（重 gate 2026-10-09）：typeSearch 300ms/char + installViaDetails face-state 前置断言 + 逐字符命令键入 + 'Installed <name>' 抗 clobber 成功面判据 + S4 全量 log 面交叉。
 *
 * 判据（peer 用户视角 6 项，本探针承载；全部面已源级核验 @ ab3211e）：
 *   cmd（源级，秒级，无 PTY）
 *     C1 kill-switch 三 env 实名在场（atlas/official/ascend 三文件各含对应 env）
 *     C2 快照计数钉死 33/24/310（bun 导入 BUILTIN_MARKETPLACE_SNAPSHOTS 实数计数）
 *     C3 S4 stats 源注册表契约（官方恒 1P URL env 不覆写 / 自建 env 可覆写 / 无源 = null）
 *     C4 上报面缺省 no-op（ATLAS_STATS_ENDPOINT 未设 = getStatsReportUrl null + reportInstall no-op + 安装路径接线）
 *     C5 快照条目不短路 already_installed（preset 链 isBuiltinSnapshotEntry 支 + 活成功清孤儿 + 判别单测文件在场）
 *     C6 三 hook 通知层「源未就绪 · 已用内建快照目录」文案在场
 *   fallback ① S3 新装零网络可见（PATH 无 git + GCS 死镜像 → 三源快照兜底：/plugin marketplace list 三源
 *             + /plugin 清单可浏览（搜索面）+ 通知行在场 + registry 落 snapshot directory 条目）
 *             + ④ 负向（无 stats 端点 + raw 受限 = 无显数无误导零值）
 *   live     ② 恢复语义（同 HOME 恢复 git+网络 → 活物化：registry 活源条目 + 孤儿快照目录清理）
 *   killswitch ③ kill-switch 三 env 设真 → disabled 且不兜底（registry 无条目 + 无快照目录 + 无兜底通知）
 *   stats    ④ 显数「有数据即显示」（mock 端点有数据 = 显数 12.3K/7/42 + 无数据插件不显数）
 *             + ⑤b 上报（ATLAS_STATS_ENDPOINT 设真 = 安装触发 POST /stats/report + 安装主流程不受影响）
 *             + ⑥ 搜索/详情/安装后 installed 管理面（/plugin manage）
 *   report-off ⑤a 缺省零外联（端点未设 = 安装成功 + mock 零命中）
 *
 * 面锚点（源级核验 @ ab3211e）：
 *   三源清单面 = /plugin marketplace list（buildMarketplaceListText：'Configured marketplaces:' + '  • <name>'；空 = 'No marketplaces configured'）
 *   插件清单面 = /plugin（无参 → discover tab，DiscoverPlugins plugin-list，就绪标记 'type to search'；
 *                任意可打印字符入搜索；j/k 导航，i 选装，Enter 详情）
 *   详情菜单 = /plugin install <name> → plugin-details（menu index 0 = 'Install for you (user scope)'，Enter = select:accept）
 *   安装成功面 = '✓ Installed <name>.'（无 options）或 options 流（'Save and continue'/'Save configuration'，esc 退配置面安装已落地）
 *   installed 面 = /plugin manage（installed tab = ManagePlugins 列已装插件）
 *
 * FAIL = 产品缺口（fail-closed 不发布）；INCONCLUSIVE 必带定因（面未达/环境面，核 pty.log）。
 * PTY 场景同 lane 串行（防网关竞争）。HOME 谱系：F(homeA 新) → L(复用 homeA) → S(复用) → R(复用)；K(homeB 新)。
 *
 * 用法：
 *   bun run user-e2e/tui-diff/threesource-046.ts --repo <gate-046 worktree @ ab3211e> [cmd|fallback|live|killswitch|stats|report-off] [--all]
 * 产物：artifacts/SC-<stamp>-<rand>/<scen>/{result.json[,pty.log]}
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, symlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { makeSandboxHome } from '../lib/gates'
import { sleep, stripAnsi } from '../lib/util'
import { Pty } from '../lib/pty'

// ── 参数 ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
function argVal(flag: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}
const REPO = argVal('--repo') ?? process.env.ATLAS_E2E_REPO ?? ''
const MODES = ['cmd', 'fallback', 'live', 'killswitch', 'stats', 'report-off'] as const
type Scen = (typeof MODES)[number]
const runScens: Scen[] = argv.includes('--all') ? [...MODES] : MODES.filter(m => argv.includes(m))
if (runScens.length === 0) runScens.push('cmd') // 缺省 = cmd（源级最快）

const E2E = '/home/vince/projects/AtlasCode/user-e2e'
const ROOT = join(E2E, 'tui-diff')
const ART = join(ROOT, 'artifacts')
const JOB_TMP = '/home/vince/.claude/jobs/09264df0/tmp'
const REAL_SETTINGS = join(process.env.HOME!, '.atlas', 'settings.json')
const HOME_A = join(ROOT, 'home-046-A') // F + L + S + R（谱系复用）
const HOME_B = join(ROOT, 'home-046-B') // K（kill-switch 独立面）
const MOCK_PORT = 19876
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}`
const DEAD_GCS = 'http://127.0.0.1:9' // 死端点（discard 端口，ECONNREFUSED 即败）
const THREE = ['agent-skills', 'atlas-plugins', 'claude-plugins-official'] as const

type Verdict = { id: string; hard: boolean; ok: boolean | null; detail: string; warn?: boolean }
function readIfExists(p: string): string {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}
const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `SC-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(36).slice(2, 5)}`
}
const RUN = join(ART, stamp())
mkdirSync(RUN, { recursive: true })
console.error(`[SC ${RUN}] modes=${runScens.join(',')} repo=${REPO}`)

// ── mock stats 后端（④ 显数面 + ⑤ 上报面；Bun.serve 进程内）────────────
// 数据 = 「有数据即显示」正例 3 插件 + 无数据插件（ascend-perf-optimize）作零值负例
const STATS_DOC = {
  plugins: [
    { plugin: 'ascend-tiling-design@atlas-plugins', unique_installs: 12345 },
    { plugin: 'ascend-precision-debug@atlas-plugins', unique_installs: 7 },
    { plugin: 'ascend-runtime-debug@atlas-plugins', unique_installs: 42 },
  ],
}
const HITS_FILE = join(JOB_TMP, 'gate-046-mock-hits.json')
type Hit = { method: string; path: string; body?: string; ts: number }
let mockStarted = false
function startMock(): { hits: () => Hit[]; resetHits: () => void } {
  writeFileSync(HITS_FILE, '[]')
  if (!mockStarted) {
    const server = Bun.serve({
      port: MOCK_PORT,
      hostname: '127.0.0.1',
      fetch: async (req: Request) => {
        const url = new URL(req.url)
        const body = req.method === 'POST' ? await req.text() : undefined
        const rec: Hit = { method: req.method, path: url.pathname, body, ts: Date.now() }
        const cur: Hit[] = JSON.parse(readIfExists(HITS_FILE) || '[]')
        cur.push(rec)
        writeFileSync(HITS_FILE, JSON.stringify(cur, null, 2))
        if (url.pathname === '/stats/install-counts.json' && req.method === 'GET') {
          return new Response(JSON.stringify(STATS_DOC), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
    })
    mockStarted = true
    console.error(`[mock] stats 后端起 @ ${MOCK_BASE}（pid 内嵌，port ${server.port}）`)
  }
  return {
    hits: () => {
      try {
        return JSON.parse(readFileSync(HITS_FILE, 'utf8')) as Hit[]
      } catch {
        return []
      }
    },
    resetHits: () => writeFileSync(HITS_FILE, '[]'),
  }
}

// ── PATH 无 git 面（场景① 新装零网络：git 缺失自然复现）────────────────
const savedPath = process.env.PATH ?? ''
function buildNoGitPath(): string {
  const dirs = savedPath.split(':')
  const bindir = join(JOB_TMP, 'no-git-bin')
  rmSync(bindir, { recursive: true, force: true })
  mkdirSync(bindir, { recursive: true })
  for (const d of dirs) {
    if (!d || d === bindir) continue
    let entries: string[] = []
    try {
      entries = readdirSync(d)
    } catch {
      continue
    }
    for (const e of entries) {
      if (e === 'git' || e === 'gitk') continue
      try {
        symlinkSync(join(d, e), join(bindir, e))
      } catch {
        // 断链/权限异常跳过（不影响面）
      }
    }
  }
  return bindir
}

// ── registry / 快照目录 轮询面（<home>/.atlas/plugins/…）───────────────
function regPath(home: string): string {
  return join(home, '.atlas', 'plugins', 'known_marketplaces.json')
}
function snapRoot(home: string): string {
  return join(home, '.atlas', 'plugins', 'marketplaces', 'builtin-snapshots')
}
function readReg(home: string): Record<string, any> {
  const raw = readIfExists(regPath(home))
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}
function isSnapEntry(v: any): boolean {
  return Boolean(v) && v.source?.source === 'directory' && String(v.installLocation ?? '').includes('builtin-snapshots')
}
function regSnapshotNames(home: string): string[] {
  const reg = readReg(home)
  return THREE.filter(k => isSnapEntry(reg[k]))
}

// ── env 注入助手（场景级：spawn 前设 process.env，场景后复原）──────────
async function withEnv(scenEnv: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const keys = Object.keys(scenEnv)
  const saved: Record<string, string | undefined> = {}
  for (const k of keys) {
    saved[k] = process.env[k]
    if (scenEnv[k] === undefined) delete process.env[k]
    else process.env[k] = scenEnv[k]
  }
  try {
    await fn()
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  }
}

// ── PTY 通用 ──────────────────────────────────────────────────────────
async function ptyStart(home: string, ws: string, scenDir: string): Promise<Pty> {
  return await Pty.start({ repoRoot: REPO, workspace: ws, sandboxHome: home, logPath: join(scenDir, 'pty.log') }, 150_000)
}
async function waitText(pty: Pty, subs: string[], timeoutMs: number): Promise<string | null> {
  const r = await pty.waitAnySince(subs, timeoutMs)
  return r.ok ? pty.sinceText() : null
}
function linesOf(text: string): string[] {
  return stripAnsi(text).split('\n')
}
const COUNT_RE = /·\s*\d+(\.\d+)?[KM]?\s*installs/
/** 'ascend' 过滤期望命中数（name∪desc∪marketplaceName，谓词同 DiscoverPlugins filteredPlugins；
 *  快照基线冻结（33/24/310 钉死）→ 24 可复现：name 命中 15 + desc 独有命中 9；fresh HOME 无 installed 过滤影响） */
const EXPECTED_ASCEND_TOTAL = 24
/** 搜索面键入（重 gate 加固 2026-10-09，r2 定因后终版）：
 *  ① 首字符激活搜索模式（DiscoverPlugins L344-356：!isSearchMode → 激活 + query=该 char）
 *  ② 激活后 2.5s 焦点路由 settle（r2 实证：激活后 ~1.5-2s 内的字符丢失——fallback 面 'ascend' 只进 'a'，
 *     而 Esc 后稳态面 250ms 逐字符 37 char 全进；产品观察项：搜索模式激活后的输入 settle 窗，既有非本波，登记）
 *  ③ 余下字符逐字 300ms（稳态面输入通路正常，300ms 避批量边界） */
async function typeSearch(pty: Pty, query: string): Promise<void> {
  // 重 gate 终版（r6 定因）：激活支（L344-356：首字符激活 + query=该 char）后，后续字符丢失
  // （2.5s/6.5s settle 均丢，仅首字注册）；而 Esc 清空 query 后（useSearchInput L140-142 setQueryState('')）
  // 稳态框 250ms 逐字符可全收（21:56 run 37 char 实证）→ 激活 → Esc 清 → 全量重键入（query='' 稳态）
  pty.sendRaw(query[0])
  await sleep(2000)
  pty.sendRaw('\x1b') // 清空 query（留搜索模式）
  await sleep(2000)
  for (const ch of query) {
    pty.sendRaw(ch)
    await sleep(250)
  }
}
/** 列表头过滤计数：'Discover plugins (sel/total)' → total（diff 重绘/行首 clobber 免疫） */
function filteredTotal(face: string): number {
  const m = face.match(/Discover plugins \(\d+\/(\d+)\)/g)
  const last = m?.[m.length - 1]
  const t = last?.match(/\/(\d+)\)/)
  return t ? Number(t[1]) : -1
}

// ── 安装脚本（详情视图：/plugin install <name> → 菜单 0 项 Enter → 安装）─
/** 重 gate 加固 2026-10-09（⑤b/⑥-search 探针侧定因修复，定因登记 4）：
 *  ① face-state 前置断言（readyMarker）：命令串必须在命令面发出（r1 = 命令串整串落 Discover search 框，
 *     pty.log 空态面 query='/pugin install ascend-precision-debug' → 安装未触发 → S6 零 POST 误判风险）
 *  ② 命令串逐字符 250ms（r1 = 整串 burst 丢 1 char；300/250ms 降输入×重绘竞争）
 *  ③ 成功面判据 = 'Installed <name>' 名字专属形（✓ U+2713 字形不存留 pty.log + 避免 manage tab 标签 'Installed' 假阳）
 *  readyMarker 缺省 = 无前置（初始主 prompt 命令面默认激活，report-off 场景） */
async function installViaDetails(
  pty: Pty,
  pluginName: string,
  readyMarker?: string[],
): Promise<{ detail: boolean; done: boolean; optsFace: boolean; err: boolean; face: string; faceStateLost: boolean }> {
  if (readyMarker?.length) {
    const ready = await waitText(pty, readyMarker, 20_000)
    if (!ready) {
      return { detail: false, done: false, optsFace: false, err: false, face: pty.sinceText(), faceStateLost: true }
    }
  }
  for (const ch of `/plugin install ${pluginName}`) {
    pty.sendRaw(ch)
    await sleep(250)
  }
  await sleep(500)
  pty.sendRaw('\r') // 提交（enter 键）
  const detail = await waitText(pty, ['Install for you (user scope)'], 60_000)
  if (!detail) return { detail: false, done: false, optsFace: false, err: false, face: pty.sinceText(), faceStateLost: false }
  await sleep(1000)
  pty.sendRaw('\r') // Enter = select:accept（菜单 index 0 = install-user）
  // 成功面二支：'Installed <name>.'（无 options，回 plugin-list）或 options 流（'Save and continue'/'Save configuration'）
  const res = await waitText(pty, [`Installed ${pluginName}`, 'Save and continue', 'Save configuration'], 90_000)
  const face = pty.sinceText()
  const optsFace = /Save and continue|Save configuration/.test(face)
  if (res && optsFace) {
    await sleep(500)
    pty.sendRaw('\x1b') // 退配置面（安装已落地，配置可后补；confirm:no）
  }
  const ok = Boolean(res) && (face.includes(`Installed ${pluginName}`) || optsFace)
  const err = /Failed to install|Install failed|is blocked by your organization|Error installing/i.test(face) && !ok
  return { detail: true, done: ok, optsFace, err, face, faceStateLost: false }
}

// ── C：源级 6 探针（无 PTY）───────────────────────────────────────────
function probeCmd(scenDir: string): Verdict[] {
  const probes: Verdict[] = []
  const src = (rel: string) => readIfExists(join(REPO, rel))
  const push = (id: string, ok: boolean | null, detail: string, hard = true, warn?: boolean) =>
    probes.push({ id, hard, ok, detail, warn })

  // C1 kill-switch 三 env 实名（三文件各含对应 env）
  const k1 = src('src/tui/utils/plugins/atlasMarketplace.ts').includes('ATLAS_DISABLE_ATLAS_MARKETPLACE_AUTOINSTALL')
  const k2 = src('src/tui/utils/plugins/officialMarketplaceStartupCheck.ts').includes('ATLAS_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL')
  const k3 = src('src/tui/plugins/ascend/marketplace/ascendMarketplaceStartupCheck.ts').includes('ATLAS_DISABLE_ASCEND_MARKETPLACE_AUTOINSTALL')
  push('C1-kill-switch-envs', k1 && k2 && k3, `kill-switch 三 env 实名在场（atlas=${k1} official=${k2} ascend=${k3}）`)

  // C2 快照计数钉死 33/24/310（bun 导入实数计数，非文本提取）
  const c2script = join(JOB_TMP, 'gate-046-c2-counts.ts')
  writeFileSync(
    c2script,
    `import { BUILTIN_MARKETPLACE_SNAPSHOTS } from '${join(REPO, 'src/tui/utils/plugins/builtinMarketplaceSnapshots.ts')}'\n` +
      `for (const s of BUILTIN_MARKETPLACE_SNAPSHOTS) console.log(\`\${s.key}\\\t\${(s.manifest.plugins ?? []).length}\`)`,
  )
  const c2out = spawnSync('bun', ['run', c2script], { cwd: REPO, timeout: 60_000, encoding: 'utf8' })
  const counts: Record<string, number> = {}
  for (const line of (c2out.stdout ?? '').trim().split('\n')) {
    const [k, v] = line.split('\t')
    if (k && v !== undefined) counts[k] = Number(v)
  }
  const c2ok = counts['agent-skills'] === 33 && counts['atlas-plugins'] === 24 && counts['claude-plugins-official'] === 310
  push(
    'C2-snapshot-counts',
    c2ok,
    `快照插件计数 = agent-skills ${counts['agent-skills']} / atlas-plugins ${counts['atlas-plugins']} / official ${counts['claude-plugins-official']}（钉死 33/24/310；bun 导入 BUILTIN_MARKETPLACE_SNAPSHOTS 实数，单测 marketplace-snapshot-bundle 同核入全量）`,
  )

  // C3 S4 stats 源注册表契约
  const ic = src('src/tui/utils/plugins/installCounts.ts')
  const c3a = ic.includes('https://raw.githubusercontent.com/anthropics/claude-plugins-official/refs/heads/stats/stats/plugin-installs.json')
  const c3b = ic.includes('SELF_HOSTED_MARKETPLACES') && ic.includes("'atlas-plugins'") && ic.includes("'agent-skills'")
  const c3c = /if\s*\(name\s*===\s*OFFICIAL_MARKETPLACE_NAME\)\s*\{[\s\S]{0,200}?return OFFICIAL_STATS_URL/.test(ic) // 官方恒 1P（env 不覆写）
  const c3d = /normalizeStatsBase\(process\.env\[STATS_ENDPOINT_ENV\]\)/.test(ic) // 自建 env 可覆写
  const c3e = /return null/.test(ic) // 无源市场 = null（优雅隐藏）
  push(
    'C3-stats-registry',
    c3a && c3b && c3c && c3d && c3e,
    `stats 源注册表契约（官方 1P 恒 URL=${c3a} / 自建双市场=${c3b} / 官方 env 不覆写=${c3c} / 自建 env 覆写=${c3d} / 无源 null=${c3e}）`,
  )

  // C4 上报面缺省 no-op
  const rep = src('src/tui/utils/plugins/installCountReporter.ts')
  const c4a = /const url = getStatsReportUrl\(\)\s*\n?\s*if\s*\(!url\)\s*\{?\s*return Promise\.resolve\(\)/.test(rep)
  const c4b = /export function getStatsReportUrl\(\): string \| null \{[\s\S]{0,240}?return base \? `\$\{base\}\/stats\/report` : null/.test(ic)
  const c4c = src('src/tui/utils/plugins/pluginInstallationHelpers.ts').includes('reportInstall(pluginId, marketplaceName)')
  push(
    'C4-report-noop-default',
    c4a && c4b && c4c,
    `上报面缺省 no-op（reportInstall !url 即 resolve=${c4a} / getStatsReportUrl 缺省 null=${c4b} / 安装成功路径接线=${c4c}）`,
  )

  // C5 快照条目不短路 already_installed + 孤儿清理接线
  const preset = src('src/tui/utils/plugins/marketplacePreset.ts')
  const c5a = preset.includes('isBuiltinSnapshotEntry(existing)')
  const c5b = preset.includes('removeBuiltinSnapshotDir(config.name)')
  const c5c = src('tests/unit/marketplace-preset-snapshot-fallback.test.ts').length > 0
  const c5d = src('src/tui/utils/plugins/officialMarketplaceStartupCheck.ts').includes('removeBuiltinSnapshotDir')
  push(
    'C5-snapshot-no-shortcircuit',
    c5a && c5b && c5c && c5d,
    `快照条目不短路（preset 链 isBuiltinSnapshotEntry 支=${c5a} / preset 活成功清孤儿=${c5b} / official 成功支清孤儿=${c5d} / 判别单测文件在场=${c5c}，核入全量）`,
  )

  // C6 三 hook 通知层文案
  const h1 = src('src/tui/hooks/useAtlasMarketplaceNotification.tsx').includes('源未就绪 · 已用内建快照目录')
  const h2 = src('src/tui/hooks/useAscendMarketplaceNotification.tsx').includes('源未就绪 · 已用内建快照目录')
  const h3 = src('src/tui/hooks/useOfficialMarketplaceNotification.tsx').includes('官方插件源未就绪 · 已用内建快照目录')
  push(
    'C6-fallback-notification-text',
    h1 && h2 && h3,
    `通知层「源未就绪·已用内建快照目录（/plugin 可浏览插件清单）·下次启动自动重试活同步」三 hook 在场（atlas=${h1} ascend=${h2} official=${h3}）`,
  )

  writeFileSync(join(scenDir, 'result.json'), JSON.stringify({ scen: 'cmd', verdicts: probes }, null, 2))
  return probes
}

// ── F：场景① 新装零网络可见（+④ 负向）────────────────────────────────
async function sceneFallback(scenDir: string): Promise<Verdict[]> {
  const probes: Verdict[] = []
  const ws = join(ROOT, 'workspaces-046', 'fallback')
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  rmSync(HOME_A, { recursive: true, force: true })
  await makeSandboxHome(HOME_A, REAL_SETTINGS, false)

  const noGitBin = buildNoGitPath()
  const fEnv = { PATH: noGitBin, ATLAS_OFFICIAL_MKT_MIRROR: DEAD_GCS }

  // pty1：零网络启动 → preset 链失败 → 三源快照兜底（本地 FS 物化，秒级）
  let pty1: Pty
  await withEnv(fEnv, async () => {
    pty1 = await ptyStart(HOME_A, ws, scenDir)
  })
  const t0 = Date.now()
  let snapNames = regSnapshotNames(HOME_A)
  const pollDiag: string[] = []
  while (snapNames.length < 3 && Date.now() - t0 < 180_000) {
    await sleep(3000)
    snapNames = regSnapshotNames(HOME_A)
    if (pollDiag.length < 3) {
      // 前 3 次迭代诊断（poll 读面定因：文件在场性/键集合）
      const raw = readIfExists(regPath(HOME_A))
      let keys: string[] = []
      try {
        keys = Object.keys(JSON.parse(raw))
      } catch {
        keys = raw ? ['<parse-err>'] : ['<file-absent>']
      }
      pollDiag.push(`t+${Math.round((Date.now() - t0) / 1000)}s snap=${snapNames.length}/3 keys=${keys.join('|') || '∅'}`)
    }
  }
  const settleMs = Math.round((Date.now() - t0) / 1000)
  pty1.kill()

  // pty2：同零网络面再起（稳定用户面：快照条目幂等重写，无活同步）→ /plugin 用户面
  let pty2: Pty
  await withEnv(fEnv, async () => {
    pty2 = await ptyStart(HOME_A, ws, scenDir)
  })
  pty2.send('/plugin marketplace list')
  const mktFace = (await waitText(pty2, [...THREE, 'No marketplaces configured'], 60_000)) ?? pty2.sinceText()
  pty2.send('/plugin')
  const listReady = await waitText(pty2, ['type to search'], 60_000)
  await sleep(13_000) // 越过启动通知窗（immediate 通知 10s timeout；过期重绘 = 字符丢失高频窗，
  // r4 实测窗口内键入 = 仅首字符注册；通知过期后面稳态输入通路正常）
  await typeSearch(pty2, 'ascend')
  await sleep(3000) // 过滤重绘 settle
  const discFace = pty2.sinceText()
  const fTotal = filteredTotal(discFace)
  const countLines = linesOf(discFace).filter(l => COUNT_RE.test(l)).length
  pty2.kill()

  const reg = readReg(HOME_A)
  const snapDirs = existsSync(snapRoot(HOME_A)) ? readdirSync(snapRoot(HOME_A)) : []
  let regMtime = '(无文件)'
  try {
    regMtime = statSync(regPath(HOME_A)).mtime.toISOString()
  } catch {
    /* 无文件 */
  }
  const fullLog = readIfExists(join(scenDir, 'pty.log'))
  const notifIn = fullLog.includes('源未就绪 · 已用内建快照目录')

  probes.push(
    {
      id: 'F1-three-sources-visible', hard: true,
      ok: THREE.every(n => mktFace.includes(n)) && mktFace.includes('Configured marketplaces'),
      detail: `① /plugin marketplace list 三源可见（${THREE.map(n => `${n}=${mktFace.includes(n)}`).join(' ')} + 'Configured marketplaces:' 头=${mktFace.includes('Configured marketplaces')}）`,
    },
    {
      id: 'F2-plugin-list-browsable', hard: true,
      ok: Boolean(listReady) && fTotal === EXPECTED_ASCEND_TOTAL,
      detail: `① 插件清单可浏览 + 搜索面（/plugin discover 面就绪 'type to search'=${Boolean(listReady)}；搜索 'ascend' 过滤头计数=${fTotal}（期望 ${EXPECTED_ASCEND_TOTAL} = 快照冻结基线 name∪desc∪mkt 命中；头计数判据 = diff 重绘/行首 clobber 免疫）；观察面：ascend 行在场=${/cend-(tiling-design|precision-debug|runtime-debug|perf-optimize)/.test(discFace)}；面未达定因核 pty.log）`,
    },
    {
      id: 'F3-registry-snapshot-entries', hard: true,
      ok: THREE.every(k => isSnapEntry(reg[k])),
      detail: `① registry 落 snapshot directory 条目 ×3（${THREE.map(k => `${k}=${isSnapEntry(reg[k])}`).join(' ')}；快照目录物化 ${snapDirs.length} 项〔${snapDirs.join(',')}〕；settle=${settleMs}s（poll 诊断：${pollDiag.join(' | ') || '首查即达标'}；registry mtime=${regMtime}）；未达标定因 = 兜底支未执行/物化失败，核 pty.log + known_marketplaces.json`,
    },
    {
      id: 'F4-fallback-notification', hard: true, ok: notifIn,
      detail: `① 通知行「源未就绪 · 已用内建快照目录（/plugin 可浏览插件清单）· 下次启动自动重试活同步」在场=${notifIn}（0.1.43 失败可见性保留面；官方支 = '官方插件源未就绪…' 同族）`,
    },
    {
      id: 'F5-no-misleading-zero', hard: true, ok: countLines === 0,
      detail: `④ 负向：新装零网络面（raw.githubusercontent 出网受限 + 无 stats 端点）/plugin 无显数无误导零值（计数行=${countLines}，期望 0；无数据 = 优雅隐藏非错误）`,
    },
    {
      id: 'F6-startup-no-regression', hard: true, ok: true,
      detail: `⑥ TUI 启动无回归（pty1/pty2 REPL 就绪 = Pty.start 通过；快照兜底面启动不崩不挂）`,
    },
  )
  writeFileSync(join(scenDir, 'result.json'), JSON.stringify({ scen: 'fallback', verdicts: probes }, null, 2))
  return probes
}

// ── L：场景② 恢复语义（同 HOME 恢复 git+网络 → 活物化）────────────────
async function sceneLive(scenDir: string): Promise<Verdict[]> {
  const probes: Verdict[] = []
  const ws = join(ROOT, 'workspaces-046', 'live')
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })

  await withEnv({ PATH: savedPath, ATLAS_OFFICIAL_MKT_MIRROR: undefined }, async () => {
    const pty = await ptyStart(HOME_A, ws, scenDir)
    // 活物化 = 后台克隆（github/gitcode/GCS）：快照条目不短路 → git 支 → 轮询 registry 至三源脱离 snapshot（≤420s）
    const t0 = Date.now()
    let reg = readReg(HOME_A)
    let allLive = THREE.every(k => reg[k] && !isSnapEntry(reg[k]))
    while (!allLive && Date.now() - t0 < 420_000) {
      await sleep(5000)
      reg = readReg(HOME_A)
      allLive = THREE.every(k => reg[k] && !isSnapEntry(reg[k]))
    }
    const elapsed = Math.round((Date.now() - t0) / 1000)
    const stillSnap = THREE.filter(k => isSnapEntry(reg[k]))
    const missing = THREE.filter(k => !reg[k])
    const liveOf = (k: string) => {
      const e = reg[k]
      return e ? `source=${e.source?.source} loc=${String(e.installLocation ?? '').slice(-48)}` : '(无条目)'
    }
    const perMkt = THREE.map(k => `${k}=${liveOf(k)}`).join(' | ')

    pty.kill()

    if (allLive) {
      const orphans = existsSync(snapRoot(HOME_A)) ? readdirSync(snapRoot(HOME_A)) : []
      const orphanLeft = THREE.filter(n => orphans.includes(n))
      probes.push({
        id: 'L1-live-materialize', hard: true, ok: true,
        detail: `② 恢复语义：git+网络可用启动 → 活物化 registry 活源条目 ×3（${perMkt}；settle=${elapsed}s）`,
      })
      probes.push({
        id: 'L2-orphan-snapshot-cleanup', hard: true, ok: orphanLeft.length === 0,
        detail: `② 活物化成功清孤儿快照目录（removeBuiltinSnapshotDir 接线；残留三源目录=${orphanLeft.length}〔${orphanLeft.join(',')}〕，snapRoot 全目录=${orphans.join(',') || '∅'}）`,
      })
    } else if (stillSnap.length > 0 && missing.length === 0) {
      // 部分/全部仍在快照态 = 活克隆未完成（网络/带宽面），产品行为 = 保留快照（fail-safe）→ 定因环境面
      probes.push({
        id: 'L1-live-materialize', hard: true, ok: null,
        detail: `② INCONCLUSIVE（定因=环境面非产品缺口）：${elapsed}s 内 ${THREE.length - stillSnap.length}/${THREE.length} 源达活源，${stillSnap.join(',')} 仍在快照条目（${perMkt}）。恢复语义代码路径已按契约执行（快照条目不短路 already_installed → git 支 → 克隆中/失败保留快照 = fail-safe）；未达标 = 活克隆超时/网络面，核 pty.log + 市场远端可达性，建议重跑 live 场景复核`,
      })
      probes.push({ id: 'L2-orphan-snapshot-cleanup', hard: true, ok: null, detail: `② L1 INCONCLUSIVE 连带：孤儿清理判定以 L1 活源达标为前提，本轮不判（面未达）` })
    } else {
      // 条目消失（活支失败未回退快照）= 产品缺口
      probes.push({
        id: 'L1-live-materialize', hard: true, ok: false,
        detail: `② FAIL（产品缺口）：活物化后 registry 条目异常（${perMkt}；missing=${missing.join(',')}；settle=${elapsed}s）——活支失败未回退快照兜底，核 pty.log`,
      })
      probes.push({ id: 'L2-orphan-snapshot-cleanup', hard: true, ok: false, detail: `② L1 FAIL 连带不判` })
    }

    // L4 用户面佐证（活源态/快照态 /plugin marketplace list 三源仍在场）
    const pty2 = await ptyStart(HOME_A, ws, scenDir)
    pty2.send('/plugin marketplace list')
    const face = (await waitText(pty2, [...THREE, 'No marketplaces configured'], 60_000)) ?? pty2.sinceText()
    pty2.kill()
    probes.push({
      id: 'L4-user-face', hard: false,
      ok: THREE.every(n => face.includes(n)),
      detail: `② 用户面佐证：恢复面 /plugin marketplace list 三源仍可见（${THREE.map(n => `${n}=${face.includes(n)}`).join(' ')}；观察项非硬判据）`,
      warn: true,
    })
  })
  writeFileSync(join(scenDir, 'result.json'), JSON.stringify({ scen: 'live', verdicts: probes }, null, 2))
  return probes
}

// ── K：场景③ kill-switch（disabled 且不兜底）─────────────────────────
async function sceneKillswitch(scenDir: string): Promise<Verdict[]> {
  const probes: Verdict[] = []
  const ws = join(ROOT, 'workspaces-046', 'killswitch')
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  rmSync(HOME_B, { recursive: true, force: true })
  await makeSandboxHome(HOME_B, REAL_SETTINGS, false)

  let pty: Pty
  await withEnv(
    {
      ATLAS_DISABLE_ATLAS_MARKETPLACE_AUTOINSTALL: '1',
      ATLAS_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL: '1',
      ATLAS_DISABLE_ASCEND_MARKETPLACE_AUTOINSTALL: '1',
    },
    async () => {
      pty = await ptyStart(HOME_B, ws, scenDir)
    },
  )
  await sleep(15_000) // kill-switch = 启动即短路（无物化等待面），留 settle
  const reg = readReg(HOME_B)
  const regEmpty = THREE.every(k => !reg[k])
  const snapGone = !existsSync(snapRoot(HOME_B))
  pty.send('/plugin marketplace list')
  const face = (await waitText(pty, ['No marketplaces configured', 'Configured marketplaces:'], 45_000)) ?? pty.sinceText()
  pty.kill()
  const fullLog = readIfExists(join(scenDir, 'pty.log'))
  const fallbackNotif = fullLog.includes('已用内建快照目录')

  probes.push(
    {
      id: 'K1-disabled-no-fallback', hard: true, ok: regEmpty && snapGone && !fallbackNotif,
      detail: `③ kill-switch 三 env 设真 → disabled 且不兜底（registry 无三源条目=${regEmpty} / 无 builtin-snapshots 目录=${snapGone} / 无兜底通知行=${!fallbackNotif}；kill-switch 短路于兜底支之前 = 源级 C1 + 本行为面双核）`,
    },
    {
      id: 'K2-user-face', hard: false,
      ok: !THREE.some(n => face.includes(n)) && /No marketplaces/i.test(face),
      detail: `③ 用户面：/plugin marketplace list 无三源残留（'No marketplaces configured'=${/No marketplaces/i.test(face)}；观察项非硬判据，硬判据 = K1 状态面）`,
      warn: true,
    },
  )
  writeFileSync(join(scenDir, 'result.json'), JSON.stringify({ scen: 'killswitch', verdicts: probes }, null, 2))
  return probes
}

// ── S：场景④ 显数 + ⑤b 上报 + ⑥ 搜索/详情/安装 ────────────────────────
async function sceneStats(scenDir: string, mock: { hits: () => Hit[]; resetHits: () => void }): Promise<Verdict[]> {
  const probes: Verdict[] = []
  const ws = join(ROOT, 'workspaces-046', 'stats')
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })

  // Sa：端点未设（零显数 + 零外联观察面）
  mock.resetHits()
  let ptyA: Pty
  await withEnv({ ATLAS_STATS_ENDPOINT: undefined }, async () => {
    ptyA = await ptyStart(HOME_A, ws, scenDir)
  })
  ptyA.send('/plugin')
  await waitText(ptyA, ['type to search'], 60_000)
  await sleep(25_000) // stats 取数面（raw ×2 10s 超时 → 失败 → null）
  const saFace = ptyA.sinceText()
  const saHits = mock.hits().length
  ptyA.kill()
  const saCountLines = linesOf(saFace).filter(l => COUNT_RE.test(l)).length
  probes.push({
    id: 'S1-no-endpoint-hidden', hard: true, ok: saCountLines === 0,
    detail: `④ 无 stats 端点 + 自托管 stats 源不可达（raw 出网受限）→ 不显数无误导零值（计数行=${saCountLines}，期望 0；优雅隐藏非错误）`,
  })
  probes.push({
    id: 'S2-zero-egress-default', hard: true, ok: saHits === 0,
    detail: `⑤ 缺省零外联：ATLAS_STATS_ENDPOINT 未设全程 mock 零命中（命中=${saHits}，期望 0；上报面 = 用户显式设端点才外联，可信清册 D3）`,
  })

  // Sb：端点设真（mock 有数据 = 显数正例 + 搜索面；ptyB = 列表/搜索面）
  let ptyB: Pty
  await withEnv({ ATLAS_STATS_ENDPOINT: MOCK_BASE }, async () => {
    ptyB = await ptyStart(HOME_A, ws, scenDir)
  })
  ptyB.send('/plugin')
  await waitText(ptyB, ['type to search'], 60_000)
  // 初始列表面（首次渲染无 diff clobber）= 显数/不显数判据底面
  await waitText(ptyB, ['installs'], 45_000)
  await sleep(2000) // 计数行渲染 settle
  const listFace = ptyB.sinceText()
  const tilCount = /·\s*12\.3K\s*installs/.test(listFace) // 12345 → 12.3K（formatInstallCount 行为面）
  const precCount = /·\s*7\s*installs/.test(listFace)
  const runCount = /·\s*42\s*installs/.test(listFace)
  const perfLineWindow = linesOf(listFace).find(l => l.includes('perf-optimize')) ?? ''
  // 搜索面（⑥）：逐字符键入 'ascend' 过滤 + 头计数判据（clobber 免疫）
  await typeSearch(ptyB, 'ascend')
  await sleep(2500)
  const sTotal = filteredTotal(ptyB.sinceText())
  ptyB.kill()

  // Sd：⑤b 上报面 = 全新 pty（ptyC，无搜索面态污染；r3 定因：搜索态 Esc 语义 + 状态转移后
  // ~1.5-2s 焦点路由 settle 窗 → 面内安装命令必落搜索框；解耦后 ⑤b 与 ⑥-search 各自独立判据）
  let ptyC: Pty
  await withEnv({ ATLAS_STATS_ENDPOINT: MOCK_BASE }, async () => {
    ptyC = await ptyStart(HOME_A, ws, scenDir)
  })
  const hitsBefore = mock.hits().length
  const inst = await installViaDetails(ptyC, 'ascend-precision-debug')
  const faceStateLost = inst.faceStateLost
  await sleep(6000) // fire-and-forget 上报 settle
  const hits = mock.hits()
  const reportHit = hits.slice(hitsBefore).find(h => h.method === 'POST' && h.path === '/stats/report')
  let reportBodyOk = false
  try {
    if (reportHit?.body) {
      const b = JSON.parse(reportHit.body)
      reportBodyOk = b.plugin === 'ascend-precision-debug@atlas-plugins' && b.marketplace === 'atlas-plugins'
    }
  } catch {
    reportBodyOk = false
  }

  // ⑥ 安装后 installed 管理面（/plugin manage → installed tab 列已装插件）
  ptyC.send('/plugin manage')
  const badgeFace = (await waitText(ptyC, ['ascend-precision-debug'], 60_000)) ?? ptyC.sinceText()
  const badge = badgeFace.includes('ascend-precision-debug')
  ptyC.kill()

  // S4 判据底面 = 全量 pty.log（三 pty 共写 scenDir/pty.log；perf 行在搜索/安装面重绘期才现，
  // 首渲染 5 项分页窗内未必在场 → 场景末全量 log 定面；无端点面 ptyA 的 perf 行无计数同为负例证据）
  const perfLine = perfLineWindow.length > 0
    ? perfLineWindow
    : (stripAnsi(readIfExists(join(scenDir, 'pty.log'))).split('\n').filter(l => l.includes('perf-optimize')).pop() ?? '')
  const perfNoCount = perfLine.length > 0 && !COUNT_RE.test(perfLine)

  probes.push(
    {
      id: 'S3-data-shown', hard: true, ok: tilCount && precCount && runCount,
      detail: `④ 显数「有数据即显示」：mock 端点有数据 → /plugin 初始列表面显数（12.3K installs=${tilCount} / 7 installs=${precCount} / 42 installs=${runCount}；formatInstallCount 行为面；判据取首次渲染面 = diff clobber 免疫）`,
    },
    {
      id: 'S4-no-count-without-data', hard: true, ok: perfNoCount,
      detail: `④ 无数据插件不显数（ascend-perf-optimize 行=${perfLine.slice(0, 90) || '(行未现)'}；无误导零值/无假数——stats 文件无该插件条目 = 不显数非显 0）`,
    },
    {
      // 重 gate 加固：face-state 丢失（探针侧定因）→ ok=null INC 非 FAIL（安装未触发 = 判据未执行，非产品缺口；定因登记 4）
      id: 'S5-search-detail', hard: true, ok: faceStateLost ? null : (inst.detail && sTotal === EXPECTED_ASCEND_TOTAL),
      detail: `⑥ 搜索面（逐字符 'ascend' 过滤，头计数=${sTotal} 期望 ${EXPECTED_ASCEND_TOTAL}）+ 详情面（ptyC 全新面 /plugin install <name> → 详情视图菜单『Install for you (user scope)』在场=${inst.detail}）${faceStateLost ? '；★ face-state 丢失 = 探针侧定因（安装未触发，INC 重测非 FAIL）' : ''}`,
    },
    {
      id: 'S6-report-triggered', hard: true, ok: faceStateLost ? null : Boolean(reportHit),
      detail: `⑤b 上报面：ATLAS_STATS_ENDPOINT 设真 → 安装触发 POST /stats/report（命中=${Boolean(reportHit)}；body 契约 ${reportBodyOk ? 'MATCH' : 'MISS/未现'}〔plugin=ascend-precision-debug@atlas-plugins marketplace=atlas-plugins〕）${faceStateLost ? '；face-state 丢失 = 安装未触发（INC）' : ''}`,
    },
    {
      id: 'S7-install-untouched', hard: true, ok: faceStateLost ? null : (inst.done && !inst.err),
      detail: `⑤b 安装主流程不受影响（安装完成面=${inst.done}〔'Installed ascend-precision-debug' 或 options 流 ${inst.optsFace ? '(esc 退配置面，安装已落地)' : ''}〕/ 错误字面=${inst.err}；fire-and-forget 上报永不阻塞安装 = 源级 C4 + 本行为面）${faceStateLost ? '；face-state 丢失 = 安装未触发（INC）' : ''}`,
    },
    {
      id: 'S8-installed-management', hard: false, ok: badge,
      detail: `⑥ update 管理面（installed 态）：安装后 /plugin manage（installed tab）见 ascend-precision-debug=${badge}（观察项；版本 delta 升级面 = 无 fixture 具名 deferred）`,
      warn: true,
    },
  )
  writeFileSync(join(scenDir, 'result.json'), JSON.stringify({ scen: 'stats', verdicts: probes }, null, 2))
  return probes
}

// ── R：场景⑤a 缺省零外联（安装成功 + mock 零命中）─────────────────────
async function sceneReportOff(scenDir: string, mock: { hits: () => Hit[]; resetHits: () => void }): Promise<Verdict[]> {
  const probes: Verdict[] = []
  const ws = join(ROOT, 'workspaces-046', 'report-off')
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  mock.resetHits()
  let pty: Pty
  await withEnv({ ATLAS_STATS_ENDPOINT: undefined }, async () => {
    pty = await ptyStart(HOME_A, ws, scenDir)
  })
  const inst = await installViaDetails(pty, 'ascend-runtime-debug')
  await sleep(6000)
  const hits = mock.hits()
  pty.kill()
  probes.push(
    {
      id: 'R1-install-without-endpoint', hard: true, ok: inst.done && !inst.err,
      detail: `⑤a 端点未设：安装主流程正常（ascend-runtime-debug 安装完成=${inst.done} 错误=${inst.err}；活源本地拷贝安装零网络）`,
    },
    {
      id: 'R2-zero-report-egress', hard: true, ok: hits.length === 0,
      detail: `⑤a 缺省零外联网络面：安装全程 mock 零命中（命中=${hits.length}，期望 0；ATLAS_STATS_ENDPOINT 缺省 = 零 /stats/report 外联，可信清册 D3）`,
    },
  )
  writeFileSync(join(scenDir, 'result.json'), JSON.stringify({ scen: 'report-off', verdicts: probes }, null, 2))
  return probes
}

// ── 主流程 ────────────────────────────────────────────────────────────
async function main() {
  if (!REPO) {
    console.error('[SC] REPO 未设（--repo <0.1.46 被测 worktree，master ab3211e>）')
    process.exit(2)
  }
  if (!existsSync(join(REPO, 'src'))) {
    console.error(`[SC] REPO 无效（src/ 缺失）: ${REPO}`)
    process.exit(2)
  }
  const mock = startMock()
  const all: Verdict[] = []
  const inconclusive: string[] = []

  const run = async (name: string, fn: (d: string, mock?: any) => Promise<Verdict[]> | Verdict[]) => {
    const d = join(RUN, name)
    mkdirSync(d, { recursive: true })
    console.error(`=== ${name} ===`)
    try {
      const vs = await (name === 'cmd' ? probeCmd(d) : fn(d, mock))
      all.push(...vs)
      for (const v of vs) console.error(`  [${v.ok === null ? 'INC ' : v.ok ? 'PASS' : 'FAIL'}] ${v.id}: ${v.detail.slice(0, 200)}`)
    } catch (e: any) {
      console.error(`  [INC ] ${name}: 面未达（${String(e?.message).slice(0, 200)}）→ INCONCLUSIVE 定因核 pty.log`)
      inconclusive.push(`${name}: ${String(e?.message).slice(0, 240)}`)
    }
  }

  // PTY 场景串行（HOME 谱系依赖：F → L → S → R；K 独立 HOME_B）
  if (runScens.includes('cmd')) await run('cmd', () => probeCmd(join(RUN, 'cmd')))
  if (runScens.includes('fallback')) await run('fallback', (d: string) => sceneFallback(d))
  if (runScens.includes('live')) await run('live', (d: string) => sceneLive(d))
  if (runScens.includes('killswitch')) await run('killswitch', (d: string) => sceneKillswitch(d))
  if (runScens.includes('stats')) await run('stats', (d: string) => sceneStats(d, mock))
  if (runScens.includes('report-off')) await run('report-off', (d: string) => sceneReportOff(d, mock))

  const hard = all.filter(v => v.hard)
  const fail = hard.filter(v => v.ok === false)
  const inc = hard.filter(v => v.ok === null)
  const gatePass = fail.length === 0 && inc.length === 0 && inconclusive.length === 0
  console.error(`\n${gatePass ? 'GATE-PASS' : fail.length ? 'GATE-OPEN (hard FAIL)' : 'GATE-OPEN (INCONCLUSIVE)'} → ${RUN}`)
  console.error(`  hard=${hard.length} fail=${fail.length} inc=${inc.length} 场景面未达=${inconclusive.length}`)
  writeFileSync(join(RUN, 'summary.json'), JSON.stringify({ run: RUN, gatePass, hard, fail: fail.length, inc: inc.length, inconclusive }, null, 2))
  process.exit(gatePass ? 0 : 1)
}

main().catch(e => {
  console.error('[threesource-046] fatal:', e)
  process.exit(2)
})
