/**
 * Defer 挂起常驻提示行（0.1.102 P0 切片 2-C，工单「C = AD-45 defer 挂起
 * 可视化」）。
 *
 * 消费面 = AgentLoopResult.deferred 单源（lock-face ①禁第二 defer 判定实现）：
 * loop 以 deferred 终态 settle（pre-hook 'defer' 裁定 → mergeHookPermission
 * defer 支 → 挂起不产 tool_result）后，REPL 置挂起态并挂本提示行——
 * 常驻（挂起态存活期间恒渲染，非逐帧转瞬）+ 超时提示（DEFER_SUSPEND_TIMEOUT_HINT_MS
 * 后追加「已挂起 Ns 未见重评」）+ Esc 消行（提示面中止，非回合中止——
 * loop 已 settle 无在途回合）。
 *
 * React-free 红线不适用（tui 域组件）；纯文本计算 deferSuspendHintText
 * 导出供判别单测（工单判据格「defer 挂起 → 提示行格」）。
 */
import { Box, Text, useInput } from '../ink.js'
import { useEffect, useState } from 'react'

/** 挂起超时提示阈值：超过此时长未见重评 → 提示行追加超时注记。 */
export const DEFER_SUSPEND_TIMEOUT_HINT_MS = 60_000

/** 提示行文本纯函数（判别单测面）。<60s 无超时注记；≥60s 追加已挂起时长。 */
export function deferSuspendHintText(
  toolName: string,
  reason: string,
  elapsedMs: number,
): string {
  const base = `⏸ 等待权限裁定：${toolName}${reason ? `（${reason}）` : ''} —— 发送消息可重评，Esc 中止`
  if (elapsedMs < DEFER_SUSPEND_TIMEOUT_HINT_MS) return base
  return `${base} · 已挂起 ${Math.floor(elapsedMs / 1000)}s 未见重评`
}

export type DeferSuspension = {
  toolName: string
  reason: string
  sinceMs: number
}

/**
 * 常驻提示行：挂起期间恒渲染；1s 心跳驱动超时注记；Esc = 消行（onDismiss，
 * 仅提示面——挂起态本身由下一次 query 重评自然消除）。
 */
export function DeferSuspendHint({
  suspension,
  onDismiss,
}: {
  suspension: DeferSuspension
  onDismiss: () => void
}): React.ReactNode {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  useInput(
    (_input, key) => {
      if (key.escape) onDismiss()
    },
    { isActive: true },
  )
  const text = deferSuspendHintText(
    suspension.toolName,
    suspension.reason,
    Math.max(0, nowMs - suspension.sinceMs),
  )
  return (
    <Box flexDirection="column" width="100%">
      <Text color="yellow">{text}</Text>
    </Box>
  )
}
