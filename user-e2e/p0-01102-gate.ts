/**
 * ⚠️ 除役封存（2026-11-13，0.1.104 回退波双信号①工单 §6 e2e 自理项）：
 * 本探针 G1/G4/G5/G6/G8 腿引用 0.1.104 回退波已撤特性（loopWatchdog env 形 /
 * defer 提示行 / 视口压缩器 / 小终端退化规则）——回退后本文件**整体封存不入任何 gate 格**，
 * 仅供历史判读存照（gate-102→t109 四轮链 + reset 事故 G7 烟测）。彼时在案账面见
 * user-e2e/reports/r-20261113-gate-102.md / r-20261113-regate-{107,108,109}.md。
 * 【0.1.105 更新（2026-11-13，重落波工单 §6 自理项）】切片 1 主题分层检测（b47ba079）
 * 与 timeoutMs（0c7dab8d）随 0.1.105 重落复活——本文件 theme 相关面（G7 /theme modal）
 * 判读效力恢复，但本文件仍整体封存不直接起跑：0.1.105 自理探针另起
 * user-e2e/p0-01105-gate.ts（AUTO_THEME env 面 + timeoutMs wire 零差 W5 形适配）；
 * compressor/crash 腿（G5/G6/G8/G3 等切片 3/2-A 面）维持除役——0.1.105 不复活该两切片。
 *
 * ─── 以下为封存时原文 ───
 *
 * 0.1.102 P0 三切片波 gate-102 pty 探针（t106 系列，e2e 侧 §4 判据格 + R3-B 五场景）。
 *
 * 场景（串行，各独占沙箱 home + workspace + 日志）：
 *   G1 watchdog 两不触发格：ATLAS_LOOP_WATCHDOG_MS=500 —— 心跳活动不误杀（回合完成）+
 *      轮间空闲 15s 不触发（无「主循环无响应中止」）。
 *   G2 turn-error 错误行可见 + 可重入：fault-proxy firstN=1 fault=500 → 错误行（api_error_500/
 *      failed 族）→ 下一次 prompt 正常回复（可重入）。
 *   G3 escape 升格面尝试：mid-stream 杀代理 + empty 注障 → 观察「内部错误已复位」（crashRecovery
 *      升格）或 handled turn-error（记录形态；escape face 主判据 = unit 侧 61 格族，e2e 尽力观察）。
 *   G4 defer 挂起提示行格：default 权限 + ask Write + 序列脚本 Write tool_use → 弹框时发消息 →
 *      「⏸ 等待权限裁定」提示行在场 → 答框完成。
 *   G5 流式 1200 行钉底格：序列 text 1200 行 40 chunk → 流式帽提示「… N 行已入滚动区」+ 完成后
 *      「N 条已入滚动区，↑ 翻看」+ 输入框钉底（log 尾 ❯ 在内容后）+ 后续 prompt 可用。
 *   G6 permission overlay 叠长内容：G5 后续 call 2 = Write tool_use → 弹框叠流式长块 →
 *      「Do you want to proceed」可见 + 答框完成。
 *   G7 modal 完备性：/theme 打开 ThemePicker（主题名清单可见）→ Esc 关 → prompt 恢复。
 *   G8 小终端 <20 行：ROWS=18 COLS=80 + 400 行流 → 退化不崩溃 + 输入框不误截 + prompt 可用。
 *   G9 teammate hideSticky（soft）：teams env live spawn → footer 导航进 teammate 视图（hideSticky
 *      面）→ Esc 退回。fragile = soft 触发，INCONCLUSIVE 不判红。
 *
 * 判读产物：/home/vince/.claude/jobs/09264df0/tmp/gate-102/pty/G<n>.verdict
 */
import { mkdirSync, rmSync, cpSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Pty } from './lib/pty'
import { startFaultProxy, type FaultPlan } from './loop-robustness/fault-proxy'
import { sleep } from './lib/util'

const REPO = '/home/vince/projects/AtlasCode'
const OUT = '/home/vince/.claude/jobs/09264df0/tmp/gate-102/pty'
const SETTINGS_SRC =
  '/home/vince/.claude/jobs/09264df0/tmp/gate-093-regate/settings-glm5/home/.atlas/settings.json'

