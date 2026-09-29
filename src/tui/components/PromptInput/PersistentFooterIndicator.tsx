// 右栏持久槽位——effort 与智能 tip 共用一个常驻显示位
//
// 优先级：effort 通知（启动/切换 effort 后占 12s）> 流式中断提示 > 空闲 tip 轮播。
// 槽位始终在右栏（真正右对齐到终端边），替代旧方案里困在 StatusLine 左栏
// 够不到右边的 flexGrow spacer，以及走通知队列 12s 后消失的 effort 通知。
//
// 设计要点：
// - effort 计时器自包含，不碰通知队列（Notifications.tsx 是 React Compiler
//   编译产物，不动它；effort 不再进队列，避免双显）。
// - 复用 useDynamicTip / formatTip / getEffortNotificationText，零逻辑重复。
// - effortValue / mainLoopModel 直接从 AppState 读（与 ThinkingLevelSegment 同模式）。

import { useEffect, useState } from 'react'
import type { Message } from '../../types/message.js'
import { useAppState } from '../../state/AppState.js'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { Box, Text } from '../../ink.js'
import { getEffortNotificationText } from '../EffortIndicator.js'
import { useDynamicTip, formatTip } from '../StatusLine/useDynamicTips.js'

type Props = {
  /** 消息 ref（useDynamicTip 据此判断流式中断态） */
  messagesRef: React.RefObject<readonly Message[] | null>
}

const EFFORT_DISPLAY_MS = 12_000

export function PersistentFooterIndicator({ messagesRef }: Props): React.ReactNode {
  const effortValue = useAppState(s => s.effortValue)
  const mainLoopModel = useMainLoopModel()
  const tip = useDynamicTip(messagesRef)
  const effortText = getEffortNotificationText(effortValue, mainLoopModel)

  // effort 文本变化（启动初始 / /effort 切换）时（重新）点亮 12s 窗口
  const [showEffort, setShowEffort] = useState(false)
  useEffect(() => {
    if (!effortText) {
      setShowEffort(false)
      return
    }
    setShowEffort(true)
    const timer = setTimeout(() => setShowEffort(false), EFFORT_DISPLAY_MS)
    return () => clearTimeout(timer)
  }, [effortText])

  const text = showEffort && effortText ? effortText : formatTip(tip)
  if (!text) return null
  return (
    <Box flexShrink={0}>
      <Text dimColor wrap="truncate">{text}</Text>
    </Box>
  )
}
