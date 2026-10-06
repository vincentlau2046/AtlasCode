// 右栏持久槽位——effort 与智能 tip 共用一个常驻显示位
//
// 优先级：effort 通知（启动/切换 effort 后占 12s）> 流式中断提示 > 空闲 tip 轮播。
// 槽位始终在右栏（真正右对齐到终端边），替代旧方案里困在 StatusLine 左栏
// 够不到右边的 flexGrow spacer，以及走通知队列 12s 后消失的 effort 通知。
//
// 设计要点：
// - effort 计时器自包含，不碰通知队列（Notifications.tsx 是 React Compiler
//   编译产物，不动它；effort 不再进队列，避免双显）。
// - 复用 useDynamicTip / TIP_PREFIX / getEffortNotificationText，零逻辑重复。
// - D-3：闲时 tip 前缀 = 光核微符号 TIP_PREFIX（brand_mark 色），tip 正文仍 dim。
// - effortValue / mainLoopModel 直接从 AppState 读（与 ThinkingLevelSegment 同模式）。

import { useEffect, useState } from 'react'
import type { Message } from '../../types/message.js'
import { useAppState } from '../../state/AppState.js'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { Box, Text } from '../../ink.js'
import { getEffortNotificationText } from '../EffortIndicator.js'
import { useDynamicTip, TIP_PREFIX } from '../StatusLine/useDynamicTips.js'

type Props = {
  /** 消息 ref（useDynamicTip 据此判断流式中断态） */
  messagesRef: React.RefObject<readonly Message[] | null>
}

const EFFORT_DISPLAY_MS = 12_000

export function PersistentFooterIndicator({ messagesRef }: Props): React.ReactNode {
  const effortValue = useAppState(s => s.effortValue)
  // O-11（0.1.34，e2e O-11）：npm 安装提示（15s）在场期间右栏槽位整体让位——
  // 提示独占 footer 行（消 80 列三通道互挤 + 双色竞争；通道优先级 = 状态段 >
  // tips > 提示，截断序见 PromptInputFooter），15s 超时后 tips 自复轮播。
  const npmHintActive = useAppState(s => s.notifications.current?.key === 'npm-deprecation-warning')
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

  // O-11（0.1.34）：npm 提示在场 → 右栏（effort / 闲时 tip）让位，渲 null（不占右栏位；
  // 所有 hooks 已调完，早返不违 Rules of Hooks）
  if (npmHintActive) {
    return null
  }

  // effort 通知优先（dim 单串）；否则闲时 tip = 光核前缀（brand_mark 色）+ dim 正文。
  if (showEffort && effortText) {
    return (
      <Box flexShrink={0}>
        <Text dimColor wrap="truncate">{effortText}</Text>
      </Box>
    )
  }
  if (tip) {
    return (
      <Box flexShrink={0}>
        <Text color="brand_mark">{TIP_PREFIX}</Text>
        <Text dimColor wrap="truncate">
          {' '}
          {tip}
        </Text>
      </Box>
    )
  }
  return null
}
