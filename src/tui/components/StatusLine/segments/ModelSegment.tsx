// Model segment——显示当前模型名
// 数据源：input.model.display_name（buildStatusLineCommandInput 已提供）

import * as React from 'react'
import { Text } from '../../../ink.js'
import type { SegmentComponent } from './types.js'

export const ModelSegment: SegmentComponent = ({ input }) => {
  const name = input.model?.display_name ?? 'unknown'
  return (
    <Text color="cyan">
      ⚡ {name}
    </Text>
  )
}
