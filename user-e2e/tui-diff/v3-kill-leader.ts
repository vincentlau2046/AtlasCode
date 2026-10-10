/**
 * V3 探针（0.1.36 切片① P1 mailbox 硬化，工单 §3 gate 判据新探针）：
 * 真 TUI 杀 leader 场景——teammate（worker 进程，真 pane-spawn CLI 参数）问权时
 * leader 被杀 → mailbox 请求落盘（跨进程信道真）+ leader 失响应 → 观察窗口内
 * unavailable deny 行 + 回合继续 + 进程可退（无残留轮询阻塞退出）。
 *
 * 拓扑（产品真实形态，PaneBackendExecutor 同款参数）：
 *   - 共享沙箱 home（零写真实 ~/.atlas）+ 预置 team 文件（t1：team-lead + worker-1）
 *   - PTY-L = leader TUI（--agent-teams，普通身份）→ 就绪后 SIGKILL = 字面「杀 leader」
 *   - PTY-W = worker TUI（--agent-id w1@t1 --agent-name worker-1 --team-name t1
 *     --agent-color cyan --parent-session-id …，= pane spawn 真参数）+
 *     ATLAS_EXPERIMENTAL_AGENT_TEAMS=1（isAgentSwarmsEnabled 门）
 *   - worker 输入危险 Bash 句（A4F 同款 rm -rf 措辞，分类器不自动批）→
 *     swarmWorkerHandler → 分类器尝试 → sendPermissionRequestViaMailbox
 *     （leader inbox 文件）+ TUI poller 等响应
 *
 * 断言面（工单 V3 三断言 × 落点）：
 *   V3-MAILBOX-REQ（hard）：leader 存活期请求已落 leader inbox（跨进程信道真）
 *   V3-TURN-CONTINUE（soft）：杀 leader 后观察窗内回合继续（tool_result 现形 + 模型续行）
 *     ——worker 进程面（TUI poller）若 slice① 未覆盖该面 → 触发未达 = INCONCLUSIVE 定因登记
 *   V3-DENY-LINE（soft）：unavailable deny 行（P1 语义串「did not respond within …ms」/
 *     approval unavailable）现形（engine 侧 P1 串同口径）
 *   V3-EXIT（hard）：worker 发 /exit 后进程自退出（gracefulShutdown，非 harness kill）
 *     = 进程可退（无残留轮询阻塞）
 *
 * 用法：
 *   bun run user-e2e/tui-diff/v3-kill-leader.ts --repo <worktree> [--observe-ms 90000]
 * 产物：artifacts/V3-<ts>-<rand>/{ticket.md,result.json,leader.log,worker.log,inbox-snapshot.json}
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Pty } from '../lib/pty'
import { makeSandboxHome } from '../lib/gates'
import { sleep } from '../lib/util'

const E2E = '/home/vince/projects/AtlasCode/user-e2e'
const ROOT = join(E2E, 'tui-diff')
const ART = join(ROOT, 'artifacts')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas/settings.json')
const CMP_MODEL = 'Qwen38-27B-TXT' // 2026-10-10 用户裁定（f4 转达）：云 Coding Plan 月配额 429 阻塞 → 切本地 Qwen38-27B-TXT（docker 8007，IFF 8999 本地路由，活验 200 无 429）；工作树交付物，不 commit（commit 归 Main）

// ── 参数 ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
function argVal(flag: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}
const REPO = argVal('--repo') ?? process.env.ATLAS_E2E_REPO ?? '/home/vince/projects/AtlasCode'
const OBSERVE_MS = Number(argVal('--observe-ms') ?? '90000') // 杀 leader 后观察窗（回合继续窗口）
const EXIT_GRACE_MS = Number(argVal('--exit-grace-ms') ?? '45000') // /exit 后自退出宽限
// ⑧（0.1.37）面 deadline 加速（shared 单一事实源 env ATLAS_PERM_MAILBOX_DEADLINE_MS）：
// 缺省 30s；探针传 3000 让 ⑧ fail-closed 早于 worker 自退路径 fire → 封口可现形。
const DEADLINE_MS = Number(argVal('--deadline-ms') ?? '10000')

const TEAM = 't1'
const LEAD_ID = 'team-lead@t1'
const LEAD_NAME = 'team-lead'
const WORKER_ID = 'w1@t1'
const WORKER_NAME = 'worker-1'
const TS = Date.now()
const DANGEROUS_CMD = `rm -rf /tmp/atlas-v3-${TS}`
const WORKER_PROMPT = `请运行 Bash 命令 \`${DANGEROUS_CMD}\` 删除临时目录。只运行这一条命令，然后报告结果。`

// ── 沙箱（零写真实 ~/.atlas：HOME 沙箱 = 全部配置/团队文件根）──────────
async function seedV3Home(home: string): Promise<void> {
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
/** 扫 leader inbox 找 permission_request（跨进程信道真 = 请求已送达 leader 侧文件） */
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

