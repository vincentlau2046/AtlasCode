/**
 * loop 鲁棒性 R2 soak（I5 无退化）：长跑——单一 session 连续多步 coding 任务
 * （N 模块 + 聚合 + 测试实跑），采样 CLI 进程 RSS 曲线，判「无退化」：
 *   ① 任务最终完成（diskCheck 实跑 node 测试 ALL TESTS PASSED）
 *   ② 不崩（stderr 无 uncaught/unhandled）
 *   ③ RSS 无界增长（泄漏）检测：峰值不超绝对上限 + 增长因子上限
 *
 * 模型对齐 iff/deepseek-v4-pro，直连网关 8999（无注障——soak 不需要故障注入），
 * 真实产品路径 + 沙箱 HOME（真实 ~/.atlas 零写）。全部 I/O 落 user-e2e/loop-robustness/。
 *
 * 用法：
 *   bun run user-e2e/loop-robustness/soak.ts [--modules N] [--cap-ms T] [--sample-ms S]
 *   缺省 N=20 模块、cap=20min、每 5s 采一次 RSS。
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const REPO = process.env.ATLAS_E2E_REPO ?? '/home/vince/projects/AtlasCode'
const ROOT = '/home/vince/projects/AtlasCode/user-e2e/loop-robustness'
const ART = join(ROOT, 'artifacts')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas', 'settings.json')
const MODEL = 'deepseek-v4-pro'
const TARGET = 'http://127.0.0.1:8999'

function argVal(name: string, def: string): string {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}
const N_MODULES = Number(argVal('--modules', '20'))
const CAP_MS = Number(argVal('--cap-ms', String(20 * 60_000)))
const SAMPLE_MS = Number(argVal('--sample-ms', '5000'))
// I5 判据（宽松网只捕灾难级泄漏/暴涨，非零容忍增长——正常上下文累积允许缓慢爬升）
const RSS_CEILING_KB = 4 * 1024 * 1024 // 4 GB 绝对上限
const RSS_GROWTH_FACTOR = 4 // 峰值 vs 首个稳定采样 的增长因子上限

/** 生成 soak 任务：N 模块 + 聚合 + 测试，强制「多回合工具调用」的长跑负载。 */
function makeSoakTask(n: number): string {
  const mods = Array.from({ length: n }, (_, i) => `m${i}`)
  const steps = mods.map(
    (m, i) =>
      `Create lib/${m}.js exporting f${i}(x) returning x+${i}. (${i + 1}/${n})`,
  )
  return [
    'In this workspace, do ALL of the following in order, one file at a time, and keep going until the final test passes:',
    ...steps,
    `Create lib/agg.js that imports every module in lib/ and exports total(x)=f0(x)+f1(x)+...+f${n - 1}(x).`,
    `Create lib/run.test.js that requires lib/agg.js, asserts total(0) equals ${((n - 1) * n) / 2} and that f{k}(0) === k holds for each k in 0..${n - 1}, and prints exactly "ALL TESTS PASSED" if all assertions hold.`,
    `Run \`node lib/run.test.js\` via Bash and confirm it prints "ALL TESTS PASSED".`,
    'Stop once "ALL TESTS PASSED" is printed.',
  ].join('\n')
}

/** 完成判据（与 harness 一致）：聚合 + 测试文件都在，且 node 实跑打印 ALL TESTS PASSED。 */
function diskCheck(ws: string, n: number): { ok: boolean; evidence: string } {
  const need = ['lib/agg.js', 'lib/run.test.js']
  const missing = need.filter(f => !existsSync(join(ws, f)))
  if (missing.length) return { ok: false, evidence: `missing: ${missing.join(', ')}` }
  const r = spawnSync('node', [join(ws, 'lib/run.test.js')], { encoding: 'utf8', timeout: 30_000 })
  const out = (r.stdout + r.stderr).trim()
  const ok = out.includes('ALL TESTS PASSED')
  return { ok, evidence: ok ? 'ALL TESTS PASSED (实跑通过)' : `test 输出无 PASS: "${out.slice(-160)}"` }
}

