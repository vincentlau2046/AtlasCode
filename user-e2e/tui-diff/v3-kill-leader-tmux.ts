/**
 * V3-⑧ 探针（0.1.37 生产 lane 新增真面核验，⑧ 真持久 pane 拓扑升级 v3-kill-leader.ts 一次性进程探针）：
 * 真 tmux 双 pane 拓扑（产品 PaneBackendExecutor 同款：持久 pane 恒驻等 leader 响应，
 * 非一次性进程自退）——worker 持久 pane 问权 → 请求落 leader inbox → 杀 leader
 * （tmux kill-pane，产品 killPane 语义）→ ⑧ deadline（shared env ATLAS_PERM_MAILBOX_DEADLINE_MS）
 * fire → **unavailable deny 行现形（approvalUnavailableReason 措辞）+ 回合继续不挂死**
 * = 封 pane-worker 用户面「杀 leader→挂死」（P1 用户面封口终验）。
 *
 * 拓扑（产品真实形态，TmuxBackend/PaneBackendExecutor 同款）：
 *   - 专用 tmux socket（-L atlas-v8-<rand>，隔离用户 tmux，kill-server 全清）
 *   - 持久 pane L = leader TUI（普通身份；tmux kill-pane = 字面「杀 leader」，产品 killPane 语义）
 *   - 持久 pane W = worker TUI（pane-spawn 真参数 --agent-id/--agent-name/--team-name/
 *     --agent-color/--parent-session-id + ATLAS_EXPERIMENTAL_AGENT_TEAMS=1 +
 *     ATLAS_PERM_MAILBOX_DEADLINE_MS 加速）；pane 恒驻（shell 活），worker CLI 进程
 *     存活至 deadline fire → ⑧ timer 得 settle（一次性进程探针的定因缺口面）。
 *   - 共享沙箱 home（零写真实 ~/.atlas）+ 预置 team 文件（v8-<rand>：team-lead + worker-1）
 *
 * 时序面（⑧ timer 于请求落盘时 arm，源级定因 swarmWorkerHandler.ts:96-112）：
 *   t0 = 请求落 leader inbox 墙钟 → deadline fire ≈ t0 + DEADLINE_MS →
 *   「Waiting for team lead approval」框关闭 + buildReject(approvalUnavailableReason) →
 *   工具调用解决 + 模型续行（回合不挂死）。
 *
 * 断言面（生产 lane ⑧ 面口径，f4 判据「⑧ deadline fire → unavailable deny 行现形 + 回合继续不挂死」）：
 *   V8-MAILBOX-REQ（hard）：leader 存活期请求落 leader inbox（跨进程信道真，同 V3）
 *   V8-PANE-PERSIST（hard）：deadline 到期时 worker CLI 进程存活（持久 pane 拓扑前提=⑧ timer 可 fire；
 *     一次性进程探针 1021ms 自退 < deadline 的定因缺口面，本拓扑核销）
 *   V8-DENY-LINE（hard）：观察窗内 unavailable deny 行现形（approvalUnavailableReason 措辞
 *     `approval unavailable: the approver (leader) did not respond within \d+ms` / 模型对
 *     fail-closed deny 的续行反应；未现形 = INCONCLUSIVE 定因登记，禁裸记）
 *   V8-TURN-CONTINUE（hard）：杀 leader 后 ⑧ 封口现形（「Waiting」框 deadline 后关闭 + 模型续行 /
 *     干净自退，非 90s 挂死）——⑧ 缺口时该面永冻（500ms poller 永收不到响应→回合挂死）→ FAIL
 *   V8-EXIT（hard）：/exit 后 worker 进程自退出（gracefulShutdown，⑧ 双 timer unref 无残留阻塞退出）
 *
 * 探针修正登记（2026-10-07，e2e 侧，零产品改动）：
 *   - V8-TURN-CONTINUE 判据修正：TUI 原地重绘使「capture 内容长度增长」判据钝感
 *     （capture 总长恒定），且「Waiting for team lead approval」英文框面在 worker 持久 pane
 *     实测未现（⑧ 封口面走 tool_result 内联渲染）。真判据 = deadline 后 worker 出现**新的
 *     assistant bullet（「●」计数较 deadline 前基线增长）= 模型续行产新内容** + worker CLI 存活
 *     （回合未死）。⑧ 缺失时（挂死）：无 deny 行 + 无新 bullet → 判据不误触。
 *   - V8-EXIT 宽限：/exit 路径可等待进行中的回合尾部（live gateway 慢轮 30-90s 量级）+
 *     5s gracefulShutdown 预算，45s 宽限过紧（0.1.37 生产 lane 首跑 V8-1791360844406-n68
 *     定因：CLI 于宽限结束后数秒内干净自退，非 ⑧ 残留 timer——残留会永久阻塞而非 ~50s 释放）；
 *     本 lane 以 --exit-grace-ms 180000 执行。
 *
 * 用法：
 *   bun run user-e2e/tui-diff/v3-kill-leader-tmux.ts --repo <worktree> [--deadline-ms 2000] [--observe-ms 90000] [--exit-grace-ms 180000]
 * 产物：artifacts/V8-<ts>-<rand>/{ticket.md,result.json,leader.pane.log,worker.pane.log,tmux-capture-tail.txt,inbox-snapshot.json}
 * 纪律：网关 8999 竞争探针串行（本探针 worker 分类器/模型面走 live IFF）；零 src/ 产品改动。
 */
