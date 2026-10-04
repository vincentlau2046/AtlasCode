// Role-fallback segment——P0b① 信任线「已从 X 回退到 Y」
// 水平回退（premium→fast/small 等）发生时，状态栏可见"谁实际在答"。
//
// 数据源：src/modelprovider 的 getLastRoleFallback()。queryWithRoleFallback 成功侧写入：
// primary 成功 → 清除（无活跃回退）；fallback 成功 → 记录 { from, to }。
// 纯读 at-render（无 hook，hook 安全）；无活跃回退 → 返回 null（SegmentHost 不渲染分隔符）。
// modelprovider 层零 TUI 依赖（engine-adjacent 红线不破）——本段只是其只读消费者。

import * as React from 'react'
import { Text } from '../../../ink.js'
import { getLastRoleFallback } from 'src/modelprovider'
import { type SegmentComponent } from './types.js'

export const RoleFallbackSegment: SegmentComponent = () => {
  const fb = getLastRoleFallback()
  if (!fb) return null
  // 回退=降级信号（首选角色失败，实际由更小角色在答）→ warning 黄（§4.3 色阶）
  return (
    <Text color="yellow">
      已从 {fb.from} 回退到 {fb.to}
    </Text>
  )
}
