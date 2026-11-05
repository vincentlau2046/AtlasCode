/**
 * 0.1.66 Q3 翻转波（Q3-2 a1 后台默认翻转 + 逃生舱 env + R4 drain）· 新双面活探针
 * （e2e lane，gate 判据⑤；工单 docs/2026-10-14-p0-wave-0166-ticket.md +
 * 评估卡 docs/2026-10-14-p0-q3-subagent-eval-card.md §8.3/§9）。
 *
 * 本波性质 = 有意语义变更波（background-by-default，零回归约束改「off 面恒等锚」模式）：
 * 判别力承载 = on 面（env 缺省 = 后台默认）行为断言 × off 面（env=1 = 现行为字节级恒等）
 * 恒等锚 × 显式参数跨 on/off 恒等 × env 五态 fail-safe × 提示词双句翻转 × R4 drain 面。
 * PTY 三段活渲染像素面（缺省委派=后台 agent 实启 → task-notification 下回合注入 →
 * 主循环续接推进）= 生产 lane 观察面（同 0162 overlay 先例）。
 *
 * 语义事实源（gate 面源码核）：shouldRunInBackground(runInBg)：
 *   on 面（isEnvTruthy(ENV)=false：缺省/0/非法值）→ runInBg !== false（undefined/true→后台）
 *   off 面（ENV∈{1,true,yes,on}）→ !!runInBg（undefined/false→前景 = 0.1.65 前现行为恒等）
 * ENV = ATLAS_AGENT_DEFAULT_FOREGROUND（isEnvTruthy 门，0.1.63 P4 env 五态先例同构）。
 *
 * 断言面（全 hard）：
 *   R1 on 面缺省=后台：env 缺省 + 缺省 run_in_background → 立即 async_launched
 *       （agentId+outputFile 在场不阻塞）+ 后台完成 → <task-notification> completed
 *   R2 显式 false 跨面（on 面）：env 缺省 + run_in_background:false → 同步 completed + 零通知
 *   R3 off 面恒等锚（env=1）：缺省 → 同步 completed + content 在场 + 零通知
 *       （= 0.1.65 前现行为字节级恒等；恒绿必跑 + 基线同绿守卫）
 *   R4 显式 true 跨面（off 面 env=1）：run_in_background:true → async_launched
 *       （显式参数压倒 env；跨 on/off 恒等）
 *   R5 env 五态 fail-safe：env=0 → 后台默认 / env=garbage → 后台默认
 *       （非法值 fail-safe = on 面，isEnvTruthy 门语义）
 *   R6 提示词双句翻转（两 prompt.ts 源级）：engine「Subagents run in the background
 *       by default」+ TUI「Agents run in the background by default」在场
 *       + 旧「Set run_in_background to true to launch」离场（occ=0）
 *       + 旧 TUI「foreground (default)」离场（occ=0）
 *   R7 1P 裁面核验（两 prompt）：零 claude.ai/Anthropic/Claude Code（0.1.55 先例延续）
 *   R8 backgroundTracker 导出面 + print.ts R4 drain 点（源级在场）：
 *       track/drain/hasPending/reset 四导出 + runHeadless 退出前 drainPendingBackgroundAgents
 *   R9 R4 drain 语义（行为）：track 后 hasPending=true → drain 全 settle 返回；
 *       单 reject 不阻断（allSettled）；空池即返回
 *   R10 TUI 车道翻转位源级：TUI AgentTool.ts shouldRunInBackground 引用在场
 *       （TUI 不导入 engine，两车道各自维护同构 helper = 波体设计面）
 *
 * 基线面（修前红形 @846004f = v0.1.65）：env 不消费（on 面探针 R1/R5 红）+
 * 提示词新句缺席/旧句在场（R6 红）+ backgroundTracker 缺席（R8/R9 红）+
 * TUI 翻转位缺席（R10 红）→ 定向红 6 项（R1/R5/R6/R8/R9/R10）；
 * R2/R3/R4（显式参数面 + off 面恒等 = 0.1.65 既有行为）+ R7（1P 裁面）基线同绿 = 恒等守卫。
 * 用法：
 *   ATLAS_E2E_Q3R0166_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-q3-reverse-0166.ts
 */
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const REPO = process.env.ATLAS_E2E_Q3R0166_REPO ?? '/home/vince/projects/AtlasCode/worktrees/worktree-gate-066'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }

async function loadMod(p: string): Promise<any> {
  return await import(p).catch(() => ({}))
}
const readSrc = (p: string): string => { try { return readFileSync(p, 'utf8') } catch { return '' } }

/** fake LLM（脚本化 ModelProvider 接口替身，同 0165 探针先例）。 */
function fakeProvider(text: string): any {
  let i = 0
  const unused = async () => { throw new Error('fake ModelProvider: 方法未被消费') }
  return {
    chat: async () => {
      i++
      return {
        type: 'assistant',
        uuid: 'u' + i,
        timestamp: '2026-10-14T00:00:00Z',
        message: {
          id: 'm' + i, model: 'fake', role: 'assistant',
          content: [{ type: 'text', text }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      }
    },
    chatStream: unused,
    healthCheck: unused,
    countTokens: unused,
  }
}

const ENV_KEY = 'ATLAS_AGENT_DEFAULT_FOREGROUND'

async function main(): Promise<void> {
  const probes: Probe[] = []
  const agentMod: any = await loadMod(join(REPO, 'src/engine/tools/agent/AgentTool.ts'))
  const AgentTool = agentMod.AgentTool
  const trackerMod: any = await loadMod(join(REPO, 'src/engine/tools/agent/backgroundTracker.ts'))
  const notifMod: any = await loadMod(join(REPO, 'src/engine/coordinator/tasks/notification.ts'))
  const diskMod: any = await loadMod(join(REPO, 'src/task/diskOutput.ts'))

  const captured: { value: string, mode: string }[] = []
  const asyncTmp = mkdtempSync(join(tmpdir(), 'atlas-q3r0166-async-'))
  const setHandler = notifMod.setTaskNotificationHandler
  const resetHandler = notifMod.resetTaskNotificationHandler
  const setDisk = diskMod.setDiskOutputEnv
  const resetDisk = diskMod.resetDiskOutputEnv

  const savedEnv = process.env[ENV_KEY]
  const setEnv = (v: string | undefined) => {
    if (v === undefined) delete process.env[ENV_KEY]
    else process.env[ENV_KEY] = v
  }

  /** 缺省/缺参调用（双面核心）：返回 {launched, sync, notif, err}。 */
  async function callDefault(tag: string) {
    const before = captured.length
    let err: unknown = null
    let data: { status?: string, agentId?: string, outputFile?: string, content?: { type: string, text: string }[] } | undefined
    try {
      const res = await AgentTool.call(
        { description: `q3r ${tag}`, prompt: 'q3r probe' },
        { modelProvider: fakeProvider(`q3r-${tag}-result`), parentRole: 'small' },
        undefined, undefined,
      )
      data = res?.data as typeof data
    } catch (e) { err = e }
    await new Promise(r => setTimeout(r, 80))
    const newNotifs = captured.slice(before)
    return {
      launched: !err && data?.status === 'async_launched' && !!data?.agentId && !!data?.outputFile,
      sync: !err && data?.status === 'completed' && data?.content?.[0]?.text === `q3r-${tag}-result`,
      zeroNotif: captured.length === before,
      completedNotif: newNotifs.some(n => n.mode === 'task-notification' && n.value.includes('completed') && n.value.includes(`q3r ${tag}`)),
      err,
    }
  }

  // 通知捕获 + 异步分支 disk output env（getTaskOutputPath 消费面；0165 先例）
  if (typeof setHandler === 'function' && typeof setDisk === 'function') {
    setHandler((n: { value: string, mode: string }) => { captured.push(n) })
    setDisk({ getProjectTempDir: () => asyncTmp, getSessionId: () => 'q3r0166-probe-sess' })
  }

  // ── R1 on 面缺省=后台（env 缺省 + 缺省参数 → async_launched + 通知）──────
  setEnv(undefined)
  const r1 = await callDefault('on-default')
  probes.push({
    id: 'R1-on-face-default-background', hard: true, ok: r1.launched && r1.completedNotif,
    detail: r1.launched && r1.completedNotif
      ? `on 面缺省=后台（env 缺省 + 缺省 run_in_background → 立即 async_launched〔agentId+outputFile 在场不阻塞〕+ 后台完成 → <task-notification> completed〔PTY 三段像素面归生产观察面〕= Q3-2 a1 翻转核心位）`
      : `on 面缺口（launched=${r1.launched} notif=${r1.completedNotif} err=${r1.err instanceof Error ? r1.err.message.slice(0, 80) : r1.err} = 修前红形活面现形）`,
  })

  // ── R2 显式 false 跨面（on 面 env 缺省 → 前景同步 + 零通知）──────────
  let r2ok: boolean | null = null
  let r2Detail = 'R2 未执行'
  {
    setEnv(undefined)
    const before = captured.length
    let err: unknown = null
    let data: { status?: string, content?: { type: string, text: string }[] } | undefined
    try {
      const res = await AgentTool.call(
        { description: 'q3r on-false', prompt: 'q3r probe', run_in_background: false },
        { modelProvider: fakeProvider('q3r-onfalse-result'), parentRole: 'small' },
        undefined, undefined,
      )
      data = res?.data as typeof data
    } catch (e) { err = e }
    await new Promise(r => setTimeout(r, 80))
    r2ok = !err && data?.status === 'completed' && data?.content?.[0]?.text === 'q3r-onfalse-result' && captured.length === before
    r2Detail = r2ok
      ? `显式 false 跨面（on 面 env 缺省 + run_in_background:false → 同步 completed + 零通知注入 = 显式前景语义压倒后台默认）`
      : `显式 false 缺口（err=${err instanceof Error ? err.message.slice(0, 80) : err} status=${data?.status} = 修前红形）`
  }
  probes.push({ id: 'R2-explicit-false-cross-face', hard: true, ok: r2ok, detail: r2Detail })

  // ── R3 off 面恒等锚（env=1 + 缺省 → 同步 completed + 零通知，现行为恒等）─
  setEnv('1')
  const r3 = await callDefault('off-default')
  probes.push({
    id: 'R3-off-face-identity-anchor', hard: true, ok: r3.sync && r3.zeroNotif,
    detail: r3.sync && r3.zeroNotif
      ? `off 面恒等锚（env=1 + 缺省 → 同步 completed + content 在场 + 零通知 = 0.1.65 前现行为字节级恒等；恒绿必跑 + 基线同绿守卫 = 逃生舱语义承载）`
      : `off 面缺口（sync=${r3.sync} zeroNotif=${r3.zeroNotif} err=${r3.err instanceof Error ? r3.err.message.slice(0, 80) : r3.err}）`,
  })

  // ── R4 显式 true 跨面（off 面 env=1 + 显式 true → async_launched）──────
  let r4ok: boolean | null = null
  let r4Detail = 'R4 未执行'
  {
    setEnv('1')
    const before = captured.length
    let err: unknown = null
    let data: { status?: string, agentId?: string, outputFile?: string } | undefined
    try {
      const res = await AgentTool.call(
        { description: 'q3r off-true', prompt: 'q3r probe', run_in_background: true },
        { modelProvider: fakeProvider('q3r-offtrue-result'), parentRole: 'small' },
        undefined, undefined,
      )
      data = res?.data as typeof data
    } catch (e) { err = e }
    await new Promise(r => setTimeout(r, 80))
    const notif = captured.slice(before).some(n => n.mode === 'task-notification' && n.value.includes('completed'))
    r4ok = !err && data?.status === 'async_launched' && !!data?.agentId && notif
    r4Detail = r4ok
      ? `显式 true 跨面（off 面 env=1 + run_in_background:true → async_launched + 完成通知 = 显式参数压倒 env，跨 on/off 恒等）`
      : `显式 true 缺口（err=${err instanceof Error ? err.message.slice(0, 80) : err} data=${JSON.stringify(data)?.slice(0, 120)} notif=${notif}）`
  }
  probes.push({ id: 'R4-explicit-true-cross-face', hard: true, ok: r4ok, detail: r4Detail })

  // ── R5 env 五态 fail-safe（env=0 / env=garbage → 后台默认）──────────
  setEnv('0')
  const r5a = await callDefault('env-zero')
  setEnv('garbage')
  const r5b = await callDefault('env-garbage')
  const r5 = r5a.launched && r5b.launched
  probes.push({
    id: 'R5-env-failsafe-faces', hard: true, ok: r5,
    detail: r5
      ? `env 五态 fail-safe（env=0 → 后台默认〔0 = 显式假 = 前台默认关〕+ env=garbage → 后台默认〔非法值 fail-safe 走 on 面 = isEnvTruthy 门语义，0.1.63 P4 env 五态先例同构〕）`
      : `env 五态缺口（env=0 launched=${r5a.launched} / garbage launched=${r5b.launched} = 修前红形活面现形）`,
  })

  // ── R6 提示词双句翻转（两 prompt.ts 源级）────────────────────────
  const engPrompt = readSrc(join(REPO, 'src/engine/tools/agent/prompt.ts'))
  const tuiPrompt = readSrc(join(REPO, 'src/tui/tools/AgentTool/prompt.ts'))
  const r6 = engPrompt.includes('Subagents run in the background by default')
    && tuiPrompt.includes('Agents run in the background by default')
    && !engPrompt.includes('Set run_in_background to true to launch')
    && !tuiPrompt.includes('foreground (default)')
  probes.push({
    id: 'R6-prompt-flip-sentences', hard: true, ok: r6,
    detail: r6
      ? `提示词双句翻转（engine「Subagents run in the background by default」+ TUI「Agents run in the background by default」在场 + 旧 engine「Set run_in_background to true to launch」离场 occ=0 + 旧 TUI「foreground (default)」离场 occ=0 = 默认句翻转面双层实证）`
      : `提示词面缺口（engNew=${engPrompt.includes('Subagents run in the background by default')} tuiNew=${tuiPrompt.includes('Agents run in the background by default')} engOldLeft=${engPrompt.includes('Set run_in_background to true to launch')} tuiOldLeft=${tuiPrompt.includes('foreground (default)')} = 修前红形）`,
  })

  // ── R7 1P 裁面核验（两 prompt，0.1.55 先例延续）──────────────────
  const banned1p = ['claude.ai', 'Anthropic', 'Claude Code']
  const bannedHit = banned1p.filter(s => engPrompt.includes(s) || tuiPrompt.includes(s))
  probes.push({
    id: 'R7-no-1p-citation', hard: true, ok: bannedHit.length === 0,
    detail: bannedHit.length === 0
      ? `1P 裁面核验（engine + TUI 双 prompt 零 claude.ai/Anthropic/Claude Code 引用 = 国产适配裁面 0.1.55 先例延续；基线同绿守卫）`
      : `1P 裁面违规（命中 ${bannedHit.join(' / ')}）`,
  })

  // ── R8 backgroundTracker 导出面 + print.ts R4 drain 点（源级）──────
  const printSrc = readSrc(join(REPO, 'src/cli/print.ts'))
  const r8 = typeof trackerMod.trackBackgroundAgent === 'function'
    && typeof trackerMod.drainPendingBackgroundAgents === 'function'
    && typeof trackerMod.hasPendingBackgroundAgents === 'function'
    && typeof trackerMod.resetBackgroundAgentTracker === 'function'
    && printSrc.includes('drainPendingBackgroundAgents')
  probes.push({
    id: 'R8-tracker-exports-and-drain-point', hard: true, ok: r8,
    detail: r8
      ? `R4 追踪器面（backgroundTracker 四导出 track/drain/hasPending/reset 在场 + print.ts runHeadless 退出前 drainPendingBackgroundAgents drain 点源级在场 = headless 进程退出前不静默 kill 语义承载）`
      : `追踪器面缺席（track=${typeof trackerMod.trackBackgroundAgent} drain=${typeof trackerMod.drainPendingBackgroundAgents} print 面=${printSrc.includes('drainPendingBackgroundAgents')} = 修前红形活面现形）`,
  })

  // ── R9 R4 drain 语义（行为：allSettled + 空池 + reject 不阻断）─────
  if (typeof trackerMod.trackBackgroundAgent === 'function' && typeof trackerMod.drainPendingBackgroundAgents === 'function') {
    trackerMod.resetBackgroundAgentTracker()
    const pending = new Promise(r => setTimeout(r, 120))
    const rej: Promise<never> = new Promise((_r, reject) => setTimeout(() => reject(new Error('q3r-drain-reject')), 30))
    rej.catch(() => { /* drain allSettled 消费；防 unhandled 兜底 */ })
    const late: Promise<never> = new Promise((_r, reject) => setTimeout(() => reject(new Error('q3r-drain-late')), 40))
    late.catch(() => { /* abort 早退面 reject 不被 drain 消费；防 unhandled 兜底 */ })
    trackerMod.trackBackgroundAgent(pending)
    trackerMod.trackBackgroundAgent(rej)
    const hasPendingBefore = trackerMod.hasPendingBackgroundAgents()
    const t0 = Date.now()
    await trackerMod.drainPendingBackgroundAgents()
    const drainedMs = Date.now() - t0
    // drain 后 hasPending 应 false（drain 消费池）；reset 防泄漏
    const hasPendingAfter = trackerMod.hasPendingBackgroundAgents()
    // 空池即返回
    const t1 = Date.now()
    await trackerMod.drainPendingBackgroundAgents()
    const emptyMs = Date.now() - t1
    // abort signal 立即返回
    trackerMod.trackBackgroundAgent(late)
    const ac = new AbortController()
    ac.abort()
    const t2 = Date.now()
    await trackerMod.drainPendingBackgroundAgents(ac.signal)
    const abortMs = Date.now() - t2
    trackerMod.resetBackgroundAgentTracker()
    const r9 = hasPendingBefore === true && drainedMs >= 100 && hasPendingAfter === false && emptyMs < 50 && abortMs < 50
    probes.push({
      id: 'R9-drain-semantics', hard: true, ok: r9,
      detail: r9
        ? `R4 drain 语义（track 后 hasPending=true → drain 全 settle 返回〔drained=${drainedMs}ms ≥ 100ms 等最长 pending〕+ 单 reject 不阻断〔allSettled 面〕+ drain 后池空 + 空池即返回〔${emptyMs}ms〕+ signal aborted 立即返回〔${abortMs}ms，SIGINT 用户中止不等〕）`
        : `drain 语义缺口（hasPendingBefore=${hasPendingBefore} drained=${drainedMs}ms hasPendingAfter=${hasPendingAfter} empty=${emptyMs}ms abort=${abortMs}ms）`,
    })
  } else {
    probes.push({
      id: 'R9-drain-semantics', hard: true, ok: null,
      detail: `R4 drain 不可执行（tracker 模块修前缺席 = 修前红形结构承载，INC 非红面）`,
    })
  }

  // ── R10 TUI 车道翻转位源级（TUI 不导入 engine，两车道同构 helper）──
  const tuiAgentSrc = readSrc(join(REPO, 'src/tui/tools/AgentTool/AgentTool.ts'))
  const r10 = /shouldRunInBackground\(/.test(tuiAgentSrc) && tuiAgentSrc.includes('ATLAS_AGENT_DEFAULT_FOREGROUND')
  probes.push({
    id: 'R10-tui-flip-point-source', hard: true, ok: r10,
    detail: r10
      ? `TUI 车道翻转位（TUI AgentTool.ts shouldRunInBackground( 引用 + ATLAS_AGENT_DEFAULT_FOREGROUND 门在场 = TUI 不导入 engine、两车道各自维护同构 helper 的波体设计面）`
      : `TUI 翻转位缺口（shouldRunInBackground=${/shouldRunInBackground\(/.test(tuiAgentSrc)} env 门=${tuiAgentSrc.includes('ATLAS_AGENT_DEFAULT_FOREGROUND')} = 修前红形）`,
  })

  // 清理：恢复 env + handler + disk
  setEnv(savedEnv)
  resetHandler?.()
  resetDisk?.()
  rmSync(asyncTmp, { recursive: true, force: true })

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const verdict = hardFail === 0 ? 'PASS' : `FAIL（hardFail=${hardFail}）`
  const OUT = process.env.ATLAS_E2E_Q3R0166_OUT ?? '/home/vince/.claude/jobs/09264df0/tmp/gate-066/q3r0166'
  const fs = await import('node:fs')
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(join(OUT, 'result.json'), JSON.stringify({ probe: 'tui-q3-reverse-0166', repo: REPO, verdict, probes }, null, 2))
  console.log(JSON.stringify({
    verdict,
    probes: probes.map((p) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`).join(' '),
  }, null, 1))
  console.log(`TUI-Q3-REVERSE-0166 ${verdict} → ${OUT}`)
  process.exit(hardFail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('TUI-Q3-REVERSE-0166 ERROR', e); process.exit(1) })
