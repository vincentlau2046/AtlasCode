/**
 * 0.1.104 机械 revert 波 gate-104 TUI smoke + 三切片撤卸用户面探针（t111 系列附腿）。
 * 判据（Main 探针建议②④ + f4 格 3 TUI smoke）：
 *   T1 turn-error 错误行可见 + 可重入（0.1.101 行为面，fault-proxy firstN=1 fault=500）。
 *   T2 /theme modal 开/Esc 关/可重入。
 *   T3 1200 行长流撤卸面：无「已入滚动区」+ 无「行已折叠」提示行（0.1.102 压缩器面已撤）
 *      + 进程存活 + 后续回合可用；随腿负断言 crash-recovery 面零现。
 *   T4 watchdog env 无操作格：ATLAS_LOOP_WATCHDOG_MS=500 下回合正常完成 + 「主循环无响应中止」零现
 *      （env 形已随 0.1.102 切片 2-B 撤卸，0.1.101 行为 = env 不存在不生效）。
 * 判读产物：/home/vince/.claude/jobs/09264df0/tmp/gate-104/pty/T<n>.verdict + ALL.verdicts
 * 纪律：沙箱 home 零写盘（real ~/.atlas 零触）；探针串行；glm-5 基面。
 */
import { mkdirSync, rmSync, cpSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Pty } from './lib/pty'
import { startFaultProxy, type FaultPlan } from './loop-robustness/fault-proxy'
import { sleep } from './lib/util'

const REPO = '/home/vince/projects/AtlasCode'
const OUT = '/home/vince/.claude/jobs/09264df0/tmp/gate-104/pty'
const SETTINGS_SRC =
  '/home/vince/.claude/jobs/09264df0/tmp/gate-093-regate/settings-glm5/home/.atlas/settings.json'

const verdicts: string[] = []
function verdict(id: string, ok: boolean, note: string) {
  const line = `${ok ? 'GREEN' : 'RED'} ${id} ${note}`
  verdicts.push(line)
  console.log('[verdict]', line)
}

const SAY_HELLO = '请用一句话回复：gate104-ok'
// 撤卸面负断言 token（全程累计，任一腿出现即 RED）
const RETIRED_TOKENS = ['已入滚动区', '行已折叠', '等待权限裁定', '主循环无响应中止', '内部错误已复位']

interface Ctx { id: string; env?: Record<string, string>; plan?: FaultPlan; tuiArgs?: string }

async function withScenario(ctx: Ctx, fn: (pty: Pty, log: string) => Promise<void>) {
  const dir = join(OUT, ctx.id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'home/.atlas'), { recursive: true })
  mkdirSync(join(dir, 'ws'), { recursive: true })
  cpSync(SETTINGS_SRC, join(dir, 'home/.atlas/settings.json'))
  const log = join(dir, 'pty.log')
  let stopProxy: (() => void) | undefined
  if (ctx.plan) {
    const h = await startFaultProxy({ port: 8998, target: 'http://127.0.0.1:8999', plan: ctx.plan, logPath: join(dir, 'proxy.log') })
    stopProxy = () => h.stop()
  }
  if (ctx.env) for (const [k, v] of Object.entries(ctx.env)) process.env[k] = v
  let pty: Pty | null = null
  try {
    pty = await Pty.start({ repoRoot: REPO, workspace: join(dir, 'ws'), sandboxHome: join(dir, 'home'), logPath: log })
    await fn(pty, log)
  } catch (e) {
    verdict(ctx.id, false, `scenario error: ${String(e).slice(0, 200)}`)
  } finally {
    pty?.kill()
    if (ctx.env) for (const k of Object.keys(ctx.env)) delete process.env[k]
    stopProxy?.()
  }
}

// ── T1 turn-error 错误行 + 可重入 ──────────────────────────────────
await withScenario(
  { id: 'T1-turnerror', plan: { kind: 'firstN', n: 10, fault: '500' }, tuiArgs: '--dangerously-skip-permissions' },
  async pty => {
    pty.send(SAY_HELLO)
    const err = await pty.waitAnySince(['api_error_500', 'in pool for role', '不可达', 'has failed'], 240_000)
    verdict('T1a-errorline', err.ok, `错误行 marker=${err.found}（0.1.101 行为面）`)
    pty.send(SAY_HELLO)
    const r2 = await pty.waitAnySince(['gate104-ok'], 180_000)
    verdict('T1b-reentrant', r2.ok, `错误后下一回合正常回复=${r2.ok}`)
  },
)

