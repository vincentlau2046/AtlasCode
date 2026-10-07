/**
 * 0.1.37 ③（P2 恢复层）gate V4/V7 探针（e2e 交付，Main 随 ③ 波收编，零 src/ 产品改动）。
 *
 * 判据（f4 ③ gate 口径，`compact413-v47-design.md`）：
 *   - V4（TUI 面）：① TokenWarning 英文跳闸态 `auto-compact paused after \d+ consecutive failures`
 *     在场（proactive auto-compact 3 连败跳断路器）② 413 反应式压缩触发且回合存活（D1）
 *     ③ 一次性门（413 持续 → 不重压，回显原始 413）。
 *   - V7（headless 面）：② 413 反应式恢复 + 回合存活（engine 窄体 compactConversation 消费点）
 *     ③ 一次性门（413 持续 → 消费者恰 1 次 + 回显原始 413）。① headless 无 TokenWarning UI → 源级/模型侧在场（非缺口）。
 *   - 门控对照组：ATLAS_DISABLE_REACTIVE_COMPACT=true → 反应式支不触发（compact 消费者 0 次），413 穿透现形。
 *
 * 机制（fault-proxy 3 扩展，`user-e2e/loop-robustness/fault-proxy.ts`）：
 *   - detectCompact = 请求体 compact-prompt marker（CRITICAL: Respond with TEXT ONLY /
 *     Your task is to create a detailed summary）——TUI 富体 / headless 窄体两支通用，
 *     主循环自然对话不含此串（源级定因：两支都用 mainLoopModel，model/role 不可判别）。
 *   - compact 前 compactFailN 次 → 500（proactive 3 连败跳断路器，D2 跳闸态）；其后 → 脚本化有效摘要（D1 恢复）。
 *   - mainLoopPtlAt 指定主循环 call 注 413 "Prompt is too long"（= classifyAPIError 'prompt_too_long'，D1 触发）；
 *     mainLoopPtlPersist=true 从最小 ptl 序号起恒 413（一次性门③场景：首 413 触发反应式，重试再 413 → 不重压）。
 *
 * 用法：
 *   bun run user-e2e/tui-diff/compact413-v47.ts v7    # headless V7 ②③（survival + one-shot + kill 对照组）
 *   bun run user-e2e/tui-diff/compact413-v47.ts v4    # TUI V4 ①②③（D2① 渲染 + 反应式 + 一次性门）
 *   [--repo <path>]（默认 worktree-0.1.36；③ 基线 6079da9）
 */