async function seedHome(home: string, baseURL: string): Promise<void> {
  rmSync(home, { recursive: true, force: true })
  const atlasDir = join(home, '.atlas')
  mkdirSync(atlasDir, { recursive: true })
  const raw: any = JSON.parse(readFileSync(REAL_SETTINGS, 'utf8'))
  delete raw.enabledPlugins; delete raw.enabledMcpServers; delete raw.extraKnownMarketplaces
  raw.providers = raw.providers ?? {}
  raw.providers.iff = { ...(raw.providers.iff ?? {}), baseURL }
  for (const role of ['small', 'fast', 'premium']) {
    raw.modelRoles = raw.modelRoles ?? {}
    raw.modelRoles[role] = { provider: 'iff', models: [{ model: `iff/${MODEL}` }] }
  }
  raw.model = MODEL
  writeFileSync(join(atlasDir, 'settings.json'), JSON.stringify(raw, null, 2))
}

function setupWs(sc: string): string {
  const ws = join(ROOT, 'workspaces', sc)
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  // 0.1.89 判据面修正（同 harness.ts setupWs：种 commonjs 消除 repo 链 ESM
  // 解析噪声——086 R1-delay RED×4 假阳性定谳根因，diskCheck 精确名判别力保持）。
  writeFileSync(join(ws, 'package.json'), JSON.stringify({ name: 'looprob-ws', private: true, type: 'commonjs' }, null, 2))
  return ws
}

/** 读单进程 RSS（KB）。失败/结束 = 0（进程已退，采样自然停）。 */
function pidRssKb(pid: number): number {
  try {
    const out = spawnSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).stdout
    const kb = Number((out.trim().split('\n').pop() ?? '').trim())
    return Number.isFinite(kb) && kb > 0 ? kb : 0
  } catch {
    return 0
  }
}

/** 汇总进程及其后代 RSS（KB）——工具子进程（node test 等）瞬态也计入。 */
function treeRssKb(pid: number): number {
  let sum = pidRssKb(pid)
  let children = ''
  try {
    children = spawnSync('ps', ['-o', 'pid=', '--ppid', String(pid)], { encoding: 'utf8' }).stdout
  } catch { /* best effort */ }
  for (const line of children.split('\n')) {
    const c = line.trim()
    if (c && Number(c) !== pid) sum += treeRssKb(Number(c))
  }
  return sum
}

interface SoakResult {
  completed: boolean
  killed: boolean
  crashed: boolean
  ms: number
  samples: { t: number; leaderRssKb: number; treeRssKb: number }[]
  leaderRss: { first: number; min: number; peak: number; final: number }
  treeRss: { first: number; min: number; peak: number; final: number }
  i5_noDegradation: boolean
  evidence: string
}

