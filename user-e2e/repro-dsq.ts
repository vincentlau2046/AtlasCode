/**
 * 定向复现（2026-10-02，v0.1.7）：「开发一个斗兽棋游戏」用户主诉三车道对照
 *
 * 背景：用户报 0.1.7 下「开发一个斗兽棋游戏」→ ✻ Sautéed for 2m 3s 无任何响应，
 * 且 thinking 信息无任何渲染（复现用户 transcript 原样 prompt）。
 *
 * 三车道：
 *  A. AtlasCode TUI（pty）——用户实际报障车道：发 prompt 后观察 180s（覆盖 2m3s 症状窗），
 *     记录首条实质响应时延 / thinking 是否渲染 / 输入面是否存活 / 磁盘产物
 *  B. AtlasCode headless（stream-json）——headless 车道对照（0.1.7 基线应正常出工具链）
 *  C. Claude Code headless（claude -p stream-json）——输出类参考基线（用户指定：用 claude
 *     headless 输出评判找差距）
 *
 * 隔离：全部 I/O 收敛 user-e2e/（workspaces/repro-20261002-dsq/*、artifacts/repro-20261002-dsq/*、
 * home/repro-20261002-dsq 沙箱 HOME）；真实 ~/.atlas 零写。
 *
 * 用法：bun run user-e2e/repro-dsq.ts
 */
import { mkdirSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { Pty } from './lib/pty'
import { headlessRound } from './lib/headless'
import { stripAnsi, nowIso } from './lib/util'
import { makeSandboxHome } from './lib/gates'

const REPO_ROOT = process.cwd()
const E2E = join(REPO_ROOT, 'user-e2e')
const WS = join(E2E, 'workspaces/repro-20261002-dsq')
const ART = join(E2E, 'artifacts/repro-20261002-dsq')
const SANDBOX_HOME = join(E2E, 'home/repro-20261002-dsq')
const PROMPT = '开发一个斗兽棋游戏'
const REAL_SETTINGS = join(process.env.HOME!, '.atlas', 'settings.json')

interface LaneA {
  name: 'A-atlas-tui'
  tuiReadyMs: number
  promptSentAt: number
  samples: { t: number; logSize: number; tail: string }[]
  firstSubstantiveAtMs: number | null // 首次出现非 spinner 实质助手文本
  thinkingRendered: boolean
  inputFaceAlive: boolean
  diskFiles: string[]
  tailAtEnd: string
  spinnerSeen: boolean
}

function listDisk(ws: string): string[] {
  const out: string[] = []
  const walk = (d: string, depth: number) => {
    if (depth > 2) return
    for (const f of readdirSync(d)) {
      if (f === 'node_modules' || f === '.git') continue
      const p = join(d, f)
      const st = statSync(p)
      if (st.isDirectory()) walk(p, depth + 1)
      else if (/\.(js|ts|mjs|py|html|cjs)$/.test(f)) out.push(p.slice(ws.length + 1))
    }
  }
  try {
    walk(ws, 0)
  } catch {
    /* empty ws */
  }
  return out
}

// ---------- Lane A：AtlasCode TUI（用户主诉车道） ----------
async function laneA(): Promise<LaneA> {
  const workspace = join(WS, 'tui')
  mkdirSync(workspace, { recursive: true }) // pty 子进程 chdir 需目录存在（2026-10-02 干净树复现 harness 假失败修复）
  const logPath = join(ART, 'laneA-tui-pty.log')
  const pty = await Pty.start({ repoRoot: REPO_ROOT, workspace, sandboxHome: SANDBOX_HOME, logPath }, 150_000)
  const tuiReadyMs = Date.now()
  const sizeBefore = pty.logSize()
  pty.send(PROMPT)
  const promptSentAt = Date.now()

  // 观察 180s（覆盖用户 2m3s 症状窗）：每 5s 采样 logSize + 尾 6 行
  const samples: LaneA['samples'] = []
  const SAMPLE_EVERY = 5_000
  const WATCH_MS = 180_000
  let firstSubstantiveAtMs: number | null = null
  for (let t = 0; t <= WATCH_MS; t += SAMPLE_EVERY) {
    await new Promise(r => setTimeout(r, SAMPLE_EVERY))
    const since = pty.sinceText()
    const tail = since.split('\n').slice(-6).join(' | ')
    samples.push({ t: t, logSize: pty.logSize() - sizeBefore, tail })
    if (firstSubstantiveAtMs === null) {
      // 实质助手文本判据：spinner 行（含 ✻ / Sautéed / 动词 + "for Xs"）之外出现的成段中文
      const nonSpinner = since
        .split('\n')
        .filter(l => !/✻/.test(l) && !/Sautéed|Crunched|Juggling|Simmering/.test(l) && !l.trim().startsWith('❯'))
        .filter(l => /[一-龥]{4,}/.test(l))
      if (nonSpinner.length > 0) firstSubstantiveAtMs = Date.now() - promptSentAt
    }
    if (!pty.alive()) break
  }
  const thinkingRendered = pty.count('Thinking') + pty.count('thinking') + pty.count('思考') > 0
  const spinnerSeen = pty.count('✻') > 0 || pty.count('Sautéed') > 0
  // 输入面探针：发独特串，3s 后查回显
  pty.sendRaw('PROBE42')
  await new Promise(r => setTimeout(r, 3_000))
  const inputFaceAlive = pty.sinceText().includes('PROBE42')
  const diskFiles = listDisk(workspace)
  const tailAtEnd = stripAnsi(pty.text()).split('\n').slice(-30).join('\n')
  pty.kill()
  return {
    name: 'A-atlas-tui',
    tuiReadyMs,
    promptSentAt,
    samples,
    firstSubstantiveAtMs,
    thinkingRendered,
    inputFaceAlive,
    diskFiles,
    tailAtEnd,
    spinnerSeen,
  }
}

// ---------- Lane B：AtlasCode headless ----------
interface LaneB {
  name: 'B-atlas-headless'
  ok: boolean
  timedOut: boolean
  ms: number
  toolUses: string[]
  textLen: number
  eventTypes: string[]
  thinkingBlocks: number
  diskFiles: string[]
  resultErr: string
}

async function laneB(): Promise<LaneB> {
  const workspace = join(WS, 'atlas-headless')
  mkdirSync(workspace, { recursive: true })
  const h = await headlessRound({
    repoRoot: REPO_ROOT,
    workspace,
    sandboxHome: SANDBOX_HOME,
    prompt: PROMPT,
    timeoutMs: 300_000,
  })
  const eventTypes = [...new Set(h.events.map(e => e?.type ?? '?'))]
  const thinkingBlocks = h.events
    .filter(e => e?.type === 'assistant')
    .flatMap(e => (e.message?.content ?? []) as any[])
    .filter(c => c?.type === 'thinking').length
  writeFileSync(join(ART, 'laneB-atlas-headless.jsonl'), JSON.stringify(h.events, null, 1))
  return {
    name: 'B-atlas-headless',
    ok: h.ok,
    timedOut: h.timedOut,
    ms: h.ms,
    toolUses: h.toolUses,
    textLen: h.assistantText.length,
    eventTypes,
    thinkingBlocks,
    diskFiles: listDisk(workspace),
    resultErr: String(h.result?.is_error ? h.result?.subtype ?? 'error' : ''),
  }
}

// ---------- Lane C：Claude Code headless（参考基线） ----------
interface LaneC {
  name: 'C-claude-headless'
  ok: boolean
  ms: number
  toolUses: string[]
  textLen: number
  eventTypes: string[]
  thinkingBlocks: number
  diskFiles: string[]
  note: string
}

function laneC(): Promise<LaneC> {
  const workspace = join(WS, 'claude-headless')
  mkdirSync(workspace, { recursive: true })
  const outPath = join(ART, 'laneC-claude-headless.jsonl')
  const child: ChildProcess = spawn(
    'claude',
    ['-p', '--output-format', 'stream-json', '--dangerously-skip-permissions', PROMPT],
    { cwd: workspace, env: { ...process.env }, detached: true, stdio: ['pipe', 'pipe', 'pipe'] },
  )
  let out = ''
  let err = ''
  child.stdout?.on('data', (d: Buffer) => (out += d.toString()))
  child.stderr?.on('data', (d: Buffer) => (err += d.toString()))
  child.stdin?.end()
  const t0 = Date.now()
  return new Promise<LaneC>(resolve => {
    const finish = (timedOut: boolean) => {
      if (!timedOut) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          /* already gone */
        }
      }
      const events: any[] = []
      for (const line of out.split('\n')) {
        const s = line.trim()
        if (!s.startsWith('{')) continue
        try {
          events.push(JSON.parse(s))
        } catch {
          /* skip */
        }
      }
      const result = [...events].reverse().find(e => e?.type === 'result') ?? null
      const textLen = events
        .filter(e => e?.type === 'assistant')
        .map(e =>
          (e.message?.content ?? [])
            .filter((c: any) => c?.type === 'text')
            .map((c: any) => c.text ?? '')
            .join(''),
        )
        .join('').length
      const toolUses = events
        .filter(e => e?.type === 'assistant')
        .flatMap(e => (e.message?.content ?? []).filter((c: any) => c?.type === 'tool_use'))
        .map((c: any) => c.name ?? '?')
      const thinkingBlocks = events
        .filter(e => e?.type === 'assistant')
        .flatMap(e => (e.message?.content ?? []) as any[])
        .filter(c => c?.type === 'thinking').length
      writeFileSync(outPath, out)
      resolve({
        name: 'C-claude-headless',
        ok: Boolean(result && !result.is_error),
        ms: Date.now() - t0,
        toolUses,
        textLen,
        eventTypes: [...new Set(events.map(e => e?.type ?? '?'))],
        thinkingBlocks,
        diskFiles: listDisk(workspace),
        note: timedOut ? 'timeout 300s' : result ? String(result.subtype ?? '') : `no result (stderr tail: ${err.slice(-200)})`,
      })
    }
    child.on('exit', () => finish(false))
    setTimeout(() => finish(true), 300_000)
  })
}

