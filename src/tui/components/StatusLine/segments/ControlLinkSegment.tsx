// ControlLink segment——状态栏内的文字提示（非可点击链接）
// 显示可用斜杠命令：/sessionlist
// 替代 Box onClick 方案（终端 click 不可靠）
// 密度切换（simple ⇄ detailed）走 meta+d / ctrl+shift+b / 状态栏左键，不占用斜杠命令

import * as React from 'react'
import { Text } from '../../../ink.js'
import type { SegmentComponent } from './types.js'

export const ControlLinkSegment: SegmentComponent = () => {
  return (
    <Text dimColor>🔗 /sessionlist</Text>
  )
}