const verdicts: string[] = []
function verdict(id: string, ok: boolean, note: string) {
  const line = `${ok ? 'GREEN' : 'RED'} ${id} ${note}`
  verdicts.push(line)
  console.log('[verdict]', line)
}
function soft(id: string, note: string) {
  const line = `SOFT ${id} ${note}`
  verdicts.push(line)
  console.log('[verdict]', line)
}

interface Ctx {
  id: string
  env?: Record<string, string>
  plan?: FaultPlan
  tuiArgs?: string
  settingsPatch?: (s: Record<string, unknown>) => void
}
const savedEnv: Array<[string, string | undefined]> = []
function setEnv(k: string, v: string | undefined) {
  savedEnv.push([k, process.env[k]])
  if (v === undefined) delete process.env[k]
  else process.env[k] = v
}
function restoreEnv() {
  for (let i = savedEnv.length - 1; i >= 0; i--) {
    const [k, v] = savedEnv[i]!
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
    savedEnv.pop()
  }
}

async function withScenario(ctx: Ctx, fn: (pty: Pty, ws: string, log: string, stopProxy?: () => void) => Promise<void>) {
  const only = process.env.GATE_ONLY
  if (only && !new RegExp(only).test(ctx.id)) return
  const dir = join(OUT, ctx.id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'home/.atlas'), { recursive: true })
  mkdirSync(join(dir, 'ws'), { recursive: true })
  cpSync(SETTINGS_SRC, join(dir, 'home/.atlas/settings.json'))
  if (ctx.settingsPatch) {
    const s = JSON.parse(readFileSync(join(dir, 'home/.atlas/settings.json'), 'utf8'))
    ctx.settingsPatch(s)
    writeFileSync(join(dir, 'home/.atlas/settings.json'), JSON.stringify(s, null, 1))
  }
  const log = join(dir, 'pty.log')
  let stopProxy: (() => void) | undefined
  if (ctx.plan) {
    const h = await startFaultProxy({ port: 8998, target: 'http://127.0.0.1:8999', plan: ctx.plan, logPath: join(dir, 'proxy.log') })
    stopProxy = () => h.stop()
  }
  if (ctx.env) for (const [k, v] of Object.entries(ctx.env)) setEnv(k, v)
  let pty: Pty | null = null
  try {
    pty = await Pty.start({ repoRoot: REPO, workspace: join(dir, 'ws'), sandboxHome: join(dir, 'home'), logPath: log })
    await fn(pty, join(dir, 'ws'), log, stopProxy)
  } catch (e) {
    verdict(ctx.id, false, `scenario error: ${String(e).slice(0, 200)}`)
  } finally {
    pty?.kill()
    restoreEnv()
    stopProxy?.()
  }
}

const SAY_HELLO = '请用一句话回复：gate-check-ok'

// ── G1 watchdog 两不触发 ────────────────────────────────────────────
await withScenario(
  { id: 'G1-watchdog-idle', env: { ATLAS_LOOP_WATCHDOG_MS: '500' }, tuiArgs: '--dangerously-skip-permissions' },
  async pty => {
    pty.send(SAY_HELLO)
    const r1 = await pty.waitAnySince(['gate-check-ok'], 180_000)
    verdict('G1a-heartbeat', r1.ok && pty.countSince('主循环无响应中止') === 0,
      `回合完成=${r1.ok}（500ms 窗下事件流不断重置）watchdog误杀=${pty.countSince('主循环无响应中止')}`)
    await sleep(15_000) // 轮间空闲 > 500ms 窗 30 倍
    pty.send(SAY_HELLO)
    const r2 = await pty.waitAnySince(['gate-check-ok'], 180_000)
    verdict('G1b-idle-notrigger', r2.ok && pty.countSince('主循环无响应中止') === 0,
      `空闲15s后再回合=${r2.ok} watchdog行=${pty.countSince('主循环无响应中止')}`)
  },
)

