// Thinking level segment——显示当前 effort/thinking 级别
// 数据源：AppState.effortValue → getDisplayedEffortLevel
// 级别：low / medium / high / max（显示为 🧠low / 🧠med / 🧠high / 🧠xhigh）

import * as React from 'react'
import { useSyncExternalStore } from 'react'
import { Text } from '../../../ink.js'
import { useAppState } from '../../../state/AppState.js'
import { getRuntimeMainLoopModel } from '../../../utils/model/model.js'
import { getDisplayedEffortLevel, type EffortValue } from '../../../utils/effort.js'
import type { SegmentComponent } from './types.js'

// 级别缩写映射
const LEVEL_SHORT: Record<string, string> = {
  low: 'low',
  medium: 'med',
  high: 'high',
  max: 'xhigh',
}

export const ThinkingLevelSegment: SegmentComponent = () => {
  const effortValue = useAppState(s => s.effortValue) as EffortValue | undefined
  const mainLoopModel = useAppState(s => s.mainLoopModel)

  const level = getDisplayedEffortLevel(
    getRuntimeMainLoopModel({
      permissionMode: 'normal' as any,
      mainLoopModel: mainLoopModel ?? 'small',
      exceeds200kTokens: false,
    }),
    effortValue,
  )

  const short = LEVEL_SHORT[level] ?? level

  return (
    <Text color="magenta">
      🧠 {short}
    </Text>
  )
}
