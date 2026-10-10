/**
 * SL-1b statusline-ctx 探针（0.1.49 工单 §1.4，e2e 测试侧定因探针；定因三分支）：
 *   (a) 0 轮完成（REPL 就绪、未发 prompt）→ ctx 段 dim 占位在场 `▤ —/256k tok`（SL-1a：pct==null 恒显）
 *   (b) 完成 1 轮（真模型回合）→ 切真实数字 `▤ Nk/256k tok`（N≥1，usage 现形）
 * 定因三分支（2026-10-10 数据定因）：
 *   ③ 首轮无数据 = 主因（asst=0 实证）→ 纯 ③ 时 SL-1a 占位即闭环（双绿 = 无需条件落码）
 *   ② 仅 (b) 红 = TUI drop（ctx 段数据链在回合后丢）→ 仓内 Main 加 1 处数据链条件落码（非本 gate 内修，修后复 gate）
 *   (a) 红 = SL-1a 占位缺陷（落码面，打回 Main 修）
 * 探针模型 = 本地 Qwen38-27B-TXT（2026-10-10 用户裁定 f4 转达：云 Coding Plan 429 阻塞 → IFF 8999 本地路由 docker 8007）；
 * 256k 分母 = settings 声明 contextWindow=256000 或 SL-1c 兜底 262144（formatK 同显 256k，双链同面）。
 *
 * 用法：
 *   bun run user-e2e/tui-diff/statusline-ctx.ts [--repo <path>] [--turn-wait-ms 90000]
 * 产物：artifacts/SL1B-<ts>-<rand>/{ticket.md,result.json,tui.log}
 * 零写真实 ~/.atlas（HOME 沙箱）；工作树交付物，不 commit（commit 归 Main 收编）。
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Pty } from '../lib/pty'
import { makeSandboxHome } from '../lib/gates'
import { sleep } from '../lib/util'

const E2E = '/home/vince/projects/AtlasCode/user-e2e'
const ROOT = join(E2E, 'tui-diff')
const ART = join(ROOT, 'artifacts')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas/settings.json')
const CMP_MODEL = 'Qwen38-27B-TXT' // 2026-10-10 用户裁定（f4 转达）：云 429 → 本地 Qwen38（docker 8007，IFF 8999 本地路由）；工作树交付物，不 commit

const argv = process.argv.slice(2)
function argVal(flag: string): string | undefined {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}
const REPO = argVal('--repo') ?? process.env.ATLAS_E2E_REPO ?? '/home/vince/projects/AtlasCode'
const TURN_WAIT_MS = Number(argVal('--turn-wait-ms') ?? '90000')

const MARKER = 'ZQX7' // 唯一标记词：回显 1 次 + 模型答复 1 次 = ≥2 命中 ⇒ 回合已产出
const A_RE = /▤\s*—\/\s*256k\s*tok/ // (a) 无数据 dim 占位（— 非数字，不与 (b) 互撞）
const B_RE = /▤\s*(\d+k)\s*\/\s*256k\s*tok/ // (b) 真实数字（N≥1k）
const STATUS_TAIL = 3000 // statusline = 底行逐帧重渲，近期区扫描

type ProbeOut = { id: string; ok: boolean | null; evidence: string }

async function main(): Promise<void> {
  const TS = Date.now()
  const runId = `SL1B-${TS}-${Math.random().toString(36).slice(2, 5)}`
  const runDir = join(ART, runId)
  mkdirSync(runDir, { recursive: true })
  const ws = join(ROOT, 'workspaces', 'SL1B')
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  const home = join(ROOT, 'home', 'SL1B')
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

  const probes: ProbeOut[] = []
  const notes: string[] = []
  let tui: Pty | null = null
  let fatalError: string | null = null
  let aOk: boolean | null = null
  let bOk: boolean | null = null
  try {
    process.env.ATLAS_E2E_TUI_ARGS = 'code --permission-mode default'
    tui = await Pty.start({ repoRoot: REPO, workspace: ws, sandboxHome: home, logPath: join(runDir, 'tui.log') }, 120_000)
    notes.push('leader REPL 就绪（沙箱 home + Qwen38 三角色）')

    // ── (a) 0 轮完成：就绪后 3s 稳帧，扫 statusline 近期区（底行重渲，未被滚出）──
    await sleep(3000)
    const idleTail = tui.sinceText().slice(-STATUS_TAIL)
    const aMatch = idleTail.match(A_RE)
    aOk = aMatch !== null
    probes.push({
      id: 'SL1B-A-DIM-PLACEHOLDER',
      ok: aOk,
      evidence: aMatch
        ? `(a) 0 轮完成 dim 占位在场：「${aMatch[0]}」（SL-1a pct==null 恒显）`
        : `(a) dim 占位未现形（statusline 末段：${idleTail.replace(/\s+/g, ' ').slice(-160)}）→ 定因三分支：SL-1a 落码面缺陷（打回 Main）或 statusline 面未渲`,
    })

    // ── (b) 完成 1 轮：廉价单回合（唯一标记词），回合产出后 3s 稳帧 → 切真实数字 ──
    tui.send(`请只回复一个词：${MARKER}`)
    let turnDone = false
    const t1 = Date.now()
    for (;;) {
      if (tui.countSince(MARKER) >= 2) {
        turnDone = true
        break
      }
      if (Date.now() - t1 > TURN_WAIT_MS) break
      if (!tui.alive()) break
      await sleep(2000)
    }
    const turnMs = Date.now() - t1
    if (!turnDone) {
      probes.push({
        id: 'SL1B-B-REAL-NUMBER',
        ok: null,
        evidence: `(b) INCONCLUSIVE：${TURN_WAIT_MS}ms 窗内 1 轮未完成（marker=${tui.countSince(MARKER)} 命中，进程=${tui.alive() ? '存活' : '已退'}，等待 ${turnMs}ms）；定因 = 回合未完成（模型时延/回合失败/网关面），非 ② TUI drop；静窗重跑`,
      })
    } else {
      await sleep(3000) // statusline 逐帧重渲 → 回合后 ctx 段现形窗
      const bTail = tui.sinceText().slice(-STATUS_TAIL)
      const bMatch = bTail.match(B_RE)
      bOk = bMatch !== null
      probes.push({
        id: 'SL1B-B-REAL-NUMBER',
        ok: bOk,
        evidence: bMatch
          ? `(b) 1 轮完成后（${turnMs}ms）切真实数字：「${bMatch[0]}」（usage 现形，${bMatch[1]}）`
          : `(b) 1 轮完成后（${turnMs}ms）未见真实数字（statusline 末段：${bTail.replace(/\s+/g, ' ').slice(-160)}）→ 定因三分支：② TUI drop（ctx 数据链回合后丢）= 仓内 Main 加 1 处条件落码，非本 gate 内修`,
      })
    }
  } catch (e: any) {
    fatalError = String(e?.message ?? e).slice(0, 300)
    notes.push(`异常: ${fatalError}`)
  } finally {
    try {
      tui?.kill()
    } catch {
      /* 已退 */
    }
  }

  // ── 判定（fail-closed：INCONCLUSIVE ≠ PASS；hard 探针未跑 = ERROR 非 PASS）──
  const triage = (): string => {
    if (aOk === true && bOk === true) return '双绿 = ③ 单点闭环（SL-1a 占位生效 + 回合后数据链在场，无需条件落码）'
    if (aOk === true && bOk === false) return '(b) 红 = ② TUI drop 命中（ctx 数据链回合后丢）→ 仓内 Main 加 1 处数据链条件落码（非本 gate 内修；修后复 gate SL-1b）'
    if (aOk === false) return '(a) 红 = SL-1a 占位缺陷（落码面：dim 占位未现形）→ 打回 Main 修'
    if (bOk === null) return '(b) INCONCLUSIVE = 回合未完成（定因登记，非 ②；静窗重跑）'
    return '其他定因（探针面不可达 / statusline 未渲；核 tui.log）'
  }
  const hardFail = probes.filter((p) => p.ok === false).length
  const inconclusive = probes.filter((p) => p.ok === null).map((p) => p.id)
  const verdict: string = fatalError
    ? `ERROR（场景未执行：${fatalError}）`
    : hardFail > 0
      ? `FAIL（hardFail=${hardFail}；${triage()}）`
      : inconclusive.length > 0
        ? `INCONCLUSIVE（${inconclusive.join(',')}；${triage()}）`
        : `PASS（${triage()}）`
  const exitCode = fatalError ? 2 : hardFail === 0 && inconclusive.length === 0 ? 0 : 1

  const result = {
    run: runId,
    repo: REPO,
    model: CMP_MODEL,
    probes,
    hardFail,
    inconclusive,
    triage: triage(),
    verdict,
    fatalError,
    notes,
  }
  writeFileSync(join(runDir, 'result.json'), JSON.stringify(result, null, 2))
  const ticket = [
    `# SL-1b statusline-ctx 探针（0.1.49 工单 §1.4 定因探针）`,
    ``,
    `- repo: ${REPO}`,
    `- model: ${CMP_MODEL}（本地 Qwen38，云 429 替代跑法；256k 分母 = settings 声明 256000 或 SL-1c 兜底 262144）`,
    `- 断言：(a) 0 轮完成 dim 占位 ▤ —/256k tok / (b) 1 轮后真实数字 ▤ Nk/256k tok`,
    ``,
    `## 判定`,
    `- **${verdict}**`,
    `- 定因三分支结论：${triage()}`,
    ``,
    `## 探针`,
    ...probes.map((p) => `- **${p.id}** = ${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : 'INCONCLUSIVE'} — ${p.evidence}`),
    ``,
    `## 备注`,
    ...notes.map((n) => `- ${n}`),
    ``,
    `## artifacts`,
    `- ${runDir}（tui.log / result.json / ticket.md）`,
  ].join('\n')
  writeFileSync(join(runDir, 'ticket.md'), ticket)
  console.log(`[SL1B] 判定=${verdict}（${triage()}） → ${runDir}`)
  for (const p of probes) console.log(`  ${p.id}=${p.ok === true ? 'PASS' : p.ok === false ? 'FAIL' : '?'} :: ${p.evidence.slice(0, 140)}`)
  process.exit(exitCode)
}

main().catch((e) => {
  console.error('[SL1B] 致命:', e)
  process.exit(2)
})
