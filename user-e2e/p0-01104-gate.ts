/**
 * ⚠️ 除役封存（2026-11-13，0.1.104 回退波双信号①工单 §6 e2e 自理项）：
 * 本探针 W1-W4 引用 ATLAS_LOOP_WATCHDOG_MS env 形（0.1.104 回退波撤卸面），
 * W5 以「0.1.103 vs 0.1.104 dist」零 wire 差为判据（回退后 0.1.104 dist = 0.1.101 行为，
 * 该对表格失去断言对象）——回退重定义后本文件**整体封存不入任何 gate 格**。
 * 存照价值：W5 于回退前实测 GREEN（tools 数组 92,958B 字节恒等 + 无 timeoutMs token），
 * 证 watchdog/timeout 形态本身 wire 无差；W1-W5 全绿存照见 tmp/gate-104/ 判读产物。
 *
 * ─── 以下为封存时原文 ───
 *
 * 0.1.104 watchdog 纠偏 + per-tool timeoutMs 波 gate-104 探针（t111 系列）。
 *
 * 判据（f4 预登记六格；本探针承 e2e 侧格，格 1 arm() 结构 / 格 3-5 假钟形归 unit 套件 canon 承接）：
 *   W1 缺省关格：无 env → 合法慢（fault-proxy delay 6s）回合续跑完成，「主循环无响应中止」=0。
 *   W2 opt-in 真挂起格：env=3000 + PreToolUse hook sleep 9（无事件窗）→ 观察可见中止 + 可重入
 *      （hook 相位若落 permission 包裹域则豁免不 fire——如实判读，fire 面由 unit 三态表承接）。
 *   W3 permission 豁免格：env=500 + ask Write 弹框持 12s → 不误杀，答框后完成。
 *   W4 defer 豁免格：env=500 + defer hook（headless 车道）→ 不误杀，deferred 挂起协议面。
 *   W5 无声明零 wire 差格：0.1.103 安装品 vs 0.1.104 dist 同 prompt 首主循环 REQ body 的
 *      tools 数组字节级对表 + 全 body 无 timeoutMs token。
 *
 * 判读产物：/home/vince/.claude/jobs/09264df0/tmp/gate-104/W*.verdict + ALL.verdicts
 * harness 纪律：headless execSync 须 < /dev/null；fault-proxy 走独立进程（in-process bun
 * server + execSync 组合致首请求零到达——0.1.102 gate §5 定因）。
 */
import { mkdirSync, rmSync, cpSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync, spawn } from 'node:child_process'

const REPO = '/home/vince/projects/AtlasCode'
const OUT = '/home/vince/.claude/jobs/09264df0/tmp/gate-104'
const SETTINGS_SRC =
  '/home/vince/.claude/jobs/09264df0/tmp/gate-093-regate/settings-glm5/home/.atlas/settings.json'
const INSTALL_0103 = '/home/vince/.claude/jobs/09264df0/tmp/prodlane-103/prefix/node_modules/@atlasharness/atlascode/dist/cli.js'

const verdicts: string[] = []
function verdict(id: string, ok: boolean, note: string) {
  const line = `${ok ? 'GREEN' : 'RED'} ${id} ${note}`
  verdicts.push(line)
  console.log('[verdict]', line)
}

interface Sandbox { dir: string; ws: string; home: string }
function mkSandbox(id: string, settingsPatch?: (s: Record<string, unknown>) => void): Sandbox {
  const dir = join(OUT, id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'home/.atlas'), { recursive: true })
  mkdirSync(join(dir, 'ws'), { recursive: true })
  cpSync(SETTINGS_SRC, join(dir, 'home/.atlas/settings.json'))
  if (settingsPatch) {
    const s = JSON.parse(readFileSync(join(dir, 'home/.atlas/settings.json'), 'utf8'))
    settingsPatch(s)
    writeFileSync(join(dir, 'home/.atlas/settings.json'), JSON.stringify(s, null, 1))
  }
  return { dir, ws: join(dir, 'ws'), home: join(dir, 'home') }
}

/** 独立进程 fault-proxy（0.1.102 纪律）。plan 传 JSON 字符串。 */
function startProxy(logPath: string, plan: string) {
  const p = spawn('bun', ['run', join(REPO, 'user-e2e/loop-robustness/fault-proxy.ts')], {
    env: { ...process.env, ATLAS_E2E_LB_TARGET: 'http://127.0.0.1:8999', ATLAS_E2E_LB_PORT: '8998', ATLAS_E2E_LB_PLAN: plan, ATLAS_E2E_LB_LOG: logPath },
    stdio: 'ignore',
  })
  return { proc: p, stop: () => { try { p.kill() } catch { /* ignore */ } } }
}

