/**
 * 专项复现：Select 选择器按一次下箭头是否跳过选项（1→3 跳过 2）
 * 用户主诉：/model 等 slash 命令选择器，按一次下从选项1跳到选项3，跳过选项2，且通用。
 * 用法：bun run user-e2e/repro-select-skip.ts
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Pty } from './lib/pty'
import { makeSandboxHome } from './lib/gates'
import { sleep } from './lib/util'

const REPO_ROOT = process.cwd()
const E2E = join(REPO_ROOT, 'user-e2e')
const WS = join(E2E, 'workspaces/repro-select-skip/tui')
const ART = join(E2E, 'artifacts/repro-select-skip')
const SANDBOX_HOME = join(E2E, 'home/repro-select-skip')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas', 'settings.json')

/** 剥 ANSI + 控制字符，提取选择器可见行（含 ❯ 焦点标记或数字编号行） */
function focusLines(text: string): string[] {
  const clean = text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\r]/g, '')
  return clean.split('\n')
    .filter(l => /^\s*[❯>]?\s*\d+\.\s/.test(l) || /❯/.test(l))
    .map(l => l.trim())
}

/** 从采样文本提取焦点选项编号。
 *  ❯ 渲染在焦点项**前**（ListItem figures.pointer）。
 *  inline 布局：`Default❯Premium/Fast` = 焦点在 Premium（❯后的首个 N.）。
 *  行首布局：`❯ 1. Default` = 焦点在1（❯后的首个 N.）。
 *  统一规则：找 ❯ 之后的首个 `N.` */
function focusIdxFromText(text: string): number {
  const clean = text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\r]/g, '')
  const idx = clean.lastIndexOf('❯')
  if (idx < 0) return 0
  const after = clean.slice(idx)
  const m = after.match(/(\d+)\./)
  return m ? parseInt(m[1]) : 0
}

async function main() {
  mkdirSync(WS, { recursive: true })
  mkdirSync(ART, { recursive: true })
  await makeSandboxHome(SANDBOX_HOME, REAL_SETTINGS, false)

  const logPath = join(ART, `select-skip-${Date.now()}.log`)
  const pty = await Pty.start({ repoRoot: REPO_ROOT, workspace: WS, sandboxHome: SANDBOX_HOME, logPath }, 150_000)

  // ── 场景：/model picker ──
  pty.send('/model')
  // 等 picker 渲染（"Select model" 或选项出现）
  const w = await pty.waitCount('Select model', 1, 60_000)
  if (!w.ok) {
    console.error(`[setup] /model picker 未出现，日志 ${logPath}`)
    pty.kill(); process.exit(2)
  }
  await pty.settle(3000, 20_000)

  // 采样初始焦点
  const before = focusLines(pty.sinceText())
  console.error('[初始] picker 选项行:')
  before.forEach(l => console.error(`  ${l}`))

  // 连续按↓ 5次，每次采样焦点编号，观察序列是否跳格
  const seq: number[] = []
  seq.push(focusIdxFromText(pty.text()))
  for (let i = 0; i < 5; i++) {
    pty.sendRaw('\x1b[B')
    await sleep(1200)
    await pty.settle(1500, 8000)
    seq.push(focusIdxFromText(pty.text()))
  }
  console.error(`\n[焦点序列] ${seq.join(' → ')}`)
  // 判定：相邻差是否 > 1（排除 wrap 3→1）
  const jumps: string[] = []
  for (let i = 1; i < seq.length; i++) {
    const d = seq[i] - seq[i-1]
    if (d > 1 && !(seq[i-1] === 3 && seq[i] === 1)) jumps.push(`${seq[i-1]}→${seq[i]}(跳${d})`)
  }
  const skip = jumps.length > 0
  console.error(`[跳格] ${jumps.length ? jumps.join(', ') : '无'}（wrap 3→1 视为正常）`)
  console.error(`[结论] ${skip ? '❌ 双 dispatch 签名' : '✅ 正常单步'}`)
  console.error(`[日志] ${logPath}`)

  pty.kill()
  process.exit(skip ? 1 : 0)
}

main().catch(e => { console.error('[select-skip] fatal:', e); process.exit(1) })
