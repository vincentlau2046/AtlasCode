/**
 * 0.1.58 PAC V2-06 loop 鲁棒性 · C4 活面探针 runner（e2e lane，0.1.57 D4-B mock 同族）。
 *
 * 判据面（工单 §2 C4-1/C4-2 + f4 预审 ⑤「本波新增面」）：
 *   C4-1 mid-stream partial 保留（CC 2.1.199）→ **直接 provider 活面探针**
 *     （c4-1-provider-live.ts：真 OpenAI SDK 流式客户端 + 产品 provider 对象
 *     @ 被测面 worktree，setEndpointConfigSource 注入 mock 8981 midstream 面
 *     〔SSE 2 partial → 流中途 RST 断 = ECONNRESET 族〕→ 断言 C4-1 事件序
 *     + partial 保留 + interrupted 标记 + 单发终止）。
 *     ★ 判据面裁定（探针首跑定因，非产品缺口）：引擎主循环 = 非流式 chat()
 *     （loop.ts L19/L362；chatStream 残留守不入引擎面，engine/index.ts L884）
 *     → 主循环 PTY 测 C4-1 = 产品不达面（mock SSE 对非流式请求 = 协议错配 →
 *     占位面）。C4-1 唯一活消费面 = compact（compact.ts L1225，本波 +10 行拒收
 *     面 = build 面覆盖）；本探针 = provider 层活面（C4-1 码面直接路径）。
 *   C4-2 瞬断退避时序（CC 2.1.198）→ **PTY 主循环探针**（引擎主循环非流式
 *     chat 面，mock 8982 backoff 面 = 响应前瞬断协议无关；mock drop 前 2 次 /
 *     第 3 次起 PONG-C4 = 干净隔离 provider 3 次预算内 C4-2 指数退避 500/1000，
 *     无跨层 turnRecovery #262 重发混淆）→ 断言前两段 attempt 间隔单调递增 +
 *     带内 + 预算内 PONG-C4 完成。
 *
 * 判据升级纪律（0.1.57 D4-B 先例）：mock 确定性替代模型非定式（零 8999 竞争、
 * 零 Qwen38 依赖）；settings.providers / setEndpointConfigSource 全量重定向 mock
 * （resolveModel 取 provider.baseURL 注册表面 = 0.1.57 定因）。
 * 断言面 = provider 事件流（C4-1）+ session 落盘（C4-2）+ mock 请求日志（时序/单发）。
 *
 * 隔离：HOME=沙箱（零写真 ~/.atlas）；mock/产物 = job tmp prodlane-058/c4/。
 * 用法：bun run user-e2e/loop-robustness/c4-loop-058.ts [--repo <path>]
 *       ATLAS_E2E_C4_OUT=<dir>（产物目录，缺省 job tmp prodlane-058/c4）
 */
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import net from 'node:net'
import { GenericPty } from '../lib/pty-generic'
import { sleep } from '../lib/util'

const REPO = process.argv.includes('--repo')
  ? process.argv[process.argv.indexOf('--repo') + 1]
  : '/home/vince/projects/AtlasCode/worktrees/worktree-gate-058'
const REAL_SETTINGS = join(process.env.HOME!, '.atlas/settings.json')
const OUT = process.env.ATLAS_E2E_C4_OUT ?? '/home/vince/.claude/jobs/09264df0/tmp/prodlane-058/c4'
const MOCK_PY = '/home/vince/projects/AtlasCode/user-e2e/loop-robustness/c4-mock-server.py'
const C41_PROBE = '/home/vince/projects/AtlasCode/user-e2e/loop-robustness/c4-1-provider-live.ts'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }

