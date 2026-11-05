/**
 * 专项复现：TUI 斜杠命令（/model 等术语）是否走 main loop（额外 LLM 响应）。
 *   场景 A（idle）：REPL 空闲时提交 /model default → 期望本地完成，无 LLM 回合
 *   场景 B（busy）：LLM 回合进行中提交 /model default → 观察是否被注入模型
 *     上下文（模型对 "/model default" 文本额外响应 = 缺陷签名）
 * 判定面：session jsonl 里 '/model default' 是否作为 user 消息落盘、其后是否
 *   有 assistant 文本响应（= 走了 main loop）。
 * 用法：bun run user-e2e/repro-slash-model.ts
 */
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Pty } from './lib/pty'
import { makeSandboxHome } from './lib/gates'

const REPO_ROOT = process.cwd()
const E2E = join(REPO_ROOT, 'user-e2e')
const WS = join(E2E, 'workspaces/repro-slash-model/tui')
const ART = join(E2E, 'artifacts/repro-slash-model')
const SANDBOX_HOME = join(E2E, 'home/repro-slash-model')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas', 'settings.json')

async function main() {
  mkdirSync(WS, { recursive: true })
  mkdirSync(ART, { recursive: true })
  writeFileSync(join(WS, 'note.txt'), '苹果是红色水果。香蕉是黄色水果。葡萄是紫色水果。\n')
  await makeSandboxHome(SANDBOX_HOME, REAL_SETTINGS, false)

  // 工具任务 → auto-approve（防 dialog 假阴；busy 场景需模型真写文件）
  process.env.ATLAS_E2E_TUI_ARGS = 'code --dangerously-skip-permissions'

  const logPath = join(ART, `slash-model-${Date.now()}.log`)
  const pty = await Pty.start({ repoRoot: REPO_ROOT, workspace: WS, sandboxHome: SANDBOX_HOME, logPath }, 150_000)

  // ── 场景 A：idle 提交 /model default（本地完成面，无交互）──
  pty.send('/model default')
  const a = await pty.waitCount('Set model to', 1, 60_000)
  console.log(`[A idle] /model default → "Set model to" 出现=${a.ok} ms=${a.ms}`)
  if (a.ok) console.log(a.tail.split('\n').slice(-4).join('\n'))
  await pty.settle(4000, 30_000)

  // ── 场景 B：busy 中提交 /model default ──
  const b0 = pty.logSize()
  pty.send('读取 note.txt 并总结内容，然后写一个 200 字左右的关于水果的短文到新文件 fruit.md（不需要执行任何 shell 命令，用 Write 工具写文件）。')
  let started = false
  for (let t = 0; t <= 240_000; t += 10_000) {
    await new Promise(r => setTimeout(r, 10_000))
    if (pty.logSize() - b0 > 2500) { started = true; break }
    if (!pty.alive()) break
  }
  console.log(`[B busy] 回合启动=${started}`)
  if (started && pty.alive()) {
    pty.send('/model default')
    await pty.settle(4000, 60_000)
  }

  // 等回合结束（空闲 = settle 静默）
  for (let t = 0; t <= 300_000; t += 10_000) {
    await new Promise(r => setTimeout(r, 10_000))
    if (!pty.alive()) break
    const s = await pty.settle(20_000, 30_000)
    if (s.ok) {
      // 静默 20s 后再探一次确认真空闲
      const s2 = await pty.settle(10_000, 30_000)
      if (s2.ok) break
    }
  }
  pty.kill()

  // ── 判定：session jsonl 面 ──
  const projDir = join(SANDBOX_HOME, '.atlas', 'projects')
  let slashAsUserMsg = false
  let assistantRepliedToSlash = false
  let jsonlNote = '(未找到 session jsonl)'
  const found: string[] = []
  try {
    const entries = readdirSync(projDir)
    for (const d of entries) {
      const dirPath = join(projDir, d)
      let files: string[] = []
      try { files = readdirSync(dirPath) } catch { continue }
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue
        const lines = readFileSync(join(dirPath, f), 'utf8').split('\n').filter(Boolean)
        for (let i = 0; i < lines.length; i++) {
          let o: any
          try { o = JSON.parse(lines[i]) } catch { continue }
          const c = o?.message?.content ?? o?.content
          const cs = typeof c === 'string' ? c : JSON.stringify(c ?? '')
          if (cs.includes('/model default')) {
            slashAsUserMsg = true
            found.push(`${d}/${f}#${i} user?="${cs.slice(0, 60)}" type=${o?.type ?? o?.message?.role ?? '?'}`)
            for (let j = i + 1; j < lines.length; j++) {
              let o2: any
              try { o2 = JSON.parse(lines[j]) } catch { continue }
              if (o2?.type === 'assistant' || o2?.message?.role === 'assistant') {
                const c2 = o2?.message?.content ?? o2?.content
                const c2s = typeof c2 === 'string' ? c2 : JSON.stringify(c2 ?? '')
                if (c2s.length > 30) { assistantRepliedToSlash = true; found.push(`  其后 assistant 响应: ${c2s.slice(0, 120)}`); break }
              }
            }
          }
        }
      }
    }
    jsonlNote = `dirs=${readdirSync(projDir).length}`
  } catch (e: any) {
    jsonlNote = `jsonl 读取失败: ${e?.message}`
  }

  console.log('──── 判定 ────')
  console.log(`slashAsUserMsg（'/model default' 作为消息落盘）=${slashAsUserMsg}`)
  console.log(`assistantRepliedToSlash（其后 assistant 有文本响应）=${assistantRepliedToSlash}`)
  found.forEach(x => console.log(x))
  console.log(`jsonl: ${jsonlNote}`)
  console.log(`日志：${logPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })
