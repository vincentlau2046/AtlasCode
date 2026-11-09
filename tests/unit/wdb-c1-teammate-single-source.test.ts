import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
  isPlanModeRequired,
  isTeammate,
} from '../../src/engine'

/**
 * 0.1.94 W-D-B 段 C-1 判别格（f4 §8 批复 @721bda51 判据面冻结）：
 * teammate.ts 双副本单源化——tui/utils/teammate.ts 直删，15+1 消费点改道
 * engine 门面（boundaries entry-point 纪律）。
 *
 * 结构断言（import 面计数，非输出文本 grep——§2.6 形锚纪律）：
 *   ① 身份链实现体实例数 = 1（修前 = 2，红）
 *   ② `utils/teammate` specifier 引用面 = 0（teammateMailbox 除外；修前 > 0，红）
 *   ③ src/tui/utils/teammate.ts 不存在（修前存在，红）
 * 行为恒等格：
 *   ④ isTeammate / isPlanModeRequired 行为锚（修前后同绿——身份段逐字零 delta）。
 */

const SRC_ROOT = join(import.meta.dir, '..', '..', 'src')

function walkTsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walkTsFiles(p))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p)
  }
  return out
}

/** 允许的 specifier 例外：teammateMailbox 是不同模块（名字前缀重叠）。 */
function referencesTuiTeammateSpecifier(source: string): boolean {
  // 形锚 regex：specifier 以 utils/teammate 或 utils/teammate.js 结尾
  // （收引号定界），不命中 utils/teammateMailbox(.js)。
  return /['"][^'"]*utils\/teammate(\.js)?['"]/.test(source)
}

describe('W-D-B 段 C-1 teammate.ts 单源化判别格', () => {
  test('① 身份链实现体实例数 = 1（engine/messaging/teammate 单源）', () => {
    const files = walkTsFiles(SRC_ROOT)
    const implFiles = files.filter((f) =>
      readFileSync(f, 'utf8').includes('export function isTeammate('),
    )
    expect(implFiles).toHaveLength(1)
    expect(implFiles[0]!.endsWith('src/engine/messaging/teammate.ts')).toBe(
      true,
    )
  })

  test('② tui/utils/teammate specifier 引用面 = 0（src ∪ tests）', () => {
    const roots = [SRC_ROOT, join(import.meta.dir, '..')]
    let hits = 0
    for (const root of roots) {
      for (const f of walkTsFiles(root)) {
        if (referencesTuiTeammateSpecifier(readFileSync(f, 'utf8'))) hits++
      }
    }
    expect(hits).toBe(0)
  })

  test('③ tui 副本文件已直删', () => {
    expect(
      existsSync(join(SRC_ROOT, 'tui', 'utils', 'teammate.ts')),
    ).toBe(false)
  })

  test('④ 行为锚：isTeammate 无身份上下文 = false（恒等）', () => {
    // 干净进程面：无 ALS ctx、无 dynamicTeamContext 写入方（C-1 定谳：
    // setDynamicTeamContext 零活跃调用点）→ 恒 false。
    expect(isTeammate()).toBe(false)
  })

  test('④ 行为锚：isPlanModeRequired ATLAS_PLAN_MODE_REQUIRED 两态', () => {
    const prev = process.env.ATLAS_PLAN_MODE_REQUIRED
    try {
      delete process.env.ATLAS_PLAN_MODE_REQUIRED
      expect(isPlanModeRequired()).toBe(false)
      process.env.ATLAS_PLAN_MODE_REQUIRED = '1'
      expect(isPlanModeRequired()).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.ATLAS_PLAN_MODE_REQUIRED
      else process.env.ATLAS_PLAN_MODE_REQUIRED = prev
    }
  })
})