// ---------- main ----------
async function main() {
  for (const d of [WS, ART, SANDBOX_HOME]) mkdirSync(d, { recursive: true })
  const summary: Record<string, unknown> = {
    ts: nowIso(),
    prompt: PROMPT,
    lanes: {} as Record<string, unknown>,
  }

  console.error('[repro] 沙箱 HOME 构造…')
  await makeSandboxHome(SANDBOX_HOME, REAL_SETTINGS, false)

  console.error('[repro] Lane A：AtlasCode TUI（用户主诉车道，180s 观察窗）…')
  let a: LaneA
  try {
    a = await laneA()
  } catch (e) {
    a = {
      name: 'A-atlas-tui', tuiReadyMs: 0, promptSentAt: 0, samples: [], firstSubstantiveAtMs: null,
      thinkingRendered: false, inputFaceAlive: false, diskFiles: [], tailAtEnd: `LaneA 异常: ${String(e)}`,
      spinnerSeen: false,
    }
  }
  summary.lanes['A-atlas-tui'] = a
  console.error(
    `[repro] A: 首条实质响应=${a.firstSubstantiveAtMs ?? '180s 内无'} thinking渲染=${a.thinkingRendered} ` +
      `输入面活=${a.inputFaceAlive} 磁盘产物=${a.diskFiles.length} 个 spinner=${a.spinnerSeen}`,
  )

  console.error('[repro] Lane B：AtlasCode headless（300s 上限）…')
  const b = await laneB()
  summary.lanes['B-atlas-headless'] = b
  console.error(
    `[repro] B: ok=${b.ok} ${b.ms / 1000}s tools=[${b.toolUses.join(',')}] 文本=${b.textLen}字 ` +
      `thinking块=${b.thinkingBlocks} 磁盘产物=${b.diskFiles.length} 个`,
  )

  console.error('[repro] Lane C：Claude Code headless 基线（300s 上限）…')
  const c = await laneC()
  summary.lanes['C-claude-headless'] = c
  console.error(
    `[repro] C: ok=${c.ok} ${c.ms / 1000}s tools=[${c.toolUses.join(',')}] 文本=${c.textLen}字 ` +
      `thinking块=${c.thinkingBlocks} 磁盘产物=${c.diskFiles.length} 个 note=${c.note}`,
  )

  writeFileSync(join(ART, 'repro-summary.json'), JSON.stringify(summary, null, 2))
  console.error(`[repro] 完成 → ${join(ART, 'repro-summary.json')}`)
}

main().catch(e => {
  console.error('[repro] fatal:', e)
  process.exit(1)
})
