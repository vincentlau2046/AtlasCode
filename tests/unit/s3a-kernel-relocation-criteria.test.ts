/**
 * 0.1.103 S3a 归位波判据格（f4 §10 终裁 + lock-face §7 五格落格，工单
 * docs/2026-11-12-p0-wave-s3a-relocation-ticket.md 必改 2）：
 *
 *   格 1 解析落点式逃逸格：src/kernel/** 每文件全部字面 import（static/type/
 *        export-from/动态 import()/require()/side-effect）解析落点 ∈
 *        kernel ∪ shared ∪ 现存顶层域（src/* 除 tui/atlascode/atlasoffice），
 *        tui 逃逸 = 0。withfig 字符串构造面（`@withfig/autocomplete/build/
 *        ${command}.js`）为 npm 包路径模板、非仓内落点，且其宿主 registry.ts
 *        留壳 tui，不在 kernel 树——白名单空。
 *   格 2 归位快照格：移动集 121 文件定义点全域恰 1（kernel 新位在场 + tui
 *        旧位缺席，禁双本）；级联退出 12 文件 + f4 终裁 5 排除 8 文件留壳
 *        tui 原位（kernel 位缺席）。
 *   格 3 字面清单零漂移格：docs/literal-inventory.json allowlist 路径面
 *        不含已搬文件的 tui 旧路径（恰合搬移映射表重锚；留壳文件键保留合法）。
 *
 * 格 4 canon 零差格 = 全量套件本身；格 5 standing 14 腿 = 既有测试。
 * I/O 面：只读 src + docs（同 literal-inventory 范型）→ unit 层。
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, relative, resolve, dirname } from 'path'

const REPO = join(import.meta.dir, '..', '..')
const SRC = join(REPO, 'src')
const PLAN_PATH = join(
  REPO,
  'docs',
  '2026-11-12-01102-s3a-lockface-attachments',
  'move-plan.json',
)

interface MovePlan {
  moveMap: Record<string, string> // tui rel -> src/kernel/...
}

const plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8')) as MovePlan

/** 级联退出 12 文件 → 0.1.106 S3b 切片 2 出口首车 5 件已迁 kernel
 * （schemaOutput/validation/debug/fsOperations/slowOperations，f4 批复 59 锚
 * 成员，新落点由 tests/unit/s3b-first-car-guard.test.ts 格 3① 恰合断言）；
 * 留壳 7 件继续原位断言（f4 终裁 6 三分法 ①/③ + settingsCache ③）。 */
const EXIT_TUI = [
  'tui/utils/hooks/hookEvents.ts',
  'tui/utils/hooks/hookInputMaterialize.ts',
  'tui/utils/settings/constants.ts',
  'tui/utils/settings/settingsCache.ts',
  'tui/utils/bash/ast.ts',
  'tui/utils/bash/parser.ts',
  'tui/utils/telemetry/perfettoTracing.ts',
]
/** f4 终裁 5 排除 8 文件（原位留壳断言；execAgentHook 等 fixpoint ③ 退出
 * 文件已由 move-plan.json exited 集覆盖，不在此单列）。 */
const EXCLUDED_TUI = [
  'tui/utils/permissions/bypassPermissionsKillswitch.ts',
  'tui/utils/hooks/hooksConfigManager.ts',
  'tui/utils/hooks/hooksSettings.ts',
  'tui/utils/hooks/registerFrontmatterHooks.ts',
  'tui/utils/hooks/registerSkillHooks.ts',
  'tui/utils/hooks/sessionHooks.ts',
  'tui/utils/api.ts',
  'tui/utils/auth.ts',
]

/** 级联退出 12 中 5 件已由 0.1.106 S3b 出口首车迁 kernel（f4 批复 59 锚成员；
 * 实际落点 kernel/utils/<同构子树>，新落点由 tests/unit/s3b-first-car-guard.test.ts
 * 格 3① 恰合断言。冻结 plan 中 settings 两件目的地 kernel/settings/* 与实际
 * kernel/utils/settings/* 不同 subtree——本格 2a 保持 S3a 波口径，5 件不并入
 * moved 快照）。 */
const S3B_CAR_FROM_EXIT = new Set([
  // 注意：集合成员 = moveMap 键（tui 旧路径），非 kernel 新路径。
  'tui/utils/settings/schemaOutput.ts',
  'tui/utils/settings/validation.ts',
  'tui/utils/debug.ts',
  'tui/utils/fsOperations.ts',
  'tui/utils/slowOperations.ts',
])

