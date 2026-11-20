/**
 * S0-R R-3 格（0.1.116 候）：./web-session-runtime 库出口 pack 判别格
 * （工单 §4.5：加载图审计 + Node>=20 真实 ESM 消费；U-2 格 B 同族先例）。
 * 全离线（zod external 解析自仓内 node_modules）。
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { builtinModules } from 'node:module'

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
    // 相对 specifier 必带 .js 扩展名（工单 §5.9：node16/nodenext 消费者
    // TS2834 判别——bundler 风格发射的无扩展名形被严格 ESM 拒编译）
    const rel = /(from\s*|import\s*\(\s*)(["'])((?:\.\.?\/)[^"']*)(["'])/g
    for (const f of files) {
      const dts = readFileSync(f, 'utf8')
      for (const m of dts.matchAll(rel)) {
        const spec = m[3]
        expect(
          spec.endsWith('.js'),
          `${f}: relative specifier '${spec}' lacks .js extension`,
        ).toBe(true)
      }
    }
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
      // S0-R2 形 A 钉②：entry 面新增仅 2（lock-face §2 公开类型面对表）
      'createDefaultReadonlySessionRuntime',
      'AtlasWebSessionRuntimeOptions',
    ]) {
      expect(entry).toContain(sym)
    }
  })

  test('bundle 加载图：形 A 只读闭包允许 + 禁面零现（lock-face @25cb7454 §1 重形）', () => {
    const js = readFileSync(OUT_JS, 'utf8')
    // S0-R2 形 A（工单 §6-3 / f4 批复工单 §7 @351c74c4）：旧「零 engine 泄漏」
    // 不变量由形 A 推翻——engine/session 只读闭包真体随 bundle = 允许面（本形
    // 目的）；新导出 + contract 协议内联在位。
    expect(js).toContain('createDefaultReadonlySessionRuntime')
    expect(js).toContain('persisted-effective-conversation')
    // S0-R4 格 5 正腿（呈批书 L5，f4 §10 @7ecf0fa4 批复）：search 域入只读
    // 闭包——搜索文本面真体（RENDERED_AS_SENTINEL 防虚影 + WeakMap 缓存）
    // 随 bundle；非 session 子域负腿由上方 not.toMatch 维持。
    expect(js).toContain('RENDERED_AS_SENTINEL')
    // 仍禁面（重形文本）：src/tui / src/private-ui / src/ui-private / engine
    // 非 session 子域 specifier 零现（bundler 内联后仅未解析 import 残留）；
    // 进程钩子（process.on）/ timer 连接 / env 写面 / 应用级全局槽零现。
    expect(js).not.toMatch(/["']src\/tui[/"']/)
    expect(js).not.toMatch(/["']src\/(private-ui|ui-private)[/"']/)
    expect(js).not.toMatch(/["']src\/engine\/(?!session)/)
    expect(js).not.toContain('process.on(')
    // timer 面管辖范围注记：重形文本的「timer 连接仍禁」针对形 A 增量闭包
    // （engine/session）；载体先存面 cursorLedger TTL 清理 setTimeout 为 S0-R
    // 既有形态（旧格未禁），不在本格断言面。
    expect(js).not.toMatch(/process\.env\.\w+\s*=[^=]/)
    expect(js).not.toContain('globalThis.')
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

  test('node16/nodenext 严格 ESM 消费编译 smoke：d.ts 零 TS2834（工单 §5.9 GREEN 判据）+ 重写幂等', () => {
    const smokeDir = join(REPO, 'dist', '.wsr-node16-smoke')
    mkdirSync(smokeDir, { recursive: true })
    try {
      writeFileSync(
        join(smokeDir, 'consumer.ts'),
        [
          "import { createReadonlySessionRuntime, WebSessionError } from '../web-session-runtime/index.js'",
          "import type { ReadonlySessionRuntime, WebSessionErrorCode } from '../web-session-runtime/index.js'",
          'export type Runtime = ReadonlySessionRuntime',
          'export type Code = WebSessionErrorCode',
          'export const mk = createReadonlySessionRuntime',
          'export const err = WebSessionError',
        ].join('\n'),
      )
      writeFileSync(
        join(smokeDir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            module: 'node16',
            moduleResolution: 'nodenext',
            target: 'es2022',
            strict: true,
            noEmit: true,
            types: [],
          },
        }),
      )
      // skipLibCheck 刻意缺省（false）：TS2834 发生在 .d.ts 内，开了会被跳过失去判别力
      const r = spawnSync('npx', ['tsc', '-p', join(smokeDir, 'tsconfig.json')], {
        cwd: REPO,
        encoding: 'utf8',
        timeout: 180_000,
      })
      expect(
        r.status,
        `tsc node16 smoke failed:\n${(r.stdout + r.stderr).slice(-1500)}`,
      ).toBe(0)
      // 幂等（工单 §5.9-②）：重写步重跑零差
      const again = spawnSync(
        'bun',
        ['scripts/rewrite-web-session-runtime-dts.ts'],
        { cwd: REPO, encoding: 'utf8', timeout: 30_000 },
      )
      expect(again.status).toBe(0)
      expect(again.stdout).toContain('rewrote 0')
    } finally {
      rmSync(smokeDir, { recursive: true, force: true })
    }
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
      'bun run build && bun run build:web-contract && bun run build:web-session-runtime && bun run build:web-session-runtime-execution',
    )
  })
})

/**
 * S4 修正锚（f4 裁定）：`./web-session-runtime/execution` subpath pack 腿。
 * 背景：S0-R R-3 「零 zod」合同 × S2 entry.ts 执行出口面冲突 → pack 构建
 * 入口分离（runtimeEntry.ts）+ 同包第二 subpath 承载执行出口（自 entry.ts
 * 构建，zod 内联不 external，自包含零 npm runtime dependencies——§9 安装
 * 面 B1 upstream 导入 createExecutionOutlet 可达）。
 */
