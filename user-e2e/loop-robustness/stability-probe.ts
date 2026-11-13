/**
 * 模型稳定性探测（task #42 前置）——轻量单跑 nominal 任务完成对照。
 *
 * 目的：只判定「当前 deepseek-v4-pro（IFF 网关）多步 coding 任务是否可靠完成」，
 *   不注障、直连网关 8999，不与 fault-proxy 耦合。结果是 task #42（R1 任务完成
 *   对照 + R3 断点续跑 + R2 soak）能否开跑的前置判据：
 *   - diskCheck=ok（三模块 + 测试文件实跑 ALL TESTS PASSED）→ 模型稳定，可开 #42。
 *   - diskCheck=fail / 0 tool_use / error_during_execution → 仍 flaky，继续等。
 *
 * 用法：bun run user-e2e/loop-robustness/stability-probe.ts [--model <m>] [--tries <n>]
 *   （--tries 连跑 n 次察 flakiness，默认 1；全 I/O 落 user-e2e/loop-robustness/）
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const REPO = process.env.ATLAS_E2E_REPO ?? '/home/vince/projects/AtlasCode'
const ROOT = '/home/vince/projects/AtlasCode/user-e2e/loop-robustness'
const ART = join(ROOT, 'artifacts')
const REAL_SETTINGS = join(process.env.HOME!, '.atlas', 'settings.json')
const MODEL = process.argv.includes('--model') ? process.argv[process.argv.indexOf('--model') + 1] : 'deepseek-v4-pro'
const TRIES = Number(process.argv.includes('--tries') ? process.argv[process.argv.indexOf('--tries') + 1] : '1')

const TASK = [
  'In this workspace, do all of the following in order and report briefly after each step:',
  '1) Create lib/math.js that exports add(a,b,c=0) returning a+b+c, sub(a,b) returning a-b, and mul(a,b) returning a*b.',
  '2) Create lib/stats.js that exports mean(arr) (average, throw on empty) and max(arr) (throw on empty).',
  '3) Create lib/app.js that imports both and computes: the mean of [1,2,3,4,5] plus the max of [7,9,2], times mul(3,4). Print the final number.',
  '4) Create lib/run.test.js that requires the three modules and asserts add(1,2)===3, add(1,2,5)===8, sub(10,4)===6, mean([2,4])===3, max([3,9,1])===9, and that app prints a number; print exactly "ALL TESTS PASSED" if all hold.',
  '5) Run `node lib/run.test.js` via Bash and confirm it prints "ALL TESTS PASSED".',
  '6) Stop once "ALL TESTS PASSED" is printed.',
].join('\n')

function diskCheck(ws: string): { ok: boolean; evidence: string } {
  const need = ['lib/math.js', 'lib/stats.js', 'lib/app.js', 'lib/run.test.js']
  const missing = need.filter(f => !existsSync(join(ws, f)))
  if (missing.length) return { ok: false, evidence: `missing: ${missing.join(', ')}` }
  const r = spawnSync('node', [join(ws, 'lib/run.test.js')], { encoding: 'utf8', timeout: 30_000 })
  const out = (r.stdout + r.stderr).trim()
  const ok = out.includes('ALL TESTS PASSED')
  return { ok, evidence: ok ? 'ALL TESTS PASSED (实跑通过)' : `test 输出无 PASS: "${out.slice(-160)}"` }
}

async function seedHome(home: string): Promise<void> {
  rmSync(home, { recursive: true, force: true })
  const atlasDir = join(home, '.atlas')
  mkdirSync(atlasDir, { recursive: true })
  const raw: any = JSON.parse(readFileSync(REAL_SETTINGS, 'utf8'))
  delete raw.enabledPlugins; delete raw.enabledMcpServers; delete raw.extraKnownMarketplaces
  raw.providers = raw.providers ?? {}
  raw.providers.iff = { ...(raw.providers.iff ?? {}), baseURL: 'http://127.0.0.1:8999/v1' } // 直连网关，不注障
  for (const role of ['small', 'fast', 'premium']) {
    raw.modelRoles = raw.modelRoles ?? {}
    raw.modelRoles[role] = { provider: 'iff', models: [{ model: `iff/${MODEL}` }] }
  }
  raw.model = MODEL
  writeFileSync(join(atlasDir, 'settings.json'), JSON.stringify(raw, null, 2))
}

function setupWs(sc: string): string {
  const ws = join(ROOT, 'workspaces', `probe-${sc}`)
  rmSync(ws, { recursive: true, force: true })
  mkdirSync(ws, { recursive: true })
  // 0.1.89 判据面修正（同 harness.ts setupWs：种 commonjs 消除 repo 链 ESM
  // 解析噪声——086 R1-delay RED×4 假阳性定谳根因，diskCheck 精确名判别力保持）。
  writeFileSync(join(ws, 'package.json'), JSON.stringify({ name: 'looprob-ws', private: true, type: 'commonjs' }, null, 2))
  return ws
}

interface RunResult {
  ok: boolean
  ms: number
  toolUses: number
  zeroContent: boolean
  isError: boolean
  crashed: boolean
  evidence: string
}

async function runOnce(sc: string, home: string, logPath: string): Promise<RunResult> {
  const ws = setupWs(sc)
  const child: ChildProcess = spawn(
    'bun', ['run', join(REPO, 'src/atlascode/cli.ts'), '-p', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'],
    { cwd: ws, env: { ...process.env, HOME: home }, detached: true, stdio: ['pipe', 'pipe', 'pipe'] },
  )
  let out = ''; let err = ''
  child.stdout?.on('data', d => { out += d.toString() })
  child.stderr?.on('data', d => { err += d.toString() })
  child.stdin?.write(TASK); child.stdin?.end()
  const t0 = Date.now()
  await new Promise<void>(resolve => {
    const cap = setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL') } catch { /* gone */ } }, 360_000)
    child.on('exit', () => { clearTimeout(cap); resolve() })
  })
  const dc = diskCheck(ws)
  const events: any[] = []
  for (const line of out.split('\n')) { const s = line.trim(); if (!s.startsWith('{')) continue; try { events.push(JSON.parse(s)) } catch { /* skip */ } }
  const toolUses = events.filter(e => e?.type === 'assistant').flatMap(e => (e.message?.content ?? []).filter((c: any) => c?.type === 'tool_use')).length
  const result = [...events].reverse().find(e => e?.type === 'result') ?? null
  const zeroContent = events.filter(e => e?.type === 'assistant').every(e => !(e.message?.content ?? []).some((c: any) => c?.type === 'text' || c?.type === 'tool_use'))
  const isError = Boolean(result?.is_error)
  const crashed = /uncaught[- ]?(exception|rejection)|unhandled[- ]?rejection/i.test(err)
  try { writeFileSync(logPath, `STDOUT:\n${out}\n\nSTDERR:\n${err}\n`) } catch { /* best effort */ }
  return { ok: dc.ok, ms: Date.now() - t0, toolUses, zeroContent, isError, crashed, evidence: dc.evidence }
}

async function main() {
  const runDir = join(ART, `stability-probe-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`)
  mkdirSync(runDir, { recursive: true })
  const home = join(ROOT, 'home', 'probe-stability')
  await seedHome(home)
  const results: any[] = []
  for (let i = 0; i < TRIES; i++) {
    const r = await runOnce(`s${i + 1}`, home, join(runDir, `s${i + 1}.log`))
    results.push(r)
    process.stderr.write(`[probe #${i + 1}/${TRIES}] completed=${r.ok} tools=${r.toolUses} zeroContent=${r.zeroContent} isError=${r.isError} crashed=${r.crashed} ms=${r.ms} | ${r.evidence}\n`)
  }
  const allOk = results.every(r => r.ok)
  writeFileSync(join(runDir, 'result.json'), JSON.stringify({ model: MODEL, tries: TRIES, allOk, results }, null, 2))
  process.stderr.write(`\n[stability-probe] ${TRIES} 次全完成=${allOk ? '✅ 模型稳定(可开 #42)' : '❌ 仍 flaky(继续等)'} → ${runDir}\n`)
  process.exit(allOk ? 0 : 1)
}

main().catch(e => { console.error('[stability-probe] fatal:', e); process.exit(2) })