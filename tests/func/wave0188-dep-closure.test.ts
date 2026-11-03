import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 0.1.88 R-087-2-FAMILY fresh-install 依赖闭包活探针（工单
// docs/2026-11-04-p0-wave-0188-ticket.md §1.B「fresh-install 闭包直证」）：
//   npm pack（真实发布形态 tarball，files=["dist"]）→ 全新目录 npm install →
//   node 子进程功能探针（dist/cli.js 的运行时就是 node——探针保真）→
//   ① 安装 rc0 ② manifest 闭包契约（deps 2 / optional 6 / @ant×2+死面 3 不声明 /
//     build 11 externals 无死面）③ fflate gzip 往返 ④ cli-highlight 高亮
//   ⑤ sharp create/resize（Gap B 核销口径，§7.2）⑥ plist 解析
//   ⑦ napi 4 项 absent/present 银行（Linux absent-only 口径，§7.2 批注 +
//     §7.6 勘误：os 收窄机制不可落地，声明不带 os 收窄）⑧ 体积 delta 登记。
//
// 判别面（gate §1.E ①B）：本探针在基线 2963e7c manifest 上 RED（fflate/
// cli-highlight 不在 dependencies → fresh install 缺包、功能探针 fail），
// 在本波 manifest 上全绿 = 闭包修复直证。
//
// 门控：node/npm 可用 + registry ping 通 + dist/cli.js 在场（发布物形态前提），
// 任一不满足整族 skip（同 live-gateway 门控先例，不红）。

const ROOT = join(import.meta.dir, '..', '..')
const PKG_NAME = '@atlasharness/atlascode'
const DEPS2 = ['fflate', 'cli-highlight'] as const
const OPT6 = [
  'audio-capture-napi',
  'image-processor-napi',
  'modifiers-napi',
  'plist',
  'sharp',
  'url-handler-napi',
] as const
const NAPI4 = [
  'audio-capture-napi',
  'image-processor-napi',
  'modifiers-napi',
  'url-handler-napi',
] as const
const UNDECLARED5 = [
  '@ant/computer-use-input',
  '@ant/computer-use-swift',
  'vscode-languageserver-protocol',
  'vscode-languageserver-types',
] as const
const DEAD_EXTERNALS3 = [
  'audio-capture.node',
  'vscode-languageserver-protocol',
  'vscode-languageserver-types',
] as const

function toolAvailable(bin: string, args: string[]): boolean {
  const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 15_000 })
  return r.status === 0
}

const GATE_OK =
  toolAvailable('node', ['--version']) &&
  toolAvailable('npm', ['--version']) &&
  toolAvailable('npm', ['ping', '--loglevel=error']) &&
  existsSync(join(ROOT, 'dist', 'cli.js'))
const gated = GATE_OK ? test : test.skip

// node 子进程功能探针（在 fresh install 目录内以正常包名解析——与 dist/cli.js
// 运行时同构）。输出一行 JSON results。
const PROBE_JS = `
const results = {}
try {
  const m = await import('fflate')
  const src = new TextEncoder().encode('atlas 0.1.88 dep-closure probe')
  const back = m.gunzipSync(m.gzipSync(src))
  results['fflate'] = new TextDecoder().decode(back) === 'atlas 0.1.88 dep-closure probe' ? 'ok' : 'mismatch'
} catch (e) { results['fflate'] = 'fail: ' + e.message }
try {
  const m = await import('cli-highlight')
  const f = m.highlight ?? (m.default && m.default.highlight)
  const out = f('const answer = 42', { language: 'js' })
  results['cli-highlight'] = typeof out === 'string' && out.length > 0 ? 'ok' : 'empty'
} catch (e) { results['cli-highlight'] = 'fail: ' + e.message }
try {
  const m = await import('sharp')
  const s = m.default ?? m
  const png = await s({ create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer()
  const out = await s(png).resize(4, 4).png().toBuffer()
  results['sharp'] = out.length > 0 ? 'ok' : 'empty'
} catch (e) { results['sharp'] = 'fail: ' + e.message }
try {
  const m = await import('plist')
  const p = typeof m.parse === 'function' ? m : m.default
  const o = p.parse('<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>atlas</key><string>probe</string></dict></plist>')
  results['plist'] = o.atlas === 'probe' ? 'ok' : 'mismatch'
} catch (e) { results['plist'] = 'fail: ' + e.message }
for (const n of ['audio-capture-napi', 'image-processor-napi', 'modifiers-napi', 'url-handler-napi']) {
  try { await import(n); results[n] = 'present+load-ok' } catch (e) { results[n] = 'present+load-fail: ' + String(e.message).slice(0, 100) }
}
console.log(JSON.stringify(results))
`

