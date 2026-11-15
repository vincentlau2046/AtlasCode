/**
 * S0-R R-3 格（0.1.116 候）：./web-session-runtime 库出口 pack 判别格
 * （工单 §4.5：加载图审计 + Node>=20 真实 ESM 消费；U-2 格 B 同族先例）。
 * 全离线（zod external 解析自仓内 node_modules）。
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const REPO = join(import.meta.dir, '..', '..')
const PKG = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as {
  exports?: Record<string, unknown>
  type: string
}
const OUT_JS = join(REPO, 'dist', 'web-session-runtime', 'index.js')
const OUT_DTS = join(REPO, 'dist', 'web-session-runtime', 'index.d.ts')
const OUT_DIR = join(REPO, 'dist', 'web-session-runtime')

beforeAll(() => {
  const r = spawnSync('bun', ['run', 'build:web-session-runtime'], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 120_000,
  })
  if (r.status !== 0) {
    throw new Error(
      `build:web-session-runtime failed (${r.status}):\n${r.stderr?.slice(-2000)}`,
    )
  }
})

/** 递归收集 d.ts 路径。 */
function dtsFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...dtsFiles(p))
    else if (e.name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

describe('S0-R R-3 · ./web-session-runtime 出口/安装', () => {
  test('独立产物存在：index.js 为 node ESM bundle（零 zod/contract 依赖，纯 runtime 面）', () => {
    expect(existsSync(OUT_JS)).toBe(true)
    const js = readFileSync(OUT_JS, 'utf8')
    expect(js).toContain('createReadonlySessionRuntime')
    // contract shim 为纯 type re-export → bundle 零 zod 依赖（校验面归 wire 层）
    expect(js).not.toMatch(/from\s*["']zod/)
    // 零副作用入口：不触 CLI 主链（无 commander 注册 / 无 launcher 引导串）
    expect(js).not.toContain('parseBaseToolsFromCLI')
  })

  test('d.ts 类型闭包：emitDeclarationOnly 产物在位 + contract 相对闭包 + 零仓库内 specifier', () => {
    expect(existsSync(OUT_DTS)).toBe(true)
    const files = dtsFiles(OUT_DIR)
    // contract 类型闭包在位（相对路径可解析）
    expect(files.some(f => f.endsWith('kernel/protocol/webSessionV0.d.ts'))).toBe(
      true,
    )
    for (const f of files) {
      const dts = readFileSync(f, 'utf8')
      // 加载图审计：零 engine/内部树 specifier 泄漏（头注文本不计——只查 import 面）
      expect(dts).not.toMatch(/from\s+["']src\//)
      expect(dts).not.toMatch(/import\s*\(\s*["']src\//)
    }
    // 公开符号在 d.ts 面
    const entry = readFileSync(
      join(OUT_DIR, 'atlascode', 'web', 'entry.d.ts'),
      'utf8',
    )
    for (const sym of [
      'createReadonlySessionRuntime',
      'ReadonlySessionEngine',
      'WebSessionError',
      'NeutralProjection',
    ]) {
      expect(entry).toContain(sym)
    }
  })

  test('bundle 加载图：零 engine 泄漏（import specifier 面 grep）', () => {
    const js = readFileSync(OUT_JS, 'utf8')
    // engine 域符号与模块面零命中（loadTranscriptFile/buildConversationChain
    // 为 engine 专属符号；'src/engine' 为模块 specifier）
    expect(js).not.toMatch(/["']src\/engine["']/)
    expect(js).not.toContain('loadTranscriptFile')
    expect(js).not.toContain('recoverOrphanedParallelToolResults')
    // contract 协议被内联（schema 值在 bundle）
    expect(js).toContain('persisted-effective-conversation')
  })

  test('Node >=20 真实 ESM 消费：node 直接 import 产物且 factory 可用', () => {
    const script = `import(${JSON.stringify(OUT_JS)}).then(m => {
      const need = ['createReadonlySessionRuntime', 'WebSessionError']
      for (const k of need) { if (typeof m[k] !== 'function') throw new Error('missing/bad export: ' + k) }
      try {
        m.createReadonlySessionRuntime({ productId: 'atlascode', scopes: [{ scopeId: 'p', storageDir: '/tmp/x' }], engine: { loadTranscriptFull: async () => ({ messages: new Map(), leafUuids: new Set() }), buildConversationChain: () => [] } })
      } catch (e) {
        throw new Error('factory invocation failed: ' + e.message)
      }
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

  test('exports 条件序钉死：./web-session-runtime types→import→default；prepublishOnly 扩链', () => {
    const exp = PKG.exports as Record<string, Record<string, string>>
    const ws = exp['./web-session-runtime']
    expect(ws).toBeDefined()
    expect(Object.keys(ws)).toEqual(['types', 'import', 'default'])
    expect(ws.types).toBe('./dist/web-session-runtime/index.d.ts')
    expect(ws.import).toBe('./dist/web-session-runtime/index.js')
    expect(ws.default).toBe('./dist/web-session-runtime/index.js')
    const scripts = (PKG as unknown as { scripts: Record<string, string> }).scripts
    expect(scripts['build:web-session-runtime']).toContain(
      '--outfile dist/web-session-runtime/index.js --target node',
    )
    expect(scripts['build:web-session-runtime']).toContain('--external zod')
    expect(scripts['prepublishOnly']).toBe(
      'bun run build && bun run build:web-contract && bun run build:web-session-runtime',
    )
  })
})