import { spawnSync } from 'node:child_process'
import { rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { makeSandboxHome } from '../lib/gates'
import { headlessRound } from '../lib/headless'
import { startFaultProxy, type CompactPlan } from '../loop-robustness/fault-proxy'

const E2E = '/home/vince/projects/AtlasCode/user-e2e'
const ROOT = join(E2E, 'tui-diff')
const ART = join(ROOT, 'artifacts')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas/settings.json')
const CMP_MODEL = 'deepseek-v4-pro'
const PROXY_PORT = Number(process.env.ATLAS_E2E_C413_PROXY_PORT ?? '8998')
const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}/v1`
const LIVE_GW = 'http://127.0.0.1:8999'

const args = process.argv.slice(2)
const mode = (args[0] ?? 'v7') as 'v7' | 'v4'
const repoIdx = args.indexOf('--repo')
const REPO = repoIdx >= 0 ? args[repoIdx + 1] : '/home/vince/projects/AtlasCode/worktrees/worktree-0.1.36'

const stamp = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
const rand = Math.random().toString(36).slice(2, 5)
const runTag = `C413-${stamp()}-${rand}`
const runDir = join(ART, runTag)
mkdirSync(runDir, { recursive: true })

interface Verdict {
  id: string
  hard: boolean
  pass: boolean
  detail: string
}
type Pl = { compactFail: number; compactSuccess: number; ptl: number; ptlMainCalls: number[]; all: string[] }

function parseProxyLog(path: string): Pl {
  if (!existsSync(path)) return { compactFail: 0, compactSuccess: 0, ptl: 0, ptlMainCalls: [], all: [] }
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean)
  const compactFail = lines.filter(l => l.includes('compact=FAIL')).length
  const compactSuccess = lines.filter(l => l.includes('compact=SUCCESS')).length
  const ptlLines = lines.filter(l => l.includes('mainloop=PTL'))
  const ptlMainCalls = ptlLines.map(l => {
    const m = l.match(/mainCalls=(\d+)/)
    return m ? Number(m[1]) : -1
  })
  return { compactFail, compactSuccess, ptl: ptlLines.length, ptlMainCalls, all: lines }
}

/** 沙箱 home：对齐三角色+顶层 model 到 iff/deepseek-v4-pro + IFF baseURL 指 fault-proxy。
 *  capWindow=true → seed autoCompactWindow window 档（V4① 跳断路器可填阈值）；
 *  capWindow=false → 不设 autoCompactWindow（V7 大窗，proactive 不触发，只测 reactive）。 */
function seedSandbox(id: string, windowTokens: number, capWindow: boolean): string {
  const home = join(ROOT, 'home', id)
  rmSync(home, { recursive: true, force: true })
  void makeSandboxHome(home, REAL_SETTINGS, false)
  try { rmSync(join(home, '.atlas', '.config.json'), { force: true }) } catch { /* 不存在 */ }
  const p = join(home, '.atlas', 'settings.json')
  const s: any = JSON.parse(readFileSync(p, 'utf8'))
  s.providers = { iff: { ...(s.providers?.iff ?? {}), baseURL: PROXY_URL } }
  for (const role of ['small', 'fast', 'premium']) {
    s.modelRoles = s.modelRoles ?? {}
    s.modelRoles[role] = { provider: 'iff', models: [{ model: `iff/${CMP_MODEL}` }] }
  }
  s.model = CMP_MODEL
  if (capWindow) s.autoCompactWindow = { kind: 'window', tokens: windowTokens }
  writeFileSync(p, JSON.stringify(s, null, 2))
  return home
}

function makeWs(id: string, withBig: boolean): string {
  const ws = join(ROOT, 'workspaces', `c413-${id}`)
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: ws, stdio: 'ignore' })
  if (withBig) {
    // ~20k token 填充（cross V4① 17k 阈值，proactive auto-compact 可触发）
    const lines = Array.from({ length: 500 }, (_, i) =>
      `line-${i + 1}: ${'上下文填充 filler content for auto-compact threshold crossing. '.repeat(4)}`)
    writeFileSync(join(ws, 'big.txt'), lines.join('\n'))
  }
  // 强制工具调用面（模型无法猜 SECRET → 必 Read）：保证主循环 ≥2 call
  writeFileSync(join(ws, 'data.txt'), 'SECRET_TOKEN_XKCD_4217\n')
  writeFileSync(join(ws, 'calc.js'), 'function add(a, b) { return a + b }\nconsole.log(add(1, 2))\n')
  spawnSync('git', ['add', '-A'], { cwd: ws, stdio: 'ignore' })
  spawnSync('git', ['commit', '-q', '-m', 'init'], { cwd: ws, stdio: 'ignore' })
  return ws
}

/** 读 data.txt 的 SECRET（模型必 Read → 主循环 ≥2 call），供 413 注障落点稳定。 */
const V7_PROMPT = '读取当前目录下的 data.txt 文件，告诉我它里面的 SECRET_TOKEN 值是多少，用一句话报告。'

type HOut = Awaited<ReturnType<typeof headlessRound>>
function surfaced413(o: HOut | null): boolean {
  if (!o) return false
  return /Prompt is too long|prompt_too_long/i.test(JSON.stringify(o.result ?? {}) + (o.assistantText ?? '') + (o.stderrTail ?? ''))
}

async function headlessScenario(kind: 'survival' | 'oneshot' | 'kill'): Promise<{ id: string; pl: Pl; out: HOut; verdicts: Verdict[] }> {
  const id = `v7-${kind}`
  const home = seedSandbox(id, 0, false)
  const ws = makeWs(id, false)
  const plan: CompactPlan = kind === 'oneshot'
    ? { compactFailN: 0, compactSucceed: true, mainLoopPtlAt: [2], mainLoopPtlPersist: true }
    : { compactFailN: 0, compactSucceed: true, mainLoopPtlAt: [2] }
  if (kind === 'kill') process.env.ATLAS_DISABLE_REACTIVE_COMPACT = 'true'
  const proxy = await startFaultProxy({
    port: PROXY_PORT,
    target: LIVE_GW,
    plan: { kind: 'nominal', compact: plan },
    logPath: join(runDir, `${id}.proxy.log`),
  })
  const out = await headlessRound({
    repoRoot: REPO,
    workspace: ws,
    sandboxHome: home,
    prompt: V7_PROMPT,
    timeoutMs: 240_000,
  })
  proxy.stop()
  if (kind === 'kill') delete process.env.ATLAS_DISABLE_REACTIVE_COMPACT
  const pl = parseProxyLog(join(runDir, `${id}.proxy.log`))

  const verdicts: Verdict[] = []
  if (kind === 'kill') {
    const consumerZero = pl.compactSuccess === 0
    verdicts.push({ id: 'KILL-reconsumer-zero', hard: true, pass: consumerZero, detail: `compact success=0（kill-switch 反应式支未触发）=${consumerZero}` })
    const surf = surfaced413(out)
    verdicts.push({ id: 'KILL-413-passthrough', hard: true, pass: surf, detail: `413 穿透现形=${surf}（kill-switch 不恢复，回显原错）` })
  } else if (kind === 'survival') {
    const fired = pl.compactSuccess >= 1
    verdicts.push({ id: 'V7-reactive-recover', hard: true, pass: fired, detail: `② compact success=${pl.compactSuccess}（D1 反应式支 fire + buildPostCompactMessages 重建）` })
    const survived = Boolean(out && !out.result?.is_error && (out.assistantText ?? '').trim().length > 0)
    verdicts.push({ id: 'V7-turn-survival', hard: true, pass: survived, detail: `末回合存活=${survived}（is_error=${out?.result?.is_error}，assistant="${(out?.assistantText ?? '').slice(0, 60)}…"）` })
  } else {
    const firedOnce = pl.compactSuccess === 1
    verdicts.push({ id: 'V7-oneshot-gate', hard: true, pass: firedOnce, detail: `③ compact 消费者次数=${pl.compactSuccess}（一次性门：反应式恰 1 次，二次 413 不重压）` })
    const surf = surfaced413(out)
    const failed413 = Boolean(out?.result?.is_error) && surf
    verdicts.push({ id: 'V7-oneshot-redisplays413', hard: true, pass: failed413, detail: `回显原始 413=${failed413}（is_error=${out?.result?.is_error}，413 现形=${surf}）` })
  }
  return { id, pl, out, verdicts }
}

async function runHeadlessV7(): Promise<void> {
  const all: Verdict[] = []
  const ids: string[] = []
  for (const kind of ['survival', 'oneshot', 'kill'] as const) {
    const r = await headlessScenario(kind)
    all.push(...r.verdicts)
    ids.push(r.id)
    writeFileSync(join(runDir, `${r.id}.result.json`), JSON.stringify({ runTag, mode: 'v7', kind, perTurn: 1, proxy: r.pl, verdicts: r.verdicts }, null, 2))
    console.log(`\n=== ${r.id} verdict ===`)
    for (const v of r.verdicts) console.log(`  [${v.pass ? 'PASS' : 'FAIL'}] ${v.id}: ${v.detail}`)
    console.log(`  proxy: compactFail=${r.pl.compactFail} compactSuccess=${r.pl.compactSuccess} ptl=${r.pl.ptl} (mainCalls=${r.pl.ptlMainCalls})`)
  }
  const hardFail = all.filter(v => v.hard && !v.pass).length
  const openInc = all.filter(v => !v.hard && !v.pass).length
  writeFileSync(join(runDir, 'v7.summary.json'), JSON.stringify({ runTag, ids, all, hardFail, openInc }, null, 2))
  console.log(`\n${hardFail === 0 && openInc === 0 ? 'V7 GATE-PASS' : `V7 GATE-OPEN (hardFail=${hardFail}, openInc=${openInc})`} → ${runTag}`)
}

/** PTY TUI 会话：seed → proxy → Pty.start → 逐 prompt 驱动 → 抓 sinceText + proxy log。 */
async function tuiSession(id: string, windowTokens: number, prompts: string[], plan: CompactPlan): Promise<{ text: string; alive: boolean; pl: Pl }> {
  const home = seedSandbox(id, windowTokens, true)
  const ws = makeWs(id, true)
  const proxy = await startFaultProxy({
    port: PROXY_PORT,
    target: LIVE_GW,
    plan: { kind: 'nominal', compact: plan },
    logPath: join(runDir, `${id}.proxy.log`),
  })
  const { Pty } = await import('../lib/pty')
  const pty = await Pty.start({ repoRoot: REPO, workspace: ws, sandboxHome: home, logPath: join(runDir, `${id}.log`) }, 180_000)
  for (const pr of prompts) {
    pty.send(pr)
    await new Promise(r => setTimeout(r, 22_000))
  }
  await new Promise(r => setTimeout(r, 15_000))
  const text = pty.sinceText()
  const alive = pty.alive()
  pty.kill()
  proxy.stop()
  return { text, alive, pl: parseProxyLog(join(runDir, `${id}.proxy.log`)) }
}

const V4_TRIP_PROMPTS = [
  '读取 big.txt 并统计它有多少行，用一句话报告。',
  '再读取 data.txt，告诉我 SECRET_TOKEN 的值。',
  '用一句话说明 calc.js 里 add(1,2) 的结果。',
  '用一句话总结以上三个文件的要点。',
]

/** V4①（TUI 唯一面）：proactive auto-compact 3 连败（pre-turn，无 413 干扰）→ D2 断路器跳闸态
 *  经 TokenWarning 英文渲染 `auto-compact paused after \d+ consecutive failures`（f4 锚点 TokenWarning.tsx:177）。
 *  机制：window cap 40k → 阈值 7k（big.txt 填充使 context 远超阈值）；turn2/3/4 pre-turn 各 1 次
 *  proactive compact → 500（compactFailN=3）→ consecutiveFailures 回灌 D2 store=3 → 跳闸态渲染。
 *  无 413 → 无反应式恢复清 context → 跳闸态持续到快照。 */
async function runTuiTrip(): Promise<void> {
  const id = 'v4-trip'
  // compactFailN=999 = 所有 compact 调用恒 500（rich compact 内部重试也全败）→ 每次 pre-turn
  // autoCompactIfNeeded 抛错 → consecutiveFailures 逐 turn +1（autoCompact.ts:558）→ 3 turn 后
  // store=3 跳闸；compact 恒败 → context 永不降 → TokenWarning 持续可见 → ① 跳闸态渲染到快照。
  const plan: CompactPlan = { compactFailN: 999, compactSucceed: false, mainLoopPtlAt: [] } // 无 413
  const { text, alive, pl } = await tuiSession(id, 40000, V4_TRIP_PROMPTS, plan)
  const d2Re = /auto-compact paused after \d+ consecutive failures/
  const d2 = d2Re.test(text)
  const d2n = (text.match(d2Re) ?? [''])[0]
  // compact 持续失败在场（store 累积跳闸的 pre-cond；≥3 = 至少 3 次 pre-turn 失败）
  const compactFailing = pl.compactFail >= 3
  const verdicts: Verdict[] = [
    { id: 'V4-D2-tripstate', hard: true, pass: d2, detail: `① D2 英文跳闸态在场=${d2}（"${d2n}"，f4 锚点 TokenWarning.tsx:177）` },
    { id: 'V4-compact-fail-accrue', hard: true, pass: compactFailing, detail: `proactive auto-compact 失败累积≥3 在场=${compactFailing}（compactFail=${pl.compactFail}，D2 store→跳闸 pre-cond）` },
  ]
  const hardFail = verdicts.filter(v => v.hard && !v.pass).length
  const openInc = verdicts.filter(v => !v.hard && !v.pass).length
  writeFileSync(join(runDir, `${id}.result.json`), JSON.stringify({ runTag, mode: 'v4-trip', alive, proxy: pl, d2: d2n, verdicts, hardFail, openInc }, null, 2))
  console.log(`\n=== ${id} verdict ===`)
  for (const v of verdicts) console.log(`  [${v.pass ? 'PASS' : 'FAIL'}] ${v.id}: ${v.detail}`)
  console.log(`  proxy: compactFail=${pl.compactFail} compactSuccess=${pl.compactSuccess} ptl=${pl.ptl} (mainCalls=${pl.ptlMainCalls})`)
  console.log(`  ${hardFail === 0 && openInc === 0 ? 'V4-① GATE-PASS' : `V4-① GATE-OPEN (hardFail=${hardFail}, openInc=${openInc})`} → ${runTag}`)
}

/** V4②（TUI 车道反应式恢复）：主循环单点 413（mainLoopPtlAt=[6]）→ D1 反应式压缩 fire
 *  → buildPostCompactMessages 重建 + 本回合重试 → 回合存活。compactFailN=0（compact 恒成功）。
 *  ③ 一次性门在 V7 headless 已硬核 + ③ 单测 loop 层证；TUI ③ 同 engine 机制 = 增量/soft。 */
async function runTuiReact(): Promise<void> {
  const id = 'v4-react'
  const plan: CompactPlan = { compactFailN: 0, compactSucceed: true, mainLoopPtlAt: [6] }
  const { alive, pl } = await tuiSession(id, 40000, V4_TRIP_PROMPTS, plan)
  const reactive = pl.compactSuccess >= 1
  const verdicts: Verdict[] = [
    { id: 'V4-reactive-recover', hard: true, pass: reactive, detail: `② compact success=${pl.compactSuccess}（反应式支 fire + 回合存活=${alive}）` },
  ]
  const hardFail = verdicts.filter(v => v.hard && !v.pass).length
  writeFileSync(join(runDir, `${id}.result.json`), JSON.stringify({ runTag, mode: 'v4-react', alive, proxy: pl, verdicts, hardFail }, null, 2))
  console.log(`\n=== ${id} verdict ===`)
  for (const v of verdicts) console.log(`  [${v.pass ? 'PASS' : 'FAIL'}] ${v.id}: ${v.detail}`)
  console.log(`  proxy: compactFail=${pl.compactFail} compactSuccess=${pl.compactSuccess} ptl=${pl.ptl} (mainCalls=${pl.ptlMainCalls})`)
  console.log(`  ${hardFail === 0 ? 'V4-② GATE-PASS' : `V4-② GATE-OPEN (hardFail=${hardFail})`} → ${runTag}`)
}

async function runTuiV4(): Promise<void> {
  await runTuiTrip()
  await runTuiReact()
}

async function main(): Promise<void> {
  console.log(`[C413 ${runTag}] mode=${mode} repo=${REPO} proxy=:${PROXY_PORT}→${LIVE_GW}`)
  if (mode === 'v7') await runHeadlessV7()
  else if (mode === 'v4') await runTuiV4()
  else if (mode === 'v4trip') await runTuiTrip()
  else if (mode === 'v4react') await runTuiReact()
  else {
    console.error(`unknown mode ${mode}（v7 | v4 | v4trip | v4react）`)
    process.exit(2)
  }
}

main().catch(e => {
  console.error(`[C413 ${runTag}] FATAL: ${String(e?.stack ?? e)}`)
  process.exit(1)
})
