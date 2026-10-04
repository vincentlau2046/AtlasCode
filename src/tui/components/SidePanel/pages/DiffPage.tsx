// P1a Diff 页（spec 页 1 你改了什么）：工作树 git diff（useDiffData）——
// unified 默认（G1 #258 内联 diff 同源，StructuredDiff 词级 + 语法高亮）
// ⇄ side-by-side（P1a 唯一纯新增渲染，同源数据，切档无丢失，ctrl+shift+d）。
// 只读投影：DiffData 来自 git 工作树，零主循环写（红线 2）。

import * as React from 'react'
import { Box, Text } from '../../../ink.js'
import { useDiffData } from '../../../hooks/useDiffData.js'
import { useSidePanel } from '../store.js'
import { StructuredDiff } from '../../StructuredDiff.js'
import { SideBySideDiff } from './SideBySideDiff.js'

/** 抽屉 40% 宽下的 diff 内容可用列宽（边框/行槽预留）。 */
const DIFF_CONTENT_WIDTH = 42
const SBS_COL_WIDTH = 18

export function DiffPage(): React.ReactNode {
  const diff = useDiffData()
  const { diffLayout } = useSidePanel()
  if (diff.loading) {
    return <Text dimColor>加载 git diff…</Text>
  }
  if (diff.files.length === 0) {
    return <Text dimColor>工作树干净 —— 无未提交改动（git diff 空）</Text>
  }
  // 最近改动文件（DiffData files 顺序 = git diff 输出顺序；v1 无页内翻页，后续波）
  const file = diff.files[diff.files.length - 1]
  const hunks = file ? (diff.hunks.get(file.path) ?? []) : []
  return (
    <Box flexDirection="column">
      <Text bold>{file ? file.path : ''}</Text>
      <Text dimColor>
        {`+${file?.linesAdded ?? 0} −${file?.linesRemoved ?? 0} · ${hunks.length} hunks`}
      </Text>
      {hunks.length === 0 ? (
        <Text dimColor>{file?.isBinary ? '二进制文件（无文本 diff）' : '无 hunk'}</Text>
      ) : diffLayout === 'side-by-side' ? (
        <SideBySideDiff hunks={hunks} colWidth={SBS_COL_WIDTH} />
      ) : (
        hunks.map((hunk, i) => (
          <StructuredDiff
            key={i}
            patch={hunk}
            filePath={file?.path}
            firstLine={hunk.oldStart}
            fileContent={undefined}
            dim={false}
            width={DIFF_CONTENT_WIDTH}
          />
        ))
      )}
    </Box>
  )
}