// ── G2 turn-error 错误行 + 可重入 ───────────────────────────────────
await withScenario(
  { id: 'G2-turnerror', plan: { kind: 'firstN', n: 10, fault: '500' }, tuiArgs: '--dangerously-skip-permissions' },
  async pty => {
    pty.send(SAY_HELLO)
    const err = await pty.waitAnySince(['api_error_500', 'in pool for role', '不可达', 'has failed'], 240_000)
    verdict('G2a-errorline', err.ok, `错误行 marker=${err.found}（首请求 500 注障）`)
    pty.send(SAY_HELLO)
    const r2 = await pty.waitAnySince(['gate-check-ok'], 180_000)
    verdict('G2b-reentrant', r2.ok, `错误后下一回合正常回复=${r2.ok}`)
  },
)

// ── G3 escape 升格面尝试（mid-stream 断连 + empty）──────────────────
await withScenario(
  { id: 'G3-escape', plan: { kind: 'nominal' }, tuiArgs: '--dangerously-skip-permissions' },
  async (pty, _ws, _log, stopProxy) => {
    pty.send('请数到十，每行一个数字。')
    await sleep(4_000) // 流式开始后断连
    stopProxy?.()
    await sleep(10_000)
    const crashLine = pty.countSince('内部错误已复位')
    const turnErr = pty.countSince('api_error_|in pool for role|无法连接|failed')
    soft('G3a-midstream-kill', `crash升格行=${crashLine} handled错误行=${turnErr > 0 ? 'yes' : 'no'}（escape face 主判据=unit 61 格族；本腿为生产环境形态观察）`)
    // 可重入护底（代理已死 → 回合失败属预期，仅记形态）
    pty.send(SAY_HELLO)
    await sleep(8_000)
    soft('G3b-postcrash-form', `进程存活=${pty.alive() ? 'yes' : 'no'}`)
  },
)

// ── G4 defer 挂起格（headless 车道 = AD-45 defer 定义车道；TUI 交互车道 defer→ask
// 等价面由 G6 弹框腿实证）─────────────────────────────────────────────
{
  const only = process.env.GATE_ONLY
  if (!only || /G4/.test(only)) {
  const dir = join(OUT, 'G4-defer-headless')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'home/.atlas'), { recursive: true })
  mkdirSync(join(dir, 'ws'), { recursive: true })
  cpSync(SETTINGS_SRC, join(dir, 'home/.atlas/settings.json'))
  const deferJson = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'defer', permissionDecisionReason: 'gate-102 probe' } })
  const s = JSON.parse(readFileSync(join(dir, 'home/.atlas/settings.json'), 'utf8'))
  s.hooks = { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: `echo '${deferJson}'` }] }] }
  writeFileSync(join(dir, 'home/.atlas/settings.json'), JSON.stringify(s, null, 1))
  // 独立进程代理：in-process bun http server + execSync 子进程组合曾致首请求零到达挂起（round-5 定因面），
  // G4 腿改 spawn 独立 fault-proxy 进程（与手工 GREEN 形态一致）。
  const { spawn } = await import('node:child_process')
  const plan4 = JSON.stringify({ kind: 'nominal', mainLoop: { toolName: 'Write', arguments: { file_path: 'note.txt', content: 'hello gate' } } })
  const proxyProc = spawn('bun', ['run', join(REPO, 'user-e2e/loop-robustness/fault-proxy.ts')], {
    env: { ...process.env, ATLAS_E2E_LB_TARGET: 'http://127.0.0.1:8999', ATLAS_E2E_LB_PORT: '8998', ATLAS_E2E_LB_PLAN: plan4, ATLAS_E2E_LB_LOG: join(dir, 'proxy.log') },
    stdio: 'ignore',
  })
  await new Promise(r => setTimeout(r, 1200))
  const h = { stop: () => { try { proxyProc.kill() } catch { /* ignore */ } } }
  try {
    const { execSync } = await import('node:child_process')
    // < /dev/null 必带：继承 stdin 永不闭合 → cli 3s 警告后仍阻塞（round-4 RC=124 定因）
    const out = execSync(
      `cd '${join(dir, 'ws')}' && env HOME='${join(dir, 'home')}' ATLAS_LOOP_WATCHDOG_MS=0 timeout 300 node ${REPO}/dist/cli.js -p "请把 hello gate 写入 note.txt" --dangerously-skip-permissions --output-format json < /dev/null > out.json 2> err.log; echo RC=$?`,
      { encoding: 'utf8', shell: '/bin/bash' },
    )
    const stdout = readFileSync(join(dir, 'ws/out.json'), 'utf8')
    const deferred = stdout.includes('deferred_tool_use') || stdout.includes('"subtype":"deferred"') || stdout.includes('Session suspended') || stdout.includes('已挂起')
    verdict('G4a-headless-defer', deferred, `headless defer 挂起协议面（deferred 标记/挂起文案）=${deferred} ${out.trim().slice(0, 120)}`)
    const notWritten = !existsSync(join(dir, 'ws/note.txt'))
    verdict('G4b-defer-notexecuted', notWritten, `挂起期工具未执行（note.txt 不存在）=${notWritten}`)
  } catch (e) {
    verdict('G4a-headless-defer', false, `scenario error: ${String(e).slice(0, 160)}`)
  } finally {
    h.stop()
  }
  } // end GATE_ONLY G4 guard
}

