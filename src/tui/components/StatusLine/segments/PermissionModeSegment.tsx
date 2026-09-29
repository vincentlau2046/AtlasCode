// PermissionMode segment——显示当前授权模式（复用系统 getModeConfig）
// symbol + shortTitle + color 全部来自 PermissionMode.ts，不引入新 icon 语义
// 与 PromptInputFooterLeftSide 等其他显示位置保持一致

import * as React from 'react'
import { Text } from '../../../ink.js'
import {
  permissionModeSymbol,
  permissionModeShortTitle,
  getModeColor,
} from '../../../utils/permissions/PermissionMode.js'
import type { SegmentComponent } from './types.js'

export const PermissionModeSegment: SegmentComponent = (ctx) => {
  const mode = ctx.input.permission_mode
  if (!mode) return null

  const symbol = permissionModeSymbol(mode as Parameters<typeof permissionModeSymbol>[0])
  const title = permissionModeShortTitle(mode as Parameters<typeof permissionModeShortTitle>[0])
  const color = getModeColor(mode as Parameters<typeof getModeColor>[0])

  // default 模式 symbol 为空，只显示文字（与系统一致）
  const text = symbol ? `${symbol} ${title}` : title

  return (
    <Text color={color}>
      {text}
    </Text>
  )
}