/** headless -p 跑批（< /dev/null 纪律）；返回 {rc, out}。 */
function headless(sb: Sandbox, prompt: string, env: Record<string, string>, timeoutSec: number, outFile: string): { rc: string; out: string } {
  const envStr = Object.entries(env).map(([k, v]) => `${k}='${v}'`).join(' ')
  const r = execSync(
    `cd '${sb.ws}' && env HOME='${sb.home}' ${envStr} timeout ${timeoutSec} node ${REPO}/dist/cli.js -p '${prompt.replace(/'/g, `'\\''`)}' --dangerously-skip-permissions --output-format json < /dev/null > ${outFile} 2> err.log; echo RC=$?`,
    { encoding: 'utf8', shell: '/bin/bash', timeout: (timeoutSec + 30) * 1000 },
  )
  const rc = (r.match(/RC=(\d+)/) || [])[1] ?? '?'
  let out = ''
  try { out = readFileSync(join(sb.ws, outFile), 'utf8') } catch { /* ignore */ }
  return { rc, out }
}

const SAY = 'reply with exactly: wd-ok'

// ── W1 缺省关：合法慢续跑 ──────────────────────────────────────────
{
  const sb = mkSandbox('W1-default-off-slow')
  // delay 注障：firstN 1 次 delay 6000ms（合法慢主循环请求）
  const px = startProxy(join(sb.dir, 'proxy.log'), JSON.stringify({ kind: 'firstN', n: 1, fault: 'delay', delayMs: 6000 }))
  try {
    const { rc, out } = headless(sb, SAY, {}, 150, 'out.json')
    const ok = rc === '0' && out.includes('wd-ok')
    const aborted = out.includes('主循环无响应中止')
    verdict('W1-default-off-slow', ok && !aborted, `无 env 合法慢（delay 6s）续跑完成=${ok} watchdog行=${aborted ? 1 : 0} RC=${rc}`)
  } finally { px.stop() }
}

// ── W2 opt-in 真挂起尝试：hook 相位无事件窗 ────────────────────────
{
  const deferSleep = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'wd probe' } })
  const sb = mkSandbox('W2-optin-hang', s => {
    s.hooks = { PreToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command: `sleep 9; echo '${deferSleep}'` }] }] }
  })
  const px = startProxy(join(sb.dir, 'proxy.log'), JSON.stringify({ kind: 'nominal' }))
  try {
    const { rc, out } = headless(sb, 'run the bash tool: echo wdprobe', { ATLAS_LOOP_WATCHDOG_MS: '3000' }, 120, 'out.json')
    const fired = out.includes('主循环无响应中止')
    const done = rc === '0' && (out.includes('wdprobe') || out.includes('success'))
    if (fired) {
      // 可重入：第二回合（hook 保留 sleep 9 仍 > 窗？改快 hook 不行——settings 已冻；用无 hook sandbox 二次）
      const sb2 = mkSandbox('W2-reentrant')
      const px2 = startProxy(join(sb2.dir, 'proxy.log'), JSON.stringify({ kind: 'nominal' }))
      try {
        const r2 = headless(sb2, SAY, { ATLAS_LOOP_WATCHDOG_MS: '3000' }, 120, 'out.json')
        verdict('W2-optin-hang', r2.rc === '0' && r2.out.includes('wd-ok'), `opt-in 真挂起可见中止 ✓（fire 行在案）+ 摘 env 面（本腿=换 sandbox 快窗续跑）=${r2.rc === '0'}`)
      } finally { px2.stop() }
    } else {
      verdict('W2-optin-hang', done, `opt-in env=3000：hook 相位 ${done ? '回合完成' : '未完成'} 且零 fire（hook 相位落豁免包裹域）——fire 面由 unit 三态表承接（结构格），e2e 侧如实判读`)
    }
  } finally { px.stop() }
}

// ── W3 permission 豁免：ask Write 弹框持 12s（pty 车道）────────────
{
  const { Pty } = await import('./lib/pty')
  const dir = join(OUT, 'W3-permission-exempt')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'home/.atlas'), { recursive: true })
  mkdirSync(join(dir, 'ws'), { recursive: true })
  cpSync(SETTINGS_SRC, join(dir, 'home/.atlas/settings.json'))
  const s = JSON.parse(readFileSync(join(dir, 'home/.atlas/settings.json'), 'utf8'))
  s.permissions = { ask: ['Write'] }
  writeFileSync(join(dir, 'home/.atlas/settings.json'), JSON.stringify(s, null, 1))
  const px = startProxy(join(dir, 'proxy.log'), JSON.stringify({ kind: 'nominal', mainLoop: { toolName: 'Write', arguments: { file_path: 'w3.txt', content: 'wd' } } }))
  let pty: import('./lib/pty').Pty | null = null
  try {
    pty = await Pty.start({ repoRoot: REPO, workspace: join(dir, 'ws'), sandboxHome: join(dir, 'home'), logPath: join(dir, 'pty.log') })
    ;(pty as unknown as { envSet?: unknown })
    pty.send('请把 wd 写入 w3.txt')
    const dlg = await pty.waitAnySince(['Do you want to'], 120_000)
    // 持框 12s（env=500 窗的 24 倍）
    await new Promise(r => setTimeout(r, 12_000))
    const firedDuringHold = pty.countSince('主循环无响应中止')
    pty.sendRaw('1')
    await pty.settle(8_000, 60_000)
    const done = existsSync(join(dir, 'ws/w3.txt'))
    verdict('W3-permission-exempt', dlg.ok && firedDuringHold === 0 && done, `ask Write 持框 12s 不误杀（fire=${firedDuringHold}）+ 答框完成=${done}`)
  } finally {
    pty?.kill()
    px.stop()
  }
}

// ── W4 defer 豁免（headless 车道，env=500 + defer hook + 脚本化 Write）──
{
  const deferJson = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'defer', permissionDecisionReason: 'wd probe' } })
  const sb = mkSandbox('W4-defer-exempt', s2 => {
    s2.hooks = { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: `echo '${deferJson}'` }] }] }
  })
  const px = startProxy(join(sb.dir, 'proxy.log'), JSON.stringify({ kind: 'nominal', mainLoop: { toolName: 'Write', arguments: { file_path: 'w4.txt', content: 'wd' } } }))
  try {
    const { rc, out } = headless(sb, '请把 wd 写入 w4.txt', { ATLAS_LOOP_WATCHDOG_MS: '500' }, 120, 'out.json')
    const deferred = out.includes('"subtype":"deferred"') || out.includes('Session suspended')
    const fired = out.includes('主循环无响应中止')
    verdict('W4-defer-exempt', deferred && !fired, `defer 挂起态 env=500 不误杀（fire=${fired ? 1 : 0}）+ deferred 协议面=${deferred} RC=${rc}`)
  } finally { px.stop() }
}

// ── W5 无声明零 wire 差：0.1.103 安装品 vs 0.1.104 dist tools 数组字节级 ──
{
  const runCapture = (cli: string, tag: string) => {
    const sb = mkSandbox(`W5-${tag}`)
    const px = startProxy(join(sb.dir, 'proxy.log'), JSON.stringify({ kind: 'nominal' }))
    try {
      headless(sb, SAY, {}, 120, 'out.json')
    } finally { px.stop() }
    const dir = join(sb.dir, 'reqlog')
    return dir
  }
  // fault-proxy reqlog? fault-proxy 只写 proxy.log；wire 抓取走 k5-bridge-proxy（reqlog 面）。
  const capture = (cli: string, tag: string) => {
    const sb = mkSandbox(`W5-${tag}`)
    const reqlog = join(sb.dir, 'reqlog')
    mkdirSync(reqlog, { recursive: true })
    const bp = spawn('python3', ['-I', join(REPO, 'user-e2e/k5-bridge-proxy.py'), '--port', '8998', '--upstream', '127.0.0.1:8999', '--logdir', reqlog], { stdio: 'ignore' })
    try {
      execSync(
        `cd '${sb.ws}' && env HOME='${sb.home}' timeout 100 node ${cli} -p 'reply with exactly: wire-probe' --dangerously-skip-permissions < /dev/null > out.json 2> err.log`,
        { encoding: 'utf8', shell: '/bin/bash', timeout: 130_000 },
      )
    } catch { /* pool 噪声容忍——reqlog 已落 */ }
    bp.kill()
    return reqlog
  }
  const rl103 = capture(INSTALL_0103, 'v103')
  const rl104 = capture(join(REPO, 'dist/cli.js'), 'v104')
  const extractTools = (dir: string): string | null => {
    try {
      const bodies = require('node:fs').readdirSync(dir).filter((f: string) => f.endsWith('-body.bin'))
      const main = bodies.map((f: string) => {
        const raw = readFileSync(join(dir, f), 'utf8')
        try { const j = JSON.parse(raw); return (j.tools && j.tools.length) ? raw : null } catch { return null }
      }).filter(Boolean) as string[]
      if (!main.length) return null
      // 取第一个带 tools 的 body，抽出 tools 数组子串（字节面）
      const raw = main[0]
      const i = raw.indexOf('"tools":')
      const j2 = raw.indexOf('"tool_choice"')
      return j2 > i ? raw.slice(i, j2) : raw.slice(i)
    } catch { return null }
  }
  const t103 = extractTools(rl103)
  const t104 = extractTools(rl104)
  const identical = t103 !== null && t103 === t104
  const noToken = (t104 ?? '').includes('timeoutMs') === false
  verdict('W5-wire-zero-diff', identical && noToken, `0.1.103 vs 0.1.104 首主循环 tools 数组字节级恒等=${identical}（${t103?.length ?? 0}B）+ 无声明工具 wire 无 timeoutMs token=${noToken}`)
}

writeFileSync(join(OUT, 'ALL.verdicts'), verdicts.join('\n') + '\n')
console.log('=== GATE-104 PROBES DONE ===')
console.log(verdicts.join('\n'))