interface InstallState {
  ok: boolean
  reason: string
  logTail: string
  installDir: string
  nodeModules: string
  probe: Record<string, string>
}
let SETUP: InstallState | null = null
let TMP: string | null = null

function duKb(p: string): number {
  const r = spawnSync('du', ['-sk', p], { encoding: 'utf8', timeout: 30_000 })
  if (r.status !== 0) return -1
  const m = /^\s*(\d+)/.exec(r.stdout ?? '')
  return m ? Number(m[1]) : -1
}

beforeAll(() => {
  if (!GATE_OK) return
  TMP = mkdtempSync(join(tmpdir(), 'atlas0188-dep-'))
  const pack = spawnSync(
    'npm',
    ['pack', '--pack-destination', TMP, '--loglevel=error', '--no-progress'],
    { cwd: ROOT, encoding: 'utf8', timeout: 120_000 },
  )
  if (pack.status !== 0) {
    SETUP = {
      ok: false,
      reason: `npm pack rc=${pack.status}`,
      logTail: ((pack.stderr ?? '') + (pack.stdout ?? '')).slice(-600),
      installDir: TMP,
      nodeModules: '',
      probe: {},
    }
    return
  }
  const tarballName = (pack.stdout ?? '').trim().split('\n').pop() ?? ''
  const installDir = join(TMP, 'fresh')
  mkdirSync(installDir, { recursive: true })
  writeFileSync(join(installDir, 'probe.mjs'), PROBE_JS)
  const inst = spawnSync(
    'npm',
    [
      'install',
      join(TMP, tarballName),
      '--no-audit',
      '--no-fund',
      '--loglevel=error',
      '--no-progress',
    ],
    { cwd: installDir, encoding: 'utf8', timeout: 480_000 },
  )
  const probe: Record<string, string> = {}
  if (inst.status === 0) {
    const run = spawnSync('node', ['probe.mjs'], {
      cwd: installDir,
      encoding: 'utf8',
      timeout: 60_000,
    })
    try {
      const parsed = JSON.parse((run.stdout ?? '').trim().split('\n').pop() ?? '{}')
      Object.assign(probe, parsed)
    } catch {
      probe['__probe__'] = `fail: probe rc=${run.status} ${(run.stderr ?? '').slice(-200)}`
    }
  }
  SETUP = {
    ok: inst.status === 0,
    reason: `npm install rc=${inst.status}`,
    logTail: ((inst.stdout ?? '') + (inst.stderr ?? '')).slice(-800),
    installDir,
    nodeModules: join(installDir, 'node_modules'),
    probe,
  }
}, 600_000)

afterAll(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true })
})

function requireInstall(): InstallState {
  if (!SETUP || !SETUP.ok) {
    throw new Error(
      `fresh install 未就绪: ${SETUP?.reason ?? 'no setup'}\n${SETUP?.logTail ?? ''}`,
    )
  }
  return SETUP
}