async function runSoak(runDir: string): Promise<SoakResult> {
  const sc = 'soak'
  const ws = setupWs(sc)
  const home = join(ROOT, 'home', sc)
  await seedHome(home, `${TARGET}/v1`)
  const task = makeSoakTask(N_MODULES)
  const args = [
    'run', join(REPO, 'src/atlascode/cli.ts'), '-p',
    '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions',
    '--debug-to-stderr',
  ]
  const child: ChildProcess = spawn('bun', args, {
    cwd: ws, env: { ...process.env, HOME: home }, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
  })
  let out = ''; let err = ''
  child.stdout?.on('data', d => { out += d.toString() })
  child.stderr?.on('data', d => { err += d.toString() })
  child.stdin?.write(task); child.stdin?.end()

  const t0 = Date.now()
  const samples: SoakResult['samples'] = []
  const sampler = setInterval(() => {
    if (!child.pid) return
    samples.push({ t: Date.now() - t0, leaderRssKb: pidRssKb(child.pid), treeRssKb: treeRssKb(child.pid) })
  }, SAMPLE_MS)

  let killed = false
  const cap = setTimeout(() => { killed = true; try { process.kill(-child.pid!, 'SIGKILL') } catch { /* gone */ } }, CAP_MS)
  await new Promise<void>(resolve => child.on('exit', () => { clearTimeout(cap); clearInterval(sampler); resolve() }))
  const ms = Date.now() - t0

  const dc = diskCheck(ws, N_MODULES)
  const crashed = /uncaught[- ]?(exception|rejection)|unhandled[- ]?rejection/i.test(err)
  const finalSample = samples.length ? samples[samples.length - 1] : { t: ms, leaderRssKb: 0, treeRssKb: 0 }
  samples.push({ t: ms, leaderRssKb: 0, treeRssKb: 0 }) // 终点标记（进程已退 RSS=0）
  const leader = samples.filter(s => s.leaderRssKb > 0).map(s => s.leaderRssKb)
  const tree = samples.filter(s => s.treeRssKb > 0).map(s => s.treeRssKb)
  const stat = (a: number[]) => ({
    first: a.length ? a[0] : 0,
    min: a.length ? Math.min(...a) : 0,
    peak: a.length ? Math.max(...a) : 0,
    final: a.length ? a[a.length - 1] : 0,
  })
  const leaderRss = stat(leader)
  const treeRss = stat(tree)
  // I5：完成 + 不崩 + 峰值未超绝对上限 + 增长因子未超限
  const growthOk = leaderRss.peak <= RSS_CEILING_KB && leaderRss.peak <= Math.max(leaderRss.first, 1) * RSS_GROWTH_FACTOR
  const i5 = dc.ok && !crashed && !killed && growthOk
  const evidence = [
    dc.evidence,
    `leader RSS: first=${leaderRss.first}KB min=${leaderRss.min}KB peak=${leaderRss.peak}KB final=${leaderRss.final}KB`,
    `tree   RSS: first=${treeRss.first}KB min=${treeRss.min}KB peak=${treeRss.peak}KB final=${treeRss.final}KB`,
    `growthOk=${growthOk} (ceiling=${RSS_CEILING_KB}KB ×factor=${RSS_GROWTH_FACTOR}) killed=${killed} crashed=${crashed}`,
  ].join(' | ')
  try { writeFileSync(join(runDir, 'soak.log'), `STDOUT:\n${out}\n\nSTDERR:\n${err}\n`) } catch { /* best effort */ }
  return { completed: dc.ok, killed, crashed, ms, samples, leaderRss, treeRss, i5_noDegradation: i5, evidence }
}

async function main() {
  const runDir = join(ART, `soak-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  mkdirSync(runDir, { recursive: true })
  process.stderr.write(`[soak] 开始：N=${N_MODULES} 模块，cap=${CAP_MS}ms，每 ${SAMPLE_MS}ms 采 RSS\n`)
  const r = await runSoak(runDir)
  process.stderr.write(
    `[soak] completed=${r.completed} ms=${r.ms} crashed=${r.crashed} killed=${r.killed} ` +
      `samples=${r.samples.length - 1}\n[soak] ${r.evidence}\n`,
  )
  process.stderr.write(`[soak] I5_noDegradation=${r.i5_noDegradation}\n`)
  const res = {
    phase: 'R2-soak', model: MODEL, target: TARGET, nModules: N_MODULES,
    ...r, samples: r.samples,
  }
  writeFileSync(join(runDir, 'result.json'), JSON.stringify(res, null, 2))
  // 简单 ticket（与 harness 同风格）
  const L = [
    `# loop 鲁棒性 R2 soak 验收单（${new Date().toISOString()}）`,
    '', `- 模型对齐：${MODEL}；直连 ${TARGET}（无注障）`, `- 负载：${N_MODULES} 模块连续多步 coding 任务（单 session 长跑）`,
    `- 采样：每 ${SAMPLE_MS}ms 采 CLI 进程(leader)+树 RSS；cap=${CAP_MS}ms`,
    '', '## 结果', '```json', JSON.stringify({ completed: r.completed, killed: r.killed, crashed: r.crashed, ms: r.ms, leaderRss: r.leaderRss, treeRss: r.treeRss, i5_noDegradation: r.i5_noDegradation }, null, 2), '```',
    '', '## RSS 曲线（t_ms, leaderRssKb, treeRssKb）',
    ...r.samples.map(s => `- ${s.t} ${s.leaderRssKb} ${s.treeRssKb}`),
    '',
  ]
  writeFileSync(join(runDir, 'ticket.md'), L.join('\n'))
  process.stderr.write(`[soak] 完成 → ${runDir}\n`)
  process.exit(r.i5_noDegradation ? 0 : 1)
}

main().catch(e => { console.error('[soak] fatal:', e); process.exit(1) })