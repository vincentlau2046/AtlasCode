/**
 * 0.1.86 K6 · 任务 A · K6-1：vim `%` 跳转（工单 docs/2026-11-03-p0-wave-0186-ticket.md §A）。
 *
 * 契约（Review Focus 2）：
 *   - `%` 在光标处于括号字符 ( ) [ ] { } 上时跳到配对括号；配对失败 = 原地不动不报错。
 *   - 光标不在括号上时，先在当前行内向右找下一个括号字符再跳配对（:help % 语义）。
 *   - operator 组合（d%/c%/y%）经 isInclusiveMotion 对齐：`%` 为 inclusive（含配对括号），
 *     正向/反向均不多吃不少吃一格（d% on (foo) 光标在 ( 或 ) 或行内 x → 删整组）。
 * 分层纪律：纯函数层（motions/bracketMatch/types），无网络 / 无真实终端 / 无定时器。
 * 基线（2bd81c0）：motions.ts case 表无 '%'（f4 实核 L32-62）→ 行为红；findMatchingBracket
 * 为新增出口，其矩阵断言在基线为 import-error（gate 口径另列，不冒充行为红）。
 */
import { describe, expect, test } from 'bun:test'
import { resolveMotion, isInclusiveMotion } from '../../src/tui/vim/motions.js'
import { SIMPLE_MOTIONS } from '../../src/tui/vim/types.js'
import { Cursor } from '../../src/tui/utils/Cursor.js'

function cursorAt(text: string, offset: number): Cursor {
  return Cursor.fromText(text, 80, offset)
}

describe('K6-1 · % 跳转行为红面（基线 2bd81c0 真实行为 RED）', () => {
  test('光标在开括号 ( 上按 % 跳到配对 )（基线：原地 default 支 = 红）', () => {
    const result = resolveMotion('%', cursorAt('(foo)', 0), 1)
    expect(result.offset).toBe(4)
  })

  test('光标在闭括号 ) 上按 % 反向跳回配对 (（基线：原地 = 红）', () => {
    const result = resolveMotion('%', cursorAt('(foo)', 4), 1)
    expect(result.offset).toBe(0)
  })

  test('% ∈ SIMPLE_MOTIONS（normal 路由 handleNormalInput 前置，基线缺席 = 红）', () => {
    expect(SIMPLE_MOTIONS.has('%')).toBe(true)
  })

  test('isInclusiveMotion("%") = true（d%/c%/y% 含配对括号，基线 = 红）', () => {
    expect(isInclusiveMotion('%')).toBe(true)
  })

  test('配对失败 = 原地不动不报错（修后回归锚：基线 default 支恒真，修后不得漂移）', () => {
    const at = cursorAt('abc', 1)
    expect(resolveMotion('%', at, 1).offset).toBe(1)
  })

  test('行内无括号且光标非括号 = 原地（同上回归锚）', () => {
    const at = cursorAt('foo\n(bar)\nbaz', 1)
    expect(resolveMotion('%', at, 1).offset).toBe(1)
  })
})

describe('K6-1 · findMatchingBracket 矩阵（新增出口，基线 import-error 另列）', () => {
  // 动态取实现，便于矩阵断言集中
  const { findMatchingBracket } = require('../../src/tui/vim/bracketMatch.js') as {
    findMatchingBracket: (text: string, offset: number) => number | null
  }

  test('开括号正向：() [] {} 三对', () => {
    expect(findMatchingBracket('(x)', 0)).toBe(2)
    expect(findMatchingBracket('[x]', 0)).toBe(2)
    expect(findMatchingBracket('{x}', 0)).toBe(2)
  })

  test('闭括号反向：从 ) ] } 跳回', () => {
    expect(findMatchingBracket('(x)', 2)).toBe(0)
    expect(findMatchingBracket('[x]', 2)).toBe(0)
    expect(findMatchingBracket('{x}', 2)).toBe(0)
  })

  test('嵌套配对：内层配对内层，外层配对外层', () => {
    const text = 'f(a(b)c)' // f0 (1 a2 (3 b4 )5 c6 )7
    expect(findMatchingBracket(text, 3)).toBe(5) // 内层 ( → )
    expect(findMatchingBracket(text, 5)).toBe(3) // 内层 ) 反向 → (
    expect(findMatchingBracket(text, 1)).toBe(7) // 外层 ( → )
    expect(findMatchingBracket(text, 7)).toBe(1) // 外层 ) 反向 → (
  })

  test('不配对：无匹配或错配 → null', () => {
    expect(findMatchingBracket('(abc', 0)).toBeNull() // 开括号无闭
    expect(findMatchingBracket('abc)', 3)).toBeNull() // 闭括号无开
    expect(findMatchingBracket('(a]', 0)).toBeNull() // 错配（] 不消 (）
  })

  test('光标不在括号上：当前行内向右找下一个括号再跳配对（:help %）', () => {
    expect(findMatchingBracket('x(y)z', 0)).toBe(3) // x → 找 ( → 跳 )
    expect(findMatchingBracket('x(y)z', 4)).toBeNull() // z 右侧行内无括号 → null
  })

  test('行内查找限当前行：下一行的括号不参与（vim % 逐行语义）', () => {
    // 光标在首行无括号处，第二行才有括号 → null
    expect(findMatchingBracket('abc\n(x)', 1)).toBeNull()
    // 光标在第二行 x 上 → 行内向右找到 )6 → 闭括号反向配对回 (4
    expect(findMatchingBracket('abc\n(x)', 5)).toBe(4)
    expect(findMatchingBracket('abc\n(x)', 4)).toBe(6)
  })

  test('跨行配对块：定位括号在当前行，配对扫描全文跨行', () => {
    const text = 'foo(\n  bar\n)'
    expect(findMatchingBracket(text, 3)).toBe(11) // ( 在行 0，配对 ) 在行 2
    expect(findMatchingBracket(text, 11)).toBe(3) // 反向
  })

  test('多字节内容不影响括号扫描（CJK/emoji 邻接）', () => {
    expect(findMatchingBracket('中文(狐) emojis', 2)).toBe(4)
    expect(findMatchingBracket('🦊(x)', 2)).toBe(4) // emoji 占 2 code units，offset 2 = (
  })
})