function buildSandboxHome(home: string, mockBase: string): string {
  rmSync(home, { recursive: true, force: true })
  const atlasDir = join(home, '.atlas')
  mkdirSync(atlasDir, { recursive: true })
  const raw: Record<string, unknown> = JSON.parse(readFileSync(REAL_SETTINGS, 'utf8'))
  delete raw.enabledPlugins
  delete raw.enabledMcpServers
  delete raw.extraKnownMarketplaces
  delete raw.mcpServers
  const provs = (raw.providers && typeof raw.providers === 'object' ? raw.providers : {}) as Record<string, any>
  for (const cfg of Object.values(provs)) {
    if (cfg && typeof cfg === 'object') { cfg.baseURL = mockBase; cfg.apiKey = 'c4mock' }
  }
  raw.providers = Object.keys(provs).length > 0 ? provs : { openai: { baseURL: mockBase, apiKey: 'c4mock' } }
  writeFileSync(join(atlasDir, 'settings.json'), JSON.stringify(raw, null, 2))
  writeFileSync(join(home, '.atlas.json'),
    JSON.stringify({ theme: 'dark', hasCompletedOnboarding: true }, null, 2))
  try { rmSync(join(atlasDir, '.config.json'), { force: true }) } catch { /* 不存在 */ }
  return home
}

function latestSessionFile(home: string): string | null {
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
  const projDir = join(home, '.atlas', 'projects')
  if (!existsSync(projDir)) return null
  let best: { p: string, m: number } | null = null
  for (const sub of readdirSync(projDir)) {
    const d = join(projDir, sub)
    for (const f of readdirSync(d)) {
      if (!f.endsWith('.jsonl')) continue
      const p = join(d, f)
      const m = statSync(p).mtimeMs
      if (!best || m > best.m) best = { p, m }
    }
  }
  return best?.p ?? null
}

/** session JSONL 中 assistant 条目的 text 内容块是否含 marker（防 user 消息回显假阳）。 */
function sessionAssistantHas(sessText: string, marker: string): boolean {
  return sessText.split('\n').some((l) => {
    try {
      const e = JSON.parse(l)
      if (e.type !== 'assistant') return false
      const content = e.message?.content
      if (!Array.isArray(content)) return String(content ?? '').includes(marker)
      return content.some((c: any) => c?.type === 'text' && String(c.text ?? '').includes(marker))
    } catch { return false }
  })
}

function readMockLog(outDir: string, mode: 'midstream' | 'backoff'): { ts: number, main: boolean, call_no: number }[] {
  const f = join(outDir, `c4-${mode}-requests.jsonl`)
  if (!existsSync(f)) return []
  const rows: { ts: number, main: boolean, call_no: number }[] = []
  for (const l of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
    let e: any; try { e = JSON.parse(l) } catch { continue }
    rows.push({ ts: e.ts, main: !!e.main, call_no: e.call_no ?? 0 })
  }
  return rows
}

async function waitPort(port: number, ms: number): Promise<boolean> {
  const t0 = Date.now()
  for (;;) {
    const ok = await new Promise<boolean>((res) => {
      const s = net.connect(port, '127.0.0.1')
      s.on('connect', () => { s.destroy(); res(true) })
      s.on('error', () => { s.destroy(); res(false) })
    })
    if (ok) return true
    if (Date.now() - t0 > ms) return false
    await sleep(300)
  }
}

/** 读 provider 探针 result.json 的 probes 面（C4-1 直接 provider 活面）。 */
function readC41Probes(scenDir: string): { probes: Probe[], verdict: string, raw: any } {
  const f = join(scenDir, 'result.json')
  if (!existsSync(f)) return { probes: [{ id: 'C41-probe-ran', hard: true, ok: false, detail: 'provider 探针 result.json 缺席（探针侧定因）' }], verdict: 'FAIL', raw: null }
  const raw = JSON.parse(readFileSync(f, 'utf8'))
  const probes: Probe[] = (raw.probes ?? []).map((p: any) => ({ id: p.id, hard: !!p.hard, ok: p.ok, detail: p.detail }))
  return { probes, verdict: raw.verdict ?? (probes.some((p) => p.hard && p.ok === false) ? 'FAIL' : 'PASS'), raw }
}

