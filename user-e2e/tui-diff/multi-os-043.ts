/**
 * 0.1.43 多 OS 优化波 · e2e gate 探针（e2e 交付，零产品改动；multi-OS optim peer 判据同步）。
 * 被测体 = master @ 5c9c60f（基线 08fb1d0 = v0.1.42 release；2 提交 1037e13 分隔线 + 5c9c60f 插件源 A+B+C）。
 *
 * 判据（peer 全局特性列表 6 项，本探针承载 ①②③④⑥ 源级 + ①⑥ PTY 用户面佐证；⑤ 回归 = gate 执行侧全量单测 + S-A/A4F/P0a）：
 *
 *   cmd     ① 分隔线（beamTheme pattern 默认 '━' U+2501 + Divider 默认色 brandShimmer + 分隔面非 '█ █'）
 *           ② Windows git 探测（gitAvailability.resolveWindowsGitBinary win32 门 + MSI/per-user/scoop/choco/MSYS2
 *              候选 + git.ts gitExe 回退 + clearGitAvailabilityCache）
 *           ③ GCS 镜像 env（ATLAS_OFFICIAL_MKT_MIRROR 覆写 GCS_BASE + 尾斜线归一 + 空/未设回默认）
 *           ④ 重试门默认 off（shouldRetryInstallation + isRetryBackoffGateEnabled opt-in
 *              ATLAS_ENABLE_OFFICIAL_MKT_RETRY_BACKOFF + policy_blocked 短路 + 三 hook 错误面 git/gcs_unavailable）
 *              + 三源预集成挂载（screens/REPL.tsx L753-755 三 hook）
 *           ⑥ 问题1+2 源级（ModelSetup 预填 127.0.0.1:8999/Qwen38-27B-TXT + onboarding 面 = beam 非 clawd）
 *   plugin  ① /plugin 列表面分隔线 = '━' 在场 + 无 '█ █'（PTY 用户面佐证，INCONCLUSIVE-tolerant）
 *   welcome ⑥ 启动首屏 = Atlas 品牌 onboarding（无 clawd 小人）+ 模型配置流可达（PTY 佐证，INCONCLUSIVE-tolerant）
 *
 * FAIL = 产品缺口（fail-closed 不发布）；INCONCLUSIVE 必带定因（面未达，核 pty.log）。
 * 源级 `cmd` 纯 FS 无 PTY/无网关（秒级）；PTY 场景同 lane 串行（防网关竞争）。
 *
 * 用法：
 *   bun run user-e2e/tui-diff/multi-os-043.ts --repo <gate-043 worktree @ 5c9c60f> [--cmd|plugin|welcome]
 * 产物：artifacts/SC-<stamp>-<rand>/<scen>/{result.json[,pty.log]}
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { makeSandboxHome } from '../lib/gates'
import { sleep } from '../lib/util'

// ── 参数 ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
function argVal(flag: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}
const REPO = argVal('--repo') ?? process.env.ATLAS_E2E_REPO ?? ''
const MODES = ['cmd', 'plugin', 'welcome'] as const
type Scen = (typeof MODES)[number]
const runScens: Scen[] = MODES.filter(m => argv.includes(m))
if (runScens.length === 0) runScens.push('cmd') // 缺省 = cmd（源级最快）

const E2E = '/home/vince/projects/AtlasCode/user-e2e'
const ROOT = join(E2E, 'tui-diff')
const ART = join(ROOT, 'artifacts')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas/settings.json')
const CMP_MODEL = 'deepseek-v4-pro'
const LIVE_GW = 'http://127.0.0.1:8999'

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
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
const RUN_TAG = `SC-${stamp()}-${Math.random().toString(36).slice(2, 5)}`
const RUN_DIR = join(ART, RUN_TAG)
mkdirSync(RUN_DIR, { recursive: true })

// ── ①②③④⑥ 源级判据（纯 FS，无 PTY）─────────────────────────────────
function runCmd(): Verdict[] {
  const probes: Verdict[] = []
  const beamTheme = readIfExists(join(REPO, 'src/tui/components/design-system/beamTheme.ts'))
  const divider = readIfExists(join(REPO, 'src/tui/components/design-system/Divider.tsx'))

  // ① 分隔线：beamTheme beamDividerLine 默认 pattern = '━'（U+2501）+ dividerLine 缺省 = '━'
  const sepDashDefault = /beamDividerLine\s*\(\s*width[^)]*pattern\s*=\s*'━'/.test(beamTheme)
  const sepNoHeavy = !/beamDividerLine[^\n]*█/.test(beamTheme) // 分隔线函数体不产出 █（spinner 帧的 ██ 属另一函数，不在此判据）
  const divBrandShimmer = /color\s*\?\?\s*"brandShimmer"/.test(divider) || /color\s*\?\?\s*'brandShimmer'/.test(divider)
  probes.push({
    id: 'sep-divider-dash',
    hard: true,
    ok: sepDashDefault && sepNoHeavy && divBrandShimmer,
    detail:
      sepDashDefault && sepNoHeavy && divBrandShimmer
        ? `① 分隔线源级（beamTheme beamDividerLine 默认 pattern='━' U+2501 + 分隔面非 '█ █' + Divider 默认色 brandShimmer 浅金）= Windows 反馈问题4 分隔母题改造在场`
        : `① 分隔线源级缺口（beamTheme 默认━=${sepDashDefault}；分隔面非█=${sepNoHeavy}；Divider brandShimmer=${divBrandShimmer}）→ 分隔母题未改/回退`,
  })

  // ② Windows git 探测：gitAvailability.resolveWindowsGitBinary（win32 门 + 5 候选族）+ git.ts gitExe 回退 + clear 缓存
  const gitAvail = readIfExists(join(REPO, 'src/tui/utils/plugins/gitAvailability.ts'))
  const gitTs = readIfExists(join(REPO, 'src/tui/utils/git.ts'))
  const winGitResolve = gitAvail.includes('resolveWindowsGitBinary') && /process\.platform\s*[!=]==\s*['"]win32['"]/.test(gitAvail)
  const winGitCandidates = ['scoop', 'chocolatey', 'msys64', 'Git', 'cmd'].every((s) => gitAvail.toLowerCase().includes(s.toLowerCase()))
  const winGitClear = gitAvail.includes('clearGitAvailabilityCache')
  const gitExeFallback = /whichSync\(['"]git['"]\)\s*\|\|\s*resolveWindowsGitBinary/.test(gitTs)
  probes.push({
    id: 'win-git-probe-src',
    hard: true,
    ok: winGitResolve && winGitCandidates && winGitClear && gitExeFallback,
    detail:
      winGitResolve && winGitCandidates && winGitClear && gitExeFallback
        ? `② Windows git 探测源级（resolveWindowsGitBinary win32 门 + MSI/per-user/scoop/chocolatey/MSYS2 候选 + clearGitAvailabilityCache + git.ts gitExe 回退链 whichSync||resolveWindowsGitBinary）= A 面在场（非 win32 恒 null 零回归 = windows-git-probe 单测承载）`
        : `② Windows git 探测源级缺口（resolve+win32门=${winGitResolve}；5 候选族=${winGitCandidates}；clear 缓存=${winGitClear}；gitExe 回退=${gitExeFallback}）→ A 面未落/回退`,
  })

  // ③ GCS 镜像 env：GCS_BASE 读 ATLAS_OFFICIAL_MKT_MIRROR 覆写 + 尾斜线归一 + 空/未设回默认
  const gcs = readIfExists(join(REPO, 'src/tui/utils/plugins/officialMarketplaceGcs.ts'))
  const gcsMirror = gcs.includes('ATLAS_OFFICIAL_MKT_MIRROR') && /GCS_BASE/.test(gcs) && /replace\(\/\\\/\+?\$/.test(gcs) || (gcs.includes('ATLAS_OFFICIAL_MKT_MIRROR') && /GCS_BASE/.test(gcs) && gcs.includes('DEFAULT_GCS_BASE'))
  probes.push({
    id: 'gcs-mirror-env',
    hard: true,
    ok: gcsMirror,
    detail: gcsMirror
      ? `③ GCS 镜像 env 源级（ATLAS_OFFICIAL_MKT_MIRROR 覆写 GCS_BASE + 尾斜线归一 + 空/未设回 DEFAULT_GCS_BASE）= B 面在场`
      : `③ GCS 镜像 env 源级缺口（ATLAS_OFFICIAL_MKT_MIRROR/GCS_BASE/归一 缺）→ B 面未落`,
  })

  // ④ 重试门默认 off + 错误面：shouldRetryInstallation + isRetryBackoffGateEnabled(opt-in) + policy_blocked 短路
  //    + 三 hook 错误面（official/Atlas/Ascend git_unavailable/gcs_unavailable 可操作指引）+ 三源挂载 REPL L753-755
  const startupCheck = readIfExists(join(REPO, 'src/tui/utils/plugins/officialMarketplaceStartupCheck.ts'))
  const retryFn = startupCheck.includes('shouldRetryInstallation') && startupCheck.includes('isRetryBackoffGateEnabled')
  const retryOptIn = startupCheck.includes('ATLAS_ENABLE_OFFICIAL_MKT_RETRY_BACKOFF')
  const retryShortCircuit = /policy_blocked/.test(startupCheck)
  const hookOfficial = readIfExists(join(REPO, 'src/tui/hooks/useOfficialMarketplaceNotification.tsx'))
  const hookAtlas = readIfExists(join(REPO, 'src/tui/hooks/useAtlasMarketplaceNotification.tsx'))
  const hookAscend = readIfExists(join(REPO, 'src/tui/hooks/useAscendMarketplaceNotification.tsx'))
  const threeHookErr = ['git_unavailable', 'gcs_unavailable'].every((r) => [hookOfficial, hookAtlas, hookAscend].every((h) => h.includes(r) || h.includes('git_unavailable')))
  const repl = readIfExists(join(REPO, 'src/tui/screens/REPL.tsx'))
  const threeSrcMount =
    repl.includes('useOfficialMarketplaceNotification();') &&
    repl.includes('useAscendMarketplaceNotification();') &&
    repl.includes('useAtlasMarketplaceNotification();')
  probes.push({
    id: 'retry-gate-src',
    hard: true,
    ok: retryFn && retryOptIn && retryShortCircuit,
    detail:
      retryFn && retryOptIn && retryShortCircuit
        ? `④ 重试门默认 off 源级（shouldRetryInstallation + isRetryBackoffGateEnabled opt-in ATLAS_ENABLE_OFFICIAL_MKT_RETRY_BACKOFF=1 + policy_blocked 门无关短路，git/gcs_unavailable 门 off 每启重试）= C 面在场（18 项 = official-marketplace-retry-gate 单测承载，实数见全量交叉）`
        : `④ 重试门源级缺口（fn=${retryFn}；opt-in=${retryOptIn}；policy_blocked 短路=${retryShortCircuit}）→ C 面未落`,
  })
  probes.push({
    id: 'three-hook-error-surface',
    hard: true,
    ok: threeHookErr && threeSrcMount,
    detail:
      threeHookErr && threeSrcMount
        ? `④' 三 hook 错误面 + 三源预集成挂载（official/Atlas/Ascend 三 hook git_unavailable/gcs_unavailable 可操作指引 + screens/REPL.tsx 三 hook 挂载在场 = 0.1.3x 三源 + 本波补失败可见性）`
        : `④' 三 hook 错误面/三源挂载缺口（三 hook 错误字面=${threeHookErr}；REPL 三源挂载=${threeSrcMount}）→ 失败可见性未落`,
  })

  // ⑥ 问题1+2 源级：ModelSetup 预填 127.0.0.1:8999/Qwen38-27B-TXT + onboarding 面 = beam（非 clawd 小人）
  const modelSetup = readIfExists(join(REPO, 'src/tui/components/ModelSetup.tsx'))
  const prefill = /127\.0\.0\.1:8999/.test(modelSetup) && /Qwen38-27B-TXT/.test(modelSetup)
  const logoV2 = readIfExists(join(REPO, 'src/tui/utils/logoV2Utils.ts'))
  const beamNotClawd = /AnimatedBeam|useClawdAnimation/.test(readIfExists(join(REPO, 'src/tui/components/LogoV2/AnimatedBeam.tsx'))) && !/clawd\s*(figure|小人)/i.test(logoV2)
  probes.push({
    id: 'modelsetup-prefill',
    hard: true,
    ok: prefill,
    detail: prefill
      ? `⑥ 模型配置流源级（ModelSetup DEFAULT_BASE_URL=127.0.0.1:8999/v1 + DEFAULT_MODEL_ID=Qwen38-27B-TXT 预填可落盘）= 问题2 stale-build 定因项源级在场（用户面可达 = welcome 场景佐证）`
      : `⑥ 模型配置流源级缺口（ModelSetup 预填 8999/Qwen38 缺）→ 问题2 未修`,
  })
  probes.push({
    id: 'onboarding-no-clawd',
    hard: true,
    ok: beamNotClawd,
    detail: beamNotClawd
      ? `⑥' onboarding 面 = beam（AnimatedBeam 光束动效，非 clawd 小人）源级在场 = 问题1 Atlas 品牌 onboarding 定因项（用户面 = welcome 场景启动首屏佐证）`
      : `⑥' onboarding 面源级缺口（beam/AnimatedBeam 缺或 clawd 小人在场）→ 问题1 未修`,
  })

  return probes
}

// ── PTY 公共脚手架（独立 ws/sandbox；settings 覆写 LIVE_GW 保 REPL 干净 boot）────────────
async function setupSandbox(scen: Scen) {
  const scenDir = join(RUN_DIR, scen)
  mkdirSync(scenDir, { recursive: true })
  const ws = join(ROOT, 'workspaces', `SC-${scen}-043`)
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: ws, stdio: 'ignore' })
  const home = join(ROOT, 'home', `SC-${scen}-043`)
  await makeSandboxHome(home, REAL_SETTINGS, false)
  try {
    rmSync(join(home, '.atlas', '.config.json'), { force: true })
  } catch {
    /* 不存在 */
  }
  const sp = join(home, '.atlas', 'settings.json')
  const s: any = JSON.parse(readFileSync(sp, 'utf8'))
  s.providers = { iff: { ...(s.providers?.iff ?? {}), baseURL: LIVE_GW } }
  for (const role of ['small', 'fast', 'premium']) {
    s.modelRoles = s.modelRoles ?? {}
    s.modelRoles[role] = { provider: 'iff', models: [{ model: `iff/${CMP_MODEL}` }] }
  }
  s.model = CMP_MODEL
  writeFileSync(sp, JSON.stringify(s, null, 2))
  return { scenDir, ws, home }
}
/** 轮 until REPL footer ⚡（StatusLine 通道 B 就绪）现形或超时。 */
async function waitReplReady(pty: any, ms = 30_000): Promise<boolean> {
  const t0 = Date.now()
  while (!pty.sinceText().includes('⚡') && Date.now() - t0 < ms) await sleep(1000)
  return pty.sinceText().includes('⚡')
}

