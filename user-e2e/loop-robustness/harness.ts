/**
 * loop 鲁棒性/稳定性测试 harness（headless 为主 + 注障代理端到端）。
 *
 * 目的：验「coding agent 持续长时间不中断」= 5 不变量（I1 不崩 / I2 不提前终止 /
 *   I3 不挂 / I4 可恢复 / I5 无退化）。故障经 fault-proxy.ts 注在 IFF 网关前
 *   （真实产品路径，不 mock 引擎）。全部 I/O 落 user-e2e/loop-robustness/。
 *
 * 层：
 *   R1 单点鲁棒：一次注一类 LLM 请求层故障（5xx 短暂 / 断连 / 空 0-0 / 慢 / 5xx 风暴），
 *     断言 loop「能恢复不崩不挂」或「优雅失败非静默」。
 *   R3 断点续跑：长任务 mid-run SIGKILL → --resume 接着跑完（crash-resumable 不变量）。
 *   （R2 长跑 soak 单独后台跑，见 soak.ts；本文件不含。）
 *
 * 用法：
 *   bun run user-e2e/loop-robustness/harness.ts [R1|R3|all] [--target <gateway>] [--model <m>]
 *   例：bun run user-e2e/loop-robustness/harness.ts all
 *
 * 模型对齐：沙箱三角色 + 顶层 model → 指定模型（缺省 iff/deepseek-v4-pro，能力对齐、
 *   多步任务稳定触发工具轮，隔离「引擎鲁棒性」面；非模型强弱结论）。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { startFaultProxy, type FaultPlan, type ProxyHandle } from './fault-proxy'

const REPO = process.env.ATLAS_E2E_REPO ?? '/home/vince/projects/AtlasCode'
const ROOT = '/home/vince/projects/AtlasCode/user-e2e/loop-robustness'
const ART = join(ROOT, 'artifacts')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas', 'settings.json')
const MODEL = process.argv.includes('--model') ? process.argv[process.argv.indexOf('--model') + 1] : 'deepseek-v4-pro'
const TARGET = process.argv.includes('--target') ? process.argv[process.argv.indexOf('--target') + 1] : 'http://127.0.0.1:8999'
const LB_PORT = Number(process.env.ATLAS_E2E_LB_PORT ?? '8998')

// ── 多步 coding 任务（触发多轮工具调用 + 可验证完成）─────────────────────
const TASK = [
  'In this workspace, do all of the following in order and report briefly after each step:',
  '1) Create lib/math.js that exports add(a,b,c=0) returning a+b+c, sub(a,b) returning a-b, and mul(a,b) returning a*b.',
  '2) Create lib/stats.js that exports mean(arr) (average, throw on empty) and max(arr) (throw on empty).',
  '3) Create lib/app.js that imports both and computes: the mean of [1,2,3,4,5] plus the max of [7,9,2], times mul(3,4). Print the final number.',
  '4) Create lib/run.test.js that requires the three modules and asserts add(1,2)===3, add(1,2,5)===8, sub(10,4)===6, mean([2,4])===3, max([3,9,1])===9, and that app prints a number; print exactly "ALL TESTS PASSED" if all hold.',
  '5) Run `node lib/run.test.js` via Bash and confirm it prints "ALL TESTS PASSED".',
  '6) Stop once "ALL TESTS PASSED" is printed.',
].join('\n')

/** 完成判据（I2）：三模块 + 测试文件都在，且 test 实跑打印 ALL TESTS PASSED */
function diskCheck(ws: string): { ok: boolean; evidence: string } {
  const need = ['lib/math.js', 'lib/stats.js', 'lib/app.js', 'lib/run.test.js']
  const missing = need.filter(f => !existsSync(join(ws, f)))
  if (missing.length) return { ok: false, evidence: `missing: ${missing.join(', ')}` }
  try {
    const r = spawnSyncNode('node', [join(ws, 'lib/run.test.js')])
    const out = (r.stdout + r.stderr).trim()
    const ok = out.includes('ALL TESTS PASSED')
    return { ok, evidence: ok ? 'ALL TESTS PASSED (实跑通过)' : `test 输出无 PASS: "${out.slice(-160)}"` }
  } catch (e: any) {
    return { ok: false, evidence: `test 实跑异常: ${e?.message}` }
  }
}

