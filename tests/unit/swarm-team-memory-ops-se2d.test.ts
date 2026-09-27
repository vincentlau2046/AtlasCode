/**
 * swarm 域 S-E2d（§8.66.1.5 测试面）unit 层（零盘零模型）：teamMemoryOps
 * 判定/摘要面（旧仓 utils/teamMemoryOps.ts 88L 逐字 + teamMemPaths 判定链
 * 重建，S-E2b 落位）。
 *
 * 测面 = isTeamMemFile 路径判定（auto-memory 目录 team/ 子目录 + 判定链
 * GrowthBook 门裁后 isAutoMemoryEnabled 单条件）/ isTeamMemorySearch
 * 工具输入面 / isTeamMemoryWriteOrEdit 双工具名 + 双路径字段面 /
 * appendTeamMemorySummaryParts 摘要动词矩阵（active/inactive × 首位/
 * 非首位 × 单复数 × 零计数 no-op）。
 *
 * 路径基址 = memory 门面 getAutoMemPath()（与模块内调用同参同 memo 键，
 * 零路径硬编码）；ATLAS_DISABLE_AUTO_MEMORY env 用例内存取还原。
 */
import { join } from 'path'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  appendTeamMemorySummaryParts,
  isTeamMemFile,
  isTeamMemorySearch,
  isTeamMemoryWriteOrEdit,
} from '../../src/swarm'
import { getAutoMemPath } from '../../src/memory'
import {
  FILE_EDIT_TOOL_NAME,
  FILE_WRITE_TOOL_NAME,
} from '../../src/engine'

const teamMemDir = join(getAutoMemPath(), 'team')
const inside = join(teamMemDir, 'notes.md')
const outside = join(getAutoMemPath(), 'solo.md')

afterEach(() => {
  delete process.env.ATLAS_DISABLE_AUTO_MEMORY
})

describe('isTeamMemFile 路径判定', () => {
  test('team/ 子目录内文件 → true（缺省 auto-memory 启用）', () => {
    expect(isTeamMemFile(inside)).toBe(true)
  })

  test('team/ 兄弟文件（auto-memory 根层）→ false', () => {
    expect(isTeamMemFile(outside)).toBe(false)
  })

  test('ATLAS_DISABLE_AUTO_MEMORY=1 → 判定链关（门裁后单条件面）', () => {
    process.env.ATLAS_DISABLE_AUTO_MEMORY = '1'
    expect(isTeamMemFile(inside)).toBe(false)
  })
})

describe('isTeamMemorySearch 工具输入面', () => {
  test('path 指向 team 目录 → true', () => {
    expect(isTeamMemorySearch({ path: inside, pattern: '*.md' })).toBe(true)
  })

  test('path 指向外部 → false', () => {
    expect(isTeamMemorySearch({ path: outside })).toBe(false)
  })

  test('仅 pattern 无 path → false（代码面只查 path 字段）', () => {
    expect(isTeamMemorySearch({ pattern: '*.md' })).toBe(false)
  })

  test('undefined / null 输入 → false（输入防御支）', () => {
    expect(isTeamMemorySearch(undefined)).toBe(false)
    expect(isTeamMemorySearch(null)).toBe(false)
  })
})

describe('isTeamMemoryWriteOrEdit 双工具名 × 双路径字段面', () => {
  test('Write + file_path team 内 → true', () => {
    expect(isTeamMemoryWriteOrEdit(FILE_WRITE_TOOL_NAME, { file_path: inside })).toBe(
      true,
    )
  })

  test('Edit + path team 内 → true（双路径字段 ?? 面）', () => {
    expect(isTeamMemoryWriteOrEdit(FILE_EDIT_TOOL_NAME, { path: inside })).toBe(true)
  })

  test('file_path 优先于 path（?? 短路面）', () => {
    expect(
      isTeamMemoryWriteOrEdit(FILE_WRITE_TOOL_NAME, {
        file_path: inside,
        path: outside,
      }),
    ).toBe(true)
  })

  test('非 Write/Edit 工具名 → false（先查工具名支）', () => {
    expect(isTeamMemoryWriteOrEdit('Bash', { file_path: inside })).toBe(false)
  })

  test('缺路径字段 / 输入 undefined → false', () => {
    expect(isTeamMemoryWriteOrEdit(FILE_WRITE_TOOL_NAME, { other: 1 })).toBe(false)
    expect(isTeamMemoryWriteOrEdit(FILE_WRITE_TOOL_NAME, undefined)).toBe(false)
  })
})

describe('appendTeamMemorySummaryParts 摘要动词矩阵', () => {
  test('零计数 → parts 零推入', () => {
    const parts: string[] = []
    appendTeamMemorySummaryParts({}, true, parts)
    expect(parts).toEqual([])
  })

  test('read 1 active 首位 → "Recalling 1 team memory"（单数 + 首词大写）', () => {
    const parts: string[] = []
    appendTeamMemorySummaryParts({ teamMemoryReadCount: 1 }, true, parts)
    expect(parts).toEqual(['Recalling 1 team memory'])
  })

  test('read 2 active 非首位 → "recalling 2 team memories"（复数 + 小写）', () => {
    const parts = ['did something']
    appendTeamMemorySummaryParts({ teamMemoryReadCount: 2 }, true, parts)
    expect(parts).toEqual(['did something', 'recalling 2 team memories'])
  })

  test('read inactive 首位/非首位 → "Recalled" / "recalled"', () => {
    const a: string[] = []
    appendTeamMemorySummaryParts({ teamMemoryReadCount: 1 }, false, a)
    const b = ['x']
    appendTeamMemorySummaryParts({ teamMemoryReadCount: 1 }, false, b)
    expect(a).toEqual(['Recalled 1 team memory'])
    expect(b).toEqual(['x', 'recalled 1 team memory'])
  })

  test('search 计数 → 文本不随计数变化（"Searching team memories"）', () => {
    const a: string[] = []
    appendTeamMemorySummaryParts({ teamMemorySearchCount: 3 }, true, a)
    const b: string[] = []
    appendTeamMemorySummaryParts({ teamMemorySearchCount: 1 }, false, b)
    expect(a).toEqual(['Searching team memories'])
    expect(b).toEqual(['Searched team memories'])
  })

  test('write 单复数面 + 4 象限动词矩阵（首/active Writing · 首/inactive Wrote · 非首/inactive wrote）', () => {
    const a: string[] = []
    appendTeamMemorySummaryParts({ teamMemoryWriteCount: 1 }, false, a)
    const b: string[] = []
    appendTeamMemorySummaryParts({ teamMemoryWriteCount: 2 }, true, b)
    const c = ['x']
    appendTeamMemorySummaryParts({ teamMemoryWriteCount: 2 }, false, c)
    expect(a).toEqual(['Wrote 1 team memory'])
    expect(b).toEqual(['Writing 2 team memories']) // 首位恒大写（active）
    expect(c).toEqual(['x', 'wrote 2 team memories'])
  })

  test('三计数并发 → 3 段依序推入（read → search → write）', () => {
    const parts: string[] = []
    appendTeamMemorySummaryParts(
      { teamMemoryReadCount: 1, teamMemorySearchCount: 1, teamMemoryWriteCount: 1 },
      true,
      parts,
    )
    expect(parts).toEqual([
      'Recalling 1 team memory',
      'searching team memories',
      'writing 1 team memory',
    ])
  })
})
