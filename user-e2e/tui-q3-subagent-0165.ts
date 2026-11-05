/**
 * 0.1.65 Q3 subagent 独占波第一波（地基波）· 新活探针（e2e lane，gate 判据⑤；
 * 工单 docs/2026-10-14-p0-wave-0165-ticket.md §2/§4 + 评估卡
 * docs/2026-10-14-p0-q3-subagent-eval-card.md §8.2/§9）。
 *
 * 判读面（0162/0163/0164 同族纪律）：产品函数活 import（@ 被测面 worktree 源码，
 * 零模型零网络零 8999 竞争；fake provider = ModelProvider 接口替身脚本化，
 * 非 mock transport）。本波性质 = 零行为变更（默认前景同步恒等 + 后台 opt-in），
 * 判别力承载 = 引擎面行为断言（异步分支/通知链/needs_input 态/提示词面/P5 接线）
 * + 前景恒等守卫（恒绿必跑）；PTY 三段活渲染像素面（后台 agent 实启 + task-notification
 * 下回合续接推进）+ needs-input 活渲染面 = 生产 lane 观察面（同 0162 overlay 先例）。
 *
 * 断言面（全 hard）：
 *   Q1a schema：AgentTool.inputSchema.properties.run_in_background 在场（boolean 型）
 *   Q1b 异步分支（三段探针段 1-2）：call(run_in_background:true) → 立即 async_launched
 *       （agentId+outputFile 在场）+ 后台完成 → 通知链注入 <task-notification> completed
 *       （段 3「主循环续接推进」= 既有通知链消费，零新建队列 = 本波零行为变更性质承载）
 *   Q1c 失败路径：provider 抛错 → 通知 status failed + 错误文案在场
 *   Q1d 前景恒等守卫（恒绿必跑）：run_in_background 缺省 = 同步 completed + content
 *       在场 + 零通知注入（同步路径不走通知链 = 前景路径零变更实证）
 *   Q2a needs_input 状态机：isTerminalTaskStatus('needs_input')=false（非终态允许恢复）
 *       + hasNonTerminalTasks 族统一谓词（pending/running/needs_input→true /
 *       全终态→false / 混合→true；LocalShellTask+LocalAgentTask 族统一）
 *   Q2b needs_input 通知构造：enqueueAgentNotification(status=needs_input+inputRequest)
 *       → 「<status>needs_input</status>」+ toolName 在场 + 不去重（连发两条均投递，
 *       非终态允许多次请求输入）
 *   Q2c wrapPermissionGateForBackground：ask 裁定 → onNeedsInput 触发（toolName 在场）
 *       + verdict 原样 fail-closed 返回（agent 不挂起，权限语义零变更）
 *   Q3a 提示词批 delta 面：agent prompt.ts 在场 run_in_background usage note +
 *       task-notification + no-predict 句（「Do not predict」）+ cost-aware 句
 *       （0.1.55 已落防漂移）
 *   Q3b 1P 裁面核验：agent prompt 零 claude.ai/Anthropic/Claude Code 引用（国产适配，
 *       0.1.55 先例同族断言面）
 *   Q4 P5 时序守卫接线（agentLoopDeps 源级）：hasPendingBackgroundTasks 注入 +
 *       hasNonTerminalTasks 引用在场（0.1.63 P5 仅声明未接线 → 本波接线回收）
 *
 * 基线面（修前红形 @26d989e = v0.1.64）：run_in_background schema 缺席 +
 * runAsyncAgentLifecycle/wrapPermissionGateForBackground/hasNonTerminalTasks 缺席 +
 * 提示词 delta 句缺席 → 定向红（Q1a/Q1b/Q1c/Q2a/Q2b/Q2c/Q3a/Q4 红；
 * Q1d/Q2a-isTerminal/Q3b 基线同绿 = 恒等/零回归守卫）。
 * 用法：
 *   ATLAS_E2E_Q30165_REPO=<worktree 绝对路径> \
 *     bun run /home/vince/projects/AtlasCode/user-e2e/tui-q3-subagent-0165.ts
 */
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const REPO = process.env.ATLAS_E2E_Q30165_REPO ?? '/home/vince/projects/AtlasCode/worktrees/worktree-gate-065'

type Probe = { id: string, hard: boolean, ok: boolean | null, detail: string }

