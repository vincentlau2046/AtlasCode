// Git files segment——显示改动文件数
// 数据源：gitStore 微 store（dirtyCount）
// 渲染：📁 +3（有改动）/ 隐藏（无改动）

import * as React from 'react'
import { useSyncExternalStore } from 'react'
import { Text } from '../../../ink.js'
import type { SegmentComponent } from './types.js'
import {
  subscribeToGitState,
  getGitSnapshot,
  refreshGitState,
} from './gitStore.js'

export const GitFilesSegment: SegmentComponent = () => {
  const gitState = useSyncExternalStore(subscribeToGitState, getGitSnapshot)

  const ref = React.useRef(false)
  if (!ref.current) {
    ref.current = true
    void refreshGitState()
  }

  if (gitState.loading || !gitState.branch) {
    return null
  }
  if (gitState.dirtyCount === 0) {
    return null  // 干净仓库：隐藏此 segment
  }
  return (
    <Text color="yellow">
      📁 +{gitState.dirtyCount}
    </Text>
  )
}
