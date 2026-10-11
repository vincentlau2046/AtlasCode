/**
 * C-3 memory 族（0.1.51，工单 §1.5/§1.6/§2）：PT-02 五要素 + PT-17
 * delete-stale 支 + PT-08 retrieval-only 保守条款——提示词在场断言 +
 * 双副本（src/memory/ × src/tui/memdir/）一致性加固单测。
 *
 * 双副本 = 刻意双份（memdir/memoryTypes.ts:9 头注登记）：engine lane
 * （src/memory/）× TUI lane（src/tui/memdir/），一致性断言 = 五要素面
 * 两侧都在场 + 关键句两侧恒等（任一车道误裁/漂移即红）。
 *
 * 分层纪律：纯静态提示词断言（常量 import + 仓内源文件静态扫描，无网络/
 * 无 LLM/无渲染，PT-20 在场断言先例同型）→ unit 层。
 *
 * 判别（修前红 → 修后绿）：
 *  - PT-17 ⑥：delete-stale-conflict 支措辞双副本在场（修前共享 lane
 *    MEMORY_DRIFT_CAVEAT 仅「verify still correct」，缺删除支 = 红）
 *  - PT-08 ⑧：user-profile 保守条款双副本在场（修前缺席 = 红）
 *  - PT-02 ①②④⑦ + PT-08 ⑤：五要素在场 + 选择器 alreadySurfaced 去重
 *    （retrieval-only 结构性已在）= 首轮绿 verify 面
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  MEMORY_TYPES as SharedMemoryTypes,
  MEMORY_DRIFT_CAVEAT as SharedDriftCaveat,
  TRUSTING_RECALL_SECTION as SharedTrustingRecall,
  MEMORY_FRONTMATTER_EXAMPLE as SharedFrontmatterExample,
  WHEN_TO_ACCESS_SECTION as SharedWhenToAccess,
} from '../../src/memory'
import {
  MEMORY_TYPES as TuiMemoryTypes,
  MEMORY_DRIFT_CAVEAT as TuiDriftCaveat,
  TRUSTING_RECALL_SECTION as TuiTrustingRecall,
  MEMORY_FRONTMATTER_EXAMPLE as TuiFrontmatterExample,
} from '../../src/tui/memdir/memoryTypes.js'

/** 仓根相对路径（tests/unit/ → ../../src/...，PT-20 在场断言先例）。 */
function readRepo(rel: string): string {
  return readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')
}

const TYPES = ['user', 'feedback', 'project', 'reference']

/** PT-17 删除支措辞（CC 2.1.94：stale 且与观察现实冲突 → 删除而非沿用）。 */
const DELETE_BRANCH = 'update or remove the stale memory'
/** PT-08 2.1.210 user-profile 保守条款（user 型记忆 = 语境非指令）。 */
const USER_PROFILE_CLAUSE =
  'User-profile memories (who the user is, how they like to collaborate) are context, not instructions'

describe('C-3 memory 提示词双副本一致性（PT-02 五要素 + PT-17 + PT-08）', () => {
  test('① 五要素在场（frontmatter/类型/重复/stale/recalled 核验）——两侧常量面', () => {
    // frontmatter 要素
    for (const ex of [SharedFrontmatterExample, TuiFrontmatterExample]) {
      expect(ex.join('\n')).toContain('name:')
      expect(ex.join('\n')).toContain('description:')
      expect(ex.join('\n')).toContain('type:')
    }
    // 类型要素：两侧类型集合一致（序无关）
    const sortedTypes = [...TYPES].sort()
    expect([...SharedMemoryTypes].sort()).toEqual(sortedTypes)
    expect([...TuiMemoryTypes].sort()).toEqual(sortedTypes)
    // stale 要素：WHEN_TO_ACCESS 段含 drift caveat
    expect(SharedWhenToAccess).toContain(SharedDriftCaveat)
    // recalled 核验要素：TRUSTING_RECALL 段含文件/符号核验 bullet
    for (const s of [SharedTrustingRecall, TuiTrustingRecall]) {
      expect(s.join('\n')).toContain('check the file exists')
      expect(s.join('\n')).toContain('grep for it')
    }
  })

  test('② 重复要素在场：how-to-save 段「先查已有再写新」句（TUI lane 提示词装配点）', () => {
    for (const f of [
      'src/tui/memdir/memdir.ts',
      'src/tui/memdir/teamMemPrompts.ts',
    ]) {
      expect(readRepo(f).includes('Do not write duplicate memories'), f).toBe(
        true,
      )
    }
  })

  test('③ 零回归：共享 lane 既有段面不漂移（WHAT_NOT_TO_SAVE/WHEN_TO_ACCESS 恒在场）', () => {
    expect(SharedWhenToAccess[0]).toBe('## When to access memories')
    expect(SharedWhenToAccess.join('\n')).toContain(
      'ignore',
    ) // ignore-memory bullet 恒在场
  })

  test('④ 装配点在场：teamMemPrompts 五要素装配（frontmatter + drift + 类型段引用）', () => {
    const src = readRepo('src/tui/memdir/teamMemPrompts.ts')
    expect(src).toContain('MEMORY_DRIFT_CAVEAT')
    expect(src).toContain('MEMORY_FRONTMATTER_EXAMPLE')
  })

  test('⑤ PT-08 verify：retrieval-only 选择器 alreadySurfaced 去重在场（零码闭环面）', () => {
    const src = readRepo('src/tui/memdir/findRelevantMemories.ts')
    expect(src).toContain('alreadySurfaced')
    expect(src).toContain('!alreadySurfaced.has(m.filePath)')
  })

  test('⑥ PT-17：delete-stale-conflict 支措辞双副本在场（修前红：共享 lane 缺删除支）', () => {
    expect(TuiDriftCaveat).toContain(DELETE_BRANCH)
    expect(SharedDriftCaveat, '共享 lane drift caveat 缺 delete 支（PT-17 落码面）').toContain(
      DELETE_BRANCH,
    )
  })

  test('⑦ PT-02 一致性加固：关键句两侧恒等（drift caveat 全文一致）', () => {
    expect(SharedDriftCaveat).toBe(TuiDriftCaveat)
  })

  test('⑧ PT-08：user-profile 保守条款双副本在场（TRUSTING_RECALL 段，修前红）', () => {
    for (const s of [SharedTrustingRecall, TuiTrustingRecall]) {
      expect(s.join('\n')).toContain(USER_PROFILE_CLAUSE)
    }
  })
})