// ── T2 /theme modal 完备性 ─────────────────────────────────────────
await withScenario(
  { id: 'T2-modal', tuiArgs: '--dangerously-skip-permissions' },
  async pty => {
    pty.send('/theme')
    const modal = await pty.waitAnySince(['Choosethetextstyle', 'Choose the text style', 'daltonized'], 60_000)
    verdict('T2a-modal-open', modal.ok, `/theme modal 打开（marker=${modal.found}）`)
    pty.esc()
    await pty.settle(3_000, 15_000)
    pty.send(SAY_HELLO)
    const r = await pty.waitAnySince(['gate104-ok'], 120_000)
    verdict('T2b-modal-close-reentrant', r.ok, `Esc 关 modal 后回合正常=${r.ok}`)
  },
)

// ── T3 1200 行长流撤卸面（0.1.101：整流照滚，无任何折叠提示）─────────
await withScenario(
  { id: 'T3-longstream-retired', tuiArgs: '--dangerously-skip-permissions', plan: { kind: 'nominal', mainLoop: { toolName: 'Write', arguments: {}, sequence: [{ kind: 'text', lines: 1200, chunks: 40 }] } } },
  async pty => {
    pty.send('请输出长测试文本')
    await pty.settle(15_000, 90_000)
    const log = pty.sinceText()
    const retiredHits = RETIRED_TOKENS.filter(t => log.includes(t))
    const alive = pty.alive()
    pty.send(SAY_HELLO)
    const r = await pty.waitAnySince(['gate104-ok'], 120_000)
    const log2 = pty.sinceText()
    const retiredHits2 = RETIRED_TOKENS.filter(t => log2.includes(t))
    verdict('T3-longstream-retired', alive && r.ok && retiredHits.length === 0 && retiredHits2.length === 0,
      `1200 行流后存活=${alive} 后续回合=${r.ok} 撤卸面 token 零现=${retiredHits.length === 0 && retiredHits2.length === 0}${[...new Set([...retiredHits, ...retiredHits2])].length ? ' 残留=' + [...new Set([...retiredHits, ...retiredHits2])].join(',') : ''}`)
  },
)

// ── T4 watchdog env 无操作格 ───────────────────────────────────────
await withScenario(
  { id: 'T4-watchdog-env-noop', env: { ATLAS_LOOP_WATCHDOG_MS: '500' }, tuiArgs: '--dangerously-skip-permissions' },
  async pty => {
    pty.send(SAY_HELLO)
    const r1 = await pty.waitAnySince(['gate104-ok'], 180_000)
    verdict('T4a-env-noop-complete', r1.ok, `env=500 合法慢面回合完成=${r1.ok}（env 形已撤，不生效）`)
    await sleep(12_000) // 空闲 > 窗 24 倍（若 env 生效必误杀）
    pty.send(SAY_HELLO)
    const r2 = await pty.waitAnySince(['gate104-ok'], 180_000)
    const aborted = pty.countSince('主循环无响应中止')
    verdict('T4b-idle-noabort', r2.ok && aborted === 0, `空闲12s后回合=${r2.ok} watchdog行=${aborted}`)
  },
)

// 全局负断言：全部 pty.log 中 crash-recovery / 压缩器撤卸面 token 零现
import { readdirSync } from 'node:fs'
let leak = ''
for (const d of readdirSync(OUT)) {
  try {
    const t = readFileSync(join(OUT, d, 'pty.log'), 'utf8')
    for (const tok of RETIRED_TOKENS) if (t.includes(tok)) leak += `${d}:${tok} `
  } catch { /* ignore */ }
}
verdict('T5-global-retired-token-scan', leak === '', leak === '' ? '全部腿 pty.log 撤卸面 token 零现（含 crash-recovery 面）' : `泄漏=${leak}`)

writeFileSync(join(OUT, 'ALL.verdicts'), verdicts.join('\n') + '\n')
console.log('=== GATE-104 REVERT SMOKE DONE ===')
console.log(verdicts.join('\n'))