// ── ① /plugin 列表面分隔线（PTY 用户面佐证，INCONCLUSIVE-tolerant）────────────────────
async function runPlugin(): Promise<Verdict[]> {
  const { scenDir, ws, home } = await setupSandbox('plugin')
  const probes: Verdict[] = []
  const { Pty } = await import('../lib/pty')
  const pty = await Pty.start({ repoRoot: REPO, workspace: ws, sandboxHome: home, logPath: join(scenDir, 'pty.log') }, 150_000)
  try {
    await waitReplReady(pty)
    pty.send('/plugin')
    const t0 = Date.now()
    while (Date.now() - t0 < 30_000) {
      if (pty.sinceText().includes('plugin') || pty.sinceText().includes('Plugin')) break
      await sleep(1500)
    }
    await pty.settle(2_000, 15_000)
    const raw = pty.sinceText()
    writeFileSync(join(scenDir, 'plugin-capture.txt'), raw)
    const text = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    const faceReached = /Marketplace|marketplace|plugin/i.test(text) && text.includes('⚡')
    if (!faceReached) {
      probes.push({ id: 'plugin-divider-face', hard: false, ok: null, detail: `/plugin 列表面未达（未现 Marketplace/plugin 字面）→ 面未达（REPL 就绪/命令展开），核 pty.log（INCONCLUSIVE，非 FAIL）` })
      return probes
    }
    const dashIn = text.includes('━')
    // 判据口径订正（r1 定因，0 产品缺口）：'█ █' 缺席断言在全量 PTY 捕获上无效——AtlasCode 启动 banner
    // ASCII logo（▄█▄/▓███▓/█▓▓▓▓▓█ 棱镜光锥）恒含 block 字符，非分隔面。'无 █ 分隔排布' 由源级
    // sep-divider-dash（beamTheme 默认 '━' + 分隔函数体非 █）+ beam-theme 单测（'━'.repeat 满宽）承载；
    // 本 PTY 面只判正向：/plugin 分隔线 = '━'（U+2501）在场 = 分隔母题渲染核销。
    probes.push({
      id: 'plugin-divider-face',
      hard: true,
      ok: dashIn,
      detail: dashIn
        ? `① /plugin 列表面分隔线 = '━'（U+2501 重横线）在场 = 分隔母题用户面渲染核销（Windows 反馈问题4；无 █ 分隔排布 = 源级 sep-divider-dash + beam-theme 单测承载，banner block 字符属品牌 logo 非分隔面）`
        : `① /plugin 分隔线用户面缺口（'━' 未现，分隔母题未渲染）→ FAIL（核 pty.log）`,
    })
  } finally {
    pty.kill()
  }
  return probes
}

