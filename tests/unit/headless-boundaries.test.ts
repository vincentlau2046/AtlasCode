/**
 * 0.1.98 S1a headless boundaries entry-point 声明守（工单 §8 第 8 点批准形：
 * headless = boundaries entry-point 声明、**零物理搬移**——src/cli 已是 #151
 * 落位公共域，本测试把声明固化为可执行判据）：
 *   - headless 车道（cli 域）**禁 import tui 域**（absorb ⑤：防「归位」名下
 *     偷运 tui 文件/依赖倒挂）——真实 import 语句零命中（注释/文档提及不算，
 *     注释剥离同 literal-inventory 口径）。
 *   - 引擎侧公共域（src/engine、src/shared）同守：shared 是唯一叶子，engine
 *     不 import tui（headless lane 不经 tui 组合根）。
 * 违例 = fail（新 import 显式回工单改表/改形，不得顺手落）。
 *
 * I/O 面：只读 src 源码扫描（同 ascend-curation-contract / literal-inventory
 * 范型）→ unit 层。
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const SRC_ROOT = join(import.meta.dir, '..', '..', 'src')

/** src 递归收集（只读，同 literal-inventory 范型）。 */
function collectFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
    }
  }
  walk(dir)
  return out
}

/** 真实 import 面：剥注释行后匹配 `from '<tui 路径>'`（含相对与 src 别名形）。 */
function findTuiImports(dir: string): string[] {
  const violations: string[] = []
  for (const f of collectFiles(dir)) {
    const rel = f.slice(SRC_ROOT.length + 1)
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue
      if (/from\s+['"](.{0,40}?tui\/|src\/tui)/.test(line)) {
        violations.push(`${rel}: ${line.trim()}`)
      }
    }
  }
  return violations
}

describe('headless boundaries entry-point 声明（0.1.98 S1a，零物理搬移）', () => {
  test('① src/cli（headless 车道）零 tui import', () => {
    expect(findTuiImports(join(SRC_ROOT, 'cli'))).toEqual([])
  })
  test('② src/engine（引擎公共域）零 tui import', () => {
    expect(findTuiImports(join(SRC_ROOT, 'engine'))).toEqual([])
  })
  test('③ src/shared（唯一叶子域）零 tui import', () => {
    expect(findTuiImports(join(SRC_ROOT, 'shared'))).toEqual([])
  })
})
