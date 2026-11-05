/**
 * A/B 探针 v2（standalone，测试侧全量自持）：
 *  - driver = lib/pty-driver-d4.py（ATLAS_E2E_BUN_PRELOAD 注入活子进程内探针，零产品改动）
 *  - shim   = /home/vince/.claude/jobs/09264df0/tmp/d4-preload.ts（T+9s 在活进程内读
 *             同一 colorize/chalk 实例：level + 裸名 SGR 产出）
 *  - 起 TUI（/sessionlist）→ 11s → kill → 扫 raw 裸 16 SGR vs theme 38;2 SGR
 * 判读：
 *  A) raw 无裸 SGR + in-app level=3 + in-app 裸名产出带 SGR → 渲染管线未走 colorize 裸名通道（管线缺口）
 *  B) raw 无裸 SGR + in-app level=0/裸名产出无 SGR → 活子进程 chalk 色级降级（环境定因）
 *  C) raw 有裸 SGR → D4 活屏面兑现（run1 为偶发，重跑全 gate）
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { stripAnsi } from '../lib/util.js'

const REPO = process.argv[2] ?? '/home/vince/projects/AtlasCode'
const SHIM = '/home/vince/.claude/jobs/09264df0/tmp/d4-preload.ts'
const INAPP = '/home/vince/.claude/jobs/09264df0/tmp/d4-inapp.json'
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)
const dir = join(process.cwd(), `artifacts/AB-D4-${stamp}`)
mkdirSync(dir, { recursive: true })
const ws = join(dir, 'ws'), home = join(dir, 'home')
mkdirSync(ws, { recursive: true }); mkdirSync(home, { recursive: true })
const cfgDir = join(home, '.atlas')
mkdirSync(cfgDir, { recursive: true })
if (process.env.AB_DARK_ANSI === '1') {
  writeFileSync(join(cfgDir, '.config.json'), JSON.stringify({ theme: 'dark-ansi' }))
  console.log('theme forced: dark-ansi')
}
const sessDir = join(cfgDir, 'sessions')
mkdirSync(sessDir, { recursive: true })
const now = Date.now()
writeFileSync(join(sessDir, 'ab-d4-1.jsonl'),
  JSON.stringify({ type: 'user', message: { role: 'user', content: 'ab-d4-probe' }, timestamp: new Date(now - 60000).toISOString() }) + '\n' +
  JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] }, timestamp: new Date(now - 30000).toISOString() }) + '\n')

const logPath = join(dir, 'pty.log')
const driver = join(__dirname, '..', 'lib', 'pty-driver-d4.py')
const env = {
  ...process.env,
  HOME: home,
  IS_DEMO: '1',
  TERM: 'xterm-256color',
  ATLAS_E2E_BUN_PRELOAD: SHIM,
}
const child: ChildProcess = spawn('python3', [driver, logPath, ws, REPO], {
  env,
  stdio: ['pipe', 'ignore', 'pipe'],
})
const stderr = join(dir, 'pty.log.stderr')
child.stderr?.pipe((await import('node:fs')).createWriteStream(stderr))

// 就绪等待（REPL 强信号；与 lib/pty.ts 同判据，精简版）
const spawnLen = existsSync(logPath) ? readFileSync(logPath, 'utf-8').length : 0
const t0 = Date.now()
let ready = false
while (Date.now() - t0 < 150_000) {
  await new Promise(r => setTimeout(r, 500))
  if (!existsSync(logPath)) continue
  const t = stripAnsi(readFileSync(logPath, 'utf-8').slice(spawnLen))
  if (t.includes('查看全部命令') || (t.includes('❯') && !t.includes('选择模型提供方预设'))) { ready = true; break }
}
if (!ready) {
  console.log('NOT READY — 见', logPath, stderr)
  child.kill('SIGKILL')
  process.exit(2)
}
console.log(`ready in ${Date.now() - t0}ms`)
child.stdin!.write('/sessionlist\r')
await new Promise(r => setTimeout(r, 11_000))
child.kill('SIGTERM')
await new Promise(r => setTimeout(r, 1500))
try { child.kill('SIGKILL') } catch {}

const raw = readFileSync(logPath, 'utf-8')
const ESC = '\x1b'
const scan = (s: string) => raw.split(s).length - 1
const res = {
  title: scan('🌲 Sessions'),
  bareCyan_36: scan(ESC + '[36m') + scan(ESC + '[1;36m'),
  bare33: scan(ESC + '[33m') + scan(ESC + '[1;33m'),
  bare95: scan(ESC + '[95m') + scan(ESC + '[1;95m'),
  theme382: scan(ESC + '[38;2;'),
  anyDim2: scan(ESC + '[2m'),
  inApp: existsSync(INAPP) ? readFileSync(INAPP, 'utf-8') : '<in-app report missing>',
}
console.log(JSON.stringify(res, null, 1))
const i = raw.indexOf('🌲 Sessions')
if (i > 0) console.log('TITLE CTX:', JSON.stringify(raw.slice(i - 70, i + 25)))
