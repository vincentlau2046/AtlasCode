/**
 * 第 4 轮定向回归 · S1+S2+S3 三面一跑（v0.1.12 @ 9414b73，2026-10-02）
 *   S1 whenToUse 键名 bug：沙箱写连字符 when-to-use skill → 断言 skill_listing
 *      system-reminder 出现其 whenToUse（全链路：发现→解析→listing→注入）
 *   S2 thinking 一句话预览：TUI 任务 → 断言 pty 转录 ∴ Thinking 后有预览文本
 *      （不只标记 + ctrl+o；折叠支 thinkingFirstLinePreview 上屏）
 *   S3 文件名提示持久：TUI 读多文件 → 断言折叠组完成后文件名仍可见
 *      （解除 isActiveGroup 门控；用户收窄范围：只验"最后一个文件名"持久，
 *       不验截断全列表）
 * 用法：bun run user-e2e/repro-r4-s1s2s3.ts
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Pty } from './lib/pty'
import { makeSandboxHome } from './lib/gates'

const REPO_ROOT = process.cwd()
const E2E = join(REPO_ROOT, 'user-e2e')
const WS = join(E2E, 'workspaces/repro-r4-s1s2s3/tui')
const ART = join(E2E, 'artifacts/repro-r4-s1s2s3')
const SANDBOX_HOME = join(E2E, 'home/repro-r4-s1s2s3')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas', 'settings.json')

// S1 沙箱 skill：连字符 when-to-use（修前静默丢失，修后应进 skill_listing）
const WHEN_USE_MARKER = 'R4-HYPHEN-WHENUSE-MARKER'
const SKILL_NAME = 'r4-hyphen-whenuse'
const SKILL_CONTENT = `---
name: ${SKILL_NAME}
description: R4 回归用沙箱 skill（连字符 when-to-use 键名双形式验证）
when-to-use: ${WHEN_USE_MARKER}
---
# ${SKILL_NAME}
R4 S1 回归占位 skill，无实际逻辑。`

async function main() {
  mkdirSync(WS, { recursive: true })
  mkdirSync(ART, { recursive: true })
  // S3 多文件 fixture
  writeFileSync(join(WS, 'a.txt'), '苹果是红色水果\n')
  writeFileSync(join(WS, 'b.txt'), '香蕉是黄色水果\n')
  writeFileSync(join(WS, 'c.txt'), '葡萄是紫色水果\n')

  // 沙箱 home + S1 skill 注入（user skills 目录 = <home>/.atlas/skills/）
  await makeSandboxHome(SANDBOX_HOME, REAL_SETTINGS, false)
  const skillDir = join(SANDBOX_HOME, '.atlas', 'skills', SKILL_NAME)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, 'SKILL.md'), SKILL_CONTENT)

  // 工具任务 → auto-approve（防 dialog 假阴；S3 需模型真读文件）
  process.env.ATLAS_E2E_TUI_ARGS = 'code --dangerously-skip-permissions'

  const logPath = join(ART, `r4-pty-${Date.now()}.log`)
  const pty = await Pty.start({ repoRoot: REPO_ROOT, workspace: WS, sandboxHome: SANDBOX_HOME, logPath }, 150_000)
  // 触发 thinking（S2）+ 多文件读（S3 collapsed group）
  pty.send('先思考一下用什么方法总结最好，然后读取 a.txt b.txt c.txt 三个文件并总结它们的内容。')
  const t0 = Date.now()

  // 等响应 + 工具轮完成（多文件读 + 总结，合法回合 >3min）
  const sizeBefore = pty.logSize()
  let responded = false
  for (let t = 0; t <= 420_000; t += 10_000) {
    await new Promise(r => setTimeout(r, 10_000))
    if (pty.logSize() - sizeBefore > 3000) {
      responded = true
      await pty.settle(4000, 20_000)
      break
    }
    if (!pty.alive()) break
  }
  const settleText = pty.sinceText()
  const fullText = pty.text()
  pty.kill()

  // ── S1 断言：session jsonl 的 skill_listing 含连字符 whenToUse ──
  // 路径 = <home>/.atlas/projects/<encoded-ws>/<sid>.jsonl
  const projDir = join(SANDBOX_HOME, '.atlas', 'projects')
  let s1Ok = false
  let s1Evidence = '(未找到 session jsonl)'
  try {
    const entries = require('fs').readdirSync(projDir)
    for (const d of entries) {
      const dir = join(projDir, d)
      if (!require('fs').statSync(dir).isDirectory()) continue
      for (const f of require('fs').readdirSync(dir)) {
        if (!f.endsWith('.jsonl')) continue
        const c = readFileSync(join(dir, f), 'utf8')
        if (c.includes(WHEN_USE_MARKER)) {
          s1Ok = true
          s1Evidence = `命中 ${f}（skill_listing system-reminder 含 ${WHEN_USE_MARKER}）`
          break
        }
      }
      if (s1Ok) break
    }
  } catch (e) { s1Evidence = `读 session jsonl 异常: ${e}` }

  // ── S2 断言：∴ Thinking 后有预览文本（非裸标记）──
  // 修前：只 "∴ Thinking (ctrl+o to expand)"；修后：∴ Thinking <preview> (ctrl+o to expand)
  const clean = fullText.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
  const thinkIdx = clean.lastIndexOf('∴ Thinking')
  let s2Ok = false
  let s2Evidence = '(无 ∴ Thinking 标记)'
  if (thinkIdx >= 0) {
    const after = clean.slice(thinkIdx, thinkIdx + 200)
    // 预览 = ∴ Thinking 与 ctrl+o 之间有实质文本（>3 字且非纯空白/标记词）
    const m = after.match(/∴\s*Thinking\s+(.*?)(?:ctrl\+o|展开)/s)
    const between = m?.[1]?.trim() ?? ''
    // 排除纯 "Thinking" 重复 / 空白
    const substantive = between.replace(/Thinking/gi, '').trim()
    s2Ok = substantive.length > 2
    s2Evidence = s2Ok
      ? `预览文本="${substantive.slice(0, 80)}"`
      : `无预览（∴ Thinking 与 ctrl+o 间无实质文本，between="${between.slice(0, 60)}"）`
  }

  // ── S3 断言：折叠组完成后文件名仍可见 ──
  // settle 后的尾屏（settleText）应含某文件名（a/b/c.txt 或 getDisplayPath 形式）
  // 修前：完成后只剩 "Read N files" 计数；修后：最后一个文件名提示持久
  const fileVisible = /a\.txt|b\.txt|c\.txt/.test(settleText)
  const readCountVisible = /Read\s+\d+\s+files/i.test(settleText)
  let s3Ok = fileVisible
  let s3Evidence = fileVisible
    ? `完成后尾屏含文件名（${(settleText.match(/a\.txt|b\.txt|c\.txt/g) ?? []).join(',')}）`
    : `完成后尾屏无文件名${readCountVisible ? '（但有 Read N files 计数 → 门控未解除）' : ''}`

  console.error(`[r4-s1s2s3] 耗时=${Date.now() - t0}ms responded=${responded}`)
  console.error(`[r4-s1s2s3] S1 whenToUse 连字符 → skill_listing: ${s1Ok ? '✅ PASS' : '❌ FAIL'} — ${s1Evidence}`)
  console.error(`[r4-s1s2s3] S2 thinking 一句话预览: ${s2Ok ? '✅ PASS' : '❌ FAIL'} — ${s2Evidence}`)
  console.error(`[r4-s1s2s3] S3 文件名完成后持久: ${s3Ok ? '✅ PASS' : '❌ FAIL'} — ${s3Evidence}`)
  console.error(`[r4-s1s2s3] 尾屏（剥控制后末 600 字）:\n${settleText.replace(/[\x00-\x1f]/g, '').slice(-600)}`)

  // 落结果
  writeFileSync(join(ART, 'result.json'), JSON.stringify({
    version: '0.1.12', commit: '9414b73',
    ms: Date.now() - t0, responded,
    s1: { ok: s1Ok, evidence: s1Evidence },
    s2: { ok: s2Ok, evidence: s2Evidence },
    s3: { ok: s3Ok, evidence: s3Evidence },
  }, null, 2))
  process.exit(s1Ok && s2Ok && s3Ok ? 0 : 1)
}

main().catch(e => { console.error('[r4-s1s2s3] fatal:', e); process.exit(1) })
