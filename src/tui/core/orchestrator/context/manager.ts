// core/orchestrator/context/manager.ts — ContextManager 接口定义 (A1.2)
// 纯决策器:只返回 CompactionDirective,不执行 yield/return/continue。
// 18 处副作用点留在主循环,顺序不变。
// A3a-A3c 逐步将 loop.ts 的 4 段压缩交互代码抽离为 3 个方法。

import type { Message } from '../../../types/message.js'
import type { OrchestrationResult } from '../api.js'
import type { AutoCompactTrackingState } from './autoCompact.js'
import type { ToolUseContext } from '../../../Tool.js'

// ── 主循环 State 镜像(来自 loop.ts:206-219) ──
export interface LoopStateSnapshot {
  messages: Message[]
  toolUseContext: ToolUseContext
  autoCompactTracking: AutoCompactTrackingState | undefined
  maxOutputTokensRecoveryCount: number
  hasAttemptedReactiveCompact: boolean
  maxOutputTokensOverride: number | undefined
  pendingToolUseSummary: Promise<any> | undefined
  stopHookActive: boolean | undefined
  turnCount: number
  transition: any | undefined
  taskBudget?: { total: number }
}

// ── CompactionDirective 契约(副作用隔离) ──
// ContextManager 是纯决策器——只计算"该做什么"(返回 directive),
// 不执行"怎么做"(yield/return/continue 留在主循环)。
export type CompactionDirective =
  | { action: 'proceed'; messagesForQuery: Message[]; statePatch?: Partial<LoopStateSnapshot> }
  | { action: 'yield_boundaries'; messages: Message[]; messagesForQuery: Message[]; statePatch?: Partial<LoopStateSnapshot> }
  | { action: 'yield_tombstone'; message: Message; messagesForQuery: Message[]; statePatch?: Partial<LoopStateSnapshot> }
  | { action: 'continue'; statePatch: Partial<LoopStateSnapshot> }
  | { action: 'return_terminal'; result: OrchestrationResult }

// ── ContextManager 接口 ──
// 3 个方法对应 loop.ts 的 4 段压缩交互代码:
//   shouldPreCompact  → P1 (行580-660, streaming 前预检)
//   shouldPostCompact → P4 (行1455-1540, 工具执行后检查)
//   recoverFromError  → P2+P3 (行920-1240, 错误恢复)
export interface ContextManager {
  /**
   * P1: streaming 前决定是否需要 autoCompact。
   * 交互点 #1-6: 读 autoCompactTracking → yield boundary → 设 tracking → 扣 taskBudget → yield boundary
   */
  shouldPreCompact(state: LoopStateSnapshot, messages: Message[]): Promise<CompactionDirective>

  /**
   * P4: 工具执行后检查是否需要 autoCompact + microcompact。
   * 交互点 #16-18: 读 autoCompactTracking → 重置 → yield boundary
   */
  shouldPostCompact(state: LoopStateSnapshot, messages: Message[]): Promise<CompactionDirective>

  /**
   * P2+P3: 模型错误/prompt_too_long 后的 reactive compact 恢复。
   * 交互点 #7-15: 读 hasAttemptedReactiveCompact → yield boundary → continue(C1/C2/C3/C4) / return(prompt_too_long)
   */
  recoverFromError(
    state: LoopStateSnapshot,
    messages: Message[],
    errorType: 'prompt_too_long' | 'image_error' | 'model_error' | 'max_output_tokens',
  ): Promise<CompactionDirective>
}