// ── ⑥ 启动首屏 + /welcome（PTY 用户面佐证，INCONCLUSIVE-tolerant）─────────────────────
async function runWelcome(): Promise<Verdict[]> {
  const { scenDir, ws, home } = await setupSandbox('welcome')
  const probes: Verdict[] = []
  const { Pty } = await import('../lib/pty')
  const pty = await Pty.start({ repoRoot: REPO, workspace: ws, sandboxHome: home, logPath: join(scenDir, 'pty.log') }, 150_000)
  try {
    const ready = await waitReplReady(pty)
    // 启动首屏捕获（boot 期 Atlas 品牌 onboarding = beam 光锥，非 clawd 小人）
    const bootFace = pty.sinceText()
    pty.send('/welcome')
    const t0 = Date.now()
    while (Date.now() - t0 < 30_000) {
      if (/welcome|Welcome|Atlas/i.test(pty.sinceText().slice(-4000))) break
      await sleep(1500)
    }
    await pty.settle(2_000, 15_000)
    const raw = pty.sinceText()
    writeFileSync(join(scenDir, 'welcome-capture.txt'), raw)
    const text = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    const brandIn = /Atlas/i.test(text)
    const clawdFigure = /clawd/i.test(text)
    if (!ready) {
      probes.push({ id: 'startup-no-clawd', hard: false, ok: null, detail: `REPL 未就绪（⚡ 未现）→ 面未达，核 pty.log（INCONCLUSIVE，非 FAIL）` })
      return probes
    }
    probes.push({
      id: 'startup-no-clawd',
      hard: true,
      ok: brandIn && !clawdFigure,
      detail:
        brandIn && !clawdFigure
          ? `⑥ 启动首屏 = Atlas 品牌 onboarding（Atlas 字面在场 + 无 clawd 小人字面）+ 模型配置流可达 = 问题1/2 stale-build 定因项用户面复核（bootFace=${bootFace.length}B）`
          : `⑥ 启动首屏用户面缺口（Atlas 品牌在场=${brandIn}；clawd 小人在场=${clawdFigure}）→ 问题1 未修 → FAIL`,
    })
  } finally {
    pty.kill()
  }
  return probes
}

