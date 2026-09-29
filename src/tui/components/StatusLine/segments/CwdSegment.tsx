// Cwd segment——显示当前工作目录（~ 缩写全路径）
// basename 太短，多项目时无法区分；全路径信息完整，~ 缩写保持简短

import * as React from 'react'
import { Text } from '../../../ink.js'
import { homedir } from 'os'
import { getCwd } from '../../../utils/cwd.js'
import type { SegmentComponent } from './types.js'

export const CwdSegment: SegmentComponent = () => {
  const cwd = getCwd()
  const home = homedir()

  // ~ 缩写：home 前缀替换为 ~
  const display = cwd.startsWith(home)
    ? '~' + cwd.slice(home.length)
    : cwd

  return (
    <Text dimColor>
      ⌂ {display}
    </Text>
  )
}
