/**
 * loop 鲁棒性 — 缺口修复「一枪验」gate（修后一跑即判，模型无关）。
 *
 * 角色：Main（AtlasCode 架构实施Main）在 worktree-loop-robustness 落两个缺口修复
 *   → 本 gate 逐项验收（atlas-user-e2e）。每项 = 一个可判 PASS/FAIL 的模型无关信号，
 *   不依赖 deepseek-v4-pro 的任务完成能力（隔离「loop 生命周期 + 接线」层）。
 *
 * 五项（①-③ 对应 Main 的 ①②③ / FINDINGS 缺口#2/#1/#3；④⑤ 对应 2026-10-04 新缺口#4/#5）：
 *   headless   缺口①（本 #2）headless/CLI 车道全局崩溃兜底不对称
 *              —— 修后 headless -p 入口链应注册全局 uncaughtException/unhandledRejection。
 *              信号（静态，模型无关）：headless 入口链（src/cli/** + src/atlascode/cli.ts）
 *              内出现 handler 注册（setupGracefulShutdown 调用 / process.on('uncaughtException')
 *              / process.on('unhandledRejection')）。pre-fix=0 命中(FAIL)，post-fix=≥1(PASS)。
 *              行为面（crash 存活）= Main 的 live 复现 + 本 gate 重跑，静态验的是「接线」。
 *   turnrecover 缺口②（本 #1）loop 无回合级错误恢复（残留守 E-1b-full）
 *              —— 注一段有限 5xx 风暴（前 N 次 500，之后 nominal）：
 *              pre-fix：loop 在风暴内单回合丢弃整任务（proxy 调用数 ≪ N，is_error，非崩）。
 *              post-fix：loop 有界恢复、穿越风暴窗口继续（proxy 调用数 ≥ N）。
 *              信号（模型无关）= proxy chat 调用数是否「穿越风暴窗口」（不看任务完成质量）。
 *   timeoutlane 缺口③（本 #3）settings llmTimeoutMs 死键 + headless 设置源缝未接
 *              —— headless -p 起真进程，沙箱 settings 写 llmTimeoutMs=小值（如 8000），
 *              注障代理给每个 chat 注 大 delay（如 15s ≫ 8s 超时）。pre-fix：settings 档死
 *              → 超时不触发、任务跑完（proxy 把 delay 等完，ms ≈ delay+模型时延 ≥ 15s）。
 *              post-fix：settings 档活 → 8s 掐断（proxy 只 1 call，result 含 Request timed out）。
 *              信号（模型无关）= 超时是否在 delay 窗内触发（不看模型态，就看 client 掐断时间）。
 *   droprecover 缺口④（新 #4）连接重置断连不重试
 *              —— 第 1 次 chat 注 drop（ECONNRESET）：pre-fix 判不可重试 → 227ms 内
 *              error_during_execution（proxyCalls=1）。post-fix 认连接错可重试 → 穿越
 *              断连窗口继续（proxyCalls≥2）。信号 = proxy chat 调用数。
 *   emptyretry  缺口⑤（新 #5）空 0-0 被 provider 占位符绕过 loop 空检测
 *              —— 第 2 次 chat 注 empty 空 0-0：pre-fix 占位文本 "(provider: empty response)"
 *              使 loop 判非空 → 无有界重试、假 success 提前终（proxyCalls=2）。post-fix 空被
 *              真检测 → 1 次有界重试（proxyCalls≥3）。信号 = proxy chat 调用数。
 *
 * 用法（指向 Main 的 worktree；缺省 master）：
 *   ATLAS_E2E_REPO=/home/vince/projects/AtlasCode/worktrees/worktree-loop-robustness \
 *   bun run user-e2e/loop-robustness/verify-fixes.ts headless        # 缺口① 静态接线
 *   ... verify-fixes.ts turnrecover --expect post                    # 缺口② 修后：应穿越风暴
 *   ... verify-fixes.ts turnrecover --expect pre                     # 缺口② pre-fix 基线：应中断
 *   ... verify-fixes.ts timeoutlane --expect post                    # 缺口③ 修后：settings 档应触发超时
 *   ... verify-fixes.ts droprecover --expect post                    # 缺口④ 修后：断连应被重试穿越
 *   ... verify-fixes.ts emptyretry --expect post                     # 缺口⑤ 修后：空 0-0 应触发有界重试
 *   ... verify-fixes.ts all --expect post
 *   阈值可用 ATLAS_E2E_LB_STORM_N 覆写（默认 40，须 > provider 3 次重试预算）。
 *   timeoutlane 超时档 ATLAS_E2E_TUI_TIMEOUT_MS（默认 8000）、delay DETOUR_MS（默认 15000）。
 * 全 I/O 落 user-e2e/loop-robustness/。
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { startFaultProxy, type FaultPlan, type ProxyHandle } from './fault-proxy'

const REPO = process.env.ATLAS_E2E_REPO ?? '/home/vince/projects/AtlasCode'
const ROOT = '/home/vince/projects/AtlasCode/user-e2e/loop-robustness'
const ART = join(ROOT, 'artifacts')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas', 'settings.json')
const MODEL = process.env.ATLAS_E2E_LB_MODEL ?? 'Qwen38-27B-TXT' // 2026-10-10 0.1.49 gate：云 Coding Plan 月配额 429 阻塞（deepseek-v4-pro 路由实测 429）→ 默认本地 Qwen38-27B-TXT（docker 8007，IFF 8999 本地路由）；可 env 覆写（ATLAS_E2E_LB_MODEL=deepseek-v4-pro 回切）；工作树交付物，不 commit（commit 归 Main；恢复口径 = F-1 云配额恢复后裁定）
const TARGET = 'http://127.0.0.1:8999'
const LB_PORT = Number(process.env.ATLAS_E2E_LB_PORT ?? '8998')
const STORM_N = Number(process.env.ATLAS_E2E_LB_STORM_N ?? '40')

// 多步 coding 任务（与 harness.ts 一致；turnrecover 只关心「loop 是否穿越风暴窗口」，不看完成质量）
const TASK = [
  'In this workspace, do all of the following in order and report briefly after each step:',
  '1) Create lib/math.js that exports add(a,b,c=0), sub(a,b), mul(a,b).',
  '2) Create lib/stats.js that exports mean(arr) and max(arr).',
  '3) Create lib/app.js that imports both and computes a value; print the final number.',
  '4) Create lib/run.test.js that requires the modules and prints "ALL TESTS PASSED" if consistent.',
  '5) Run `node lib/run.test.js` via Bash.',
  '6) Stop once "ALL TESTS PASSED" is printed.',
].join('\n')

function setupWs(sc: string): string {
  const ws = join(ROOT, 'workspaces', `verify-${sc}`)
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  return ws
}

async function seedHome(home: string, proxyPort: number): Promise<void> {
  rmSync(home, { recursive: true, force: true })
  const atlasDir = join(home, '.atlas')
  mkdirSync(atlasDir, { recursive: true })
  const raw: any = JSON.parse(readFileSync(REAL_SETTINGS, 'utf8'))
  delete raw.enabledPlugins; delete raw.enabledMcpServers; delete raw.extraKnownMarketplaces
  raw.providers = raw.providers ?? {}
  raw.providers.iff = { ...(raw.providers.iff ?? {}), baseURL: `http://127.0.0.1:${proxyPort}/v1` }
  for (const role of ['small', 'fast', 'premium']) {
    raw.modelRoles = raw.modelRoles ?? {}
    raw.modelRoles[role] = { provider: 'iff', models: [{ model: `iff/${MODEL}` }] }
  }
  raw.model = MODEL
  writeFileSync(join(atlasDir, 'settings.json'), JSON.stringify(raw, null, 2))
}

/** headless 跑一遍（供 turnrecover）。返回 proxy 调用数 + is_error + crashed。 */
async function runHeadlessStorm(runDir: string, proxyPort: number): Promise<{
  proxyCalls: number; isError: boolean; crashed: boolean; ms: number; stdout: string; stderr: string
}> {
  const ws = setupWs('turnrecover')
  const home = join(ROOT, 'home', 'verify-turnrecover')
  await seedHome(home, proxyPort)
  let proxy: ProxyHandle
  try {
    proxy = await startFaultProxy({
      port: proxyPort, target: TARGET,
      plan: { kind: 'firstN', n: STORM_N, fault: '500' } as FaultPlan,
      logPath: join(runDir, 'turnrecover.proxy.log'),
    })
  } catch (e: any) {
    throw new Error(`proxy 启动失败: ${e?.message}`)
  }
  const child: ChildProcess = spawn(
    'bun', ['run', join(REPO, 'src/atlascode/cli.ts'), '-p', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'],
    { cwd: ws, env: { ...process.env, HOME: home }, detached: true, stdio: ['pipe', 'pipe', 'pipe'] },
  )
  let out = ''; let err = ''
  child.stdout?.on('data', d => { out += d.toString() })
  child.stderr?.on('data', d => { err += d.toString() })
  child.stdin?.write(TASK); child.stdin?.end()
  const t0 = Date.now()
  await new Promise<void>(resolve => {
    const cap = setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL') } catch { /* gone */ } }, 300_000)
    child.on('exit', () => { clearTimeout(cap); resolve() })
  })
  const proxyCalls = proxy.calls()
  proxy.stop()
  await new Promise(r => setTimeout(r, 500))
  const events: any[] = []
  for (const line of out.split('\n')) { const s = line.trim(); if (!s.startsWith('{')) continue; try { events.push(JSON.parse(s)) } catch { /* skip */ } }
  const result = [...events].reverse().find(e => e?.type === 'result') ?? null
  const isError = Boolean(result?.is_error)
  const crashed = /uncaught[- ]?(exception|rejection)|unhandled[- ]?rejection/i.test(err)
  try { writeFileSync(join(runDir, 'turnrecover.log'), `STDOUT:\n${out}\n\nSTDERR:\n${err}\n`) } catch { /* best effort */ }
  return { proxyCalls, isError, crashed, ms: Date.now() - t0, stdout: out, stderr: err }
}

/** 完成判据（evidence 用，非 gate 判据——gate 判据 = proxyCalls 模型无关信号）。 */
function diskCheck(ws: string): { ok: boolean; evidence: string } {
  const need = ['lib/math.js', 'lib/stats.js', 'lib/app.js', 'lib/run.test.js']
  const missing = need.filter(f => !existsSync(join(ws, f)))
  if (missing.length) return { ok: false, evidence: `missing: ${missing.join(', ')}` }
  try {
    const r = spawnSync('node', [join(ws, 'lib/run.test.js')], { encoding: 'utf8', timeout: 30_000 })
    const out = (r.stdout + r.stderr).trim()
    const ok = out.includes('ALL TESTS PASSED')
    return { ok, evidence: ok ? 'ALL TESTS PASSED (实跑通过)' : `test 输出无 PASS: "${out.slice(-160)}"` }
  } catch (e: any) {
    return { ok: false, evidence: `test 实跑异常: ${e?.message}` }
  }
}

/** headless 跑一遍（任意 fault plan，供 droprecover/emptyretry）。返回 proxy 调用数 + 完成判据。 */
async function runHeadlessFault(sc: string, plan: FaultPlan, runDir: string, proxyPort: number): Promise<{
  proxyCalls: number; isError: boolean; crashed: boolean; ms: number; completed: boolean; diskEvidence: string
}> {
  const ws = setupWs(sc)
  const home = join(ROOT, 'home', `verify-${sc}`)
  await seedHome(home, proxyPort)
  let proxy: ProxyHandle
  try {
    proxy = await startFaultProxy({ port: proxyPort, target: TARGET, plan, logPath: join(runDir, `${sc}.proxy.log`) })
  } catch (e: any) {
    throw new Error(`proxy 启动失败: ${e?.message}`)
  }
  const child: ChildProcess = spawn(
    'bun', ['run', join(REPO, 'src/atlascode/cli.ts'), '-p', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'],
    { cwd: ws, env: { ...process.env, HOME: home }, detached: true, stdio: ['pipe', 'pipe', 'pipe'] },
  )
  let out = ''; let err = ''
  child.stdout?.on('data', d => { out += d.toString() })
  child.stderr?.on('data', d => { err += d.toString() })
  child.stdin?.write(TASK); child.stdin?.end()
  const t0 = Date.now()
  await new Promise<void>(resolve => {
    const cap = setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL') } catch { /* gone */ } }, 300_000)
    child.on('exit', () => { clearTimeout(cap); resolve() })
  })
  const proxyCalls = proxy.calls()
  proxy.stop()
  await new Promise(r => setTimeout(r, 500))
  const events: any[] = []
  for (const line of out.split('\n')) { const s = line.trim(); if (!s.startsWith('{')) continue; try { events.push(JSON.parse(s)) } catch { /* skip */ } }
  const result = [...events].reverse().find(e => e?.type === 'result') ?? null
  const isError = Boolean(result?.is_error)
  const crashed = /uncaught[- ]?(exception|rejection)|unhandled[- ]?rejection/i.test(err)
  const dc = diskCheck(ws)
  try { writeFileSync(join(runDir, `${sc}.log`), `STDOUT:\n${out}\n\nSTDERR:\n${err}\n`) } catch { /* best effort */ }
  return { proxyCalls, isError, crashed, ms: Date.now() - t0, completed: dc.ok, diskEvidence: dc.evidence }
}

// ── 缺口① headless：静态接线（模型无关，不 spawn） ─────────────────────
const REGEX = /setupGracefulShutdown|process\.on\(['"]uncaughtException['"]|process\.on\(['"]unhandledRejection['"]/
function collectFiles(dir: string, exts: string[] = ['.ts', '.tsx']): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name)
    if (name.isDirectory()) out.push(...collectFiles(p, exts))
    else if (exts.includes(`.${name.name.split('.').pop()}`)) out.push(p)
  }
  return out
}
function checkHeadlessWiring(): { pass: boolean; hits: string[]; scanned: number } {
  const roots = [join(REPO, 'src', 'cli'), join(REPO, 'src', 'atlascode', 'cli.ts')]
  const files: string[] = []
  for (const r of roots) {
    if (r.endsWith('.ts')) files.push(r)
    else files.push(...collectFiles(r))
  }
  const hits: string[] = []
  for (const f of files) {
    let src = ''
    try { src = readFileSync(f, 'utf8') } catch { continue }
    const lines = src.split('\n')
    lines.forEach((ln, i) => { if (REGEX.test(ln)) hits.push(`${f.replace(REPO, '')}:${i + 1}: ${ln.trim().slice(0, 90)}`) })
  }
  return { pass: hits.length > 0, hits, scanned: files.length }
}

// ── 缺口③ timeoutlane：settings llmTimeoutMs 档是否真触发 ─────────────
const DETOUR_MS = Number(process.env.ATLAS_E2E_TUI_TIMEOUT_MS ?? '8000')
const DELAY_MS = Number(process.env.ATLAS_E2E_TUI_DELAY_MS ?? '15000')

async function runTimeoutLane(runDir: string, proxyPort: number, expect: string): Promise<{ pass: boolean; detail: string }> {
  const ws = setupWs('timeoutlane')
  const home = join(ROOT, 'home', 'verify-timeoutlane')
  await seedHome(home, proxyPort)
  // 关键：在 seedHome 之后把 llmTimeoutMs 写进沙箱 settings（settings 档，非 env）
  const atlasSettings = join(home, '.atlas', 'settings.json')
  const s: any = JSON.parse(readFileSync(atlasSettings, 'utf8'))
  s.llmTimeoutMs = DETOUR_MS
  writeFileSync(atlasSettings, JSON.stringify(s, null, 2))
  let proxy: ProxyHandle
  try {
    proxy = await startFaultProxy({
      port: proxyPort, target: TARGET,
      plan: { kind: 'always', fault: 'delay', delayMs: DELAY_MS } as FaultPlan,
      logPath: join(runDir, 'timeoutlane.proxy.log'),
    })
  } catch (e: any) {
    throw new Error(`proxy 启动失败: ${e?.message}`)
  }
  const t0 = Date.now()
  // 注意：故意不设 ATLAS_LLM_TIMEOUT env（测 settings 档，非 env 档）；HOME 必须合进 env（否则落到真实 settings/真实 provider）
  const cleanEnv: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (k === 'ATLAS_LLM_TIMEOUT') continue
    if (v !== undefined) cleanEnv[k] = v
  }
  cleanEnv.HOME = home
  const child: ChildProcess = spawn(
    'bun', ['run', join(REPO, 'src/atlascode/cli.ts'), '-p', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'],
    { cwd: ws, env: cleanEnv, detached: true, stdio: ['pipe', 'pipe', 'pipe'] },
  )
  let out = ''; let err = ''
  child.stdout?.on('data', d => { out += d.toString() })
  child.stderr?.on('data', d => { err += d.toString() })
  child.stdin?.write('说一个词'); child.stdin?.end()
  await new Promise<void>(resolve => {
    const cap = setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL') } catch { /* gone */ } }, 90_000)
    child.on('exit', () => { clearTimeout(cap); resolve() })
  })
  const ms = Date.now() - t0
  const proxyCalls = proxy.calls()
  proxy.stop()
  await new Promise(r => setTimeout(r, 500))
  const timedOut = /Request timed out|timed out|超时/i.test(out + err)
  // 判据（模型无关）：settings 档活 → 客户端在 delay 窗（DELAY_MS）内掐断 → ms < DELAY_MS 且 proxCralls 少（≤1）
  //      settings 档死 → proxy 把 delay 等完 → ms ≥ DELAY_MS（实测 ~delay+模型时延）
  const laneFired = timedOut && ms < DELAY_MS
  const wantFire = expect === 'post'
  const pass = wantFire ? laneFired : !laneFired
  try { writeFileSync(join(runDir, 'timeoutlane.log'), `STDOUT:\n${out}\n\nSTDERR:\n${err}\n`) } catch { /* best effort */ }
  const detail = `${pass ? 'PASS' : 'FAIL'}（expect=${expect}）settings llmTimeoutMs=${DETOUR_MS}ms + proxy delay=${DELAY_MS}ms ` +
    `→ ${laneFired ? `8s 窗内掐断（settings 档活，ms=${ms} proxyCalls=${proxyCalls}）` : `超时未触发（settings 档死，ms=${ms}≥${DELAY_MS} proxyCalls=${proxyCalls}）`}；out 含 timedout=${timedOut}`
  return { pass, detail }
}

// ── 主流程 ────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2)
  const which = argv.find(a => !a.startsWith('--')) ?? 'all'
  const expect = argv.includes('--expect') ? argv[argv.indexOf('--expect') + 1] : 'post'
  const runDir = join(ART, `verify-${which}-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`)
  mkdirSync(runDir, { recursive: true })
  const verdicts: Record<string, { pass: boolean; detail: string }> = {}

  if (which === 'headless' || which === 'all') {
    const r = checkHeadlessWiring()
    verdicts['headless'] = {
      pass: r.pass,
      detail: `${r.pass ? 'PASS' : 'FAIL'} 命中 ${r.hits.length} 处（扫描 ${r.scanned} 文件，根=src/cli/** + src/atlascode/cli.ts）：\n  ` +
        (r.hits.length ? r.hits.map(h => h).join('\n  ') : '(无) → headless 入口链仍缺全局崩溃兜底（缺口①未修 / pre-fix 基线）'),
    }
    process.stderr.write(`[headless] ${r.pass ? '✅ PASS' : '❌ FAIL'} — headless 入口链全局崩溃兜底接线\n`)
  }

  if (which === 'turnrecover' || which === 'all') {
    const r = await runHeadlessStorm(runDir, LB_PORT)
    const recovered = r.proxyCalls >= STORM_N
    const wantRecover = expect === 'post'
    const pass = wantRecover ? recovered : !recovered
    verdicts['turnrecover'] = {
      pass,
      detail: `${pass ? 'PASS' : 'FAIL'}（expect=${expect}）proxy 调用数=${r.proxyCalls}（风暴窗口 N=${STORM_N}）` +
        ` → ${recovered ? '穿越风暴窗口（loop 有界恢复）' : '风暴内中断（无回合级恢复）'}；isError=${r.isError} crashed=${r.crashed} ms=${r.ms}`,
    }
    process.stderr.write(`[turnrecover] proxyCalls=${r.proxyCalls} (N=${STORM_N}) recovered=${recovered} expect=${expect} → ${pass ? '✅ PASS' : '❌ FAIL'}\n`)
  }

  if (which === 'timeoutlane' || which === 'all') {
    const r = await runTimeoutLane(runDir, LB_PORT, expect)
    verdicts['timeoutlane'] = r
    process.stderr.write(`[timeoutlane] settings llmTimeoutMs=${DETOUR_MS}ms + delay=${DELAY_MS}ms → ${r.pass ? '✅ PASS' : '❌ FAIL'}\n`)
  }

  // ── 缺口④ droprecover：连接重置断连须被重试（isRetryableError 认 APIConnectionError）──
  //    pre-fix 基线（已锁，R1-drop-transient）：proxyCalls=1、isError=true、tasks 227ms 内 error_during_execution。
  //    post-fix 判据：proxyCalls ≥ 2（drop 后至少再来 1 次 nominal = 断连被重试穿越）。
  if (which === 'droprecover' || which === 'all') {
    const r = await runHeadlessFault('droprecover', { kind: 'firstN', n: 1, fault: 'drop' } as FaultPlan, runDir, LB_PORT)
    const recovered = r.proxyCalls >= 2
    const wantRecover = expect === 'post'
    const pass = wantRecover ? recovered : !recovered
    verdicts['droprecover'] = {
      pass,
      detail: `${pass ? 'PASS' : 'FAIL'}（expect=${expect}）proxy 调用数=${r.proxyCalls}（断连窗口 firstN=1）` +
        ` → ${recovered ? '断连被重试穿越（连接错判可重试）' : '断连未重试（连接错判不可重试→整任务死）'}；isError=${r.isError} completed=${r.completed}(${r.diskEvidence}) ms=${r.ms}`,
    }
    process.stderr.write(`[droprecover] proxyCalls=${r.proxyCalls} recovered=${recovered} expect=${expect} → ${pass ? '✅ PASS' : '❌ FAIL'}\n`)
  }

  // ── 缺口⑤ emptyretry：空 0-0 须触发 loop 有界重试（provider 不再塞 "(provider: empty response)" 占位）──
  //    pre-fix 基线（已锁，R1-empty-bounded）：proxyCalls=2、假 success 提前终止（无 call=3）。
  //    post-fix 判据：proxyCalls ≥ 3（call=3 发出 = 空 0-0 触发 1 次有界重试）。
  if (which === 'emptyretry' || which === 'all') {
    const r = await runHeadlessFault('emptyretry', { kind: 'at', at: 2, fault: 'empty' } as FaultPlan, runDir, LB_PORT)
    const recovered = r.proxyCalls >= 3
    const wantRecover = expect === 'post'
    const pass = wantRecover ? recovered : !recovered
    verdicts['emptyretry'] = {
      pass,
      detail: `${pass ? 'PASS' : 'FAIL'}（expect=${expect}）proxy 调用数=${r.proxyCalls}（空 fault at=2）` +
        ` → ${recovered ? '空 0-0 触发有界重试（call=3 发出）' : '空 0-0 未重试（被占位符绕过→假 success 提前终）'}；isError=${r.isError} completed=${r.completed}(${r.diskEvidence}) ms=${r.ms}`,
    }
    process.stderr.write(`[emptyretry] proxyCalls=${r.proxyCalls} recovered=${recovered} expect=${expect} → ${pass ? '✅ PASS' : '❌ FAIL'}\n`)
  }

  writeFileSync(join(runDir, 'result.json'), JSON.stringify({ which, expect, repo: REPO, verdicts }, null, 2))
  const allPass = Object.values(verdicts).every(v => v.pass)
  process.stderr.write(`\n[verify-fixes] ${which} 判定=${allPass ? 'ALL-PASS' : 'HAS-FAIL'} → ${runDir}\n`)
  process.exit(allPass ? 0 : 1)
}

main().catch(e => { console.error('[verify-fixes] fatal:', e); process.exit(1) })
