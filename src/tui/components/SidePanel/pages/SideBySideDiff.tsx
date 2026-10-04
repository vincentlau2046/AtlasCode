// P1a Diff 页 side-by-side 渲染（spec §4 P1a 唯一纯新增渲染）：
// 双列（行号 + 内容），del 红 / add 绿 / ctx 灰。数据源与 unified 档同组
// hunks（切档无数据丢失，ctrl+shift+d 往返）。

import * as React from 'react'
import { Box, Text } from '../../../ink.js'
import type { StructuredPatchHunk } from 'diff'
import { hunkToSbsRows } from './sideBySideRows.js'

const NUM_WIDTH = 5

function cell(text: string | null, num: number | null, width: number): string {
  const numStr = num === null ? ' '.repeat(NUM_WIDTH) : String(num).padStart(NUM_WIDTH)
  const body = text === null ? '' : text.slice(0, Math.max(0, width - NUM_WIDTH))
  return `${numStr} ${body}`
}

export function SideBySideDiff({
  hunks,
  colWidth,
}: {
  hunks: StructuredPatchHunk[]
  colWidth: number
}): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Text dimColor>side-by-side · ctrl+shift+d 回 unified</Text>
      {hunks.map((hunk, i) => (
        <React.Fragment key={i}>
          <Text dimColor>{`@@ ${hunk.oldStart} ⇄ ${hunk.newStart} @@`}</Text>
          {hunkToSbsRows(hunk).map((row, j) => (
            <Box key={j} flexDirection="row">
              <Text
                color={row.kind === 'del' ? 'red' : undefined}
                dimColor={row.kind === 'ctx'}
              >
                {cell(row.left, row.leftNum, colWidth)}
              </Text>
              <Text
                color={row.kind === 'add' ? 'green' : undefined}
                dimColor={row.kind === 'ctx'}
              >
                {'  ' + cell(row.right, row.rightNum, colWidth)}
              </Text>
            </Box>
          ))}
        </React.Fragment>
      ))}
    </Box>
  )
}