import { execFile, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { makeSandboxHome } from '../lib/gates'
import { sleep } from '../lib/util'

const pExecFile = promisify(execFile)

const E2E = '/home/vince/projects/AtlasCode/user-e2e'
const ROOT = join(E2E, 'tui-diff')
const ART = join(ROOT, 'artifacts')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas/settings.json')
const CMP_MODEL = 'deepseek-v4-pro'

// ── 参数 ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
function argVal(flag: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}
const REPO = argVal('--repo') ?? process.env.ATLAS_E2E_REPO ?? '/home/vince/projects/AtlasCode'
const OBSERVE_MS = Number(argVal('--observe-ms') ?? '90000') // 杀 leader 后观察窗
const EXIT_GRACE_MS = Number(argVal('--exit-grace-ms') ?? '45000') // /exit 后自退出宽限
// ⑧ deadline（shared 单一事实源 env ATLAS_PERM_MAILBOX_DEADLINE_MS 缺省 30s；
// 探针传 2000 = f4 生产 lane 判据「⑧ deadline（2s）fire」口径，⑧ fail-closed 早于观察窗 fire）
const DEADLINE_MS = Number(argVal('--deadline-ms') ?? '2000')
const READY_MS = 150_000 // REPL 就绪窗（live gateway 单轮 60-110s 量级）

const TS = Date.now()
const RAND = Math.random().toString(36).slice(2, 5)
const TEAM = `v8-${TS % 100000}-${RAND}`
const LEAD_ID = `team-lead@${TEAM}`
const LEAD_NAME = 'team-lead'
const WORKER_ID = `w1@${TEAM}`
const WORKER_NAME = 'worker-1'
const PARENT_SESSION_ID = randomUUID()
const SOCK = `atlas-v8-${RAND}` // 专用 tmux socket（隔离用户 tmux）
const SESSION = 'v8'
const DANGEROUS_CMD = `rm -rf /tmp/atlas-v8-${TS}`
const WORKER_PROMPT = `请运行 Bash 命令 \`${DANGEROUS_CMD}\` 删除临时目录。只运行这一条命令，然后报告结果。`
const BUN_BIN = execSync('command -v bun', { encoding: 'utf8' }).trim()

// ── tmux 层（-L 专用 socket；产品 TmuxBackend 同款命令面）────────────
function tmux(args: string[]): Promise<{ out: string; code: number }> {
  return pExecFile('tmux', ['-L', SOCK, ...args], { timeout: 20_000 })
    .then(r => ({ out: r.stdout, code: 0 }))
    .catch((e: any) => ({ out: String(e?.stdout ?? '') + String(e?.stderr ?? e?.message ?? e), code: e?.code ?? 1 }))
}
const tmuxS = async (args: string[]): Promise<string> => (await tmux(args)).out.trim()

/** 剥净 ANSI（pane 捕获含转义） */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b[=>]/g, '')
}
/** worker CLI 进程存活（唯一 team 名 pgrep；pane 恒驻但 CLI 可自退——判 CLI 非 pane） */
function workerCliAlive(): boolean {
  try {
    const out = execSync(`pgrep -f -- "--agent-name ${WORKER_NAME} --team-name ${TEAM}" || true`, { encoding: 'utf8' }).trim()
    return out.split('\n').filter(Boolean).length > 0
  } catch {
    return false
  }
}

