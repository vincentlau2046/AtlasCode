/**
 * V8-EXIT 隔离探针（0.1.37 生产 lane ⑧ 面附检，e2e 交付，零产品改动）：
 * 定因区分 V8-kill-leader-tmux 的 V8-EXIT 宽限 FAIL（45s/180s 首两跑）=
 *   (a) /exit 排在进行中回合尾部后执行（useCommandQueue 语义 + live gateway 慢轮）——非缺陷，或
 *   (b) /exit shutdown 路径缺陷（idle 态 /exit 也慢/不退出）——新发现（非 ⑧ 面，单独登记）。
 * 拓扑：专用 tmux socket 单 pane + 普通身份 CLI（无 team/无 ⑧ 参与）+ 一简单 prompt 回合 →
 *   回合完成（idle 判定：spinner 消失 + 稳定）→ 计时 /exit → 进程退出时刻。
 * 判读：
 *   - idle /exit ≤15s 退出 = /exit 路径健康（gracefulShutdown 预算 ~5s）→ (a) 坐实；
 *   - 15-60s = 慢（数据点，进一步定因）；
 *   - >60s 或宽限内未退 = shutdown 路径缺陷（登记新发现，归 Main，非 ⑧ lane 判据）。
 * 用法：bun run user-e2e/tui-diff/v8-exit-isolate.ts --repo <worktree> [--exit-grace-ms 120000]
 */
import { execSync, execFile } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { makeSandboxHome } from '../lib/gates'
import { sleep } from '../lib/util'

const pExecFile = promisify(execFile)

const E2E = '/home/vince/projects/AtlasCode/user-e2e'
const ROOT = join(E2E, 'tui-diff')
const ART = join(ROOT, 'artifacts')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas/settings.json')
const CMP_MODEL = 'deepseek-v4-pro'

const argv = process.argv.slice(2)
function argVal(flag: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}
const REPO = argVal('--repo') ?? process.env.ATLAS_E2E_REPO ?? '/home/vince/projects/AtlasCode'
const EXIT_GRACE_MS = Number(argVal('--exit-grace-ms') ?? '120000')
const SETTLE_MS = 75_000 // 简单回合完成基线窗
const BUSY_EXTEND_MS = 90_000 // spinner 仍在则延长等待上限
const READY_MS = 150_000

const TS = Date.now()
const RAND = Math.random().toString(36).slice(2, 5)
const SOCK = `atlas-v8x-${RAND}`
const SESSION = 'v8x'
const WS = join(ROOT, 'workspaces', `V8X-${TS % 100000}-${RAND}`)
const HOME = join(ROOT, 'home', `V8X-${TS % 100000}-${RAND}`)
const RUN_ID = `V8X-${TS}-${RAND}`
const RUN_DIR = join(ART, RUN_ID)
const BUN_BIN = execSync('command -v bun', { encoding: 'utf8' }).trim()
const CLI_PROC_RE = `bun run ${REPO}/src/atlascode/cli\\.ts`

