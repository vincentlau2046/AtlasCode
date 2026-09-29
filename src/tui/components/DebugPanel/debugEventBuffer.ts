// 调试事件环形 buffer——tool_call / tool_result 事件流
// 17-TUI设计方案 §9.6：独立模块级 ring buffer（不走 AppState，避免高频写拖累订阅者）
// 仿 SandboxEventBus 模式 + DevBar useInterval 轮询取数

import { createSignal } from '../../utils/signal.js'

export interface DebugEvent {
  type: 'tool_call' | 'tool_result' | 'error'
  toolName: string
  toolUseId: string
  timestamp: number
  /** tool_result 的耗时（ms），仅 tool_result 有 */
  durationMs?: number
  /** tool_result 的退出码或状态，仅 tool_result 有 */
  status?: 'success' | 'error'
  /** 截断的输入摘要（前 80 字符） */
  inputSummary?: string
  /** 截断的输出摘要（前 80 字符） */
  outputSummary?: string
}

const MAX_EVENTS = 256
const buffer: DebugEvent[] = []
let head = 0  // 下一个写入位置
let count = 0  // 当前元素数
const eventSignal = createSignal()

/** 推入一个事件（环形覆盖旧数据） */
export function pushDebugEvent(event: DebugEvent): void {
  buffer[head] = event
  head = (head + 1) % MAX_EVENTS
  if (count < MAX_EVENTS) count++
  eventSignal.emit()
}

/** 取最近 N 条事件（按时间倒序，最新的在前） */
export function getRecentDebugEvents(n: number = 20): DebugEvent[] {
  if (count === 0) return []
  const result: DebugEvent[] = []
  const startIdx = (head - 1 + MAX_EVENTS) % MAX_EVENTS
  for (let i = 0; i < Math.min(n, count); i++) {
    const idx = (startIdx - i + MAX_EVENTS) % MAX_EVENTS
    if (buffer[idx]) result.push(buffer[idx])
  }
  return result
}

/** useSyncExternalStore subscribe 接口 */
export const subscribeToDebugEvents = eventSignal.subscribe

/** useSyncExternalStore getSnapshot 接口（返回最近 20 条） */
export function getDebugEventSnapshot(): DebugEvent[] {
  return getRecentDebugEvents(20)
}

/** 清空 buffer（测试用） */
export function resetDebugBuffer(): void {
  buffer.length = 0
  head = 0
  count = 0
  eventSignal.clear()
}

/** 截断字符串到指定长度 */
export function truncateSummary(s: string, max: number = 80): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}