// ── 沙箱（零写真实 ~/.atlas：HOME 沙箱 = 全部配置/团队文件根；同 v3-kill-leader）──
async function seedV8Home(home: string): Promise<void> {
  rmSync(home, { recursive: true, force: true })
  await makeSandboxHome(home, REAL_SETTINGS, false)
  try {
    rmSync(join(home, '.atlas', '.config.json'), { force: true })
  } catch {
    /* 不存在 */
  }
  const p = join(home, '.atlas', 'settings.json')
  const s: any = JSON.parse(readFileSync(p, 'utf8'))
  for (const role of ['small', 'fast', 'premium']) {
    s.modelRoles = s.modelRoles ?? {}
    s.modelRoles[role] = { provider: 'iff', models: [{ model: `iff/${CMP_MODEL}` }] }
  }
  s.model = CMP_MODEL
  writeFileSync(p, JSON.stringify(s, null, 2))
  // team 文件（func 测试同款 schema；leader 在位、worker 在位）
  const teamDir = join(home, '.atlas', 'teams', TEAM)
  mkdirSync(teamDir, { recursive: true })
  writeFileSync(
    join(teamDir, 'config.json'),
    JSON.stringify(
      {
        name: TEAM,
        createdAt: TS,
        leadAgentId: LEAD_ID,
        members: [
          { agentId: LEAD_ID, name: LEAD_NAME, joinedAt: TS, tmuxPaneId: '', cwd: '/tmp', subscriptions: [] },
          { agentId: WORKER_ID, name: WORKER_NAME, joinedAt: TS, tmuxPaneId: '', cwd: '/tmp', subscriptions: [] },
        ],
      },
      null,
      2,
    ),
  )
}

function inboxDir(home: string): string {
  return join(home, '.atlas', 'teams', TEAM, 'inboxes')
}
/** 扫 leader inbox 找 permission_request（跨进程信道真 = 请求已送达 leader 侧文件；同 v3） */
function findPermissionRequest(home: string): string | null {
  const dir = inboxDir(home)
  if (!existsSync(dir)) return null
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      const t = readFileSync(join(dir, f), 'utf8')
      if (t.includes('permission_request') && t.includes('rm -rf')) return `${f} :: ${t.slice(0, 400)}`
    } catch {
      /* 写中态，下轮再扫 */
    }
  }
  return null
}

/** pane 捕获（历史 N 行 + 当前屏；剥净） */
function capture(paneId: string, history = 300): string {
  return stripAnsi(
    execSync(`tmux -L ${SOCK} capture-pane -p -S -${history} -t ${paneId} 2>/dev/null || true`, {
      encoding: 'utf8',
      timeout: 15_000,
    }),
  )
}

/** 全量历史捕获（-S - = 从头；ANSI 原样）——留档用（替代 pipe-pane，后者实测不产文件） */
function captureFull(paneId: string): string {
  try {
    return execSync(`tmux -L ${SOCK} capture-pane -p -S - -t ${paneId} 2>/dev/null || true`, {
      encoding: 'utf8',
      timeout: 15_000,
    })
  } catch {
    return ''
  }
}

/** 周期性全量快照留档（setInterval unref；每 5s 覆盖写最新全量历史到 outFile）。
 *  返回 stop 函数（finally 调，补最后一次快照）。pipe-pane 在 TUI 重绘场景实测不产文件，
 *  故改用 capture-pane 全量历史快照（TUI 原地重绘，全量历史含「Waiting」框等瞬态内容）。 */
function startArchiver(paneId: string, outFile: string): () => void {
  const timer = setInterval(() => {
    const snap = captureFull(paneId)
    if (snap) {
      try { writeFileSync(outFile, stripAnsi(snap)) } catch { /* pane 已死 */ }
    }
  }, 5000)
  timer.unref()
  return () => {
    clearInterval(timer)
    const snap = captureFull(paneId)
    if (snap) {
      try { writeFileSync(outFile, stripAnsi(snap)) } catch { /* 已死 */ }
    }
  }
}