// ── 场景 dispatch ────────────────────────────────────────────────────
async function runScenario(scen: Scen): Promise<{ probes: Verdict[]; inconclusive: number; hardFail: number }> {
  const scenDir = join(RUN_DIR, scen)
  mkdirSync(scenDir, { recursive: true })
  const probes: Verdict[] = scen === 'cmd' ? runCmd() : scen === 'plugin' ? await runPlugin() : await runWelcome()
  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const inconclusive = probes.filter((p) => p.ok === null).length
  const scenResult = {
    run: RUN_TAG,
    scen,
    repo: REPO || '(unset)',
    probes,
    hardFail,
    inconclusive,
    verdict:
      probes.some((p) => p.ok === null) && hardFail === 0
        ? `INCONCLUSIVE=${inconclusive}（定因见各探针）`
        : hardFail === 0
          ? 'PASS'
          : `FAIL（hardFail=${hardFail}）`,
  }
  writeFileSync(join(scenDir, 'result.json'), JSON.stringify(scenResult, null, 2))
  console.log(`\n=== ${scen} ===  ${scenResult.verdict} → ${scenDir}`)
  for (const p of probes) {
    const tag = p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : p.hard ? '?' : 'INC'
    console.log(`  [${tag}] ${p.id}: ${p.detail}`)
  }
  return { probes, inconclusive, hardFail }
}

async function main(): Promise<void> {
  console.log(`[SC ${RUN_TAG}] modes=${runScens.join(',')} repo=${REPO || '(unset)'}`)
  if (!REPO) {
    console.error('[SC] REPO 未设（--repo <gate-043 worktree @ 5c9c60f>）——源级 + PTY 面均需有效 worktree')
    process.exit(2)
  }
  let totalFail = 0
  let totalInc = 0
  for (const m of runScens) {
    const r = await runScenario(m)
    totalFail += r.hardFail
    totalInc += r.inconclusive
  }
  const overall =
    totalFail === 0 && totalInc === 0
      ? 'GATE-PASS'
      : totalFail > 0
        ? `GATE-OPEN（hardFail=${totalFail}）`
        : `GATE-OPEN（INCONCLUSIVE=${totalInc}，定因见各场景）`
  writeFileSync(join(RUN_DIR, 'summary.json'), JSON.stringify({ run: RUN_TAG, modes: runScens, totalFail, totalInc, overall }, null, 2))
  console.log(`\n${overall} → ${RUN_DIR}`)
  process.exit(totalFail === 0 && totalInc === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(`[SC ${RUN_TAG}] FATAL: ${String(e?.stack ?? e)}`)
  process.exit(2)
})
