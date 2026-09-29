// Git combined segment——分支 + 变更文件数合并段（detailed 行2 专用）
// 格式：✔ master 📁 +3（干净时无 📁 段）
// 原来分支和变更分散为两个独立 segment，在行1 占两个位置；合并后行2 只占一格

import * as React from 'react'
import { useSyncExternalStore } from 'react'
import { Text } from '../../../ink.js'
import type { SegmentComponent } from './types.js'
import {
  subscribeToGitState,
  getGitSnapshot,
  refreshGitState,
} from './gitStore.js'

export const GitCombinedSegment: SegmentComponent = () => {
  const gitState = useSyncExternalStore(subscribeToGitState, getGitSnapshot)

  const ref = React.useRef(false)
  if (!ref.current) {
    ref.current = true
    void refreshGitState()
  }

  if (gitState.loading) {
    return <Text dimColor>⏳ git…</Text>
  }
  if (!gitState.branch) {
    return null // 非 git 仓库：静默隐藏
  }

  const icon = gitState.isClean ? '✔' : '✗'
  const color = gitState.isClean ? 'green' : 'yellow'

  return (
    <Text color={color}>
      {icon} {gitState.branch}
      {gitState.dirtyCount > 0 && ` 📁 +${gitState.dirtyCount}`}
    </Text>
  )
}