// ── C4-1：直接 provider 活面（无 PTY；真 SDK 流式客户端 + mock 8981 midstream）──
async function runC41(): Promise<{ probes: Probe[], verdict: string }> {
  const scenDir = join(OUT, 'c4-1-provider')
  rmSync(scenDir, { recursive: true, force: true })
  mkdirSync(join(scenDir, 'mock'), { recursive: true })

  const mock = spawn('python3', [MOCK_PY, join(scenDir, 'mock'), '--mode', 'midstream', '--port', '8981'],
    { stdio: ['ignore', 'ignore', 'inherit'] })
  const ready = await waitPort(8981, 15_000)
  console.log(`[c4] c4-1-provider mock ready=${ready} port=8981`)
  if (!ready) { mock.kill(); throw new Error('c4-1 mock 未就绪（8981）') }

  try {
    const probe = spawn('bun', ['run', C41_PROBE], {
      cwd: REPO,
      env: {
        ...process.env,
        ATLAS_E2E_C41_REPO: REPO,
        ATLAS_E2E_C41_MOCK_BASE: 'http://127.0.0.1:8981/v1',
        ATLAS_E2E_C41_OUT: scenDir,
        ATLAS_E2E_C41_MOCKLOG: join(scenDir, 'mock', 'c4-midstream-requests.jsonl'),
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    const code = await new Promise<number>((res) => probe.on('exit', (c) => res(c ?? -1)))
    console.log(`[c4] c4-1-provider probe exit=${code}`)
    return readC41Probes(scenDir)
  } finally {
    mock.kill()
  }
}

// ── C4-2：PTY 主循环探针（非流式 chat 面；mock 8982 backoff，drop 前 2 次）──
async function runC42(): Promise<{ probes: Probe[], mainCalls: number[], gaps: number[] }> {
  const scenDir = join(OUT, 'c4-2-backoff')
  rmSync(scenDir, { recursive: true, force: true })
  mkdirSync(join(scenDir, 'mock'), { recursive: true })
  const home = join(scenDir, 'home')
  const ws = join(scenDir, 'ws')
  mkdirSync(ws, { recursive: true })
  buildSandboxHome(home, 'http://127.0.0.1:8982/v1')

  const mock = spawn('python3', [MOCK_PY, join(scenDir, 'mock'), '--mode', 'backoff', '--port', '8982'],
    { stdio: ['ignore', 'ignore', 'inherit'] })
  const ready = await waitPort(8982, 15_000)
  console.log(`[c4] c4-2-backoff mock ready=${ready} port=8982`)
  if (!ready) { mock.kill(); throw new Error('c4-2 mock 未就绪（8982）') }

  const pty = await GenericPty.start({
    logPath: join(scenDir, 'pty.log'),
    workspace: ws,
    cmd: `bun run ${join(REPO, 'src/atlascode/cli.ts')} --dangerously-skip-permissions`,
    home,
    unset: ['CLAUDECODE'],
    readySubs: ['▶ default', '▶ acceptEdits', '▶ plan'],
    readyMs: 90_000,
  })
  try {
    const b = await pty.waitAnySince(['Yes, I accept'], 20_000)
    if (b.ok) {
      await sleep(1_500)
      pty.sendRaw('2')
      await sleep(800)
      pty.sendRaw('\r')
      const repl = await pty.waitAnySince(['▶ default', '▶ acceptEdits', '▶ plan'], 20_000)
      console.log(`[c4] c4-2-backoff bypass accepted=${repl.ok}`)
    }
    await sleep(5_000) // mock 无 MCP 连接面，短 settle
    pty.send(`Reply with exactly the text: C4LIVE-058 PONG-C4. Output nothing else.`)
    // 回合完成判据（session 落盘面，防 pty 屏面输入回显假阳）：
    // end_turn 或 assistant 条目含 PONG-C4
    const doneRe = (st: string) => st.includes('"stop_reason":"end_turn"') || sessionAssistantHas(st, 'PONG-C4')
    const t0 = Date.now()
    for (;;) {
      const f = latestSessionFile(home)
      const st = f ? readFileSync(f, 'utf8') : ''
      if (doneRe(st)) break
      if (Date.now() - t0 > 180_000) break
      await sleep(1_000)
    }
    await sleep(2_000)
    const sessFile = latestSessionFile(home)
    const sessText = sessFile ? readFileSync(sessFile, 'utf8') : ''
    const ptyText = pty.text()
    writeFileSync(join(scenDir, 'session.jsonl.snapshot'), sessText)
    writeFileSync(join(scenDir, 'pty.snapshot.txt'), ptyText)

    const mainRows = readMockLog(join(scenDir, 'mock'), 'backoff').filter((r) => r.main)
    const mainCalls = mainRows.map((r) => r.call_no)
    const ts = mainRows.map((r) => r.ts)
    const gaps = ts.slice(1).map((t, i) => (t - ts[i]) * 1000) // ms
    const g0 = gaps[0], g1 = gaps[1]
    // provider 3 次预算（maxRetriesPerModel=3）：call1 瞬断(C4-2 退避 500) → call2 瞬断(退避 1000)
    // → call3 成功（mock drop 前 2 次 / 第 3 次起 PONG-C4）= 全在 provider 预算内，
    // 无跨层 turnRecovery（#262 既有层）重发混淆。前两段间隔 = C4-2 指数退避面。
    const budgetIn = mainCalls.length >= 3
    const monotonic = budgetIn && g0 < g1
    const inBand = budgetIn && g0 >= 300 && g0 <= 700 && g1 >= 700 && g1 <= 1400 // ≈500 / ≈1000 ± 环境容差
    const completed = sessionAssistantHas(sessText, 'PONG-C4')

    const probes: Probe[] = [
      { id: 'C42-retry-count', hard: true, ok: budgetIn, detail: `mock 主循环请求 = ${mainCalls.length}（判据 ≥ 3 = drop 2 次 + 第 3 次成功 = provider 预算 3 次重试不变）` },
      { id: 'C42-backoff-monotonic', hard: true, ok: monotonic, detail: `前两段 attempt 间隔（ms）= [${g0 != null ? Math.round(g0) : '?'}, ${g1 != null ? Math.round(g1) : '?'}]（判据 = 单调递增 = C4-2 指数退避活面；provider 预算内，非跨层面）` },
      { id: 'C42-backoff-band', hard: true, ok: inBand, detail: `间隔带 g0∈[300,700](≈500=base) + g1∈[700,1400](≈1000=base×2) = ${inBand ? '在场' : '出带（定因分流）'}` },
      { id: 'C42-pong-completed', hard: true, ok: completed, detail: `PONG-C4 完成面（预算内恢复，I2 不静默丢；session assistant 条路面）= ${completed ? '在场' : '缺失'}` },
      { id: 'C42-session-materialized', hard: true, ok: sessText.length > 0, detail: `session 落盘（${sessText.length} 字符）` },
    ]
    return { probes, mainCalls, gaps }
  } finally {
    pty.kill()
    mock.kill()
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  const report: any = { ts: new Date().toISOString(), repo: REPO, scenarios: {} }

  const c41 = await runC41()
  const c41HardFail = c41.probes.filter((p) => p.hard && p.ok === false).length
  report.scenarios.c41 = { probes: c41.probes, hardFail: c41HardFail, verdict: c41HardFail === 0 ? 'PASS' : 'FAIL' }

  const c42 = await runC42()
  const c42HardFail = c42.probes.filter((p) => p.hard && p.ok === false).length
  report.scenarios.c42 = { probes: c42.probes, hardFail: c42HardFail, verdict: c42HardFail === 0 ? 'PASS' : 'FAIL' }

  const total = c41HardFail + c42HardFail
  report.verdict = total === 0 ? 'PASS' : `FAIL（hardFail=${total}）`
  writeFileSync(join(OUT, 'result.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({
    verdict: report.verdict,
    c41: report.scenarios.c41?.verdict,
    c42: report.scenarios.c42?.verdict,
    c41_probes: report.scenarios.c41?.probes.map((p: Probe) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`).join(' '),
    c42_probes: report.scenarios.c42?.probes.map((p: Probe) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`).join(' '),
    c42_gaps_ms: c42.gaps.map((g) => Math.round(g)),
  }, null, 1))
  console.log(`C4-LOOP-058 ${report.verdict} → ${OUT}`)
}

main().catch((e) => { console.error('C4-LOOP-058 ERROR', e); process.exit(1) })
