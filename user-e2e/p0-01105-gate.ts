/**
 * 0.1.105 重落波自理探针（theme + timeoutMs 复活；t112 系列，f4 双信号①工单 §6 @a83b36aa）。
 * 判据（格3 timeoutMs wire 面 + 格2 AUTO_THEME env 面 e2e 承接；主题行为面主判据归 canon 复活套件）：
 *   X1 无声明零 wire 差格：0.1.104 安装品 vs 0.1.105 dist 首主循环 REQ body 的 tools 数组
 *      字节级对表（timeoutMs 为 wrapper 层契约不入 inputSchema/description → wire 零 diff）
 *      + 全 body 无 timeoutMs token（含 WebFetch/WebSearch 声明工具）。
 *   X2 声明在场格：0.1.105 dist 内 timeoutMs 契约面在树（WebFetch 90000 / WebSearch 30000
 *      声明值 + wrapper token），与 X1 wire 零 token 互证「契约在源不在 wire」。
 *   X3 AUTO_THEME env 面（soft）：FEATURE_AUTO_THEME 缺省开（0.1.105 重落缺省）与 =0 关断
 *      两形态 /theme picker 开启观察，不崩溃 + 可重入即 GREEN（初选形态差异 soft 记档，
 *      分层检测主判据 = canon p0-theme-layered-detection 复活套件）。
 * 判读产物：/home/vince/.claude/jobs/09264df0/tmp/gate-105/X*.verdict + ALL.verdicts
 * 纪律：headless execSync 须 < /dev/null；wire 抓取走 k5-bridge-proxy reqlog 面；沙箱 home 零写盘。
 */
import { mkdirSync, rmSync, cpSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execSync, spawn } from 'node:child_process'

const REPO = '/home/vince/projects/AtlasCode'
const OUT = '/home/vince/.claude/jobs/09264df0/tmp/gate-105'
const SETTINGS_SRC =
  '/home/vince/.claude/jobs/09264df0/tmp/gate-093-regate/settings-glm5/home/.atlas/settings.json'
const INSTALL_0104 = '/home/vince/.claude/jobs/09264df0/tmp/prodlane-104/prefix/node_modules/@atlasharness/atlascode/dist/cli.js'

const verdicts: string[] = []
function verdict(id: string, ok: boolean, note: string) {
  const line = `${ok ? 'GREEN' : 'RED'} ${id} ${note}`
  verdicts.push(line)
  console.log('[verdict]', line)
}
function soft(id: string, note: string) {
  const line = `SOFT ${id} ${note}`
  verdicts.push(line)
  console.log('[verdict]', line)
}

function mkSandbox(id: string): { dir: string; ws: string; home: string } {
  const dir = join(OUT, id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'home/.atlas'), { recursive: true })
  mkdirSync(join(dir, 'ws'), { recursive: true })
  cpSync(SETTINGS_SRC, join(dir, 'home/.atlas/settings.json'))
  return { dir, ws: join(dir, 'ws'), home: join(dir, 'home') }
}

/** k5-bridge reqlog 抓首主循环带 tools 的 body，抽 tools 数组子串（字节面）。 */
function capture(cli: string, tag: string): string | null {
  const sb = mkSandbox(`X1-${tag}`)
  const reqlog = join(sb.dir, 'reqlog')
  mkdirSync(reqlog, { recursive: true })
  const bp = spawn('python3', ['-I', join(REPO, 'user-e2e/k5-bridge-proxy.py'), '--port', '8998', '--upstream', '127.0.0.1:8999', '--logdir', reqlog], { stdio: 'ignore' })
  try {
    execSync(
      `cd '${sb.ws}' && env HOME='${sb.home}' timeout 100 node ${cli} -p 'reply with exactly: wire-probe-105' --dangerously-skip-permissions < /dev/null > out.json 2> err.log`,
      { encoding: 'utf8', shell: '/bin/bash', timeout: 130_000 },
    )
  } catch { /* pool 噪声容忍——reqlog 已落 */ }
  bp.kill()
  try {
    const bodies = readdirSync(reqlog).filter(f => f.endsWith('-body.bin'))
    const mains = bodies.map(f => readFileSync(join(reqlog, f), 'utf8')).filter(raw => {
      try { const j = JSON.parse(raw); return j.tools && j.tools.length } catch { return false }
    })
    if (!mains.length) return null
    const raw = mains[0]
    const i = raw.indexOf('"tools":')
    const j2 = raw.indexOf('"tool_choice"')
    return j2 > i ? raw.slice(i, j2) : raw.slice(i)
  } catch { return null }
}