const EXEC_JS = join(REPO, 'dist', 'web-session-runtime-execution', 'index.js')
const EXEC_DTS = join(REPO, 'dist', 'web-session-runtime-execution', 'index.d.ts')

describe('S4 修正锚 · ./web-session-runtime/execution pack 腿', () => {
  beforeAll(() => {
    const r = spawnSync('bun', ['run', 'build:web-session-runtime-execution'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 180_000,
    })
    if (r.status !== 0) {
      throw new Error(
        `build:web-session-runtime-execution failed (${r.status}):\n${r.stderr?.slice(-2000)}`,
      )
    }
  })

  test('存在 + 导出 createExecutionOutlet（B1 upstream §9 安装面可达）', () => {
    expect(existsSync(EXEC_JS)).toBe(true)
    expect(existsSync(EXEC_DTS)).toBe(true)
    const js = readFileSync(EXEC_JS, 'utf8')
    expect(js).toContain('createExecutionOutlet')
    expect(js).toContain('createReadonlySessionRuntime')
    const dts = readFileSync(EXEC_DTS, 'utf8')
    expect(dts).toContain('./atlascode/web/entry.js')
  })

  test('自包含：zod 内联（零 zod import 语句）+ 外部 import 仅 node 内建', () => {
    const js = readFileSync(EXEC_JS, 'utf8')
    expect(js).not.toMatch(/import\s+[^;]*from\s*["']zod/)
    // 外部 import 面 ⊆ node 内建（bun build 保留 bare 形 fs/promises 等，
    // node: 前缀与 builtinModules 裸名均算内建）
    const builtins = new Set(builtinModules)
    for (const m of js.matchAll(/^import\s+[^'"]*['"]([^'"]+)['"]/gm)) {
      const spec = m[1].startsWith('node:')
        ? m[1].slice(5)
        : m[1]
      expect(builtins.has(spec)).toBe(true)
    }
  })

  test('exports 表 subpath 形 + 构建脚本零 --external zod', () => {
    const exp = PKG.exports as Record<string, Record<string, string>>
    const sub = exp['./web-session-runtime/execution']
    expect(sub).toBeDefined()
    expect(Object.keys(sub)).toEqual(['types', 'import', 'default'])
    expect(sub.import).toBe('./dist/web-session-runtime-execution/index.js')
    const scripts = (PKG as unknown as { scripts: Record<string, string> }).scripts
    expect(scripts['build:web-session-runtime-execution']).toContain(
      '--outfile dist/web-session-runtime-execution/index.js --target node',
    )
    expect(scripts['build:web-session-runtime-execution']).not.toContain('--external zod')
  })
})