// ── G5+G6 流式钉底 + overlay ────────────────────────────────────────
await withScenario(
  {
    id: 'G5-stream-pin',
    tuiArgs: 'code --permission-mode default',
    settingsPatch: s => { (s as Record<string, unknown>).permissions = { ask: ['Write'] } },
    plan: { kind: 'nominal', mainLoop: { toolName: 'Write', arguments: {}, sequence: [
      { kind: 'text', lines: 1200, chunks: 40 },
      { kind: 'tool', toolName: 'Write', arguments: { file_path: 'pin.txt', content: 'after-stream' } },
    ] } },
  },
  async pty => {
    pty.send('请输出长测试文本')
    // t108 措辞分域（Main be84fb10）：流式溢出行改「… N 行已折叠」；「N 条已入滚动区」= 回合后 divider（G5b 域，不动）。
    const capped = await pty.waitAnySince(['行已折叠'], 180_000)
    verdict('G5a-stream-cap-hint', capped.ok, `流式帽提示「… N 行已折叠」=${capped.ok}（1200 行 / 40 chunk SSE）`)
    await pty.settle(5_000, 30_000)
    // t108 重锚（f4 判据 2 重冻 D 方案）：单条超视口消息场景下提示面 =
    // 行级「… N 行已折叠」（Messages.tsx:568）；「N 条已入滚动区」divider
    // （:633）= 整条消息截断（多消息溢出）条件面，本场景按设计不在场。
    const hintCount = pty.countSince('行已折叠')
    verdict('G5b-hint-persist', hintCount >= 1, `回合后滚动区提示行在场（行折叠形 count=${hintCount}；条-divider=:633 整条截断条件面，本场景设计不在场）`)
    const full = pty.sinceText()
    const lastIdxContent = full.lastIndexOf('stream-anchor-line')
    const lastIdxPrompt = full.lastIndexOf('❯')
    verdict('G5c-pinned', lastIdxPrompt > lastIdxContent, `log 尾 prompt 边界在内容之后（钉底）=${lastIdxPrompt > lastIdxContent}`)
    // G6：call 2 = Write tool_use → 弹框叠长内容
    pty.send('请把 after-stream 写入 pin.txt')
    const dlg = await pty.waitCountSince('Do you want to', 1, 180_000)
    verdict('G6a-overlay-dialog', dlg, `长内容上权限弹框 overlay 可见=${dlg}`)
    if (dlg) {
      pty.sendRaw('1')
      await pty.settle(8_000, 60_000)
      const done = existsSync(join(OUT, 'G5-stream-pin/ws/pin.txt'))
      verdict('G6b-overlay-complete', done, `overlay 答框后完成=${done}`)
    }
    // 后续 prompt 可用 + 重冻判据（可见性底线）：视口内恒有最近回合内容
    // （gate-check-ok 渲染）+ 「N 行已折叠」提示行在场 + 不崩溃。
    pty.send(SAY_HELLO)
    const r = await pty.waitAnySince(['gate-check-ok'], 120_000)
    const foldHint = pty.countSince('行已折叠')
    verdict('G5d-post-pin-reentrant', r.ok && foldHint >= 1 && pty.countSince('Maximum update depth') === 0,
      `钉底后新回合（重冻判据）=${r.ok} 最近回合内容可见 + 「N 行已折叠」提示行=${foldHint} + 不崩溃（max-depth=0）`)
  },
)