function tmux(args: string[]): Promise<{ out: string; code: number }> {
  return pExecFile('tmux', ['-L', SOCK, ...args], { timeout: 20_000 })
    .then(r => ({ out: r.stdout, code: 0 }))
    .catch((e: any) => ({ out: String(e?.stdout ?? '') + String(e?.stderr ?? e?.message ?? e), code: e?.code ?? 1 }))
}
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b[=>]/g, '')
}
function paneAlive(paneId: string): boolean {
  try {
    const r = execSync(`tmux -L ${SOCK} display-message -p -t ${paneId} '#{pane_dead}' 2>/dev/null`, {
      encoding: 'utf8',
      timeout: 10_000,
    }).trim()
    return r === '0'
  } catch {
    return false
  }
}
function capture(paneId: string, history = 300): string {
  return stripAnsi(
    execSync(`tmux -L ${SOCK} capture-pane -p -S -${history} -t ${paneId} 2>/dev/null || true`, {
      encoding: 'utf8',
      timeout: 15_000,
    }),
  )
}
function cliAlive(): boolean {
  try {
    const out = execSync(`pgrep -f -- "${CLI_PROC_RE}" || true`, { encoding: 'utf8' }).trim()
    return out.split('\n').filter(Boolean).length > 0
  } catch {
    return false
  }
}
async function waitPaneReady(paneId: string): Promise<boolean> {
  const t0 = Date.now()
  for (let attempt = 0; ; attempt++) {
    const txt = capture(paneId, 80)
    if (txt.includes('查看全部命令') || (txt.includes('❯') && !txt.includes('选择模型提供方预设'))) return true
    if (txt.includes('选择模型提供方预设') && attempt < 3) {
      execSync(`tmux -L ${SOCK} send-keys -t ${paneId} Enter`, { stdio: 'ignore' })
      await sleep(90_000)
      continue
    }
    if (Date.now() - t0 > READY_MS || !paneAlive(paneId)) return false
    await sleep(2000)
  }
}