// ── X1 无声明零 wire 差 ────────────────────────────────────────────
{
  const t104 = capture(INSTALL_0104, 'v104')
  const t105 = capture(join(REPO, 'dist/cli.js'), 'v105')
  const identical = t104 !== null && t104 === t105
  const noToken = (t105 ?? '').includes('timeoutMs') === false
  verdict('X1-wire-zero-diff', identical && noToken,
    `0.1.104 vs 0.1.105 首主循环 tools 数组字节级恒等=${identical}（${t104?.length ?? 0}B vs ${t105?.length ?? 0}B）+ wire 无 timeoutMs token=${noToken}`)
}

// ── X2 声明在场（dist token 面）────────────────────────────────────
{
  try {
    const dist = readFileSync(join(REPO, 'dist/cli.js'), 'utf8')
    const hasWrapper = dist.includes('timeoutMs')
    const hasFetchDecl = /timeoutMs[^,}]{0,40}90000|90000[^,}]{0,40}timeoutMs/.test(dist)
    const hasSearchDecl = /timeoutMs[^,}]{0,40}30000|30000[^,}]{0,40}timeoutMs/.test(dist)
    verdict('X2-declarations-in-dist', hasWrapper && hasFetchDecl && hasSearchDecl,
      `dist timeoutMs 契约在树=${hasWrapper} WebFetch 90000 声明=${hasFetchDecl} WebSearch 30000 声明=${hasSearchDecl}（与 X1 wire 零 token 互证「契约在源不在 wire」）`)
  } catch (e) {
    verdict('X2-declarations-in-dist', false, `dist 读取失败: ${String(e).slice(0, 120)}`)
  }
}

// ── X3 AUTO_THEME env 面（soft）────────────────────────────────────
{
  const { Pty } = await import('./lib/pty')
  const run = async (id: string, env: Record<string, string>) => {
    const dir = join(OUT, id)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(join(dir, 'home/.atlas'), { recursive: true })
    mkdirSync(join(dir, 'ws'), { recursive: true })
    cpSync(SETTINGS_SRC, join(dir, 'home/.atlas/settings.json'))
    for (const [k, v] of Object.entries(env)) process.env[k] = v
    let pty: import('./lib/pty').Pty | null = null
    try {
      pty = await Pty.start({ repoRoot: REPO, workspace: join(dir, 'ws'), sandboxHome: join(dir, 'home'), logPath: join(dir, 'pty.log') })
      pty.send('/theme')
      const modal = await pty.waitAnySince(['Choosethetextstyle', 'Choose the text style', 'daltonized'], 60_000)
      pty.esc()
      await pty.settle(3_000, 15_000)
      pty.send('请用一句话回复：gate105-ok')
      const r = await pty.waitAnySince(['gate105-ok'], 120_000)
      const crash = pty.countSince('Maximum update depth')
      return modal.ok && r.ok && crash === 0
    } finally {
      pty?.kill()
      for (const k of Object.keys(env)) delete process.env[k]
    }
  }
  try {
    const def = await run('X3-autotHEME-default', {})
    const off = await run('X3-autotHEME-off', { FEATURE_AUTO_THEME: '0' })
    soft('X3-autotHEME-face', `AUTO_THEME 缺省开形态 /theme 开+可重入+不崩=${def}；=0 关断形态同=${off}（初选形态差异 soft 记档；分层检测主判据=canon 复活套件）`)
  } catch (e) {
    soft('X3-autotHEME-face', `scenario error: ${String(e).slice(0, 160)}`)
  }
}

writeFileSync(join(OUT, 'ALL.verdicts'), verdicts.join('\n') + '\n')
console.log('=== GATE-105 SELF-CARE PROBES DONE ===')
console.log(verdicts.join('\n'))
