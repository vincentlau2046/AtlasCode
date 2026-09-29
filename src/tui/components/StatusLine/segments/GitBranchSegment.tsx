// Git branch segment——显示当前分支名 + 干净/脏状态
// 数据源：gitStore 微 store（组件内自取数，§9.2 方案 B）
// 渲染：✔ main（干净）/ ✗ main（脏）

import * as React from 'react'
import { useSyncExternalStore } from 'react'
import { Text } from '../../../ink.js'
import type { SegmentComponent } from './types.js'
import {
  subscribeToGitState,
  getGitSnapshot,
  refreshGitState,
} from './gitStore.js'

export const GitBranchSegment: SegmentComponent = () => {
  const gitState = useSyncExternalStore(subscribeToGitState, getGitSnapshot)

  // 首次渲染触发拉取（useEffect 不适合 segment 纯组件，用挂载时 ref）
  const ref = React.useRef(false)
  if (!ref.current) {
    ref.current = true
    void refreshGitState()
  }

  if (gitState.loading) {
    return <Text dimColor>⏳ git…</Text>
  }
  if (!gitState.branch) {
    return null  // 非 git 仓库：静默隐藏
  }
  const icon = gitState.isClean ? '✔' : '✗'
  const color = gitState.isClean ? 'green' : 'yellow'
  return (
    <Text color={color}>
      {icon} {gitState.branch}
    </Text>
  )
}
