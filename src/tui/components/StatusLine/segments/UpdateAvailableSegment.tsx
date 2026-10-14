// 0.1.71 块 B：状态行「新版本可用」nudge segment（StatusLine 通道 B 原生段）。
//
// 渲染条件（恒等锚：默认不显形，仅当 npm latest 严格大于当前版本时）：
//  - 订阅 updateStore 的 latest；latest 更新于 getVersion()（当前版本）→
//    渲染「新版本 X 可用（当前 Y）· <升级命令行>」（B-2 registry 段必在场）。
//  - 同版本 / 检查失败（latest=null）/ 仍在检查 → null（不留分隔符残余，
//    对齐 SegmentHost「空 segment 不留分隔符」约定）。
//
// 首帧 mount 触发一次 refreshUpdateState()（ref-guard，对齐 GitCombinedSegment）
// = 工单 B-1「启动触发」；24h 磁盘缓存（updateStore→updateCheck）使重复刷新廉价。

import * as React from 'react'
import { useSyncExternalStore } from 'react'
import { Text } from '../../../ink.js'
import type { SegmentComponent } from './types.js'
import {
  subscribeToUpdateState,
  getUpdateSnapshot,
  refreshUpdateState,
} from './updateStore.js'
import { getUpdateNudgeText } from '../../../utils/updateCheck.js'
import { getVersion } from 'src/shared'

export const UpdateAvailableSegment: SegmentComponent = () => {
  const updateState = useSyncExternalStore(subscribeToUpdateState, getUpdateSnapshot)

  // 首帧 mount 触发版本检查（ref-guard：仅一次，避免每渲染重触发）
  const started = React.useRef(false)
  if (!started.current) {
    started.current = true
    void refreshUpdateState()
  }

  // 仍在检查 / 同版本 / 检查失败 → null（nudge 缺席，恒等锚）
  if (updateState.loading) return null
  const nudge = getUpdateNudgeText(getVersion(), updateState.latest)
  if (!nudge) return null

  return (
    <Text color="yellow">
      {nudge}
    </Text>
  )
}
