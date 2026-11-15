/**
 * S0-U U-2 格（0.1.115 候）：./web-contract 库出口 pack 判别格。
 * 呈批书 docs/2026-11-15-s0-ur-lockface-brief.md §7.2 产物面 + §7.7（f4 批复
 * @f1f1099d）；工单 §3.1/§3.3。
 * 格 B（出口/安装）：独立 browser ESM 产物 + d.ts 发射闭包 + package.json
 * exports 条件序 + Node>=20 真实 ESM 消费。全离线（zod external 解析自仓内
 * node_modules）；npm pack 纯安装腿归 e2e gate 采集面（工单 §1：
 * 无需先 publish 才验可行）。
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const REPO = join(import.meta.dir, '..', '..')
const PKG = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as {
  version: string
  exports?: Record<string, unknown>
  bin: Record<string, string>
  type: string
}
const OUT_JS = join(REPO, 'dist', 'web-contract', 'index.js')
const OUT_DTS = join(REPO, 'dist', 'web-contract', 'index.d.ts')

beforeAll(() => {
  const r = spawnSync('bun', ['run', 'build:web-contract'], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 120_000,
  })
  if (r.status !== 0) {
    throw new Error(`build:web-contract failed (${r.status}):\n${r.stderr?.slice(-2000)}`)
  }
})

describe('S0-U U-2 · 格 B 出口/安装', () => {
  test('独立产物存在：dist/web-contract/index.js 为 browser ESM（零 Node 内建 import）', () => {
    expect(existsSync(OUT_JS)).toBe(true)
    const js = readFileSync(OUT_JS, 'utf8')
    // browser 兼容闭包：bundle 内不得出现 Node 内建模块引用（zod external 保留 import 形）
    expect(js).not.toMatch(/from\s+["']node:/)
    expect(js).not.toMatch(/require\(/)
  })

  test('d.ts 发射：emitDeclarationOnly 产物在位且含公开符号声明', () => {
    expect(existsSync(OUT_DTS)).toBe(true)
    const dts = readFileSync(OUT_DTS, 'utf8')
    for (const sym of [
      'WEB_SESSION_PROTOCOL_VERSION',
      'WebSessionRequestSchema',
      'WebSessionSuccessSchema',
      'WebSessionEventSchema',
      'ProjectionSchema',
      'SessionSummarySchema',
    ]) {
      expect(dts).toContain(sym)
    }
    // 类型闭包自足：不得相对引用 src 源树（单文件闭包，zod 为唯一外部引用）
    expect(dts).not.toMatch(/from\s+["']\.\.?\//)
  })

  test('Node >=20 真实 ESM 消费：node 直接 import 产物且公开面在', () => {
    const script = `import(${JSON.stringify(OUT_JS)}).then(m => {
      const need = ['WebSessionRequestSchema', 'WebSessionEventSchema', 'WEB_SESSION_PROTOCOL_VERSION', 'WEB_SESSION_SCHEMA_VERSION']
      for (const k of need) { if (!(k in m)) throw new Error('missing export: ' + k) }
      if (m.WEB_SESSION_PROTOCOL_VERSION !== 'v0') throw new Error('bad protocolVersion')
      console.log('NODE_ESM_OK')
    }).catch(e => { console.error(e.message); process.exit(1) })`
    const r = spawnSync('node', ['--input-type=module', '-e', script], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(r.status, `node spawn failed: ${r.stderr?.slice(-500)}`).toBe(0)
    expect(r.stdout).toContain('NODE_ESM_OK')
  })

  test('exports 条件序钉死：./web-contract types→import→default；./package.json 保留；bin 不变', () => {
    const exp = PKG.exports as Record<string, Record<string, string>>
    expect(exp).toBeDefined()
    expect(exp['./package.json']).toBe('./package.json')
    const wc = exp['./web-contract']
    expect(wc).toBeDefined()
    const keys = Object.keys(wc)
    expect(keys).toEqual(['types', 'import', 'default'])
    expect(wc.types).toBe('./dist/web-contract/index.d.ts')
    expect(wc.import).toBe('./dist/web-contract/index.js')
    expect(wc.default).toBe('./dist/web-contract/index.js')
    // CLI bin 保持（本波无 library root 默认指向）
    expect(PKG.bin['atlas']).toBe('dist/cli.js')
    expect(PKG.bin['atlascode']).toBe('dist/cli.js')
    expect(PKG.type).toBe('module')
  })

  test('prepublishOnly 接两 build：CLI build 命令字节不动 + build:web-contract 在链', () => {
    const scripts = (PKG as unknown as { scripts: Record<string, string> }).scripts
    expect(scripts['build']).toContain('--outfile dist/cli.js --target node')
    expect(scripts['build:web-contract']).toContain(
      '--outfile dist/web-contract/index.js --target browser',
    )
    expect(scripts['build:web-contract']).toContain('--external zod')
    // R-3 扩链：web-session-runtime 出口加入 publish 前置构建
    expect(scripts['prepublishOnly']).toBe(
      'bun run build && bun run build:web-contract && bun run build:web-session-runtime',
    )
  })
})