/** 终态移动集 = 冻结 133 − 留壳 7 − S3b 车已迁 5（S3a 口径 121）。 */
const moved = Object.entries(plan.moveMap)
  .filter(([k]) => !EXIT_TUI.includes(k) && !S3B_CAR_FROM_EXIT.has(k))
  .map(([k, v]) => [k, v.slice('src/'.length)] as const)

function walkTs(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
    }
  }
  walk(dir)
  return out
}

function stripComments(src: string): string {
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '')
  return stripped
    .split('\n')
    .map(l => {
      const idx = l.indexOf('//')
      const before = l.slice(0, idx)
      const quotes = (before.match(/['"]/g) ?? []).length
      return idx >= 0 && quotes % 2 === 0 ? before : l
    })
    .join('\n')
}

const SPEC_RES = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /^\s*import\s*['"]([^'"]+)['"]/gm,
]

/** 字面 specifier 解析（.js→.ts 后缀矩阵 + src/ 别名；与段 D 扫描器同口径）。 */
function resolveSpec(spec: string, fromFile: string): string | null {
  let base: string | null = null
  if (spec.startsWith('src/')) base = join(SRC, spec.slice(4))
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
  if (!base) return null
  const tries = [
    base,
    base + '.ts',
    base + '.tsx',
    base + '/index.ts',
    base + '/index.tsx',
  ]
  if (spec.endsWith('.js'))
    tries.push(
      base.replace(/\.js$/, '.ts'),
      base.replace(/\.js$/, '.tsx'),
      base.replace(/\.js$/, '.ts') + '/index.ts',
    )
  if (spec.endsWith('.jsx')) tries.push(base.replace(/\.jsx$/, '.tsx'))
  for (const t of tries)
    if (existsSync(t) && statSync(t).isFile()) return t
  return null
}

describe('0.1.103 S3a 归位波判据格（f4 §10 + lock-face §7）', () => {
  test('格 1 逃逸格：kernel 树字面 import 落点零 tui 逃逸', () => {
    const kernelFiles = walkTs(join(SRC, 'kernel'))
    expect(kernelFiles.length).toBeGreaterThan(100)
    const escapes: string[] = []
    for (const f of kernelFiles) {
      const text = stripComments(readFileSync(f, 'utf-8'))
      for (const re of SPEC_RES) {
        for (const m of text.matchAll(re)) {
          const r = resolveSpec(m[1]!, f)
          if (!r || !r.startsWith(SRC)) continue
          const rel = relative(SRC, r)
          if (rel.startsWith('tui/'))
            escapes.push(`${relative(REPO, f)} -> ${rel} (${m[1]})`)
        }
      }
    }
    expect(escapes).toEqual([])
  })

  test('格 2a 归位快照：移动集 121 定义点全域恰 1（kernel 在场 + tui 旧位缺席；S3a 口径，S3b 车 5 件另测）', () => {
    expect(moved.length).toBe(121)
    const doubleCopy: string[] = []
    for (const [oldRel, newRel] of moved) {
      if (!existsSync(join(SRC, newRel))) doubleCopy.push(`缺 kernel 新位: ${newRel}`)
      if (existsSync(join(SRC, oldRel))) doubleCopy.push(`tui 旧位残留双本: ${oldRel}`)
    }
    expect(doubleCopy).toEqual([])
  })

  test('格 2b 归位快照：级联退出 12 + 排除 8 留壳 tui 原位（kernel 位缺席）', () => {
    const stayTwins: string[] = []
    for (const rel of [...EXIT_TUI, ...EXCLUDED_TUI]) {
      if (!existsSync(join(SRC, rel))) stayTwins.push(`tui 原位缺失: ${rel}`)
      const kernelTwin = join(SRC, 'kernel', rel.slice('tui/'.length))
      if (existsSync(kernelTwin)) stayTwins.push(`kernel 双本: ${kernelTwin}`)
    }
    expect(stayTwins).toEqual([])
  })

  test('格 3 字面清单零漂移：allowlist 路径面无已搬文件 tui 旧路径', () => {
    const inv = JSON.parse(
      readFileSync(join(REPO, 'docs', 'literal-inventory.json'), 'utf8'),
    ) as { allowlist: Record<string, Record<string, number>> }
    const movedOld = new Set(moved.map(([k]) => k))
    const stale: string[] = []
    for (const [cls, files] of Object.entries(inv.allowlist)) {
      for (const p of Object.keys(files)) {
        if (movedOld.has(p)) stale.push(`${cls}: ${p}`)
      }
    }
    expect(stale).toEqual([])
  })
})
