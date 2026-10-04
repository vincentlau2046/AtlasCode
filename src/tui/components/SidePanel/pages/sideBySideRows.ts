// P1a Diff 页 side-by-side 行配对（纯函数——判别单测可测）。
// git hunk 行语义：'-' = 仅旧侧 / '+' = 仅新侧 / ' ' = 上下文行（两侧）；
// '\ No newline at end of file' 等 marker 不占行号。与 unified 档同源
// （同一组 StructuredPatchHunk[]）→ 切档无数据丢失（spec 门禁②）。

import type { StructuredPatchHunk } from 'diff'

export interface SbsRow {
  left: string | null
  right: string | null
  leftNum: number | null
  rightNum: number | null
  kind: 'ctx' | 'del' | 'add'
}

export function hunkToSbsRows(hunk: StructuredPatchHunk): SbsRow[] {
  const rows: SbsRow[] = []
  let oldNum = hunk.oldStart
  let newNum = hunk.newStart
  for (const raw of hunk.lines) {
    const marker = raw[0]
    const text = raw.slice(1)
    if (marker === '-') {
      rows.push({ left: text, right: null, leftNum: oldNum, rightNum: null, kind: 'del' })
      oldNum += 1
    } else if (marker === '+') {
      rows.push({ left: null, right: text, leftNum: null, rightNum: newNum, kind: 'add' })
      newNum += 1
    } else if (marker === ' ') {
      rows.push({ left: text, right: text, leftNum: oldNum, rightNum: newNum, kind: 'ctx' })
      oldNum += 1
      newNum += 1
    }
    // '\ ...' 等 marker：不成行
  }
  return rows
}
