// Model segment——显示当前模型名
// 数据源：input.model.display_name（buildStatusLineCommandInput 已提供）
//
// B1（2026-10-05 §4b，P0b① 持续监控）：水平回退信任线折入本段——独立
// role-fallback segment 删除。getLastRoleFallback() 非空（fallback 成功，
// 实际由更小角色在答）时尾部追加黄色 ` ↦ {to}`（spec 示例形：
// `⚡ deepseek-v4-pro ↦ fast`；from 即段首显示的模型名，不重复）。
// 回退=降级信号（首选角色失败）→ warning 黄（§4.3 色阶）。
// 数据源：src/modelprovider 纯 leaf store 只读面（queryWithRoleFallback
// 成功侧写入：primary 成功→清除，fallback 成功→记录 {from,to}）。
// 纯读 at-render（无 hook，hook 安全）；无活跃回退 → 无尾标（不留残余）。
// modelprovider 层零 TUI 依赖（engine-adjacent 红线不破）——本段只是其只读消费者。

import * as React from 'react'
import { Text } from '../../../ink.js'
import { getLastRoleFallback } from 'src/modelprovider'
import type { SegmentComponent } from './types.js'

export const ModelSegment: SegmentComponent = ({ input }) => {
  const name = input.model?.display_name ?? 'unknown'
  const fb = getLastRoleFallback()
  return (
    <Text color="cyan">
      ⚡ {name}
      {fb && <Text color="yellow"> ↦ {fb.to}</Text>}
    </Text>
  )
}