// 本地小工具：跑 node（避免 spawnSync 名字冲突，独立命名）
import { spawnSync } from 'node:child_process'
function spawnSyncNode(cmd: string, args: string[]): { stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 30_000 })
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

// ── 沙箱种子（三角色 + 顶层 → MODEL，IFF baseURL 指注障代理）────────────
async function seedHome(home: string, proxyPort: number): Promise<void> {
  rmSync(home, { recursive: true, force: true })
  const atlasDir = join(home, '.atlas')
  mkdirSync(atlasDir, { recursive: true })
  const raw: any = JSON.parse(readFileSync(REAL_SETTINGS, 'utf8'))
  delete raw.enabledPlugins
  delete raw.enabledMcpServers
  delete raw.extraKnownMarketplaces
  raw.providers = raw.providers ?? {}
  raw.providers.iff = { ...(raw.providers.iff ?? {}), baseURL: `http://127.0.0.1:${proxyPort}/v1` }
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
  // 0.1.89 判据面修正（工单 §6.3 择定 Option 2 治本，e2e lane 权属）：本工作区
  // 位于 AtlasCode repo 链内，根 package.json "type":"module" 使 .js 按 ESM
  // 解析 → TASK 本意是 CommonJS（require/module.exports），模型被逼走「改名
  // .cjs」合法自适配 → diskCheck 精确文件名假阴（086 R1-delay RED×4 假阳性
  // 定谳：transcript 同条 mv 命令 + ALL TESTS PASSED 实跑在场）。种 commonjs
  // package.json 消除环境噪声 = 判据不稀释（精确名判别力保持，不采等价物容忍）。
  // 同形姊妹探针 soak/stability-probe/tui-longtask setupWs 已同批种子。
  writeFileSync(join(ws, 'package.json'), JSON.stringify({ name: 'looprob-ws', private: true, type: 'commonjs' }, null, 2))
  // R3 需 git（任务含 commit？本任务不含，但保留 init 便于后续）
  const r = spawnSync('git', ['init', '-q'], { cwd: ws, stdio: 'ignore' })
  return ws
}

// ── headless 任务驱动（可 mid-run kill，供 R3）─────────────────────────
interface HRes {
  exitCode: number | null
  killed: boolean
  ms: number
  stdout: string
  stderr: string
  events: any[]
  result: any | null
  assistantText: string
  toolUses: string[]
  sessionId: string | null
  zeroContent: boolean
  /** I1：stderr 含 uncaught/unhandled 崩栈标记 */
  crashed: boolean
}

