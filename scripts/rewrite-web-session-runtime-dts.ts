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

const ROOT = resolve(import.meta.dir, '..', 'dist', 'web-session-runtime')

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
      // fail-closed：重写目标必须真实可解析（emit 树内为 <spec>.d.ts）
      const target = join(dirname(f), `${spec}.d.ts`)
      if (!existsSync(target)) {
        throw new Error(
          `rewrite target missing for '${spec}' in ${f}: ${target} — fail-closed`,
        )
      }
      touched = true
      changed++
      return `${pre}${q1}${spec}.js${q2}`
    },
  )
  if (touched) writeFileSync(f, out)
}
console.log(`rewrote ${changed} specifier(s) across ${files.length} d.ts file(s)`)