async function loadMod(p: string): Promise<any> {
  return await import(p).catch(() => ({}))
}
const readSrc = (p: string): string => { try { return readFileSync(p, 'utf8') } catch { return '' } }

/** fake LLM（脚本化 ModelProvider 接口替身，非 mock transport；判别单测同形）。 */
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

async function main(): Promise<void> {
  const probes: Probe[] = []
  const agentMod: any = await loadMod(join(REPO, 'src/engine/tools/agent/AgentTool.ts'))
  const AgentTool = agentMod.AgentTool
  const taskMod: any = await loadMod(join(REPO, 'src/task/task.ts'))
  const runAgentMod: any = await loadMod(join(REPO, 'src/engine/tools/agent/runAgent.ts'))
  const localAgentTaskMod: any = await loadMod(join(REPO, 'src/engine/coordinator/tasks/localAgentTask.ts'))
  const notifMod: any = await loadMod(join(REPO, 'src/engine/coordinator/tasks/notification.ts'))
  const diskMod: any = await loadMod(join(REPO, 'src/task/diskOutput.ts'))

  // ── Q1a schema run_in_background 在场 ─────────────────────────────
  const schema = AgentTool?.inputSchema
  const q1a = schema?.properties?.run_in_background?.type === 'boolean'
  probes.push({
    id: 'Q1a-schema-run-in-background', hard: true, ok: q1a,
    detail: q1a
      ? `schema 面（AgentTool.inputSchema.properties.run_in_background = boolean 型在场 = Q3-1 参数面；修前红形 = 参数缺席）`
      : `schema 面缺口（run_in_background=${JSON.stringify(schema?.properties?.run_in_background)} = 修前红形活面现形）`,
  })

  // ── Q1b 异步分支（call run_in_background:true → async_launched + 通知）─
  const captured: { value: string, mode: string }[] = []
  const asyncTmp = mkdtempSync(join(tmpdir(), 'atlas-q30165-async-'))
  const setHandler = notifMod.setTaskNotificationHandler
  const resetHandler = notifMod.resetTaskNotificationHandler
  const setDisk = diskMod.setDiskOutputEnv
  const resetDisk = diskMod.resetDiskOutputEnv
  if (typeof setHandler === 'function' && typeof setDisk === 'function') {
    setHandler((n: { value: string, mode: string }) => { captured.push(n) })
    setDisk({ getProjectTempDir: () => asyncTmp, getSessionId: () => 'q30165-probe-sess' })
    try {
      // 探针侧容错（基线红形承载）：基线无异步生命周期 → call 同步路径错误直抛
      // （无通知链兜底）→ try/catch 记 FAIL 红形不中断后续探针。
      let q1bErr: unknown = null
      let q1bData: { status?: string, agentId?: string, outputFile?: string, description?: string } | undefined
      try {
        const res = await AgentTool.call(
          { description: 'q3 probe bg', prompt: 'do bg', run_in_background: true },
          { modelProvider: fakeProvider('q3-bg-result'), parentRole: 'small' },
          undefined, undefined,
        )
        q1bData = res?.data as typeof q1bData
      } catch (e) { q1bErr = e }
      const launched = !q1bErr && q1bData?.status === 'async_launched' && !!q1bData.agentId && !!q1bData.outputFile && q1bData.description === 'q3 probe bg'
      await new Promise(r => setTimeout(r, 80))
      const notif = captured.find(n => n.mode === 'task-notification')
      const notifOk = !!notif && notif.value.includes('<task-notification>') && notif.value.includes('completed') && notif.value.includes('q3 probe bg')
      probes.push({
        id: 'Q1b-async-branch-and-notification', hard: true, ok: launched && notifOk,
        detail: launched && notifOk
          ? `异步分支（三段探针段 1-2：run_in_background:true → 立即 async_launched〔agentId+outputFile 在场不阻塞〕+ 后台完成 → 通知链注入 <task-notification> completed 〔段 3 主循环续接 = 既有通知链消费零新建队列 = 零行为变更性质承载；PTY 活渲染像素面 = 生产 lane 观察面〕）`
          : `异步分支缺口（err=${q1bErr instanceof Error ? q1bErr.message.slice(0, 80) : q1bErr} data=${JSON.stringify(q1bData)?.slice(0, 160)} notifOk=${notifOk}〔captured=${captured.length}〕= 修前红形活面现形）`,
      })
      // ── Q1c 失败路径 ─────────────────────────────────────────────
      const failProvider = { ...fakeProvider('x'), chat: async () => { throw new Error('q3-probe-LLM-boom') } }
      const beforeFail = captured.length
      let q1cErr: unknown = null
      try {
        await AgentTool.call(
          { description: 'q3 probe bg fail', prompt: 'fail me', run_in_background: true },
          { modelProvider: failProvider, parentRole: 'small' },
          undefined, undefined,
        )
      } catch (e) { q1cErr = e }
      await new Promise(r => setTimeout(r, 80))
      const failNotif = captured.slice(beforeFail).find(n => n.mode === 'task-notification')
      const q1c = !q1cErr && !!failNotif && failNotif.value.includes('failed') && failNotif.value.includes('q3-probe-LLM-boom')
      probes.push({
        id: 'Q1c-bg-failure-notification', hard: true, ok: q1c,
        detail: q1c
          ? `失败路径（后台 provider 抛错 → 通知 status=failed + 错误文案在场 = 非静默失败语义）`
          : `失败路径缺口（err=${q1cErr instanceof Error ? q1cErr.message.slice(0, 80) : q1cErr}〔基线 = 同步直抛无通知链兜底红形〕failNotif=${JSON.stringify(failNotif?.value ?? null)?.slice(0, 120)}）`,
      })
      // ── Q1d 前景恒等守卫（恒绿必跑，基线同绿）────────────────
      let q1dErr: unknown = null
      let q1dData: { status?: string, content?: { type: string, text: string }[] } | undefined
      const beforeSync = captured.length
      try {
        const syncRes = await AgentTool.call(
          { description: 'q3 probe sync', prompt: 'do sync' },
          { modelProvider: fakeProvider('q3-sync-result'), parentRole: 'small' },
          undefined, undefined,
        )
        q1dData = syncRes?.data as typeof q1dData
      } catch (e) { q1dErr = e }
      const zeroNotif = captured.length === beforeSync
      const q1d = !q1dErr && q1dData?.status === 'completed' && q1dData.content?.[0]?.text === 'q3-sync-result' && zeroNotif
      probes.push({
        id: 'Q1d-foreground-identity-guard', hard: true, ok: q1d,
        detail: q1d
          ? `前景恒等守卫（run_in_background 缺省 = 同步 completed + content 在场 + 零通知注入〔同步路径不走通知链〕= 默认前景同步字节级恒等零变更实证；恒绿必跑 + 基线同绿守卫）`
          : `前景恒等缺口（err=${q1dErr instanceof Error ? q1dErr.message.slice(0, 80) : q1dErr} status=${q1dData?.status} content=${JSON.stringify(q1dData?.content)?.slice(0, 100)} zeroNotif=${zeroNotif}）`,
      })
    } finally {
      resetHandler?.()
      resetDisk?.()
    }
  } else {
    for (const id of ['Q1b-async-branch-and-notification', 'Q1c-bg-failure-notification', 'Q1d-foreground-identity-guard']) {
      probes.push({ id, hard: true, ok: id === 'Q1d-foreground-identity-guard' ? null : false, detail: `通知/disk 注入面缺席（setHandler=${typeof setHandler} setDisk=${typeof setDisk}）→ 不可执行${id === 'Q1d-foreground-identity-guard' ? '（INC：守卫面缺席非产品回归）' : '（修前红形）'}` })
    }
  }

  // ── Q2a needs_input 状态机 + hasNonTerminalTasks 族统一 ──────────
  const isTerm = taskMod.isTerminalTaskStatus
  const hasNonTerminal = taskMod.hasNonTerminalTasks
  const mkTask = (status: string, id = `t-${status}`) => ({ id, type: 'local_shell', status, description: `d ${id}`, startTime: Date.now(), outputFile: '/tmp/x', outputOffset: 0, notified: false })
  const q2aTerm = typeof isTerm === 'function' && isTerm('needs_input') === false && isTerm('completed') === true && isTerm('failed') === true
  const q2aPred = typeof hasNonTerminal === 'function'
    && hasNonTerminal({ a: mkTask('running') }) === true
    && hasNonTerminal({ a: mkTask('needs_input') }) === true
    && hasNonTerminal({ a: mkTask('pending') }) === true
    && hasNonTerminal({ a: mkTask('completed'), b: mkTask('failed'), c: mkTask('killed') }) === false
    && hasNonTerminal({ a: mkTask('completed'), b: mkTask('running') }) === true
    && hasNonTerminal({}) === false
  const q2a = q2aTerm && q2aPred
  probes.push({
    id: 'Q2a-needs-input-state-machine', hard: true, ok: q2a,
    detail: q2a
      ? `needs_input 状态机（isTerminalTaskStatus('needs_input')=false 非终态允许恢复〔基线同绿恒等〕+ hasNonTerminalTasks 族统一谓词〔pending/running/needs_input→true / 全终态→false / 混合→true / 空→false = LocalShellTask+LocalAgentTask 族统一；修前红形 = 谓词缺席〕）`
      : `needs_input 状态机缺口（isTerm(needs_input)=${isTerm?.('needs_input')} hasNonTerminalTasks=${typeof hasNonTerminal} pred=${q2aPred} = 修前红形活面现形）`,
  })

  // ── Q2b needs_input 通知构造（不去重）──────────────────────────
  const enqueue = localAgentTaskMod.enqueueAgentNotification
  const setHandler2 = notifMod.setTaskNotificationHandler
  if (typeof enqueue === 'function' && typeof setHandler2 === 'function') {
    const captured2: { value: string, mode: string }[] = []
    setHandler2((n: { value: string, mode: string }) => { captured2.push(n) })
    setDisk({ getProjectTempDir: () => asyncTmp, getSessionId: () => 'q30165-probe-sess' })
    try {
      // 探针侧容错（基线红形承载）：基线 setAppState 必选（Q3-1 才可选化）→
      // 缺省投递路径缺席 = 红形；try/catch 记 FAIL 不中断。
      const base = { taskId: 'q3-need-1', description: 'bg probe', setAppState: undefined as unknown }
      let q2bErr: unknown = null
      try {
        enqueue({ ...base, status: 'needs_input', inputRequest: 'Permission required for Bash: rm -rf' })
        enqueue({ ...base, status: 'needs_input', inputRequest: 'second question' })
      } catch (e) { q2bErr = e }
      await new Promise(r => setTimeout(r, 50))
      const niNotifs = captured2.filter(n => n.value.includes('<status>needs_input</status>'))
      const q2b = !q2bErr && niNotifs.length === 2
        && niNotifs[0].value.includes('Permission required for Bash: rm -rf')
        && niNotifs[1].value.includes('second question')
      probes.push({
        id: 'Q2b-needs-input-notification', hard: true, ok: q2b,
        detail: q2b
          ? `needs_input 通知构造（连发两条均投递〔非终态不去重允许多次请求输入〕+ 「<status>needs_input</status>」+ inputRequest 内容在场 = Q3-3 通知构造面）`
          : `needs_input 通知缺口（err=${q2bErr instanceof Error ? q2bErr.message.slice(0, 100) : q2bErr}〔基线 = setAppState 必选 + needs_input 态缺席红形〕needs_input 通知数=${niNotifs.length} 期望 2）`,
      })
    } finally {
      notifMod.resetTaskNotificationHandler?.()
      diskMod.resetDiskOutputEnv?.()
    }
  } else {
    probes.push({
      id: 'Q2b-needs-input-notification', hard: true, ok: false,
      detail: `enqueueAgentNotification=${typeof enqueue} = 修前红形活面现形（或通知注入面缺席）`,
    })
  }

  // ── Q2c wrapPermissionGateForBackground（ask → needs_input，fail-closed 不变）─
  const wrapGate = runAgentMod.wrapPermissionGateForBackground
  if (typeof wrapGate === 'function') {
    const fired: { toolName: string, reason?: string }[] = []
    const fakeGate = async (_tool: { name: string }, _input: unknown, _ctx: unknown) => ({ ask: true, reason: 'probe-ask' })
    const wrapped = wrapGate(fakeGate as never, (r: { toolName: string, reason?: string }) => { fired.push(r) })
    const verdict = await wrapped({ name: 'Bash' }, {}, {})
    const q2c = fired.length === 1 && fired[0].toolName === 'Bash' && verdict.ask === true
    probes.push({
      id: 'Q2c-wrap-permission-gate', hard: true, ok: q2c,
      detail: q2c
        ? `wrapPermissionGateForBackground（ask 裁定 → onNeedsInput 触发〔toolName 在场〕+ verdict 原样 fail-closed 返回〔agent 不挂起，权限语义零变更 = Q3-3 权限面接线〕）`
        : `wrap 缺口（fired=${JSON.stringify(fired)} verdict.ask=${verdict?.ask} = 修前红形）`,
    })
  } else {
    probes.push({
      id: 'Q2c-wrap-permission-gate', hard: true, ok: false,
      detail: 'wrapPermissionGateForBackground 缺席（runAgent.ts 修前红形活面现形）',
    })
  }

  // ── Q3a 提示词批 delta 面（源级在场）──────────────────────────
  const promptSrc = readSrc(join(REPO, 'src/engine/tools/agent/prompt.ts'))
  const q3a = promptSrc.includes('run_in_background') && promptSrc.includes('task-notification')
    && promptSrc.includes('Do not predict') && promptSrc.includes('Be cost-aware about delegating')
  probes.push({
    id: 'Q3a-prompt-batch-delta', hard: true, ok: q3a,
    detail: q3a
      ? `提示词批 delta 面（agent prompt.ts 在场：run_in_background usage note + task-notification 语义 + no-predict 句「Do not predict」+ cost-aware 句〔0.1.55 已落防漂移〕= Q3-4 零码批落码面；修前红形 = delta 句缺席）`
      : `提示词批缺口（run_in_background=${promptSrc.includes('run_in_background')} task-notification=${promptSrc.includes('task-notification')} no-predict=${promptSrc.includes('Do not predict')} cost-aware=${promptSrc.includes('Be cost-aware about delegating')} = 修前红形活面现形）`,
  })

  // ── Q3b 1P 裁面核验（基线同绿守卫）────────────────────────────
  const banned1p = ['claude.ai', 'Anthropic', 'Claude Code']
  const bannedHit = banned1p.filter(s => promptSrc.includes(s))
  probes.push({
    id: 'Q3b-no-1p-citation', hard: true, ok: bannedHit.length === 0,
    detail: bannedHit.length === 0
      ? `1P 裁面核验（agent prompt 零 claude.ai/Anthropic/Claude Code 引用 = 国产适配裁面，0.1.55 先例同族断言；基线同绿守卫）`
      : `1P 裁面违规（命中 ${bannedHit.join(' / ')} = 裁面未落）`,
  })

  // ── Q4 P5 时序守卫接线（agentLoopDeps 源级）────────────────────
  const depsSrc = readSrc(join(REPO, 'src/tui/agentLoopDeps.ts'))
  const q4 = /hasPendingBackgroundTasks:/.test(depsSrc) && /hasNonTerminalTasks/.test(depsSrc)
  probes.push({
    id: 'Q4-p5-guard-wiring', hard: true, ok: q4,
    detail: q4
      ? `P5 时序守卫接线（agentLoopDeps.ts 源级：hasPendingBackgroundTasks 注入 + hasNonTerminalTasks 引用在场 = 0.1.63 P5「仅声明未接线」→ 本波接线回收〔/goal 评估器后台任务时序守卫触 LocalAgentTask 族〕；修前红形 = 未接线）`
      : `P5 接线缺口（hasPendingBackgroundTasks=${/hasPendingBackgroundTasks:/.test(depsSrc)} hasNonTerminalTasks 引用=${/hasNonTerminalTasks/.test(depsSrc)} = 修前红形活面现形）`,
  })

  rmSync(asyncTmp, { recursive: true, force: true })

  const hardFail = probes.filter((p) => p.hard && p.ok === false).length
  const verdict = hardFail === 0 ? 'PASS' : `FAIL（hardFail=${hardFail}）`
  const OUT = process.env.ATLAS_E2E_Q30165_OUT ?? '/home/vince/.claude/jobs/09264df0/tmp/gate-065/q3-probe'
  const fs = await import('node:fs')
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(join(OUT, 'result.json'), JSON.stringify({ probe: 'tui-q3-subagent-0165', repo: REPO, verdict, probes }, null, 2))
  console.log(JSON.stringify({
    verdict,
    probes: probes.map((p) => `[${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INC'}] ${p.id}`).join(' '),
  }, null, 1))
  console.log(`TUI-Q3-SUBAGENT-0165 ${verdict} → ${OUT}`)
  process.exit(hardFail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('TUI-Q3-SUBAGENT-0165 ERROR', e); process.exit(1) })