// ── G7 modal 完备性 ────────────────────────────────────────────────
await withScenario(
  { id: 'G7-modal', tuiArgs: '--dangerously-skip-permissions' },
  async pty => {
    pty.send('/theme')
    const modal = await pty.waitAnySince(['Choosethetextstyle', 'Choose the text style', 'daltonized'], 60_000)
    verdict('G7a-modal-open', modal.ok, `/theme modal 打开（主题清单 marker=${modal.found}）`)
    pty.esc()
    await pty.settle(3_000, 15_000)
    pty.send(SAY_HELLO)
    const r = await pty.waitAnySince(['gate-check-ok'], 120_000)
    verdict('G7b-modal-close-reentrant', r.ok, `Esc 关 modal 后回合正常=${r.ok}`)
  },
)

// ── G8 小终端 <20 行 ───────────────────────────────────────────────
await withScenario(
  {
    id: 'G8-small-terminal',
    env: { ATLAS_E2E_ROWS: '18', ATLAS_E2E_COLS: '80' },
    tuiArgs: '--dangerously-skip-permissions',
    plan: { kind: 'nominal', mainLoop: { toolName: 'Write', arguments: {}, sequence: [{ kind: 'text', lines: 400, chunks: 20 }] } },
  },
  async pty => {
    pty.send('请输出长测试文本')
    const done = await pty.waitAnySince(['条已入滚动区'], 180_000)
    const alive = pty.alive()
    const promptBack = pty.countSince('❯') > 0
    verdict('G8a-degrade-alive', alive && promptBack, `18 行终端 400 行流后：进程存活=${alive} prompt可见=${promptBack} divider=${done.ok}`)
    pty.send(SAY_HELLO)
    const r = await pty.waitAnySince(['gate-check-ok'], 120_000)
    verdict('G8b-small-reentrant', r.ok, `小终端后续回合=${r.ok}`)
  },
)

// ── G9 teammate hideSticky（soft）──────────────────────────────────
await withScenario(
  {
    id: 'G9-hide-sticky',
    env: { ATLAS_EXPERIMENTAL_AGENT_TEAMS: '1' },
    tuiArgs: '--dangerously-skip-permissions',
  },
  async pty => {
    pty.send('创建团队 research-pair-102g（成员 scout，目标：回复 ok 即完成），spawn scout 并等它完成。')
    const spawned = await pty.waitAnySince(['scout', 'Agent'], 240_000)
    if (!spawned.ok) { soft('G9a-spawn', '未观察到 teammate 迹象（soft，不判红）'); return }
    await pty.settle(20_000, 120_000)
    // footer 导航：down 选中任务 pill → enter 进 teammate 视图（hideSticky 面）
    pty.sendRaw('\x1b[B')
    await pty.settle(2_000, 10_000)
    pty.sendRaw('\r')
    await pty.settle(4_000, 20_000)
    const inView = pty.countSince('scout') > 0
    soft('G9b-teammate-view', `teammate 视图进入形态观察（scout 迹象=${inView}；hideSticky=!!viewedTeammateTask 渲染面，soft 判）`)
    pty.esc()
    await pty.settle(3_000, 15_000)
    pty.send(SAY_HELLO)
    const r = await pty.waitAnySince(['gate-check-ok'], 120_000)
    soft('G9c-exit-reentrant', `Esc 退视图后回合=${r.ok ? 'ok' : 'no'}`)
  },
)

writeFileSync(join(OUT, 'ALL.verdicts'), verdicts.join('\n') + '\n')
console.log('=== GATE-102 PTY PROBES DONE ===')
console.log(verdicts.join('\n'))
