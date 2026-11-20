/**
 * S0-R 腿 6 修形（工单 §5.9 @544caa07）：tsconfig.web-session-runtime.json
 * emitDeclarationOnly 沿源码 bundler resolution 风格，d.ts 树相对 specifier
 * 无扩展名（`from './x'`）——node16/nodenext 严格 ESM 消费者 TS2834 拒编译。
 *
 * post-emit 重写 dist/web-session-runtime 树内 .d.ts：仅相对（'./' '../'
 * 起始）且无扩展名的 specifier 加 '.js'。钉死形（f4 §5.9）：
 * ① bare 与已带 .js 扩展名者零触碰；② fail-closed（歧义形=带其他扩展名的
 * 相对 specifier、重写目标 .d.ts 不在 → 报错退出非静默跳过）且幂等（重跑
 * 零差）；③ 零源码触碰（仅 dist 产物）。
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

// S4 修正锚（f4 裁定）：pack 构建入口分离后同参数化复用——argv[2] = dist
// 子树根（默认 dist/web-session-runtime；execution bundle 传
// dist/web-session-runtime-execution），重写语义逐字不变。
const ROOT = resolve(
  import.meta.dir,
  '..',
  process.argv[2] ?? join('dist', 'web-session-runtime'),
)

function dtsFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...dtsFiles(p))
    else if (e.name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

/** 相对 specifier（'./x' / '../x/y'）的 import 面：from '...' 与 import('...')。 */
const REL_SPEC =
  /(from\s*|import\s*\(\s*)(["'])((?:\.\.?\/)[^"']*)(["'])/g

let changed = 0
const files = dtsFiles(ROOT)
if (files.length === 0) {
  console.error(
    `rewrite-web-session-runtime-dts: no .d.ts under ${ROOT} — run tsc emit first`,
  )
  process.exit(1)
}
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  let touched = false
  const out = src.replace(
    REL_SPEC,
    (m: string, pre: string, q1: string, spec: string, q2: string) => {
      const last = spec.split('/').pop() as string
      if (last.includes('.')) {
        if (last.endsWith('.js')) return m // 已带 .js：零触碰
        throw new Error(
          `ambiguous relative specifier '${spec}' in ${f} — fail-closed`,
        )
      }
      // fail-closed：重写目标必须真实可解析。两形态：
      // ① <spec>.d.ts（普通子模块）→ 重写为 <spec>.js；
      // ② <spec>/index.d.ts（bundler resolution 目录 barrel，S0-R2 实锚：
      //    闭内 type-only `from '../../shared'` 擦除前不入 bundle 图，但
      //    d.ts emit 面解析到 shared/index.d.ts）→ 重写为 <spec>/index.js。
      //    两者皆无 → 报错退出（fail-closed 语义不变）。
      const directTarget = join(dirname(f), `${spec}.d.ts`)
      const indexTarget = join(dirname(f), spec, 'index.d.ts')
      if (!existsSync(directTarget) && !existsSync(indexTarget)) {
        throw new Error(
          `rewrite target missing for '${spec}' in ${f}: neither ${directTarget} nor ${indexTarget} — fail-closed`,
        )
      }
      const resolved = existsSync(directTarget)
        ? `${spec}.js`
        : `${spec}/index.js`
      touched = true
      changed++
      return `${pre}${q1}${spec}.js${q2}`
    },
  )
  if (touched) writeFileSync(f, out)
}
console.log(`rewrote ${changed} specifier(s) across ${files.length} d.ts file(s)`)
