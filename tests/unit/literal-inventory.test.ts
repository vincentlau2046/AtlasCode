/**
 * 0.1.98 S1a 字面清单制（lock-face 批复形）：读 docs/literal-inventory.json，
 * 对 src/**（.ts/.tsx）非注释行重执行同款 grep，逐类比对——
 *   - 新文件出现该类字面命中 → fail（fail-visible：字面漂移须回工单改表）；
 *   - 已知文件命中数超清单登记值 → fail（同文件内净增）；
 *   - 命中减少 / 清单残留过期项 → 不 fail（收敛向宽松，表格可在后续波修剪）。
 * 另锁单一事实源在场：repoSlug 在 src/shared/identity.ts 必须仍有命中（焊点①
 * 派生源不可整删）。
 *
 * I/O 面：只读 src 源码 + docs 表（同 ascend-curation-contract 范型）→ unit 层。
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const SRC_ROOT = join(import.meta.dir, '..', '..', 'src')
const INVENTORY_PATH = join(
  import.meta.dir,
  '..',
  '..',
  'docs',
  'literal-inventory.json',
)

interface Inventory {
  _meta: { classes: string[]; commentStrip: string; domain: string }
  regexes: Record<string, string>
  allowlist: Record<string, Record<string, number>>
}

const inventory = JSON.parse(
  readFileSync(INVENTORY_PATH, 'utf8'),
) as Inventory

/** src 递归 .ts/.tsx 文件只读收集。 */
function collectSrcFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
    }
  }
  walk(SRC_ROOT)
  return out
}

/** 非注释行按类计数（与生成器同款：行首注释剥离 + 空行跳过）。 */
function scanClass(re: RegExp): Record<string, number> {
  const hits: Record<string, number> = {}
  for (const f of collectSrcFiles()) {
    const rel = f.slice(SRC_ROOT.length + 1)
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue
      if (line.trim() === '') continue
      if (re.test(line)) hits[rel] = (hits[rel] ?? 0) + 1
    }
  }
  return hits
}

describe('字面清单制（0.1.98 S1a，fail-visible）', () => {
  test('① 表形健全：六类字面 + regex 在场', () => {
    expect(inventory._meta.classes).toEqual([
      'repoSlug',
      'repoUrl',
      'brandName',
      'configDirLiteral',
      'envPrefixLiteral',
      'packageNameLiteral',
    ])
    expect(Object.keys(inventory.regexes)).toHaveLength(6)
    expect(Object.keys(inventory.allowlist)).toHaveLength(6)
  })

  test('② repoSlug 单一事实源在场：src/shared/identity.ts 仍有命中', () => {
    const hits = scanClass(new RegExp(inventory.regexes.repoSlug!))
    expect(hits['shared/identity.ts']).toBeGreaterThan(0)
  })

  for (const cls of inventory._meta.classes) {
    test(`③ ${cls}：当前命中 ⊆ 清单（新漂移 fail-visible）`, () => {
      const re = new RegExp(inventory.regexes[cls]!)
      const allow = inventory.allowlist[cls]!
      const current = scanClass(re)
      const drift: string[] = []
      for (const [file, count] of Object.entries(current)) {
        if (!(file in allow)) drift.push(`新文件 ${file} (${count} hits)`)
        else if (count > allow[file]!)
          drift.push(`${file} 命中净增 ${allow[file]}→${count}`)
      }
      expect(drift).toEqual([])
    })
  }
})
