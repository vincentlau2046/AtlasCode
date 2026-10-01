#!/usr/bin/env bun
/**
 * user-e2e 唯一入口（方案 §4 触发方式）——「指定才跑，非必测」。
 *
 *   bun run user-e2e/run.ts --tier all|core|slash|short|medium|long
 *   bun run user-e2e/run.ts --resume <runId> [--tier ...]
 *   bun run user-e2e/run.ts --full-home
 *
 * 执行序：T0 门控 → T1 core（报障复现面）→ T2 slash sweep → T3 short →
 * T4 medium → T5 long+soak；逐 case checkpoint（中断 reports/ 亦有增量报告）。
 * 全部 I/O 收敛 user-e2e/（workspaces/home/artifacts 已 gitignore），真实 ~/.atlas 零写。
 */
import { execSync } from 'node:child_process'
import {
  mkdirSync,
  readFileSync,
  existsSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { RunState, type CaseRec } from './lib/checkpoint'
import { classify } from './lib/classify'
import { buildCalcFixture, runFixtureTest, gitLog } from './lib/fixture'
import { runGates, makeSandboxHome } from './lib/gates'
import { headlessRound, type HOut } from './lib/headless'
import { buildReports } from './lib/report'
import { dumpCommands } from './lib/registry'
import { Pty } from './lib/pty'
import { countOcc, sleep, stripAnsi, readWhole } from './lib/util'

const ROOT = __dirname
const REPO = join(ROOT, '..')

// ── CLI ───────────────────────────────────────────────────────────────────
function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}
function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

const TIERS_ALL = ['core', 'slash', 'short', 'medium', 'long'] as const
type Tier = (typeof TIERS_ALL)[number]
const wanted: Tier[] = (
  hasFlag('--tier') ? (arg('--tier') ?? 'all').split(',').map(s => s.trim()) : ['all']
).filter((t): t is Tier | 'all' => TIERS_ALL.includes(t as Tier) || t === 'all')
  .map(t => (t === 'all' ? (TIERS_ALL as readonly string[]) : [t]) as Tier[])
  .flat()
const resumeRunId = arg('--resume')
const fullHome = hasFlag('--full-home')

function runStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `r-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

// ── 上下文 ────────────────────────────────────────────────────────────────
const HOME_REAL = process.env.HOME ?? ''
const realSettings = join(HOME_REAL, '.atlas', 'settings.json')

async function main(): Promise<void> {
  const runId = resumeRunId ?? runStamp()
  const runHome = join(ROOT, 'home', runId)
  const wsDir = join(ROOT, 'workspaces', runId)
  mkdirSync(runHome, { recursive: true })
  mkdirSync(wsDir, { recursive: true })

  const meta = {
    runId,
    startedAt: new Date().toISOString(),
    repoRoot: REPO,
    repoRev: (() => {
      try {
        return execSync('git rev-parse --short HEAD', { cwd: REPO }).toString().trim()
      } catch {
        return '(unknown)'
      }
    })(),
    version: JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).version,
    gateway: process.env.ATLAS_E2E_GATEWAY ?? '127.0.0.1:8999',
    model: 'iff/Qwen38-27B-TXT（settings modelRoles 池头）',
    fullHome,
    env: {
      CI: process.env.CI ?? '',
      platform: process.platform,
    },
  }
  const state = new RunState(ROOT, meta, Boolean(resumeRunId))
  const done = state.doneIds()

  // 沙箱 HOME（隔离：会话/历史/配置全落 user-e2e/home/<runId>）
  makeSandboxHome(runHome, realSettings, fullHome)
  // 本进程内 import（registry/healthCheck）同走沙箱面
  process.env.HOME = runHome

  const wsFor = (id: string): string => {
    const p = join(wsDir, id)
    mkdirSync(p, { recursive: true })
    return p
  }
  const logFor = (id: string, drv: string): string =>
    join(ROOT, 'artifacts', runId, `${id}-${drv}.log`)

  const ptyOpts = (id: string) => ({
    repoRoot: REPO,
    workspace: wsFor(id),
    sandboxHome: runHome,
    logPath: logFor(id, 'pty'),
  })

  // ── T0 门控 ────────────────────────────────────────────────────────────
  let llmGo = true
  if (!done.has('gate')) {
    const t0 = Date.now()
    const g = await runGates(REPO, runHome, wsFor('gate'), realSettings)
    state.rec({
      id: 'gate',
      tier: 'gate',
      verdict: g.llmGo ? 'PASS' : 'FAIL',
      ms: Date.now() - t0,
      note: `网关 ${g.gateway.ok ? `${g.gateway.code}/${g.gateway.ms}ms models=${g.gateway.models.join(',')}` : '不可达'}；settings ${g.settings.ok ? g.settings.note : g.settings.note}；LLM 单轮 ${g.llmProbe.ok ? 'OK' : 'FAIL'}${g.llmProbe.zeroContent ? '（0 内容形态！）' : ''}`,
      evidence: {
        gateway: g.gateway,
        settings: g.settings,
        llmProbe: {
          ok: g.llmProbe.ok,
          ms: g.llmProbe.ms,
          zeroContent: g.llmProbe.zeroContent,
          textHead: g.llmProbe.assistantText.slice(0, 80),
          result: g.llmProbe.result ? { subtype: g.llmProbe.result.subtype, is_error: g.llmProbe.result.is_error, num_turns: g.llmProbe.result.num_turns } : null,
        },
      },
    })
  }
  const gateRec = state.byId('gate')
  llmGo = gateRec?.verdict === 'PASS'

  const skipLlm = (id: string, why: string): void => {
    state.rec({ id, tier: id.split('/')[0] ?? 'core', verdict: 'SKIP', ms: 0, note: `GATE: ${why}` })
  }

  // ── T1 core（报障复现面，优先跑）──────────────────────────────────────
  if (wanted.includes('core')) {
    // core-1：TUI 单 session 4 轮 marker（顺序等待，判基本多轮）
    if (!done.has('core-1')) {
      if (!llmGo) {
        skipLlm('core-1', '门控 LLM 未放行')
      } else {
        await coreMultiTurn(state, ptyOpts, 'core-1', 4)
      }
    }
    // core-2：headless --resume 同 session 2 轮
    if (!done.has('core-2')) {
      if (!llmGo) {
        skipLlm('core-2', '门控 LLM 未放行')
      } else {
        await coreHeadlessResume(state, wsFor, 'core-2')
      }
    }
    // core-3：工具回合（fixture + 磁盘 ground truth）
    if (!done.has('core-3')) {
      if (!llmGo) {
        skipLlm('core-3', '门控 LLM 未放行')
      } else {
        await coreToolRound(state, ptyOpts, 'core-3')
      }
    }
    // core-4：流式期间排队输入（用户「连打两条」行为模型——报障直接判别面）
    if (!done.has('core-4')) {
      if (!llmGo) {
        skipLlm('core-4', '门控 LLM 未放行')
      } else {
        await coreQueueInput(state, ptyOpts, 'core-4')
      }
    }
    buildReports(state)
  }

  // ── T2 slash sweep ─────────────────────────────────────────────────────
  if (wanted.includes('slash')) {
    await tierSlash(state, ptyOpts, wsFor, done, llmGo)
    buildReports(state)
  }

  // ── T3 short ───────────────────────────────────────────────────────────
  if (wanted.includes('short')) {
    await tierShort(state, ptyOpts, wsFor, done, llmGo)
    buildReports(state)
  }

  // ── T4 medium ──────────────────────────────────────────────────────────
  if (wanted.includes('medium')) {
    await tierMedium(state, ptyOpts, wsFor, done, llmGo)
    buildReports(state)
  }

  // ── T5 long + soak ─────────────────────────────────────────────────────
  if (wanted.includes('long')) {
    await tierLong(state, ptyOpts, wsFor, done, llmGo)
    buildReports(state)
  }

  const paths = buildReports(state)
  const recs = state.all()
  const fails = recs.filter(r => r.verdict === 'FAIL' || r.verdict === 'STUCK').length
  console.log(`[user-e2e] runId=${runId} 共 ${recs.length} case，失败/失联 ${fails}`)
  console.log(`[user-e2e] 报告：${paths.report}`)
  console.log(`[user-e2e] 定位：${paths.diagnosis}`)
  process.exit(fails > 0 ? 1 : 0)
}

// ── T1 core 各 case ──────────────────────────────────────────────────────
async function coreMultiTurn(
  state: RunState,
  ptyOpts: (id: string) => Parameters<typeof Pty.start>[0],
  id: string,
  turns: number,
): Promise<void> {
  const t0 = Date.now()
  const pty = await Pty.start(ptyOpts(id))
  const words = Array.from({ length: turns }, (_, i) => `e2e-core-${id}-${i + 1}`)
  const perTurn: Record<string, number> = {}
  let okAll = true
  let brokenAt = -1
  for (const w of words) {
    pty.send(`回复且仅回复标记词：${w}`)
    const r = await pty.waitCount(w, 2, 180_000, 3000)
    perTurn[w] = r.ms
    if (!r.ok && brokenAt === -1) {
      okAll = false
      brokenAt = words.indexOf(w)
      // 断点后不再续发（记录断点即本 case 结论），直接收尾
      break
    }
  }
  const tail = pty.text()
  pty.kill()
  state.rec({
    id,
    tier: 'core',
    verdict: okAll ? 'PASS' : 'FAIL',
    ms: Date.now() - t0,
    note: okAll
      ? `${turns}/${turns} 轮 marker 渲染（基本多轮通）`
      : `第 ${brokenAt + 1} 轮起无响应（${words[brokenAt]} 未渲染）——报障复现`,
    evidence: { perTurnMs: perTurn, words },
    drivers: { pty: { verdict: okAll ? 'PASS' : 'FAIL', ok: okAll, tail: tailLinesSafe(tail) } },
  })
}

async function coreHeadlessResume(
  state: RunState,
  wsFor: (id: string) => string,
  id: string,
): Promise<void> {
  const t0 = Date.now()
  const ws = wsFor(id)
  const h1 = await headlessRound({
    repoRoot: REPO,
    workspace: ws,
    sandboxHome: process.env.HOME!,
    prompt: '回复且仅回复标记词：e2e-core-2a',
    timeoutMs: 240_000,
  })
  const h2 = h1.sessionId
    ? await headlessRound({
        repoRoot: REPO,
        workspace: ws,
        sandboxHome: process.env.HOME!,
        resume: h1.sessionId,
        prompt: '回复且仅回复标记词：e2e-core-2b',
        timeoutMs: 240_000,
      })
    : null
  const ok = h1.ok && h2 != null && h2.ok && h2.sessionId === h1.sessionId
  state.rec({
    id,
    tier: 'core',
    verdict: ok ? 'PASS' : 'FAIL',
    ms: Date.now() - t0,
    note: ok
      ? `headless --resume 同 session 2 轮通过（${h1.sessionId?.slice(0, 8)}）`
      : `headless 多轮断：r1=${h1.ok}${h1.zeroContent ? '(0内容)' : ''} r2=${h2 ? (h2.ok ? 'ok' : `fail${h2.zeroContent ? '(0内容)' : ''}`) : '未发起（r1 无 sessionId）'}——engine loop 续轮面`,
    drivers: {
      headless: {
        verdict: ok ? 'PASS' : 'FAIL',
        ok,
        detail: `r1 ${h1.ms}ms r2 ${h2?.ms ?? '-'}ms`,
        zeroContent: h1.zeroContent || h2?.zeroContent,
        stderrTail: (h1.stderrTail + '\n' + (h2?.stderrTail ?? '')).slice(-400),
      },
    },
  })
}

async function coreToolRound(
  state: RunState,
  ptyOpts: (id: string) => Parameters<typeof Pty.start>[0],
  id: string,
): Promise<void> {
  const t0 = Date.now()
  const pty = await Pty.start(ptyOpts(id))
  const PROMPT = '用工具在 ./out 目录创建文件 hello.txt（内容一行：hello-atlas-e2e-core），然后读取该文件并回复文件内容。'
  pty.send(PROMPT)
  const r = await pty.waitCount('hello-atlas-e2e-core', 2, 300_000, 3000)
  const ws = join(ROOT, 'workspaces', state.meta.runId, id)
  let diskOk = false
  try {
    diskOk = readFileSync(join(ws, 'out', 'hello.txt'), 'utf8').includes('hello-atlas-e2e-core')
  } catch {
    /* 缺文件 */
  }
  const ok = r.ok && diskOk
  const tail = pty.text()
  pty.kill()
  state.rec({
    id,
    tier: 'core',
    verdict: ok ? 'PASS' : 'FAIL',
    ms: Date.now() - t0,
    note: ok
      ? '工具回合通（渲染 + 磁盘产物双证）'
      : `工具回合断：渲染=${r.ok}（marker ${r.count}/2）磁盘=${diskOk}`,
    evidence: { markerCount: r.count, diskOk, waitMs: r.ms },
    drivers: { pty: { verdict: ok ? 'PASS' : 'FAIL', ok, tail: tailLinesSafe(tail) } },
  })
}

/** 流式中排队输入：发 w1 → 等 15s（模型 60-110s 仍在流式）→ 发 w2（进队列）→ 双 marker 各 ≥2 */
async function coreQueueInput(
  state: RunState,
  ptyOpts: (id: string) => Parameters<typeof Pty.start>[0],
  id: string,
): Promise<void> {
  const t0 = Date.now()
  const pty = await Pty.start(ptyOpts(id))
  const w1 = `e2e-queue-a`
  const w2 = `e2e-queue-b`
  pty.send(`回复且仅回复标记词：${w1}`)
  await sleep(15_000) // w1 流式中（弱模型单轮 60-110s）
  pty.send(`回复且仅回复标记词：${w2}`) // 排队
  const r1 = await pty.waitCount(w1, 2, 300_000, 2000)
  const r2 = await pty.waitCount(w2, 2, 300_000, 2000)
  const text = pty.text()
  const w2Echo = countOcc(text, w2) >= 1
  const ok = r1.ok && r2.ok
  pty.kill()
  state.rec({
    id,
    tier: 'core',
    verdict: ok ? 'PASS' : 'FAIL',
    ms: Date.now() - t0,
    note: ok
      ? '流式中排队输入正常（w2 入队 → w1 完成后渲染）'
      : `排队输入面异常：w1=${r1.ok ? '渲染' : `未渲染(${r1.count}/2)`} w2=${r2.ok ? '渲染' : `未渲染(${r2.count}/2, 回显=${w2Echo})`}——用户「连打两条」场景复现`,
    evidence: { w1Ms: r1.ms, w2Ms: r2.ms, w2Echo },
    drivers: { pty: { verdict: ok ? 'PASS' : 'FAIL', ok, tail: tailLinesSafe(text) } },
  })
}

// ── T2 slash sweep ────────────────────────────────────────────────────────
async function tierSlash(
  state: RunState,
  ptyOpts: (id: string) => Parameters<typeof Pty.start>[0],
  wsFor: (id: string) => string,
  done: Set<string>,
  llmGo: boolean,
): Promise<void> {
  const ws = wsFor('slash')
  // 给 git 系命令素材（diff/commit/tag/branch/rewind）
  writeFileSync(join(ws, 'SLEDGE.txt'), 'e2e slash sweep workspace\n')
  try {
    execSync('git init -q && git add . && git -c user.name=e2e -c user.email=e2e@atlas.local commit -qm "sweep ws"', { cwd: ws })
  } catch {
    /* git 缺则降级 */
  }

  const reg = await dumpCommands(ws)
  const metaDoc = JSON.parse(readFileSync(join(ROOT, 'cases', 'slash-meta.json'), 'utf8'))
  const meta: Record<string, any> = metaDoc.commands ?? {}
  const liveNames = new Set(reg.cmds.map(c => c.name))
  const typeOf = new Map(reg.cmds.map(c => [c.name, c.type]))

  const DANGER = new Set(['exit', 'rewind', 'force-snip'])
  const cmds = reg.cmds.filter(c => !DANGER.has(c.name))
  const danger = reg.cmds.filter(c => DANGER.has(c.name))
  // 顺序：local 快面 → llm → auth（未知按 local 快面兜底）
  const clsOf = (name: string): string =>
    meta[name]?.cls ?? (typeOf.get(name) === 'prompt' ? 'llm' : 'local')
  const order: Record<string, number> = { local: 0, llm: 1, auth: 2 }
  cmds.sort((a, b) => (order[clsOf(a.name)] ?? 0) - (order[clsOf(b.name)] ?? 0))

  let session: Pty | null = null
  let respawns = 0
  let sessN = 0
  let probeN = 0
  let stuckStreak = 0 // 连续 STUCK 数：存活 session 复用 1 次（测自恢复），第 2 次才换
  const ensureSession = async (): Promise<Pty> => {
    if (session?.alive()) return session
    if (session) {
      session.kill()
      respawns++
      await sleep(2000) // 旧 TUI 组回收 + 项目锁释放窗口
    }
    sessN++
    session = await Pty.start({
      ...ptyOpts('slash'),
      logPath: logForPath(state.meta.runId, `slash-pty-${sessN}`),
    })
    return session
  }

  for (const c of cmds) {
    const id = `slash/${c.name}`
    if (done.has(id)) continue
    const m = meta[c.name] ?? {}
    const cls = m.cls ?? (typeOf.get(c.name) === 'prompt' ? 'llm' : 'local')
    const inLive = reg.source === 'baked' || liveNames.has(c.name)
    const isLlm = cls === 'llm'
    if (isLlm && !llmGo) {
      state.rec({ id, tier: 'slash', verdict: 'SKIP', ms: 0, note: 'GATE: LLM 未放行（本地面照跑）' })
      continue
    }
    // vim 面：toggle 会把 editorMode=vim 持久化进沙箱 .atlas.json（全局配置），
    // 污染后续 case（Esc 进 vim NORMAL 后探针串/恢复键 q、'/' 全被吞成 vim 指令；
    // session 复带/重启动直接进 vim 模式）——0405 实测 80/83 STUCK 级联即此。
    // 处置：独立 session 跑 + 结束后删 editorMode 键（只削本面污染，其余持久化态不动；
    // 初始沙箱无 .atlas.json，重启动回到初始配置面）。
    if (c.name === 'vim') {
      const vt0 = Date.now()
      const iso = await Pty.start(ptyOpts(`slash-${c.name}`))
      iso.send(`/${c.name}`)
      const vSettle = await iso.settle(2500, 30_000)
      const vText = iso.text()
      // ink 原地重绘：PTY 流里命令输出按列覆写、空格不连续（"Editormodesettovim"），
      // 判据须去空白后匹配（A/B 回归实测：连续字节匹配恒 false）
      const toggled = vText.replace(/\s+/g, '').includes('Editormodesetto')
      iso.kill()
      const vCfgPath = join(runHome, '.atlas.json')
      if (existsSync(vCfgPath)) {
        try {
          const vCfg = JSON.parse(readFileSync(vCfgPath, 'utf8'))
          if (vCfg.editorMode) {
            delete vCfg.editorMode
            writeFileSync(vCfgPath, JSON.stringify(vCfg, null, 2))
          }
        } catch {
          // 不可解析则留原样：只针对 editorMode 污染面，不破坏其他持久化态
        }
      }
      state.rec({
        id,
        tier: 'slash',
        verdict: toggled ? 'PASS' : 'STUCK',
        ms: Date.now() - vt0,
        note: toggled
          ? 'vim 模式切换（独立 session；已复原沙箱 .atlas.json editorMode，防污染后续 case）'
          : `vim（独立 session；命令面未响应${vSettle.ok ? '' : '，settle 超时'}）`,
        evidence: { cls, settleOk: vSettle.ok, inputAlive: toggled, expectOk: toggled, recovered: false, respawns, probeMs: 0 },
        drivers: { pty: { verdict: toggled ? 'PASS' : 'STUCK', ok: toggled, tail: tailLinesSafe(vText) } },
      })
      continue
    }
    const s = await ensureSession()
    const t0 = Date.now()
    const basePromptCount = s.count('❯')
    const argStr = m.arg ? ` ${m.arg}` : ''
    // 判据核心 = 回显探针（ink 原地重绘，提示符 ❯ 未必再写日志，计数不可靠）：
    // 往输入框打探针串（不带回车）→ 见回显 = 输入框活（用户面真属性）→ Ctrl-U 清残留
    const probeSeq = `e2e-probe-${c.name}-${++probeN}`
    const echoProbe = async (tag: string, timeoutMs = 6000): Promise<boolean> => {
      const b = s.count(`${probeSeq}${tag}`)
      s.sendRaw(`${probeSeq}${tag}`)
      const t0 = Date.now()
      for (;;) {
        if (s.count(`${probeSeq}${tag}`) > b) return true
        if (!s.alive() || Date.now() - t0 > timeoutMs) return s.count(`${probeSeq}${tag}`) > b
      }
    }
    const cleanupLine = async (): Promise<void> => {
      s.sendRaw('\x15') // Ctrl-U 清输入框残留（不带换行）
      await sleep(300)
    }
    const sizeBefore = s.logSize()
    s.send(`/${c.name}${argStr}`)
    // local-jsx 命令也可能走 LLM 回合（如 /add-dir 的「Channelling…」面）：
    // settle 窗口放宽（静默即早退，快命令零代价；慢命令等回合完成再探针）
    const waitMs = cls === 'llm' ? 180_000 : cls === 'auth' ? 60_000 : 120_000
    let settle = await s.settle(cls === 'llm' ? 4000 : 2500, waitMs)
    // meta.esc 命令（对话框/列表/picker 面）：先 Esc 再判
    if (m.esc) {
      s.esc()
      await sleep(1500)
      settle = await s.settle(2500, 12_000)
    }
    // 45s 窗口：渲染管线可能落后墙钟 12s~100s+（footer 12s tick 批量冲刷，实测
    // session-8 迟到 >12s、add-dir session 迟到 ~100s）。延迟本身即诊断证据
    // （probeMs 记入 evidence）；>45s 的冻结记 STUCK（渲染冻结），非输入面判据问题。
    const probeT0 = Date.now()
    let inputAlive = await echoProbe('', 45_000)
    const probeMs = Date.now() - probeT0
    let recovered = false
    if (!inputAlive && s.alive()) {
      // 恢复阶梯：Esc → q → Esc+q（每步后复探针）
      s.esc()
      await sleep(1000)
      inputAlive = await echoProbe('-r1', 15_000)
      if (inputAlive) await cleanupLine()
      if (!inputAlive) {
        s.sendRaw('q')
        await sleep(1000)
        inputAlive = await echoProbe('-r2', 15_000)
        if (inputAlive) await cleanupLine()
      }
      if (!inputAlive) {
        s.esc()
        s.sendRaw('q')
        await sleep(1200)
        inputAlive = await echoProbe('-r3', 15_000)
        if (inputAlive) await cleanupLine()
      }
      recovered = inputAlive
    }
    // 探针串/被吞命令残留在输入框（Enter 被 suggestions guard 吞掉的场景）：
    // 清行，防污染下一条命令的输入面
    if (inputAlive) await cleanupLine()
    const text = s.text()
    const alive = s.alive()
    const expectOk = m.expect ? countOcc(text, m.expect) > 0 : true
    const busy = !inputAlive && !recovered && !settle.ok && s.logSize() > sizeBefore
    let verdict: CaseRec['verdict']
    if (!alive) verdict = 'STUCK'
    else if (inputAlive && expectOk) verdict = 'PASS'
    else if (inputAlive && !expectOk && m.expect) verdict = 'FAIL' // 输入面活但命令输出缺失（命令处理面断）
    else if (busy) verdict = 'TIMEOUT'
    else verdict = 'STUCK'
    const tail = tailLinesSafe(text)
    const lagNote = probeMs > 10_000 ? `（渲染滞后 ${Math.round(probeMs / 1000)}s）` : ''
    state.rec({
      id,
      tier: 'slash',
      verdict,
      ms: Date.now() - t0,
      note:
        (verdict === 'PASS' ? (recovered ? '（UX：需 Esc/q 恢复输入面）' : '') : `[${verdict}] `) +
        `${c.name}（${cls}${m.note ? `，${m.note}` : ''}${!inLive ? '，不在 live 注册表' : ''}${lagNote}）`,
      evidence: { cls, settleOk: settle.ok, inputAlive, expectOk, recovered, respawn: respawns, probeMs },
      drivers: { pty: { verdict, ok: verdict === 'PASS', tail } },
    })
    // STUCK：输入面失联。进程存活且非连发 → 复用 session（测渲染冻结能否自恢复；
    // 避免每条命令都付一次新 session 启动成本）；连发 2 次或进程已死 → 换 session。
    if (verdict === 'STUCK') {
      stuckStreak++
      if (session?.alive() && stuckStreak < 2) {
        s.esc()
        s.sendRaw('\x15') // 预清输入残留（被吞命令/探针串）
        await sleep(500)
      } else {
        session?.kill()
        session = null
        respawns++
      }
    } else {
      stuckStreak = 0
    }
  }

  // danger 面：独立 session
  for (const c of danger) {
    const id = `slash/${c.name}`
    if (done.has(id)) continue
    const t0 = Date.now()
    const s = await ensureSession()
    s.kill()
    const iso = await Pty.start(ptyOpts(`slash-${c.name}`))
    if (c.name === 'exit') {
      iso.send('/exit')
      await sleep(3000)
      let clean = false
      for (let i = 0; i < 27 && !clean; i++) {
        await sleep(1000)
        clean = !iso.alive()
      }
      const isoTail = tailLinesSafe(iso.text())
      const unknownCmd = /unknown command|unknown slash|未知命令/i.test(isoTail)
      const ok = clean || unknownCmd
      state.rec({
        id,
        tier: 'slash',
        verdict: ok ? 'PASS' : 'FAIL',
        ms: Date.now() - t0,
        note: clean
          ? '/exit 进程干净退出'
          : unknownCmd
            ? '/exit 不在注册表（优雅报错，可接受）'
            : '/exit 后进程悬挂 30s（退出面损坏）',
        drivers: { pty: { verdict: ok ? 'PASS' : 'FAIL', ok, tail: isoTail } },
      })
      iso.kill()
    } else {
      // rewind / force-snip：沙箱内执行，断不崩 + 输入恢复
      iso.send(`/${c.name}`)
      const settle = await iso.settle(2500, 30_000)
      if (!settle.ok) {
        iso.esc()
        await sleep(2000)
      }
      const ok = iso.alive()
      const tail = tailLinesSafe(iso.text())
      state.rec({
        id,
        tier: 'slash',
        verdict: ok ? 'PASS' : 'STUCK',
        ms: Date.now() - t0,
        note: ok ? `${c.name}（独立 session，未崩）` : `${c.name} 打死 session（danger 面）`,
        drivers: { pty: { verdict: ok ? 'PASS' : 'STUCK', ok, tail } },
      })
      iso.kill()
    }
  }
  if (session) session.kill()
}

// ── T3 short ──────────────────────────────────────────────────────────────
async function tierShort(
  state: RunState,
  ptyOpts: (id: string) => Parameters<typeof Pty.start>[0],
  wsFor: (id: string) => string,
  done: Set<string>,
  llmGo: boolean,
): Promise<void> {
  const cases: any[] = JSON.parse(readFileSync(join(ROOT, 'cases', 'short.json'), 'utf8'))
  for (const c of cases) {
    const id = c.id
    if (done.has(id)) continue
    if (!llmGo) {
      state.rec({ id, tier: 'short', verdict: 'SKIP', ms: 0, note: 'GATE: LLM 未放行' })
      continue
    }
    const t0 = Date.now()
    const drivers: Record<string, any> = {}
    let allOk = true
    for (const drv of c.drivers as string[]) {
      const drvWs = c.drivers.length > 1 ? wsFor(`${id}/${drv}`) : wsFor(id)
      if (drv === 'headless') {
        const h = await headlessRound({
          repoRoot: REPO,
          workspace: drvWs,
          sandboxHome: process.env.HOME!,
          prompt: c.prompt,
          timeoutMs: c.timeoutMs ?? 300_000,
        })
        let diskOk = true
        if (c.disk) diskOk = diskCheck(drvWs, c.disk)
        const ok = h.ok && diskOk
        allOk = allOk && ok
        drivers[drv] = {
          verdict: ok ? 'PASS' : 'FAIL',
          ok,
          ms: h.ms,
          detail: `result=${h.result?.subtype ?? 'none'} is_error=${h.result?.is_error} tools=${h.toolUses.slice(0, 6).join(',')} disk=${diskOk}${h.zeroContent ? '（0内容形态）' : ''}`,
          zeroContent: h.zeroContent,
          toolUses: h.toolUses.slice(0, 10),
          sessionId: h.sessionId,
          stderrTail: h.stderrTail.slice(-400),
        }
      } else {
        const pty = await Pty.start({
          ...ptyOpts(id),
          workspace: drvWs,
          logPath: logForPath(state.meta.runId, `${id}-pty`),
        })
        let ok = true
        const details: string[] = []
        // 顺序发送：前一轮 marker 渲染后才发下一轮（干净多轮，非排队场景）
        const pairs: [string, string | undefined][] = c.marker2
          ? [
              [c.prompt, c.marker],
              [c.prompt2, c.marker2],
            ]
          : [[c.prompt, c.marker]]
        const perTurnMs = (c.timeoutMs ?? 300_000) / pairs.length + 60_000
        for (const [step, word] of pairs) {
          pty.send(step)
          if (word) {
            const r = await pty.waitCount(word, 2, perTurnMs, 2500)
            details.push(`${word}:${r.count}/2`)
            if (!r.ok) ok = false
          } else {
            // 无 marker 用例（磁盘 ground truth 面，如 short-filewrite）：
            // 等渲染静默即可，断言交给下方 disk 检查（旧版误等字面量 "undefined"）
            const s = await pty.settle(10_000, perTurnMs)
            details.push(`settle:${s.ok}`)
            if (!s.ok) ok = false
          }
        }
        if (c.disk) {
          const dOk = diskCheck(drvWs, c.disk)
          details.push(`disk:${dOk}`)
          ok = ok && dOk
        }
        const tail = tailLinesSafe(pty.text())
        pty.kill()
        allOk = allOk && ok
        drivers[drv] = { verdict: ok ? 'PASS' : 'FAIL', ok, tail, detail: details.join(' ') }
      }
    }
    state.rec({
      id,
      tier: 'short',
      verdict: allOk ? 'PASS' : 'FAIL',
      ms: Date.now() - t0,
      note: allOk
        ? `short 任务通过（${(c.drivers as string[]).join('+')}）`
        : `short 任务断：${Object.entries(drivers)
            .filter(([, v]) => !v.ok)
            .map(([k, v]) => `${k}(${v.detail ?? v.tail?.slice(0, 60)})`)
            .join('；')}`,
      drivers,
    })
  }
}

// ── T4 medium（fixture 修 bug / 加功能，磁盘 ground truth）──────────────
async function tierMedium(
  state: RunState,
  ptyOpts: (id: string) => Parameters<typeof Pty.start>[0],
  wsFor: (id: string) => string,
  done: Set<string>,
  llmGo: boolean,
): Promise<void> {
  const cases: any[] = JSON.parse(readFileSync(join(ROOT, 'cases', 'medium.json'), 'utf8'))
  for (const c of cases) {
    const id = c.id
    if (done.has(id)) continue
    if (!llmGo) {
      state.rec({ id, tier: 'medium', verdict: 'SKIP', ms: 0, note: 'GATE: LLM 未放行' })
      continue
    }
    const t0 = Date.now()
    const drivers: Record<string, any> = {}
    let allOk = true
    for (const drv of c.drivers as string[]) {
      // 每 driver 独立新 fixture（公平对照，不被前一 driver 的修复污染）
      const drvWs = wsFor(`${id}/${drv}`)
      buildCalcFixture(drvWs)
      if (drv === 'headless') {
        const h = await headlessRound({
          repoRoot: REPO,
          workspace: drvWs,
          sandboxHome: process.env.HOME!,
          prompt: c.prompt,
          timeoutMs: c.timeoutMs ?? 1_500_000,
        })
        const test = runFixtureTest(drvWs)
        const ok = h.ok && test.pass
        allOk = allOk && ok
        drivers[drv] = {
          verdict: ok ? 'PASS' : 'FAIL',
          ok,
          ms: h.ms,
          detail: `result=${h.result?.subtype ?? 'none'} is_error=${h.result?.is_error} tools=${h.toolUses.length}次 test=${test.pass}`,
          toolUses: h.toolUses.slice(0, 20),
          stderrTail: h.stderrTail.slice(-400),
        }
      } else {
        const pty = await Pty.start({
          ...ptyOpts(id),
          workspace: drvWs,
          logPath: logForPath(state.meta.runId, `${id}-pty`),
        })
        pty.send(c.prompt)
        const settle = await pty.settle(6000, c.timeoutMs ?? 1_500_000)
        const test = runFixtureTest(drvWs)
        const ok = settle.ok && test.pass
        allOk = allOk && ok
        const tail = tailLinesSafe(pty.text())
        pty.kill()
        drivers[drv] = {
          verdict: ok ? 'PASS' : 'FAIL',
          ok,
          detail: `settle=${settle.ok} test=${test.pass}（磁盘 ground truth）`,
          tail,
        }
      }
    }
    state.rec({
      id,
      tier: 'medium',
      verdict: allOk ? 'PASS' : 'FAIL',
      ms: Date.now() - t0,
      note: allOk
        ? 'fixture 任务通过（双 driver 磁盘 ground truth）'
        : `fixture 任务断：${Object.entries(drivers)
            .filter(([, v]) => !v.ok)
            .map(([k, v]) => `${k}(${v.detail})`)
            .join('；')}`,
      drivers,
    })
  }
}

// ── T5 long + soak ────────────────────────────────────────────────────────
async function tierLong(
  state: RunState,
  ptyOpts: (id: string) => Parameters<typeof Pty.start>[0],
  wsFor: (id: string) => string,
  done: Set<string>,
  llmGo: boolean,
): Promise<void> {
  // long-multistep（headless，工具预算观察面）
  if (!done.has('long-multistep')) {
    if (!llmGo) {
      state.rec({ id: 'long-multistep', tier: 'long', verdict: 'SKIP', ms: 0, note: 'GATE' })
    } else {
      const t0 = Date.now()
      const ws = wsFor('long-multistep')
      buildCalcFixture(ws)
      const c: any = JSON.parse(readFileSync(join(ROOT, 'cases', 'long.json'), 'utf8'))[0]
      const h = await headlessRound({
        repoRoot: REPO,
        workspace: ws,
        sandboxHome: process.env.HOME!,
        prompt: c.prompt,
        timeoutMs: c.timeoutMs,
      })
      const test = runFixtureTest(ws)
      const log = gitLog(ws)
      const commitOk = /fix: calc bug \+ stats module/i.test(log)
      const overBudget = h.toolUses.length > (c.toolBudget ?? 99)
      const ok = h.ok && test.pass && commitOk && !overBudget
      state.rec({
        id: 'long-multistep',
        tier: 'long',
        verdict: ok ? 'PASS' : 'FAIL',
        ms: Date.now() - t0,
        note: ok
          ? `长程多步通过（${h.toolUses.length} 次工具调用，预算 ${c.toolBudget}）`
          : `长程断：result=${h.ok}${h.zeroContent ? '(0内容)' : ''} test=${test.pass} commit=${commitOk} 工具=${h.toolUses.length}/${c.toolBudget}${h.timedOut ? '（超时）' : ''}`,
        evidence: { toolUses: h.toolUses, gitLog: log.slice(0, 300) },
        drivers: {
          headless: {
            verdict: ok ? 'PASS' : 'FAIL',
            ok,
            ms: h.ms,
            detail: `num_turns=${h.result?.num_turns} is_error=${h.result?.is_error}`,
            toolUses: h.toolUses.slice(0, 30),
            stderrTail: h.stderrTail.slice(-400),
          },
        },
      })
    }
  }
  // soak：单 TUI session 连续 10 轮 marker（loop 漂移/泄漏面 + 逐轮时延曲线）
  if (!done.has('soak')) {
    if (!llmGo) {
      state.rec({ id: 'soak', tier: 'long', verdict: 'SKIP', ms: 0, note: 'GATE' })
    } else {
      const t0 = Date.now()
      const pty = await Pty.start(ptyOpts('soak'))
      const latencies: Record<string, number> = {}
      let okCount = 0
      let brokenAt = -1
      for (let k = 1; k <= 10; k++) {
        const w = `e2e-soak-${k}`
        pty.send(`回复且仅回复标记词：${w}`)
        const r = await pty.waitCount(w, 2, 240_000, 2000)
        latencies[w] = r.ms
        if (r.ok) okCount++
        else if (brokenAt === -1) {
          brokenAt = k
          break
        }
      }
      pty.kill()
      const ok = okCount === 10
      state.rec({
        id: 'soak',
        tier: 'long',
        verdict: ok ? 'PASS' : 'FAIL',
        ms: Date.now() - t0,
        note: ok
          ? `soak 10/10 轮（loop 无漂移）；时延曲线 ${JSON.stringify(latencies)}`
          : `soak ${okCount}/10 轮，第 ${brokenAt} 轮断——长 session loop 稳定性问题`,
        evidence: { latenciesMs: latencies, okCount, brokenAt },
        drivers: { pty: { verdict: ok ? 'PASS' : 'FAIL', ok, tail: tailLinesSafe(pty.text()) } },
      })
    }
  }
}

// ── helpers ───────────────────────────────────────────────────────────────
function tailLinesSafe(t: string, n = 25): string {
  const lines = t.split('\n').filter(l => l.trim().length > 0)
  return lines.slice(-n).join('\n')
}

function diskCheck(ws: string, disk: { path: string; contains?: string }): boolean {
  try {
    const content = readFileSync(join(ws, disk.path), 'utf8')
    return disk.contains ? content.includes(disk.contains) : true
  } catch {
    return false
  }
}

function logForPath(runId: string, id: string): string {
  const p = join(ROOT, 'artifacts', runId)
  mkdirSync(p, { recursive: true })
  return join(p, `${id}.log`)
}

void main().catch(e => {
  console.error('[user-e2e] 崩溃：', e)
  process.exit(2)
})