async function main(): Promise<void> {
  mkdirSync(RUN_DIR, { recursive: true })
  rmSync(WS, { recursive: true, force: true })
  mkdirSync(WS, { recursive: true })
  execSync('git init -q', { cwd: WS, stdio: 'ignore' })
  writeFileSync(join(WS, 'data.txt'), 'SECRET_TOKEN_XKCD_4217\n')
  execSync('git add -A && git commit -qm init', { cwd: WS, stdio: 'ignore' })
  // 沙箱 home（零写真实 ~/.atlas）
  rmSync(HOME, { recursive: true, force: true })
  await makeSandboxHome(HOME, REAL_SETTINGS, false)
  try { rmSync(join(HOME, '.atlas', '.config.json'), { force: true }) } catch { /* 不存在 */ }
  const p = join(HOME, '.atlas', 'settings.json')
  const s: any = JSON.parse(readFileSync(p, 'utf8'))
  for (const role of ['small', 'fast', 'premium']) {
    s.modelRoles = s.modelRoles ?? {}
    s.modelRoles[role] = { provider: 'iff', models: [{ model: `iff/${CMP_MODEL}` }] }
  }
  s.model = CMP_MODEL
  writeFileSync(p, JSON.stringify(s, null, 2))

  const s0 = await tmux(['new-session', '-d', '-s', SESSION, '-x', '200', '-y', '50', '-P', '-F', '#{pane_id}'])
  if (s0.code !== 0) throw new Error(`tmux new-session 失败：${s0.out.slice(0, 200)}`)
  const pane = s0.out.trim()
  const cmd =
    `cd ${WS} && env HOME=${HOME} IS_DEMO=1 TERM=xterm-256color ` +
    `${BUN_BIN} run ${REPO}/src/atlascode/cli.ts code --permission-mode default`
  const archiver = setInterval(() => {
    const snap = stripAnsi(
      execSync(`tmux -L ${SOCK} capture-pane -p -S - -t ${pane} 2>/dev/null || true`, { encoding: 'utf8', timeout: 15_000 }),
    )
    if (snap) {
      try { writeFileSync(join(RUN_DIR, 'pane.log'), snap) } catch { /* 已死 */ }
    }
  }, 5000)
  archiver.unref()
  let notes: string[] = []
  let verdict = ''
  try {
    await tmux(['send-keys', '-t', pane, cmd, 'Enter'])
    const ready = await waitPaneReady(pane)
    if (!ready) throw new Error(`pane 未就绪（${READY_MS}ms），见 ${join(RUN_DIR, 'pane.log')}`)
    notes.push('REPL 就绪（普通身份，无 team/无 ⑧）')

    // 简单回合（一 Read 工具调用 + 一句话报告）
    await tmux(['send-keys', '-t', pane, '读取 data.txt，告诉我它的内容，用一句话报告。', 'Enter'])
    await sleep(SETTLE_MS)
    // 回合未结（spinner 态）则延长等待（上限 BUSY_EXTEND_MS）
    let extendT0 = Date.now()
    let stillBusy = true
    while (stillBusy && Date.now() - extendT0 < BUSY_EXTEND_MS) {
      const txt = capture(pane, 200)
      const tail = txt.slice(-1200)
      stillBusy = /Vectorizing|Profiling|Quantizing|Scheduling|Parallelizing/.test(tail)
      if (stillBusy) await sleep(5000)
    }
    notes.push(stillBusy ? `回合可能仍在进行（${BUSY_EXTEND_MS}ms 后 spinner 仍在）` : '回合完成（idle，spinner 消失）')

    // 计时 /exit → 退出
    const aliveBefore = cliAlive()
    const tE = Date.now()
    execSync(`tmux -L ${SOCK} send-keys -t ${pane} "/exit" Enter 2>/dev/null || true`, { stdio: 'ignore' })
    let exited = false
    let exitMs = -1
    for (;;) {
      if (!cliAlive()) {
        exited = true
        exitMs = Date.now() - tE
        break
      }
      if (Date.now() - tE > EXIT_GRACE_MS) break
      await sleep(1000)
    }
    const tailAtEnd = capture(pane, 60).slice(-400).replace(/\t/g, ' ').trim()
    writeFileSync(join(RUN_DIR, 'exit-tail.txt'), tailAtEnd)
    notes.push(`idle /exit 时刻 CLI 存活=${aliveBefore}；exitMs=${exitMs}（宽限 ${EXIT_GRACE_MS}ms）`)
    if (!exited) {
      verdict = 'DEFECT（idle /exit 宽限内未退 = /exit shutdown 路径缺陷候选；非 ⑧ 面，单独登记归 Main）'
    } else if (exitMs <= 15_000) {
      verdict = `HEALTHY（idle /exit ${exitMs}ms 内退出 ≤15s = /exit 路径健康；V8-kill-leader 45/180s 宽限 FAIL 定因 = 进行中回合排队 + live gateway 慢轮，非产品缺陷）`
    } else if (exitMs <= 60_000) {
      verdict = `SLOW（idle /exit ${exitMs}ms = 慢退出数据点；进一步定因区：核 exit-tail + diagnostics 日志）`
    } else {
      verdict = `DEFECT（idle /exit ${exitMs}ms > 60s = /exit shutdown 路径缺陷候选；非 ⑧ 面，单独登记归 Main）`
    }
  } catch (e: any) {
    verdict = `ERROR（${String(e?.message ?? e).slice(0, 200)}）`
  } finally {
    clearInterval(archiver)
    const snap = stripAnsi(
      execSync(`tmux -L ${SOCK} capture-pane -p -S - -t ${pane} 2>/dev/null || true`, { encoding: 'utf8', timeout: 15_000 }),
    )
    if (snap) {
      try { writeFileSync(join(RUN_DIR, 'pane.log'), snap) } catch { /* 已死 */ }
    }
    writeFileSync(
      join(RUN_DIR, 'result.json'),
      JSON.stringify({ run: RUN_ID, repo: REPO, ts: TS, verdict, notes, graceMs: EXIT_GRACE_MS }, null, 2),
    )
    for (const c of [
      `tmux -L ${SOCK} kill-server 2>/dev/null || true`,
      `pkill -f "${CLI_PROC_RE}" 2>/dev/null || true`,
    ]) {
      try { execSync(c, { stdio: 'ignore' }) } catch { /* best effort */ }
    }
  }
  console.log(`[V8X] 判定=${verdict} → ${RUN_DIR}`)
  process.exit(verdict.startsWith('DEFECT') || verdict.startsWith('ERROR') ? 1 : 0)
}

main().catch(e => {
  console.error('[V8X] 致命:', e)
  process.exit(2)
})
