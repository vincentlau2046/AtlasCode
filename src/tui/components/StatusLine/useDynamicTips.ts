// Dynamic operation tips for status line right-aligned area.
// Shows context-sensitive tips based on current app state,
// or cycles through common command hints when idle.

import { useEffect, useRef, useState } from 'react'
import type { Message } from '../../types/message.js'

// ── Tip pool (idle rotation) ────────────────────────────────────

interface Tip {
  text: string
  key: string
}

const IDLE_TIPS: Tip[] = [
  { text: '/model 切换模型', key: 'model' },
  { text: '/help 查看全部命令', key: 'help' },
  { text: '/clear 清屏', key: 'clear' },
  { text: '/sessionlist 会话列表', key: 'session' },
  { text: 'ctrl+d 退出', key: 'exit' },
  { text: 'Esc Esc 清空输入', key: 'clear-input' },
]

const ROTATION_MS = 12_000

// ── Helper: detect if a query is in progress ────────────────────

function isUserMessage(m: Message): boolean {
  return m.role === 'user'
}

function isAssistantMessage(m: Message): boolean {
  return m.role === 'assistant'
}

/**
 * Returns true when the last visible user message has no corresponding
 * assistant response yet — i.e., a query is running.
 */
function isStreaming(messages: readonly Message[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (isAssistantMessage(m)) return false
    if (isUserMessage(m)) return true
  }
  return false
}

// ── Hook ────────────────────────────────────────────────────────

export function useDynamicTip(
  messagesRef: React.RefObject<readonly Message[] | null>,
): string | null {
  const [idleIndex, setIdleIndex] = useState(0)

  // Always call useEffect (React rules of hooks — no conditional hooks)
  useEffect(() => {
    const timer = setInterval(() => {
      setIdleIndex(prev => (prev + 1) % IDLE_TIPS.length)
    }, ROTATION_MS)
    return () => clearInterval(timer)
  }, [])

  // Context-sensitive override (safe to have conditional returns AFTER all hooks)
  const messages = messagesRef.current ?? []
  if (isStreaming(messages)) {
    return 'Esc 中断'
  }

  // Idle: show current rotation tip
  if (idleIndex >= IDLE_TIPS.length) return null
  return IDLE_TIPS[idleIndex].text
}

// ── Render helper ───────────────────────────────────────────────

const PREFIX_CHAR = '·'

export function formatTip(tip: string | null): string | null {
  if (!tip) return null
  return `${PREFIX_CHAR} ${tip}`
}