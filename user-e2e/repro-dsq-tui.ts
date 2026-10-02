/**
 * 定向复现 · Lane A 单跑版（2026-10-02）：斗兽棋 TUI 车道（用户主诉车道）。
 * 只跑 TUI pty 车道（180s 观察窗），避免与 B/C 车道网关竞争；用于干净树/脏树快速复现确认。
 * 用法：在目标 repo 根目录执行 bun run user-e2e/repro-dsq-tui.ts
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Pty } from './lib/pty'
import { makeSandboxHome } from './lib/gates'

const REPO_ROOT = process.cwd()
const E2E = join(REPO_ROOT, 'user-e2e')
const WS = join(E2E, 'workspaces/repro-20261002-dsq')
const ART = join(E2E, 'artifacts/repro-20261002-dsq')
const SANDBOX_HOME = join(E2E, 'home/repro-20261002-dsq')
const PROMPT = '开发一个斗兽棋游戏'
const REAL_SETTINGS = join(process.env.HOME!, '.atlas', 'settings.json')

async function main() {
  const workspace = join(WS, 'tui')
  mkdirSync(workspace, { recursive: true })
  mkdirSync(ART, { recursive: true })
  const logPath = join(ART, `laneA-tui-pty-${Date.now()}.log`)
  await makeSandboxHome(SANDBOX_HOME, REAL_SETTINGS, false)
  const pty = await Pty.start({ repoRoot: REPO_ROOT, workspace, sandboxHome: SANDBOX_HOME, logPath }, 150_000)
  const sizeBefore = pty.logSize()
  pty.send(PROMPT)
  const t0 = Date.now()
  const samples: { t: number; logSize: number; tail: string }[] = []
  let firstSubstantiveAtMs: number | null = null
  for (let t = 0; t <= 180_000; t += 5_000) {
    await new Promise(r => setTimeout(r, 5_000))
    const since = pty.sinceText()
    const tail = since.split('\n').slice(-6).join(' | ')
    samples.push({ t, logSize: pty.logSize() - sizeBefore, tail })
    if (firstSubstantiveAtMs === null) {
      const nonSpinner = since
        .split('\n')
        .filter(l => !/✻/.test(l) && !/Sautéed|Crunched|Juggling|Simmering|Brewed/.test(l) && !l.trim().startsWith('❯'))
        .filter(l => /[一-龥]{4,}/.test(l) && !/查看全部命令|会话列表/.test(l))
      if (nonSpinner.length > 0) firstSubstantiveAtMs = Date.now() - t0
    }
    if (!pty.alive()) break
  }
  const thinking = pty.count('Thinking') + pty.count('thinking') + pty.count('思考')
  const spinner = pty.count('✻') + pty.count('Brewed') + pty.count('Sautéed')
  pty.sendRaw('PROBE42')
  await new Promise(r => setTimeout(r, 3_000))
  const inputFaceAlive = pty.sinceText().includes('PROBE42')
  const tailAtEnd = pty.sinceText().split('\n').slice(-25).join('\n')
  pty.kill()
  console.error(
    `[repro-tui] 首条实质响应=${firstSubstantiveAtMs ?? '180s 内无'} thinking标记=${thinking} spinner标记=${spinner} 输入面活=${inputFaceAlive}`,
  )
  console.error(`[repro-tui] 尾屏：\n${tailAtEnd}`)
  console.error(`[repro-tui] 采样：`)
  for (const s of samples.filter((_, i) => i % 2 === 0)) console.error(`  t=${s.t} size=${s.logSize} ${JSON.stringify(s.tail.slice(0, 100))}`)
}

main().catch(e => {
  console.error('[repro-tui] fatal:', e)
  process.exit(1)
})