describe('wave0188 R-087-2-FAMILY fresh-install 依赖闭包（func 活探针）', () => {
  gated('① fresh install rc0', () => {
    const s = requireInstall()
    expect(existsSync(join(s.nodeModules, PKG_NAME, 'package.json'))).toBe(true)
  })

  gated(
    '② manifest 闭包契约：deps2 / optional6 / 不声明5 / build 11 externals 无死面',
    () => {
      const s = requireInstall()
      const pkg = JSON.parse(
        readFileSync(join(s.nodeModules, PKG_NAME, 'package.json'), 'utf8'),
      ) as {
        dependencies?: Record<string, string>
        optionalDependencies?: Record<string, string>
        scripts?: Record<string, string>
      }
      for (const d of DEPS2) {
        expect(
          typeof pkg.dependencies?.[d],
          `dependencies 缺 ${d}（undici 型闭包）`,
        ).toBe('string')
      }
      for (const o of OPT6) {
        expect(
          typeof pkg.optionalDependencies?.[o],
          `optionalDependencies 缺 ${o}`,
        ).toBe('string')
      }
      for (const u of UNDECLARED5) {
        expect(pkg.dependencies?.[u], `${u} 不应声明在 dependencies`).toBeUndefined()
        expect(
          pkg.optionalDependencies?.[u],
          `${u} 不应声明在 optionalDependencies`,
        ).toBeUndefined()
      }
      const build = pkg.scripts?.build ?? ''
      expect(
        (build.match(/--external/g) ?? []).length,
        `build externals 应为 11: ${build}`,
      ).toBe(11)
      for (const d of DEAD_EXTERNALS3) {
        expect(build.includes(`--external ${d}`), `死面标记不应在场: ${d}`).toBe(
          false,
        )
      }
    },
  )

  gated('③ fflate 功能直证（gzip 往返，node 运行时）', () => {
    const s = requireInstall()
    expect(s.probe['fflate'], `fflate 探针: ${JSON.stringify(s.probe)}`).toBe('ok')
  })

  gated('④ cli-highlight 功能直证（高亮，node 运行时）', () => {
    const s = requireInstall()
    expect(
      s.probe['cli-highlight'],
      `cli-highlight 探针: ${JSON.stringify(s.probe)}`,
    ).toBe('ok')
  })

  gated('⑤ sharp 装成支：create/resize 功能直证（Gap B 核销）', () => {
    const s = requireInstall()
    expect(
      s.probe['sharp'],
      `sharp 探针（Gap B 核销口径要求 Linux 装成）: ${JSON.stringify(s.probe)}`,
    ).toBe('ok')
  })

  gated('⑥ plist 功能直证（plist 解析，node 运行时）', () => {
    const s = requireInstall()
    expect(s.probe['plist'], `plist 探针: ${JSON.stringify(s.probe)}`).toBe('ok')
  })

  gated('⑦ napi 4 项 absent/present 银行（Linux absent-only 口径，记录不硬断）', () => {
    const s = requireInstall()
    const bank: Record<string, string> = {}
    for (const n of NAPI4) {
      const v = s.probe[n] ?? 'absent（未安装：npm optional skip）'
      bank[n] = v.startsWith('fail:') ? 'absent（npm optional skip）' : v
    }
    console.log('[wave0188] napi bank:', JSON.stringify(bank))
    expect(Object.keys(bank).length).toBe(4)
  })

  gated('⑧ 安装体积 delta 登记（>15% 说明 = sharp 级，工单 §7.4/§7.6 预登记）', () => {
    const s = requireInstall()
    const total = duKb(s.nodeModules)
    const subtrees: Record<string, number> = {}
    for (const name of [...DEPS2, ...OPT6]) {
      const p = join(s.nodeModules, name)
      if (existsSync(p)) subtrees[name] = duKb(p)
    }
    // sharp 的平台二进制是独立 top-level 传递依赖（@img/*），计入新增面
    const imgDir = join(s.nodeModules, '@img')
    if (existsSync(imgDir)) subtrees['@img(sharp transitive)'] = duKb(imgDir)
    const newSum = Object.values(subtrees)
      .filter(v => v > 0)
      .reduce((a, b) => a + b, 0)
    const pct = total > 0 ? Math.round((newSum / Math.max(total - newSum, 1)) * 100) : -1
    console.log(
      `[wave0188] fresh-install node_modules=${total}KB; 本波新增项合计=${newSum}KB; 相对基线≈+${pct}%`,
    )
    console.log('[wave0188] 新增分项 KB:', JSON.stringify(subtrees))
    expect(total).toBeGreaterThan(0)
  })
})