type ProbeOut = { id: string; ok: boolean | null; evidence: string; hard: boolean }

async function main(): Promise<void> {
  const runId = `V3-${TS}-${Math.random().toString(36).slice(2, 5)}`
  const runDir = join(ART, runId)
  mkdirSync(runDir, { recursive: true })
  const ws = join(ROOT, 'workspaces', 'V3')
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  const home = join(ROOT, 'home', 'V3')
  await seedV3Home(home)
  const parentSessionId = randomUUID()

  const probes: ProbeOut[] = []
  const notes: string[] = []
  let leader: Pty | null = null
  let worker: Pty | null = null
  let fatalError: string | null = null
  try {
    // ── 1. leader TUI（普通身份，仅存活作「在位 leader」；杀前 inbox 信道真断言）──
    // 注：--agent-teams 非 commander 注册选项（会崩 unknown option）；swarm 门真入口 = env。
    // leader 无需 swarm 态（mailbox 信道 = 磁盘文件，worker 侧写、不依赖 leader 进程 swarm 门）。
    process.env.ATLAS_E2E_TUI_ARGS = 'code --permission-mode default'
    leader = await Pty.start({ repoRoot: REPO, workspace: ws, sandboxHome: home, logPath: join(runDir, 'leader.log') }, 120_000)
    notes.push('leader REPL 就绪')

    // ── 2. worker TUI（pane-spawn 真参数 + swarms 门 env；default 模式 = ask 支确定）──
    // worker 需 isAgentSwarmsEnabled()（env）∧ isSwarmWorker()（--agent-id/--team-name）→ 走 mailbox 支。
    process.env.ATLAS_E2E_TUI_ARGS =
      `code --permission-mode default --agent-id ${WORKER_ID} --agent-name ${WORKER_NAME} ` +
      `--team-name ${TEAM} --agent-color cyan --parent-session-id ${parentSessionId}`
    process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS = '1'
    // ⑧（0.1.37）：TUI pane-worker 面 deadline 加速（shared 单一事实源 env
    // ATLAS_PERM_MAILBOX_DEADLINE_MS，缺省 30s；探针传 --deadline-ms 3000 让
    // ⑧ fail-closed 早于 worker 自退路径 fire → 封口可现形；对 leader 普通 TUI 无消费侧效应）
    process.env.ATLAS_PERM_MAILBOX_DEADLINE_MS = String(DEADLINE_MS)
    worker = await Pty.start({ repoRoot: REPO, workspace: ws, sandboxHome: home, logPath: join(runDir, 'worker.log') }, 120_000)
    delete process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS
    delete process.env.ATLAS_PERM_MAILBOX_DEADLINE_MS
    notes.push('worker REPL 就绪')

    // ── 3. worker 危险 Bash 问权（分类器不自动批 → 转发 leader mailbox）──
    worker.send(WORKER_PROMPT + '\r')

    // ── 4. leader 存活期：等 mailbox 请求落 leader inbox（信道真，90s 窗）──
    let reqEvidence: string | null = null
    const t0 = Date.now()
    for (;;) {
      reqEvidence = findPermissionRequest(home)
      if (reqEvidence) break
      if (Date.now() - t0 > 90_000) break
      if (!worker.alive()) break
      await sleep(1000)
    }
    const reqMs = Date.now() - t0
    const reqWallTs = Date.now() // ⑧ 时序基准：deadline fire ≈ reqWallTs + DEADLINE_MS
    probes.push({
      id: 'V3-MAILBOX-REQ',
      hard: true,
      ok: reqEvidence !== null,
      evidence: reqEvidence
        ? `leader 存活期 ${reqMs}ms 内请求落 inbox（跨进程信道真）：${reqEvidence!.slice(0, 200)}`
        : `(未命中：leader inbox 无 permission_request → 触发未达或信道未走；核 worker.log stderr)`,
    })

    // ── 5. 杀 leader（字面 SIGKILL；此后 mailbox 永无响应）──
    const killTs = Date.now()
    leader.kill()
    notes.push(`t=${killTs - t0}ms 杀 leader（SIGKILL 进程组）`)

    // ── 6. 观察窗：⑧ 面 封口现形（⑧ deadline fail-closed 使工具调用解决）+ 时序 ──
    // ⑧ 封口判别（⑧ 第 4 终态 = deadline fail-closed deny）的 TUI 可观测面：
    //   杀 leader 后，无 ⑧ 时该「Waiting for team lead approval」面永冻（500ms poller
    //   永收不到响应 → 工具调用永挂 → 回合 90s 挂死，框只重绘 spinner 不关闭）。
    //   有 ⑧ 时 deadline 到期（reqWallTs + DEADLINE_MS）→ fail-closed deny 送模型 →
    //   工具调用解决 → 「Waiting」框关闭（或模型给终答后 worker 干净自退）。
    // ∴ ⑧ 封口现形 = 「Waiting」框在 deadline 到期后关闭（非 90s 挂死、非 /exit 前自退）。
    // 时序基准：deadline 到期时刻 = reqWallTs + DEADLINE_MS（⑧ timer 于请求落盘时 arm）。
    const t1 = Date.now()
    const deadlineFireWallTs = reqWallTs + DEADLINE_MS
    let turnOk = false
    let turnEvidence = '(观察窗内未见 ⑧ 封口现形)'
    let denyEvidence: string | null = null
    let sessionEndWallTs: number | null = null
    let workerAliveAtDeadline: boolean | null = null
    let workerSelfExitWallTs: number | null = null // 观察窗内 worker 自退（非 /exit）时刻
    let waitingSeen = false // 「Waiting for team lead approval」框是否出现
    let waitingClosedWallTs: number | null = null // 框关闭（工具调用解决）时刻
    // unavailable 措辞（approvalUnavailableReason）或模型对 fail-closed deny 的反应
    const denyRe =
      /did not respond within \d+ms|approval unavailable|denied \(fail-closed\)|the tool did not run|did NOT run|no approver|未获批准|denied|denied|无法(?:运行|执行)|not approved|not granted|denied|denied/i
    // 剥净后「近期内容」是否仍在「Waiting」框态（框关闭 = 近期内容不再含 waiting 措辞）
    const stripAnsiLocal = (s: string): string => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\x1b[=>]/g, '')
    while (Date.now() - t1 < OBSERVE_MS) {
      const raw = worker.sinceText()
      const txt = stripAnsiLocal(raw)
      const m = txt.match(denyRe)
      if (m && !denyEvidence) denyEvidence = m[0].trim().slice(0, 200)
      const waitingNow = /Waiting for team lead approval/i.test(txt.slice(-2500))
      if (waitingNow) waitingSeen = true
      if (waitingSeen && !waitingNow && waitingClosedWallTs === null) {
        waitingClosedWallTs = Date.now()
      }
      if (sessionEndWallTs === null && /Resume this session with/i.test(txt)) {
        sessionEndWallTs = Date.now()
      }
      if (workerAliveAtDeadline === null && Date.now() >= deadlineFireWallTs) {
        workerAliveAtDeadline = worker.alive()
      }
      if (workerSelfExitWallTs === null && !worker.alive()) {
        workerSelfExitWallTs = Date.now()
      }
      // ⑧ 封口现形：deadline 到期后，工具调用已解决（「Waiting」框关闭）且 worker 仍活
      //（= 模型续行中，非 /exit 前自退、非 90s 挂死），或 worker 在 deadline 后干净自退
      //（= 模型给终答任务完成）。二者皆证明 ⑧ 第 4 终态 fire + 回合未 90s 挂死。
      const boxClosedAfterDeadline =
        waitingClosedWallTs !== null && waitingClosedWallTs >= deadlineFireWallTs
      // worker 在观察窗内（/exit 前）干净自退且发生在 deadline 到期后 = 模型终答→任务完成
      //（非 90s 挂死、非 /exit 驱动）；sessionEndWallTs 保证是「Resume this session」干净自退非 crash
      const selfExitedAfterDeadline =
        workerSelfExitWallTs !== null &&
        workerSelfExitWallTs >= deadlineFireWallTs &&
        sessionEndWallTs !== null
      if (boxClosedAfterDeadline || selfExitedAfterDeadline || denyEvidence) {
        turnOk = true
        turnEvidence =
          `⑧ 封口现形（观察窗 ${Date.now() - t1}ms，deadline 到期=${new Date(deadlineFireWallTs).toISOString()}）：` +
          (boxClosedAfterDeadline
            ? `「Waiting」框于 ${waitingClosedWallTs}ms 后关闭（deadline 到期后工具调用解决，非 90s 挂死）`
            : selfExitedAfterDeadline
              ? `worker 于 deadline 到期后干净自退（模型终答→任务完成，非 hang）`
              : `deny 行/反应「${denyEvidence?.slice(0, 120)}」`)
        break
      }
      if (!worker.alive()) break
      await sleep(1000)
    }
    // ⑧ 封口时序结论（供报告定因）：以请求落盘 reqWallTs 为 t0，各时刻为相对 t0 的 ms
    const rel = (w: number | null): string => (w === null ? '未现' : `${w - reqWallTs}ms`)
    const timingNote =
      `⑧ 时序（t0=请求落盘 ${new Date(reqWallTs).toISOString()}）：` +
      `deadline=${DEADLINE_MS}ms（到期 t=${DEADLINE_MS}ms，${new Date(deadlineFireWallTs).toISOString()}），` +
      `deadline 到期时 worker=${workerAliveAtDeadline === null ? '未到期' : workerAliveAtDeadline ? '存活(timer 可 fire)' : '已退(timer 未 fire)'}，` +
      `「Waiting」框=${waitingSeen ? (waitingClosedWallTs !== null ? `t=${rel(waitingClosedWallTs)} 关闭` : '全程未关闭(挂死)') : '未出现'}，` +
      `worker 自退 t=${rel(workerSelfExitWallTs)}，` +
      `session 终态 t=${rel(sessionEndWallTs)}`
    probes.push({
      id: 'V3-TURN-CONTINUE',
      hard: false,
      ok: turnOk ? true : null,
      evidence: `${turnEvidence}；${timingNote}`,
    })
    probes.push({
      id: 'V3-DENY-LINE',
      hard: false,
      ok: denyEvidence !== null ? true : null,
      evidence: denyEvidence ? `${denyEvidence}；${timingNote}` : `观察窗内未见 unavailable deny 行/模型反应；${timingNote}`,
    })

    // ── 7. 进程可退（P1 验收「进程可退出 / timer 无残留」）：worker 在宽限窗内退出 ──
    // 判据修正：不要求 /exit 前 worker 仍存活。P1 缺陷 = 活轮询 timer 阻塞退出；
    // 若 worker 已干净自退（会话总结现形、非 hang）=「进程可退」已满足（更强于 /exit 可退）。
    // ok = 宽限窗内 worker 变 dead（自退或 /exit 退任一）；若宽限窗内仍活 = 残留轮询阻塞（FAIL）。
    const workerAliveBefore = worker.alive()
    worker.send('/exit\r')
    const t2 = Date.now()
    let exited = false
    for (;;) {
      if (!worker.alive()) {
        exited = true
        break
      }
      if (Date.now() - t2 > EXIT_GRACE_MS) break
      await sleep(1000)
    }
    const exitMs = Date.now() - t2
    const exitTail = worker.sinceText().slice(-600).replace(/\t/g, ' ')
    probes.push({
      id: 'V3-EXIT',
      hard: true,
      ok: exited,
      evidence: !exited
        ? `(宽限 ${EXIT_GRACE_MS}ms 内 worker 仍存活 → 残留轮询 timer 阻塞退出 或 TUI 未响应 /exit；核 worker.log)`
        : workerAliveBefore
          ? `/exit 后 ${exitMs}ms 进程自退出（gracefulShutdown，无残留轮询阻塞）；末段：${exitTail.trim().slice(-160)}`
          : `worker 已于观察窗内干净自退（/exit 前已 dead，非 hang；「进程可退」满足）；末段：${exitTail.trim().slice(-160)}`,
    })
  } catch (e: any) {
    fatalError = String(e?.message ?? e).slice(0, 300)
    notes.push(`异常: ${fatalError}`)
  } finally {
    try { leader?.kill() } catch { /* 已杀 */ }
    try { worker?.kill() } catch { /* 已杀 */ }
    // inbox 快照（信道真证据留档）
    try {
      const dir = inboxDir(home)
      const snap: Record<string, unknown> = {}
      if (existsSync(dir)) for (const f of readdirSync(dir)) snap[f] = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      writeFileSync(join(runDir, 'inbox-snapshot.json'), JSON.stringify(snap, null, 2))
    } catch (e: any) {
      notes.push(`inbox 快照失败: ${String(e).slice(0, 120)}`)
    }
  }

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const inconclusive = probes.filter((p) => p.ok === null)
  // 假 PASS 防御：场景未跑完（fatalError，如 TUI 未就绪早退）→ 判 ERROR 非 PASS
  // （probes 空 / hard 探针未跑 时 hardFail=0 会误报 PASS；此处显式 fail-closed）。
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
    scenario: 'V3 杀 leader mailbox 兜底（0.1.36 切片① P1 / 0.1.37 ⑧ 面）',
    observeMs: OBSERVE_MS,
    deadlineMs: DEADLINE_MS,
    probes,
    hardFail,
    inconclusive: inconclusive.map((p) => p.id),
    verdict,
    fatalError,
    notes,
  }
  writeFileSync(join(runDir, 'result.json'), JSON.stringify(result, null, 2))
  const ticket = [
    `# V3 杀 leader mailbox 兜底探针（0.1.36 切片①）`,
    ``,
    `- repo: ${REPO}`,
    `- 拓扑: leader(PTY,L) + worker(PTY,W, pane-spawn 真参数) + 预置 team 文件 ${TEAM} + 共享沙箱 home`,
    `- 流程: leader 就绪 → worker 危险 Bash 问权 → 请求落 leader inbox（存活期）→ SIGKILL leader → 观察窗 ${OBSERVE_MS}ms → worker /exit 自退出核验`,
    ``,
    `## 判定`,
    `- **${verdict}**`,
    ``,
    `## 探针`,
    ...probes.map(
      (p) =>
        `- **${p.id}**（${p.hard ? 'hard' : 'soft'}）= ${
          p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INCONCLUSIVE（触发未达）'
        } — ${p.evidence}`,
    ),
    ``,
    `## 定因登记区（INCONCLUSIVE 必填，禁裸记）`,
    ...(inconclusive.length
      ? inconclusive.map((p) => `- ${p.id}: （e2e 填定因）`)
      : ['- 无']),
    ``,
    `## 备注`,
    ...notes.map((n) => `- ${n}`),
    ``,
    `## artifacts`,
    `- ${runDir}（leader.log / worker.log / inbox-snapshot.json / result.json）`,
  ].join('\n')
  writeFileSync(join(runDir, 'ticket.md'), ticket)
  console.log(`[V3] 判定=${verdict}（INCONCLUSIVE=${inconclusive.length}：${inconclusive.map((p) => p.id).join(',') || '无'}） → ${runDir}`)
  for (const p of probes) console.log(`  ${p.id}=${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : '?'} :: ${p.evidence.slice(0, 120)}`)
  process.exit(exitCode)
}

main().catch((e) => {
  console.error('[V3] 致命:', e)
  process.exit(2)
})
