/**
 * 专项回归：斜杠命令路由 + /autocompact + spinner 活性（v0.1.x，main 任务 #250 交付后跑）
 *   C1 路由回归：/model default → jsonl 断言 #4→#6 间无 assistant（钉死路由正确，防回退）
 *   C2 /autocompact：/autocompact 128k → settings.json 落 autoCompactWindow:128000 + AppState 更新
 *   C3 spinner 早显：TUI 任务 1s 后日志含 (时分秒)；5s 后状态栏含 token 计数(Nk/Nktok)
 *
 * 依赖 main #250 交付（/autocompact 命令 + spinner 阈值改）。交付前 C2/C3 断言会 FAIL（预期）。
 * 用法：bun run user-e2e/repro-slash-autocompact-spinner.ts
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Pty } from './lib/pty'
import { makeSandboxHome } from './lib/gates'
import { sleep } from './lib/util'

const REPO_ROOT = process.cwd()
const E2E = join(REPO_ROOT, 'user-e2e')
const WS = join(E2E, 'workspaces/repro-slash-acs/tui')
const ART = join(E2E, 'artifacts/repro-slash-acs')
const SANDBOX_HOME = join(E2E, 'home/repro-slash-acs')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas', 'settings.json')

async function main() {
  mkdirSync(WS, { recursive: true })
  mkdirSync(ART, { recursive: true })
  writeFileSync(join(WS, 'note.txt'), '苹果是红色水果。香蕉是黄色水果。葡萄是紫色水果。\n')
  await makeSandboxHome(SANDBOX_HOME, REAL_SETTINGS, false)
  process.env.ATLAS_E2E_TUI_ARGS = 'code --dangerously-skip-permissions'

  const logPath = join(ART, `acs-${Date.now()}.log`)
  const pty = await Pty.start({ repoRoot: REPO_ROOT, workspace: WS, sandboxHome: SANDBOX_HOME, logPath }, 150_000)
  const t0 = Date.now()

  // ── C1：/model default 路由回归 ──
  pty.send('/model default')
  const c1Wait = await pty.waitCount('Set model to', 1, 60_000)
  await pty.settle(4000, 30_000)
  const c1ModelJsonl = await checkSlashModelNoAssistant()
  console.error(`[C1] /model default → "Set model to"=${c1Wait.ok} ms=${c1Wait.ms}`)
  console.error(`[C1] jsonl 无 assistant 响应 /model: ${c1ModelJsonl.ok ? '✅ PASS' : '❌ FAIL'} — ${c1ModelJsonl.evidence}`)

  // ── C2：/autocompact 128k ──
  // main 0.1.14 交付回执文案 = "Auto-compact window: 128k tokens"（命中断言② /128k|128000/i）
  pty.send('/autocompact 128k')
  await pty.settle(4000, 30_000)
  // 断言①：settings.json 落 autoCompactWindow=128000。
  // main 0.1.14 交付：落盘形是判别联合 {kind:'window', tokens:128000}（结构单源 engine autoCompactWindow.ts，
  // zod discriminatedUnion），非裸数。此处兼容联合形 + 旧裸数形两者。
  const sandboxSettings = join(SANDBOX_HOME, '.atlas', 'settings.json')
  let c2SettingsOk = false
  let c2SettingsEv = '(未读到 settings)'
  try {
    const s = JSON.parse(readFileSync(sandboxSettings, 'utf8'))
    const acw = s.autoCompactWindow
    c2SettingsOk = acw === 128000 || (acw?.kind === 'window' && acw.tokens === 128000)
    c2SettingsEv = `autoCompactWindow=${JSON.stringify(acw ?? '(undefined)')}`
  } catch (e: any) { c2SettingsEv = `读 settings 异常: ${e?.message}` }
  console.error(`[C2] /autocompact 128k → settings.autoCompactWindow=128000: ${c2SettingsOk ? '✅ PASS' : '❌ FAIL'} — ${c2SettingsEv}`)

  // 断言②：TokenWarning / 状态栏显示新阈值（main 交付后补确切文案）
  // 占位：检查日志是否含 "128k" 或 "128000" 相关阈值显示
  // 确认文案（main 0.1.14 交付 = "Auto-compact window: 128k tokens"）在重绘 TUI 里是瞬态——
  // 随后 LLM 回合 spinner 会覆盖它，故查「spawn 后全量」而非末 800 字。匹配确认行独有特征：
  // "128k tokens" / "auto-compact window"（命令 prompt "/autocompact 128k" 无 "tokens"/"window"，可区分，不误报）。
  const c2All = pty.sinceText().replace(/[\x00-\x1f]/g, '')
  const c2ThresholdVisible = /128\s?k\s*tokens|auto-?compact\s*window/i.test(c2All)
  console.error(`[C2] autocompact 确认文案（128k tokens）: ${c2ThresholdVisible ? '✅ PASS' : '❌ FAIL'}`)

  // ── C3：spinner 早显 ──
  // 触发一个真 LLM 回合，前 5s 内采样日志
  const c3b0 = pty.logSize()
  pty.send('读取 note.txt 并用一句话总结。')
  // 1s 采样：日志应含 (N?m N?s 或 Ns) 形 elapsed
  await sleep(1500)
  const c3at1 = pty.sinceText().replace(/[\x00-\x1f]/g, '')
  const c3ElapsedAt1 = /\(\s*\d+\s*(s|sec|秒|m\b|min)/.test(c3at1.slice(-500)) || /\(\s*\d+:\d+/.test(c3at1.slice(-500))
  console.error(`[C3] 1.5s 后日志含 elapsed: ${c3ElapsedAt1 ? '✅ PASS' : '❌ FAIL'} — 末500字: "${c3at1.slice(-500).replace(/\s+/g,' ').slice(-120)}"`)

  // 5s 采样：状态栏应显示上下文 token 计数。实测状态栏形如 "29k/256ktok(11%)"（短形 tok，非全词
  // tokens）→ 旧探针 /tokens/i 查末 800 字恒不命中（全词 tokens 只出现在更早的 /autocompact 确认行，
  // 被随后的 LLM 回合 spinner 重绘推出末窗）= 伪阴性。改匹配状态栏计数器 [0-9]+k?/[0-9]+k?tok，
  // 且查 spawn 后全量（避免末窗被重绘推出）。
  await sleep(4500)
  const c3at6 = pty.sinceText().replace(/[\x00-\x1f]/g, '')
  const c3TokensAt6 = /[0-9]+k?\/[0-9]+k?tok/i.test(c3at6)
  console.error(`[C3] 6s 后状态栏含 token 计数(Nk/Nktok): ${c3TokensAt6 ? '✅ PASS' : '❌ FAIL'}`)

  // 等回合结束：按墙钟封顶 90s（本简单 read+summarize 回合足够，且足够 jsonl flush）。
  // 旧 for 循环按「迭代数 × settle 超时」计时，而 Atlas 常驻 spinner 使每次 settle 都打满 30s 超时
  // → 实际拖到 ~10min（曾把整跑拖过 10min 任务超时被杀、result.json 没写出）。改墙钟封顶，快且够用。
  const tailDeadline = Date.now() + 90_000
  while (pty.alive() && Date.now() < tailDeadline) {
    const s = await pty.settle(20_000, 20_000) // 每段最多等 20s 静默；spinner 常致超时，靠墙钟封顶
    if (s.ok) { await sleep(10_000); break }
  }
  pty.kill()

  // ── 汇总 ──
  const c1Ok = c1ModelJsonl.ok
  const c2Ok = c2SettingsOk
  const c3Ok = c3ElapsedAt1 && c3TokensAt6
  console.error(`\n[总结] 耗时=${Date.now() - t0}ms`)
  console.error(`[C1 路由] /model 不走主循环: ${c1Ok ? '✅' : '❌'}`)
  console.error(`[C2 /autocompact] 持久化+阈值: ${c2Ok ? '✅' : '❌'}`)
  console.error(`[C3 spinner] 早显: ${c3Ok ? '✅' : '❌'}`)
  console.error(`[日志] ${logPath}`)

  writeFileSync(join(ART, 'result.json'), JSON.stringify({
    ms: Date.now() - t0,
    c1: { ok: c1Ok, evidence: c1ModelJsonl.evidence },
    c2: { ok: c2Ok, settings: c2SettingsEv },
    c3: { ok: c3Ok, elapsedAt1: c3ElapsedAt1, tokensAt6: c3TokensAt6 },
  }, null, 2))
  // C2/C3 在 main #250 交付前预期 FAIL；C1 应恒 PASS（路由未改）
  process.exit(c1Ok ? 0 : 1)
}

/** C1：检查 session jsonl 里 /model 命令后是否紧跟 assistant 文本响应（应无） */
async function checkSlashModelNoAssistant(): Promise<{ ok: boolean; evidence: string }> {
  const projDir = join(SANDBOX_HOME, '.atlas', 'projects')
  try {
    for (const d of readdirSync(projDir)) {
      const dirPath = join(projDir, d)
      if (!existsSync(dirPath)) continue
      for (const f of readdirSync(dirPath)) {
        if (!f.endsWith('.jsonl')) continue
        const lines = readFileSync(join(dirPath, f), 'utf8').split('\n').filter(Boolean)
        for (let i = 0; i < lines.length; i++) {
          let o: any
          try { o = JSON.parse(lines[i]) } catch { continue }
          const c = o?.message?.content ?? o?.content
          const cs = typeof c === 'string' ? c : JSON.stringify(c ?? '')
          // 命中 /model 命令消息（command-name 形或裸 /model）
          if (cs.includes('<command-name>/model</command-name>') || cs.includes('<command-name>model</command-name>')) {
            // 找其后最近 assistant 文本响应（跳过 tool_result / caveat / stdout）
            for (let j = i + 1; j < lines.length; j++) {
              let o2: any
              try { o2 = JSON.parse(lines[j]) } catch { continue }
              if (o2?.type !== 'assistant' && o2?.message?.role !== 'assistant') continue
              const c2 = o2?.message?.content ?? o2?.content
              const c2s = typeof c2 === 'string' ? c2 : JSON.stringify(c2 ?? '')
              // 跳过纯 thinking / tool_use（这些是后续真任务回合的，不算对 /model 的响应）
              // 缺陷签名 = assistant 纯文本响应 /model（< 200 字且非 tool_use）
              if (!c2s.includes('"type":"tool_use"') && !c2s.includes('"type":"thinking"') && c2s.length > 5 && c2s.length < 500) {
                return { ok: false, evidence: `#${j} assistant 文本响应了 /model: "${c2s.slice(0, 120)}"` }
              }
            }
            return { ok: true, evidence: `命中 ${f}#${i}，其后无 assistant 纯文本响应 /model` }
          }
        }
      }
    }
    return { ok: false, evidence: '(jsonl 未含 /model 命令消息)' }
  } catch (e: any) {
    return { ok: false, evidence: `读 jsonl 异常: ${e?.message}` }
  }
}

main().catch(e => { console.error('[acs] fatal:', e); process.exit(1) })