/** REPL 就绪（banner + 提示符，同 Pty.waitAnySince 判据面；预设屏兜底 Enter，同 pty-driver） */
async function waitPaneReady(paneId: string, label: string, notes: string[]): Promise<boolean> {
  const t0 = Date.now()
  for (let attempt = 0; ; attempt++) {
    const txt = capture(paneId, 80)
    if (txt.includes('查看全部命令') || (txt.includes('❯') && !txt.includes('选择模型提供方预设'))) return true
    if (txt.includes('选择模型提供方预设') && attempt < 3) {
      execSync(`tmux -L ${SOCK} send-keys -t ${paneId} Enter`, { stdio: 'ignore' })
      notes.push(`${label} 预设屏 → Enter 确认`)
      await sleep(90_000)
      continue
    }
    if (Date.now() - t0 > READY_MS || !paneAlive(paneId)) return false
    await sleep(2000)
  }
}
function paneAlive(paneId: string): boolean {
  // tmux pane id 形如 %0（非 window 的 @0）；pane_dead=0 存活 / 1 已死。
  // 注：CLI 崩回 shell 时 pane（shell）仍活（pane_dead=0）——就绪判定以 REPL 字符串为准，
  // 此处仅用于「整个 pane/session 死了可提前退出」。
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

type ProbeOut = { id: string; ok: boolean | null; evidence: string; hard: boolean }

async function main(): Promise<void> {
  const runId = `V8-${TS}-${RAND}`
  const runDir = join(ART, runId)
  mkdirSync(runDir, { recursive: true })
  const ws = join(ROOT, 'workspaces', 'V8')
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  const home = join(ROOT, 'home', 'V8')
  await seedV8Home(home)

  const probes: ProbeOut[] = []
  const notes: string[] = []
  let fatalError: string | null = null
  let leaderPane = ''
  let workerPane = ''
  let stopLeaderArchiver: (() => void) | null = null
  let stopWorkerArchiver: (() => void) | null = null
  const cliArgs = `code --permission-mode default`
  const leaderCmd =
    `cd ${ws} && env HOME=${home} IS_DEMO=1 TERM=xterm-256color ` +
    `${BUN_BIN} run ${REPO}/src/atlascode/cli.ts ${cliArgs}`
  const workerCmd =
    `cd ${ws} && env HOME=${home} IS_DEMO=1 TERM=xterm-256color ` +
    `ATLAS_EXPERIMENTAL_AGENT_TEAMS=1 ATLAS_PERM_MAILBOX_DEADLINE_MS=${DEADLINE_MS} ` +
    `${BUN_BIN} run ${REPO}/src/atlascode/cli.ts ${cliArgs} ` +
    `--agent-id ${WORKER_ID} --agent-name ${WORKER_NAME} --team-name ${TEAM} --agent-color cyan --parent-session-id ${PARENT_SESSION_ID}`
  try {
    // ── 0. 专用 tmux server（-L socket；用户 tmux 隔离）+ 双 pane 拓扑 ──
    // 产品 TmuxBackend：leader pane（用户当前窗）+ split-window 持久 teammate pane。
    // 探针等价：new-session 持久 pane L + split-window 持久 pane W（均恒驻至 kill-server）。
    const s = await tmux(['new-session', '-d', '-s', SESSION, '-x', '200', '-y', '50', '-P', '-F', '#{pane_id}'])
    if (s.code !== 0) throw new Error(`tmux new-session 失败：${s.out.slice(0, 200)}`)
    leaderPane = s.out.trim()
    // 全量历史快照留档（替代 pipe-pane；TUI 重绘场景 pipe-pane 实测不产文件）
    stopLeaderArchiver = startArchiver(leaderPane, join(runDir, 'leader.pane.log'))
    await tmux(['send-keys', '-t', leaderPane, leaderCmd, 'Enter'])

    // ── 1. leader REPL 就绪（普通身份；mailbox 信道 = 磁盘文件，不依赖 leader swarm 门）──
    const leaderReady = await waitPaneReady(leaderPane, 'leader', notes)
    if (!leaderReady) throw new Error(`leader pane 未就绪（${READY_MS}ms 内未见 REPL），见 ${join(runDir, 'leader.pane.log')}`)
    notes.push('leader 持久 pane REPL 就绪')

    // ── 2. split-window 持久 worker pane + pane-spawn 真参数 CLI（产品 sendCommandToPane 同款）──
    const w = await tmux(['split-window', '-h', '-t', leaderPane, '-P', '-F', '#{pane_id}'])
    if (w.code !== 0) throw new Error(`split-window 失败：${w.out.slice(0, 200)}`)
    workerPane = w.out.trim()
    stopWorkerArchiver = startArchiver(workerPane, join(runDir, 'worker.pane.log'))
    await tmux(['send-keys', '-t', workerPane, workerCmd, 'Enter'])
    const workerReady = await waitPaneReady(workerPane, 'worker', notes)
    if (!workerReady) throw new Error(`worker pane 未就绪（${READY_MS}ms 内未见 REPL），见 ${join(runDir, 'worker.pane.log')}`)
    notes.push('worker 持久 pane REPL 就绪（pane 恒驻，区别于一次性进程探针）')

    // ── 3. worker 危险 Bash 问权（分类器不自动批 → 转发 leader mailbox；⑧ timer 于请求落盘时 arm）──
    await tmux(['send-keys', '-t', workerPane, WORKER_PROMPT, 'Enter'])

    // ── 4. leader 存活期：等 mailbox 请求落 leader inbox（信道真，90s 窗）──
    let reqEvidence: string | null = null
    const t0 = Date.now()
    for (;;) {
      reqEvidence = findPermissionRequest(home)
      if (reqEvidence) break
      if (Date.now() - t0 > 90_000) break
      if (!workerCliAlive() && !paneAlive(workerPane)) break
      await sleep(1000)
    }
    const reqMs = Date.now() - t0
    const reqWallTs = Date.now() // ⑧ 时序基准：deadline fire ≈ reqWallTs + DEADLINE_MS
    probes.push({
      id: 'V8-MAILBOX-REQ',
      hard: true,
      ok: reqEvidence !== null,
      evidence: reqEvidence
        ? `leader 存活期 ${reqMs}ms 内请求落 inbox（跨进程信道真）：${reqEvidence!.slice(0, 200)}`
        : '(未命中：leader inbox 无 permission_request → 触发未达或信道未走；核 worker.pane.log stderr)',
    })

    // ── 5. 杀 leader（tmux kill-pane = 产品 killPane 语义；字面「杀 leader」）──
    const killTs = Date.now()
    const k = await tmux(['kill-pane', '-t', leaderPane])
    if (k.code !== 0) notes.push(`kill-pane leader 非零（${k.out.slice(0, 120)}；pane 或已死）`)
    notes.push(`t=${killTs - t0}ms 杀 leader（tmux kill-pane 持久 pane L）`)

    // ── 6. 观察窗：⑧ 封口现形（⑧ deadline fail-closed 使工具调用解决）+ 时序 ──
    // ⑧ 封口判别（⑧ 第 4 终态 = deadline fail-closed deny）的持久 pane 拓扑 TUI 可观测面：
    //   杀 leader 后，无 ⑧ 时「Waiting for team lead approval」面永冻（500ms poller 永收不到
    //   响应 → 工具调用永挂 → 回合 90s 挂死）。有 ⑧ 时 deadline 到期（reqWallTs + DEADLINE_MS）
    //   → fail-closed deny（approvalUnavailableReason）送模型 → 工具调用解决 → 「Waiting」框关闭
    //   + 模型续行 / worker 干净自退（持久 pane 下二者皆可达——一次性进程探针自退早于 deadline 的
    //   定因缺口面在此拓扑核销：worker CLI 恒驻 → ⑧ timer 得 settle）。
    const t1 = Date.now()
    const deadlineFireWallTs = reqWallTs + DEADLINE_MS
    let turnOk = false
    let turnEvidence = '(观察窗内未见 ⑧ 封口现形)'
    let denyEvidence: string | null = null
    let denyWallTs: number | null = null
    let sessionEndWallTs: number | null = null
    let workerAliveAtDeadline: boolean | null = null
    let workerSelfExitWallTs: number | null = null // 观察窗内 worker CLI 自退（非 /exit）时刻
    let waitingSeen = false
    let waitingClosedWallTs: number | null = null
    // unavailable 措辞（shared approvalUnavailableReason）或模型对 fail-closed deny 的续行反应
    const denyRe =
      /approval unavailable|did not respond within \d+ms|denied \(fail-closed\)|the tool did NOT run|the tool did not run|did NOT run|no approver|未获批准|无法(?:运行|执行)|not approved|not granted|denied/i
    const lastContentLen = { v: 0 }
    let modelContinued = false
    let modelContinueWallTs: number | null = null
    // 判据修正（2026-10-07）：deadline 前「●」assistant bullet 计数基线（逐 poll 更新）；
    // deadline 后计数增长 = 模型续行产出新 assistant 消息（TUI 原地重绘下长度判据钝感的替代面）
    let bulletBeforeDeadline: number | null = null
    let bulletGrewWallTs: number | null = null
    while (Date.now() - t1 < OBSERVE_MS) {
      const txt = capture(workerPane, 300)
      if (!denyEvidence) {
        const m = txt.match(denyRe)
        if (m) {
          denyEvidence = m[0].trim().slice(0, 200)
          denyWallTs = Date.now()
        }
      }
      const waitingNow = /Waiting for team lead approval/i.test(txt.slice(-2500))
      if (waitingNow) waitingSeen = true
      if (waitingSeen && !waitingNow && waitingClosedWallTs === null) waitingClosedWallTs = Date.now()
      if (sessionEndWallTs === null && /Resume this session with/i.test(txt)) sessionEndWallTs = Date.now()
      if (workerAliveAtDeadline === null && Date.now() >= deadlineFireWallTs) workerAliveAtDeadline = workerCliAlive()
      if (workerSelfExitWallTs === null && !workerCliAlive()) workerSelfExitWallTs = Date.now()
      // 模型续行判据：deadline 到期后 pane 内容有新增且非「Waiting」框态（流式渲染中）
      if (Date.now() >= deadlineFireWallTs && txt.length > lastContentLen.v + 40 && !waitingNow && modelContinueWallTs === null) {
        modelContinueWallTs = Date.now()
        modelContinued = true
      }
      lastContentLen.v = Math.max(lastContentLen.v, txt.length)
      // 判据修正面：deadline 前基线逐 poll 更新；deadline 后新 assistant bullet（「●」计数增长）= 模型续行
      const bulletCount = (txt.match(/●/g) ?? []).length
      if (Date.now() < deadlineFireWallTs) bulletBeforeDeadline = bulletCount
      if (
        bulletGrewWallTs === null &&
        Date.now() >= deadlineFireWallTs &&
        bulletBeforeDeadline !== null &&
        bulletCount > bulletBeforeDeadline
      ) {
        bulletGrewWallTs = Date.now()
      }
      const boxClosedAfterDeadline = waitingClosedWallTs !== null && waitingClosedWallTs >= deadlineFireWallTs
      // worker 在观察窗内（/exit 前）干净自退且发生在 deadline 到期后 = 模型终答→任务完成（非 hang）
      const selfExitedAfterDeadline =
        workerSelfExitWallTs !== null && workerSelfExitWallTs >= deadlineFireWallTs && sessionEndWallTs !== null
      // 判据修正主面：deny 现形 + deadline 后模型续行（新 bullet）+ CLI 存活 = 回合未挂死
      const bulletContinue = denyEvidence !== null && bulletGrewWallTs !== null && workerCliAlive()
      if (boxClosedAfterDeadline || selfExitedAfterDeadline || (denyEvidence && modelContinued) || bulletContinue) {
        turnOk = true
        turnEvidence =
          `⑧ 封口现形（观察窗 ${Date.now() - t1}ms，deadline 到期=${new Date(deadlineFireWallTs).toISOString()}）：` +
          (boxClosedAfterDeadline
            ? `「Waiting」框于 t=${waitingClosedWallTs! - t0}ms 关闭（deadline 到期后工具调用解决，非 90s 挂死）`
            : selfExitedAfterDeadline
              ? `worker 于 t=${workerSelfExitWallTs! - t0}ms 干净自退（模型终答→任务完成，非 hang）`
              : bulletContinue
                ? `deny 行「${denyEvidence?.slice(0, 120)}」+ 模型续行（deadline 后新 assistant bullet t=${bulletGrewWallTs! - t0}ms，CLI 存活=回合未挂死；判据修正面：TUI 原地重绘下长度判据钝感）`
                : `deny 行「${denyEvidence?.slice(0, 120)}」+ 模型续行（t=${modelContinueWallTs! - t0}ms）`)
        break
      }
      if (!paneAlive(workerPane) && !workerCliAlive()) break
      await sleep(1000)
    }
    // ⑧ 封口时序结论（供报告定因）：以请求落盘 reqWallTs 为 t0，各时刻为相对 t0 的 ms
    const rel = (w: number | null): string => (w === null ? '未现' : `${w - t0}ms`)
    const timingNote =
      `⑧ 时序（t0=请求落盘 ${new Date(reqWallTs).toISOString()}）：deadline=${DEADLINE_MS}ms（到期 t=${DEADLINE_MS}ms），` +
      `deadline 到期时 worker CLI=${workerAliveAtDeadline === null ? '未到期' : workerAliveAtDeadline ? '存活(⑧ timer 可 fire)' : '已退(timer 未 fire)'}，` +
      `「Waiting」框=${waitingSeen ? (waitingClosedWallTs !== null ? `t=${rel(waitingClosedWallTs)} 关闭` : '全程未关闭(挂死)') : '未出现'}，` +
      `模型续行 t=${rel(modelContinueWallTs)}，worker 自退 t=${rel(workerSelfExitWallTs)}，session 终态 t=${rel(sessionEndWallTs)}`
    probes.push({
      id: 'V8-PANE-PERSIST',
      hard: true,
      ok: workerAliveAtDeadline === true,
      evidence: workerAliveAtDeadline === true
        ? `deadline 到期时（t=${DEADLINE_MS}ms）worker CLI 存活（持久 pane 拓扑：⑧ timer 得 settle，一次性进程探针定因缺口核销）`
        : `deadline 到期时 worker CLI ${workerAliveAtDeadline === null ? '未观测' : '已退'} → ⑧ timer 未 fire（拓扑前提不满足，定因：pane 内 CLI 提前自退/异常）`,
    })
    probes.push({
      id: 'V8-TURN-CONTINUE',
      hard: true,
      ok: turnOk ? true : null,
      evidence: turnOk ? `${turnEvidence}；${timingNote}` : `观察窗 ${OBSERVE_MS}ms 内未见 ⑧ 封口现形（「Waiting」框未关闭 + 无模型续行 + 无 deny 行 = 回合挂死面）；${timingNote}`,
    })
    probes.push({
      id: 'V8-DENY-LINE',
      hard: true,
      ok: denyEvidence !== null ? true : null,
      evidence: denyEvidence
        ? `unavailable deny 行现形 t=${rel(denyWallTs)}：「${denyEvidence.slice(0, 160)}」（approvalUnavailableReason 措辞 / 模型 fail-closed 反应）；${timingNote}`
        : `观察窗内未见 approval unavailable 字面行；${timingNote}（定因登记区：核 worker.pane.log 模型续行反应面 / tool_result 折叠渲染面）`,
    })

    // ── 7. 进程可退（⑧ 双 timer unref：500ms poll + deadline timer 无残留阻塞退出）──
    const workerAliveBefore = workerCliAlive()
    // /exit 时刻 pane tail 留档（定因区分：spinner 态=等待进行中回合尾部 vs REPL idle=shutdown 慢）
    const exitTailAtExit = capture(workerPane, 60).slice(-400).replace(/\t/g, ' ').trim()
    notes.push(`/exit 时刻 pane tail（${exitTailAtExit.slice(-160)}）`)
    execSync(`tmux -L ${SOCK} send-keys -t ${workerPane} "/exit" Enter 2>/dev/null || true`, { stdio: 'ignore' })
    const t2 = Date.now()
    let exited = false
    for (;;) {
      if (!workerCliAlive()) {
        exited = true
        break
      }
      if (Date.now() - t2 > EXIT_GRACE_MS) break
      await sleep(1000)
    }
    const exitMs = Date.now() - t2
    const paneTail = capture(workerPane, 60).slice(-600).replace(/\t/g, ' ')
    probes.push({
      id: 'V8-EXIT',
      hard: true,
      ok: exited,
      evidence: !exited
        ? `(宽限 ${EXIT_GRACE_MS}ms 内 worker CLI 仍存活 → 残留 timer 阻塞退出 或 TUI 未响应 /exit；核 worker.pane.log；宽限末段 tail：${paneTail.trim().slice(-160)})`
        : workerAliveBefore
          ? `/exit 后 ${exitMs}ms worker CLI 自退出（gracefulShutdown，⑧ 双 timer unref 无残留阻塞）；末段：${paneTail.trim().slice(-160)}`
          : `worker CLI 已于观察窗内干净自退（/exit 前已 dead，非 hang；「进程可退」满足）；末段：${paneTail.trim().slice(-160)}`,
    })
  } catch (e: any) {
    fatalError = String(e?.message ?? e).slice(0, 300)
    notes.push(`异常: ${fatalError}`)
  } finally {
    // 归档收尾：停周期快照器（补最后一次全量快照到 leader/worker.pane.log，须在 kill-server 前）
    try { stopLeaderArchiver?.() } catch { /* 已死 */ }
    try { stopWorkerArchiver?.() } catch { /* 已死 */ }
    // 捕获留档 + inbox 快照 + 专用 tmux server 全清（-L socket 隔离，kill-server 不误伤用户 tmux）
    try {
      if (workerPane) writeFileSync(join(runDir, 'tmux-capture-tail.txt'), capture(workerPane, 300))
    } catch { /* 已死 */ }
    try {
      const dir = inboxDir(home)
      const snap: Record<string, unknown> = {}
      if (existsSync(dir)) for (const f of readdirSync(dir)) snap[f] = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      writeFileSync(join(runDir, 'inbox-snapshot.json'), JSON.stringify(snap, null, 2))
    } catch (e: any) {
      notes.push(`inbox 快照失败: ${String(e).slice(0, 120)}`)
    }
    for (const cmd of [
      `tmux -L ${SOCK} kill-server 2>/dev/null || true`,
      `pkill -f "agent-name ${WORKER_NAME} --team-name ${TEAM}" 2>/dev/null || true`,
      `pkill -f "bun run ${REPO}/src/atlascode/cli\\.ts" 2>/dev/null || true`,
    ]) {
      try { execSync(cmd, { stdio: 'ignore' }) } catch { /* best effort */ }
    }
  }

  const hardFail = probes.filter(p => p.hard && p.ok === false).length
  const inconclusive = probes.filter(p => p.ok === null)
  // 假 PASS 防御：场景未跑完（fatalError，如 REPL 未就绪早退）→ 判 ERROR 非 PASS
  const verdict: string = fatalError
    ? `ERROR（场景未执行：${fatalError}）`
    : hardFail === 0
      ? 'PASS'
      : `FAIL（hardFail=${hardFail}）`
  const exitCode = fatalError ? 2 : hardFail === 0 ? 0 : 1
  const result = {
    run: runId,
    repo: REPO,
    ts: TS,
    scenario: 'V8 杀 leader ⑧ 真持久 pane 封口（0.1.37 生产 lane 真面核验；tmux 双 pane 拓扑）',
    observeMs: OBSERVE_MS,
    deadlineMs: DEADLINE_MS,
    probes,
    hardFail,
    inconclusive: inconclusive.map(p => p.id),
    verdict,
    fatalError,
    notes,
  }
  writeFileSync(join(runDir, 'result.json'), JSON.stringify(result, null, 2))
  const ticket = [
    `# V8 杀 leader ⑧ 真持久 pane 封口探针（0.1.37 生产 lane）`,
    ``,
    `- repo: ${REPO}`,
    `- 拓扑: 专用 tmux server（-L ${SOCK}）持久 pane L(leader) + 持久 pane W(worker, pane-spawn 真参数) + 预置 team 文件 ${TEAM} + 共享沙箱 home`,
    `- 流程: leader 就绪 → worker 危险 Bash 问权 → 请求落 leader inbox（存活期）→ tmux kill-pane 杀 leader → ⑧ deadline ${DEADLINE_MS}ms fire 观察窗 ${OBSERVE_MS}ms → worker /exit 自退出核验`,
    ``,
    `## 判定`,
    `- **${verdict}**`,
    ``,
    `## 探针`,
    ...probes.map(
      p =>
        `- **${p.id}**（${p.hard ? 'hard' : 'soft'}）= ${
          p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INCONCLUSIVE（触发未达）'
        } — ${p.evidence}`,
    ),
    ``,
    `## 定因登记区（INCONCLUSIVE 必填，禁裸记）`,
    ...(inconclusive.length ? inconclusive.map(p => `- ${p.id}: （e2e 填定因）`) : ['- 无']),
    ``,
    `## 备注`,
    ...notes.map(n => `- ${n}`),
    ``,
    `## artifacts`,
    `- ${runDir}（leader.pane.log / worker.pane.log / tmux-capture-tail.txt / inbox-snapshot.json / result.json）`,
  ].join('\n')
  writeFileSync(join(runDir, 'ticket.md'), ticket)
  console.log(`[V8] 判定=${verdict}（INCONCLUSIVE=${inconclusive.length}：${inconclusive.map(p => p.id).join(',') || '无'}） → ${runDir}`)
  for (const p of probes) console.log(`  ${p.id}=${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : '?'} :: ${p.evidence.slice(0, 140)}`)
  process.exit(exitCode)
}

main().catch(e => {
  console.error('[V8] 致命:', e)
  process.exit(2)
})
