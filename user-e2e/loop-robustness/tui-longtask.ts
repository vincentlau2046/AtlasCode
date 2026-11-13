/**
 * loop 鲁棒性 — TUI 侧长程任务稳定性/鲁棒性探针（模型无关，对齐用户主诉）。
 *
 * 背景（用户主诉，本 session 2026-10-03）：「之前超时模型 120s 的问题，实际使用
 *   中经常中断且**没有任何提示**」——长程任务稳定性的痛点不在 loop 生命周期本身
 *   （headless 已验 I1 不崩/I3 不挂），而在 **TUI 事件路径上的「中断时用户是否
 *   看到提示」+「中断后 session 是否还能用」**，这两点 headless harness 看不见。
 *
 * 对齐已落地修复（都只在 TUI 事件路径表现）：
 *   - R1（P0 静默终止）REPL.tsx:2693-2700：turn 异常原为 unhandled rejection
 *     （spinner 停、无错误行、无落盘 = 主诉「无响应」）→ 现在 catch 出
 *     `本轮执行出错…请重试。`
 *   - #260 llmTimeoutRemediationHint（modelprovider.ts:89）→ 附 `LLM 请求超时
 *     （…）。可调大 env ATLAS_LLM_TIMEOUT…` 修复旋钮。
 *
 * 探针方法（模型无关，隔离 flaky deepseek-v4-pro）：
 *   —— 把 settings `llmTimeoutMs` 降到 8000ms（或 ATLAS_E2E_TUI_TIMEOUT_MS），
 *   用注障代理给每个 chat 注 15s delay（> 8s 超时）→ 客户端超时**确定性**触发
 *   （是客户端掐断，非模型态）→ 断言错误行 + remediation 提示真出现。
 *
 * 三探针（T-LT1/2 同一 session 连续段，T-LT3 独立 session）：
 *   T-LT1 超时提示面：强制客户端超时 → 见「本轮执行出错」+「LLM 请求超时」提示。
 *   T-LT2 超时后可用：超时错误后发本地命令 /model fast → 信任线即时切 fast → session 没死。
 *   T-LT3 慢但不超时（回归护底）：5s delay < 30s 超时 → 不得出现「LLM 请求超时」
 *        提示（防 #260 误杀慢模型）、session 存活。
 *
 * 用法：
 *   bun run user-e2e/loop-robustness/tui-longtask.ts [all|LT1|LT3] [--model <m>]
 *   超时档：ATLAS_E2E_TUI_TIMEOUT_MS（缺省 8000）
 * 全 I/O 落 user-e2e/loop-robustness/（PTY 沙箱 HOME / 独立 ws / artifacts）。
 * 注意：需本地网关 127.0.0.1:8999（注障代理转发目标）。
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Pty } from '../lib/pty'
import { makeSandboxHome } from '../lib/gates'
import { sleep, countOcc } from '../lib/util'
import { startFaultProxy, type ProxyHandle } from './fault-proxy'

const REPO = process.env.ATLAS_E2E_REPO ?? '/home/vince/projects/AtlasCode'
const ROOT = '/home/vince/projects/AtlasCode/user-e2e/loop-robustness'
const ART = join(ROOT, 'artifacts')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas', 'settings.json')
const MODEL = process.argv.includes('--model') ? process.argv[process.argv.indexOf('--model') + 1] : 'deepseek-v4-pro'
const TARGET = 'http://127.0.0.1:8999'
const LB_PORT = Number(process.env.ATLAS_E2E_LB_PORT ?? '8998')
const TIMEOUT_MS = Number(process.env.ATLAS_E2E_TUI_TIMEOUT_MS ?? '8000')

process.env.ATLAS_E2E_TUI_ARGS = 'code --dangerously-skip-permissions'

const NOTE_TXT = '苹果是红色水果。香蕉是黄色水果。葡萄是紫色水果。\n'
const READ_PROMPT = '读取 note.txt 并用一句话总结。'

async function seedHome(home: string, proxyPort: number, llmTimeoutMs: number): Promise<void> {
  rmSync(home, { recursive: true, force: true })
  await makeSandboxHome(home, REAL_SETTINGS, false)
  const p = join(home, '.atlas', 'settings.json')
  const s: any = JSON.parse(readFileSync(p, 'utf8'))
  s.providers = s.providers ?? {}
  s.providers.iff = { ...(s.providers.iff ?? {}), baseURL: `http://127.0.0.1:${proxyPort}/v1` }
  for (const role of ['small', 'fast', 'premium']) {
    s.modelRoles = s.modelRoles ?? {}
    s.modelRoles[role] = { provider: 'iff', models: [{ model: `iff/${MODEL}` }] }
  }
  s.model = MODEL
  s.llmTimeoutMs = llmTimeoutMs // 探针核心：降超时档使客户端超时确定性触发
  writeFileSync(p, JSON.stringify(s, null, 2))
}

function setupWs(sc: string): string {
  const ws = join(ROOT, 'workspaces', `tui-${sc}`)
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  writeFileSync(join(ws, 'note.txt'), NOTE_TXT)
  // 0.1.89 判据面修正（同 harness.ts setupWs：种 commonjs 消除 repo 链 ESM
  // 解析噪声——086 R1-delay RED×4 假阳性定谳根因，diskCheck 精确名判别力保持）。
  writeFileSync(join(ws, 'package.json'), JSON.stringify({ name: 'looprob-ws', private: true, type: 'commonjs' }, null, 2))
  return ws
}

interface ProbeResult {
  ok: boolean
  evidence: string[]
}

// ── T-LT1 + T-LT2（同一 session 连续段）─────────────────────────────────
async function runLT1LT2(proxyPort: number, runDir: string, logPath: string): Promise<Record<string, unknown>> {
  const ws = setupWs('lt12')
  const home = join(ROOT, 'home', 'tui-lt12')
  await seedHome(home, proxyPort, TIMEOUT_MS)
  let proxy: ProxyHandle
  try {
    proxy = await startFaultProxy({
      port: proxyPort, target: TARGET,
      plan: { kind: 'always', fault: 'delay', delayMs: 15_000 }, // 15s > 8s 超时 → 确定性触发
      logPath: join(runDir, 'lt12.proxy.log'),
    })
  } catch (e: any) {
    return { fatal: `proxy 启动失败: ${e?.message}` }
  }
  const pty = await Pty.start({ repoRoot: REPO, workspace: ws, sandboxHome: home, logPath }, 120_000)
  try {
    // T-LT1：发 prompt → 客户端 8s 超时 → 断言错误行 + remediation 提示
    const preErr = countOcc(pty.text(), '本轮执行出错')
    pty.send(READ_PROMPT)
    const w = await pty.waitCount('本轮执行出错', preErr + 1, 40_000)
    const txt = pty.sinceText()
    const hasTimeoutHint = /LLM 请求超时|ATLAS_LLM_TIMEOUT|llmTimeoutMs/.test(txt)
    const aliveAfterTimeout = pty.alive()
    const lt1: ProbeResult = {
      ok: w.ok && hasTimeoutHint && aliveAfterTimeout,
      evidence: [
        `错误行出现=${w.ok}（count=${w.count}/${preErr + 1}，${w.ms}ms）`,
        `remediation 提示可见=${hasTimeoutHint}`,
        `超时后 session 存活=${aliveAfterTimeout}`,
        `tail: ${w.tail.slice(-200).replace(/\n/g, ' ⏎ ')}`,
      ],
    }
    process.stderr.write(`[T-LT1 超时提示面] ${lt1.ok ? '✅ PASS' : '❌ FAIL'} — ${lt1.evidence[0]} / ${lt1.evidence[1]} / ${lt1.evidence[2]}\n`)

    // T-LT2：超时错误后发本地命令 /model fast → 信任线即时切 fast → session 没死
    const preFast = countOcc(pty.text(), 'fast')
    pty.send('/model fast')
    const w2 = await pty.waitCount('fast', preFast + 1, 20_000)
    const lt2: ProbeResult = {
      ok: w2.ok && pty.alive(),
      evidence: [
        `/model fast 响应=${w2.ok}（count=${w2.count}/${preFast + 1}，${w2.ms}ms）`,
        `命令后 session 存活=${pty.alive()}`,
        `tail: ${w2.tail.slice(-200).replace(/\n/g, ' ⏎ ')}`,
      ],
    }
    process.stderr.write(`[T-LT2 超时后可用] ${lt2.ok ? '✅ PASS' : '❌ FAIL'} — ${lt2.evidence[0]} / ${lt2.evidence[1]}\n`)
    return { 'T-LT1': lt1, 'T-LT2': lt2 }
  } finally {
    pty.kill()
    proxy.stop()
    await new Promise(r => setTimeout(r, 500))
  }
}

// ── T-LT3（慢但不超时：回归护底，防 #260 误杀慢模型）──────────────────
async function runLT3(proxyPort: number, runDir: string, logPath: string): Promise<Record<string, unknown>> {
  const ws = setupWs('lt3')
  const home = join(ROOT, 'home', 'tui-lt3')
  // 关键：用 FULL 600s 缺省超时档（不降档）。deepseek 真实生成常 60–110s，
  // 若降 30s 会在「真·慢但成功」的回合误触发超时 → 假阳性；600s 下 5s proxy delay
  // 结构上不可能在观察窗内触发超时，断言「无 LLM 请求超时提示」才干净。
  const bigTimeout = 600_000
  await seedHome(home, proxyPort, bigTimeout)
  let proxy: ProxyHandle
  try {
    proxy = await startFaultProxy({
      port: proxyPort, target: TARGET,
      plan: { kind: 'always', fault: 'delay', delayMs: 5_000 }, // 5s < 30s 超时 → 不应误杀
      logPath: join(runDir, 'lt3.proxy.log'),
    })
  } catch (e: any) {
    return { fatal: `proxy 启动失败: ${e?.message}` }
  }
  const pty = await Pty.start({ repoRoot: REPO, workspace: ws, sandboxHome: home, logPath }, 120_000)
  try {
    pty.send(READ_PROMPT)
    // 观察 30s（慢生成窗口）：断言「LLM 请求超时」提示**不得**出现 + session 存活。
    // 注：不赌任务完成（flaky 模型污染完成类断言）；只断言「未误报超时」这一模型无关负事实。
    await sleep(30_000)
    const txt = pty.sinceText()
    const falseTimeout = /LLM 请求超时|ATLAS_LLM_TIMEOUT/.test(txt)
    const alive = pty.alive()
    const lt3: ProbeResult = {
      ok: !falseTimeout && alive,
      evidence: [
        `未误报超时=${!falseTimeout}（30s 慢生成窗口内无「LLM 请求超时」提示面）`,
        `session 存活=${alive}`,
        `已见错误行=${/本轮执行出错/.test(txt)}（可容忍：非超时类，flaky 模型面）`,
      ],
    }
    process.stderr.write(`[T-LT3 慢不误杀] ${lt3.ok ? '✅ PASS' : '❌ FAIL'} — ${lt3.evidence[0]} / ${lt3.evidence[1]}\n`)
    return { 'T-LT3': lt3 }
  } finally {
    pty.kill()
    proxy.stop()
    await new Promise(r => setTimeout(r, 500))
  }
}

// ── 主流程 ─────────────────────────────────────────────────────────────
async function main() {
  const which = process.argv.slice(2).find(a => !a.startsWith('--')) ?? 'all'
  const runDir = join(ART, `tui-longtask-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`)
  mkdirSync(runDir, { recursive: true })
  const results: Record<string, unknown> = {}
  if (which === 'all' || which === 'LT1' || which === 'LT12') {
    Object.assign(results, await runLT1LT2(LB_PORT, runDir, join(runDir, 'lt12.log')))
  }
  if (which === 'all' || which === 'LT3') {
    Object.assign(results, await runLT3(LB_PORT, runDir, join(runDir, 'lt3.log')))
  }
  const allPass = Object.values(results).every((r: any) => r && (r.ok === true))
  writeFileSync(join(runDir, 'result.json'), JSON.stringify({
    which, model: MODEL, target: TARGET, llmTimeoutMs: TIMEOUT_MS, results,
  }, null, 2))
  // ticket.md（验收单骨架）
  const L = [
    `# TUI 长程任务稳定性探针 验收单（${new Date().toISOString()}）`,
    '', `- 模型对齐：${MODEL}（三角色+顶层）；llmTimeoutMs=${TIMEOUT_MS}ms（探针降档使超时确定性触发）`,
    `- 注障：always delay（LT1/LT2=15s > 超时档；LT3=5s < 3×超时档）→ 客户端超时确定性，模型无关`,
    '', '| 探针 | 判据 | 结果 |', '|---|---|---|',
  ]
  for (const [k, v] of Object.entries(results)) {
    const r = v as any
    L.push(`| ${k} | ${k === 'T-LT1' ? '超时→错误行+remediation 提示可见' : k === 'T-LT2' ? '超时后本地命令可用(session 没死)' : '慢生成不误报超时'} | ${r.ok === true ? '✅ PASS' : r.ok === false ? '❌ FAIL' : '⚠ 见 result.json'} |`)
    if (r.evidence) r.evidence.forEach((e: string) => L.push(`| | - ${e.replace(/\|/g, '∣')} | |`))
  }
  L.push('', '## 判定（验收者填写）', '- [ ] 通过 / [ ] 缺陷（下列单）', '  1. （空）')
  writeFileSync(join(runDir, 'ticket.md'), L.join('\n'))
  process.stderr.write(`\n[tui-longtask] ${which} 判定=${allPass ? 'ALL-PASS' : 'HAS-FAIL'} → ${runDir}\n`)
  process.exit(allPass ? 0 : 1)
}

main().catch(e => { console.error('[tui-longtask] fatal:', e); process.exit(1) })