function spawnHeadless(o: {
  ws: string
  home: string
  prompt: string
  resume?: string
  timeoutMs?: number
  /** 到点后 SIGKILL（R3 断点续跑）；null = 不主动杀 */
  killAfterMs?: number
  /** 0.1.82 探针硬化（081 S-A waitCountSince 先例同构）：返回 true 即 SIGKILL——
   *  事件驱动 mid-task 击杀。轮级信号 = fault-proxy call 计数（stream-json 事件只在
   *  loop 结束后上流、stderr 仅 turn 粒度，均不可作 kill 信号）；与 killAfterMs 上界
   *  取先到者。背景：固定 25s 窗按 TXT 冷 pace 标定，VL+网关缓存面下任务 8.26s 即完
   *  → killed=false 退化（082 run4 实证）；触发器改轮数后在任意 pace/缓存态下结构性
   *  保证 mid-task。测的不变量零变化：mid-run kill → resume 完成。 */
  killWhen?: () => boolean
  logPath: string
}): Promise<HRes> {
  const timeoutMs = o.timeoutMs ?? 600_000
  const args = [
    'run', join(REPO, 'src/atlascode/cli.ts'), '-p',
    '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions',
    // --debug-to-stderr：让 headlessStartLine（`[headless] session start: id=<uuid>`）启动即落到
    // stderr——这是 mid-run SIGKILL 前唯一可捕获 session_id 的通道（stream-json 的 result/assistant
    // 事件只在 loop 结束后上流，见 print.ts:864-868「旧实仅 lastRound 上流」）。
    '--debug-to-stderr',
    ...(o.resume ? ['--resume', o.resume] : []),
  ]
  const child: ChildProcess = spawn('bun', args, {
    cwd: o.ws,
    env: { ...process.env, HOME: o.home },
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let out = ''
  let err = ''
  child.stdout?.on('data', d => { out += d.toString() })
  child.stderr?.on('data', d => { err += d.toString() })
  child.stdin?.write(o.prompt)
  child.stdin?.end()

  const t0 = Date.now()
  let killed = false
  let killTimer: NodeJS.Timeout | null = null
  if (o.killAfterMs) {
    killTimer = setTimeout(() => {
      killed = true
      try { process.kill(-child.pid!, 'SIGKILL') } catch { try { child.kill('SIGKILL') } catch { /* gone */ } }
    }, o.killAfterMs)
    killTimer.unref?.()
  }
  const timeoutTimer = setTimeout(() => {
    if (!killed) { killed = true; try { process.kill(-child.pid!, 'SIGKILL') } catch { /* gone */ } }
  }, timeoutMs)
  timeoutTimer.unref?.()
  let killProbeTimer: NodeJS.Timeout | null = null
  if (o.killWhen) {
    killProbeTimer = setInterval(() => {
      if (killed) { if (killProbeTimer) clearInterval(killProbeTimer); return }
      if (!o.killWhen!()) return
      killed = true
      if (killProbeTimer) clearInterval(killProbeTimer)
      try { process.kill(-child.pid!, 'SIGKILL') } catch { try { child.kill('SIGKILL') } catch { /* gone */ } }
    }, 150)
    killProbeTimer.unref?.()
  }

  return new Promise(resolve => {
    child.on('exit', code => {
      clearTimeout(killTimer); clearTimeout(timeoutTimer)
      if (killProbeTimer) clearInterval(killProbeTimer)
      const events: any[] = []
      for (const line of out.split('\n')) {
        const s = line.trim()
        if (!s.startsWith('{')) continue
        try { events.push(JSON.parse(s)) } catch { /* skip */ }
      }
      const result = [...events].reverse().find(e => e?.type === 'result') ?? null
      const assistantText = events
        .filter(e => e?.type === 'assistant')
        .flatMap(e => (e.message?.content ?? []).filter((c: any) => c?.type === 'text').map((c: any) => c.text ?? ''))
        .join('\n')
      const toolUses = events
        .filter(e => e?.type === 'assistant')
        .flatMap(e => (e.message?.content ?? []).filter((c: any) => c?.type === 'tool_use').map((c: any) => c.name ?? '?'))
      const sessionId = result?.session_id ?? events.find(e => e?.type === 'system')?.session_id ??
        /\[headless\] session start: id=([0-9a-f-]{36})/i.exec(err)?.[1] ?? null
      const zeroContent = assistantText.trim().length === 0 && !toolUses.length
      const crashed = /uncaught[- ]?(exception|rejection)|unhandled[- ]?rejection/i.test(err)
      try { writeFileSync(o.logPath, `STDOUT:\n${out}\n\nSTDERR:\n${err}\n`) } catch { /* best effort */ }
      resolve({
        exitCode: code, killed, ms: Date.now() - t0, stdout: out, stderr: err,
        events, result, assistantText, toolUses, sessionId, zeroContent, crashed,
      })
    })
  })
}

// ── 不变量判定 ─────────────────────────────────────────────────────────
interface Invariants {
  I1_noCrash: boolean
  I2_noSilentDrop: boolean
  I3_noHang: boolean
  completed: boolean
  gap?: string
}
function judgeInvariants(r: HRes, expectComplete: boolean, wallCapMs: number): Invariants {
  // I1 不崩：进程非崩溃退出（exitCode 0 或优雅非 0）且 stderr 无 uncaught/unhandled 崩栈
  const I1 = !r.crashed
  // I2 不静默丢弃：无 zeroContent 的静默成功；要么完成、要么显式 is_error（非静默）
  const explicitError = Boolean(r.result?.is_error) || Boolean(r.result?.subtype && r.result.subtype !== 'success')
  // 0.1.71 r3 勘误（探针侧，gate r-20261015-gate-071-r3）：原式 `r.zeroContent ? false : …`
  // 在 zeroContent=true 时无条件短路 false，吞掉 explicitError 面——与上注语义「要么完成、
  // 要么显式 is_error（非静默）」矛盾。0.1.71 块 A A-1 池聚合（ModelPoolExhaustedError）
  // 新引入「任务未完成（zeroContent=true）+ 显式 is_error」面（R1-500-storm：40×500 超
  // 重试预算 → 聚合错误显式终止）首次触发该潜伏假阴（原式判 I2=false=静默，实为非静默
  // 显式错误）。勘误 = 忠实实现注释意图：explicitError 在场即非静默（I2=true）；真静默
  // 丢弃面（zeroContent 且无显式错误且未完成）判定不变（I2=false），零弱化。
  const I2 = explicitError || (r.zeroContent ? false : (r.completed || r.killed))
  // I3 不挂：wall-clock 有界（未打满总超时）或已完成
  const I3 = r.ms < wallCapMs || r.completed
  let gap: string | undefined
  if (expectComplete && !r.completed && !r.killed) {
    gap = r.zeroContent
      ? '任务未完成且静默空内容（I2 击穿：可能空 0-0 反复 emptyTerminated 或静默丢弃）'
      : '任务未完成（非静默）——若为注障超出恢复预算，属「loop 无回合级错误恢复」缺口面'
  }
  return { I1_noCrash: I1, I2_noSilentDrop: I2, I3_noHang: I3, completed: r.completed, gap }
}

// ── R1 单点鲁棒场景 ────────────────────────────────────────────────────
interface Scenario {
  name: string
  plan: FaultPlan
  /** 该故障下任务本应完成（true=短暂故障应恢复；false=风暴等超预算，完成非强求，用于暴露缺口） */
  expectComplete: boolean
  wallCapMs: number
  note: string
}
const R1_SCENARIOS: Scenario[] = [
  { name: 'R1-nominal', plan: { kind: 'nominal' }, expectComplete: true, wallCapMs: 600_000, note: '无故障基线：多步任务应完成（其他场景的对照组）' },
  { name: 'R1-500-transient', plan: { kind: 'firstN', n: 2, fault: '500' }, expectComplete: true, wallCapMs: 600_000, note: '前 2 次 500（在 provider 3 次重试预算内）→ 应恢复并完成' },
  { name: 'R1-drop-transient', plan: { kind: 'firstN', n: 1, fault: 'drop' }, expectComplete: true, wallCapMs: 600_000, note: '第 1 次断连（ECONN，可重试）→ 应恢复并完成' },
  { name: 'R1-empty-bounded', plan: { kind: 'at', at: 2, fault: 'empty' }, expectComplete: true, wallCapMs: 600_000, note: '第 2 次空 0-0（R1 有界 1 次重试面）→ 应不崩、非静默' },
  { name: 'R1-delay', plan: { kind: 'always', fault: 'delay', delayMs: 2000 }, expectComplete: true, wallCapMs: 900_000, note: '每次 +2s（模拟慢模型，post-#260 不应提前 fail-fast）→ 应完成' },
  { name: 'R1-500-storm', plan: { kind: 'firstN', n: 40, fault: '500' }, expectComplete: false, wallCapMs: 900_000, note: '40 次连续 500（超 3 次重试预算）→ 暴露「loop 无回合级错误恢复」缺口（预期：任务不完成，非静默）' },
]

async function runR1(scenario: Scenario, runDir: string, proxyPort: number): Promise<Record<string, unknown>> {
  const sc = scenario.name
  const ws = setupWs(sc)
  const home = join(ROOT, 'home', sc)
  await seedHome(home, proxyPort)
  // 起注障代理（本场景 plan）
  let proxy: ProxyHandle
  try {
    proxy = await startFaultProxy({
      port: proxyPort, target: TARGET,
      plan: scenario.plan,
      logPath: join(runDir, `${sc}.proxy.log`),
    })
  } catch (e: any) {
    return { scenario: sc, fatal: `proxy 启动失败: ${e?.message}`, plan: scenario.plan }
  }
  process.stderr.write(`[${sc}] ${scenario.note}\n`)
  const r = await spawnHeadless({
    ws, home, prompt: TASK,
    logPath: join(runDir, `${sc}.log`),
    timeoutMs: scenario.wallCapMs,
  })
  const dc = diskCheck(ws)
  r.completed = dc.ok
  const inv = judgeInvariants(r, scenario.expectComplete, scenario.wallCapMs)
  proxy.stop()
  // 让端口释放
  await new Promise(res => setTimeout(res, 500))
  const res = {
    scenario: sc,
    note: scenario.note,
    plan: scenario.plan,
    exitCode: r.exitCode,
    killed: r.killed,
    ms: r.ms,
    toolUses: r.toolUses.length,
    zeroContent: r.zeroContent,
    crashed: r.crashed,
    resultSubtype: r.result?.subtype ?? null,
    isError: Boolean(r.result?.is_error),
    completed: r.completed,
    diskCheck: dc.evidence,
    invariants: inv,
  }
  process.stderr.write(
    `  [${sc}] completed=${r.completed} exit=${r.exitCode} ms=${r.ms} tools=${r.toolUses.length} ` +
      `crashed=${r.crashed} zeroContent=${r.zeroContent} | I1=${inv.I1_noCrash} I2=${inv.I2_noSilentDrop} I3=${inv.I3_noHang}` +
      (inv.gap ? ` | GAP: ${inv.gap}` : '') + `\n`,
  )
  return res
}

// ── R3 断点续跑 ────────────────────────────────────────────────────────
async function runR3(runDir: string, proxyPort: number): Promise<Record<string, unknown>> {
  const sc = 'R3-resume'
  const ws = setupWs(sc)
  const home = join(ROOT, 'home', sc)
  await seedHome(home, proxyPort)
  let proxy: ProxyHandle
  try {
    proxy = await startFaultProxy({ port: proxyPort, target: TARGET, plan: { kind: 'nominal' }, logPath: join(runDir, `${sc}.proxy.log`) })
  } catch (e: any) {
    return { scenario: sc, fatal: `proxy 启动失败: ${e?.message}` }
  }
  // ① 跑到第 K 点 SIGKILL（0.1.82 硬化：触发 = 第 killAtCall 次模型调用〔proxy call
  //    计数，事件驱动〕∨ killAtMs 上界，先到先杀——任意模型 pace/网关缓存态下结构性
  //    保证 mid-task 击杀；任务最少 ~5-6 调用才完成，第 4 调用杀必为任务中）
  const killAtMs = 25_000
  const killAtCall = 4
  const r1 = await spawnHeadless({
    ws, home, prompt: TASK, killAfterMs: killAtMs, killWhen: () => proxy.calls() >= killAtCall, timeoutMs: 300_000,
    logPath: join(runDir, `${sc}.kill.log`),
  })
  const sessionId = r1.sessionId
  process.stderr.write(`[${sc}] ① SIGKILL@call${killAtCall}∨${killAtMs}ms → sessionId=${sessionId ?? '(未捕获)'} killed=${r1.killed} ms=${r1.ms} calls=${proxy.calls()}\n`)
  if (!sessionId) {
    proxy.stop()
    return { scenario: sc, stage: 'kill', completed: false, gap: 'mid-run 未捕获 session_id（R3 无法续跑）', sessionId: null }
  }
  // ② --resume 接着跑完（continue 指令，不复述 TASK——resume 已载入 leaf 链，
  //    再 append 一条「接着跑完」user 消息触发续跑，而非重头做）
  const r2 = await spawnHeadless({
    ws, home, prompt: 'Continue from where you left off and finish the task. Stop once "ALL TESTS PASSED" is printed.',
    resume: sessionId, timeoutMs: 600_000,
    logPath: join(runDir, `${sc}.resume.log`),
  })
  const dc = diskCheck(ws)
  r2.completed = dc.ok
  proxy.stop()
  const ok = dc.ok
  process.stderr.write(`[${sc}] ② --resume 后 completed=${dc.ok} (${dc.evidence})\n`)
  return {
    scenario: sc,
    stage: ok ? 'resume-ok' : 'resume-failed',
    sessionId,
    killAtMs,
    killAtCall,
    killedMidTask: r1.killed,
    completed: ok,
    resumeMs: r2.ms,
    resumeToolUses: r2.toolUses.length,
    diskCheck: dc.evidence,
    invariant: { I4_recoverable: ok },
  }
}

// ── 验收单 ─────────────────────────────────────────────────────────────
function writeTicket(runDir: string, phase: string, results: Record<string, unknown>[]): string {
  const L: string[] = []
  L.push(`# loop 鲁棒性/稳定性 验收单（${phase}，${new Date().toISOString()}）`)
  L.push('')
  L.push(`- 模型对齐：${MODEL}（三角色+顶层）；注障代理端口 ${LB_PORT} → ${TARGET}`)
  L.push(`- 不变量：I1 不崩 / I2 不提前终止 / I3 不挂 / I4 可恢复 / I5 无退化（I5 归 soak）`)
  L.push('')
  for (const r of results) {
    L.push(`## ${r.scenario}`)
    if (r.fatal) { L.push(`- FATAL: ${r.fatal}`); L.push('') ; continue }
    L.push(JSON.stringify(r, null, 2).split('\n').map(l => '- ' + l).join('\n'))
    L.push('')
  }
  // 汇总缺口
  L.push('## 候选设计缺口（确认项提交 main 开新闭环）')
  L.push('- （验收者填写，逐条：现象 + 复现场景 + 证据 + 定级）')
  L.push('  1. （空）')
  const p = join(runDir, 'ticket.md')
  writeFileSync(p, L.join('\n'))
  return p
}

// ── 主流程 ─────────────────────────────────────────────────────────────
async function main() {
  const phaseArg = process.argv.slice(2).find(a => !a.startsWith('--')) ?? 'all'
  const runDir = join(ART, `${phaseArg}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  mkdirSync(runDir, { recursive: true })
  const results: Record<string, unknown>[] = []
  if (phaseArg === 'R1' || phaseArg === 'all') {
    // 0.1.71 r3 勘误增补（探针侧）：ATLAS_E2E_LOOPROB_SCENARIO 单场景过滤
    // （逗号分隔场景名，如 "R1-500-storm"；缺省 = 全场景，向后兼容）——
    // 假阴/定因复核单场景快跑面，不占全量 all 时程
    const only = process.env.ATLAS_E2E_LOOPROB_SCENARIO
      ?.split(',').map(s => s.trim()).filter(Boolean)
    const scens = only ? R1_SCENARIOS.filter(s => only.includes(s.name)) : R1_SCENARIOS
    for (const sc of scens) {
      results.push(await runR1(sc, runDir, LB_PORT))
    }
  }
  if (phaseArg === 'R3' || phaseArg === 'all') {
    results.push(await runR3(runDir, LB_PORT))
  }
  writeTicket(runDir, phaseArg, results)
  writeFileSync(join(runDir, 'result.json'), JSON.stringify({ phase: phaseArg, model: MODEL, target: TARGET, results }, null, 2))
  process.stderr.write(`\n[${phaseArg}] 完成 → ${runDir}\n`)
  process.exit(0)
}

main().catch(e => {
  console.error('[loop-robustness] fatal:', e)
  process.exit(1)
})
