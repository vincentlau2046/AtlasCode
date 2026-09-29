// core/orchestrator/context/defaultManager.ts — DefaultContextManager (A3a)
// 纯决策器: 返回 CompactionDirective,不执行 yield/return/continue。
// A3a: shouldPreCompact 用回调注入 P1 逻辑,避免内联 215 行依赖。
// A3b/A3c 逐步补齐 shouldPostCompact / recoverFromError。

import type { Message } from '../../../types/message.js'
import type { CompactionDirective, ContextManager, LoopStateSnapshot } from './manager.js'

// P1 逻辑回调签名: 接收 state + messages,返回 directive。
// 实际 P1 逻辑仍保留在 loop.ts 中(作为独立函数),由构造时注入。
export type PreCompactFn = (
  state: LoopStateSnapshot,
  messages: Message[],
) => Promise<CompactionDirective>

export type PostCompactFn = (
  state: LoopStateSnapshot,
  messages: Message[],
) => Promise<CompactionDirective>

export type RecoverFromErrorFn = (
  state: LoopStateSnapshot,
  messages: Message[],
  errorType: 'prompt_too_long' | 'image_error' | 'model_error' | 'max_output_tokens',
) => Promise<CompactionDirective>

export interface DefaultContextManagerDeps {
  preCompact: PreCompactFn
  postCompact?: PostCompactFn
  recoverFromError?: RecoverFromErrorFn
}

/**
 * DefaultContextManager — ContextManager 的默认实现。
 *
 * A3a 阶段: shouldPreCompact 通过回调委托 P1 逻辑。
 * A3b 阶段: shouldPostCompact 通过回调委托 P4 逻辑。
 * P4 实际压缩交互仅 3 处:
 *   #16 行1544: tracking.turnCounter++ + logEvent (post-autocompact turn 跟踪)
 *   #17 行274:  autoCompactTracking 重置 (下一轮 streaming 前在 P1 中处理)
 *   #18:        yield boundary (由 P1 的 compactionResult 驱动,非 P4 独立 yield)
 * P4 没有独立的 yield/return/continue——仅 tracking 更新 + analytics 事件。
 *
 * 后续 A3c 逐步将 P2+P3 逻辑也提取为独立函数注入。
 */
export class DefaultContextManager implements ContextManager {
  constructor(private deps: DefaultContextManagerDeps) {}

  async shouldPreCompact(
    state: LoopStateSnapshot,
    messages: Message[],
  ): Promise<CompactionDirective> {
    return this.deps.preCompact(state, messages)
  }

  async shouldPostCompact(
    state: LoopStateSnapshot,
    messages: Message[],
  ): Promise<CompactionDirective> {
    if (this.deps.postCompact) {
      return this.deps.postCompact(state, messages)
    }
    // A3b: P4 无独立压缩决策——仅 tracking 更新,不改变 messagesForQuery
    // tracking.turnCounter++ 和 logEvent 留在主循环(副作用,非决策)
    return {
      action: 'proceed',
      messagesForQuery: messages,
      statePatch: state.autoCompactTracking?.compacted
        ? {
            autoCompactTracking: {
              ...state.autoCompactTracking,
              turnCounter: state.autoCompactTracking.turnCounter + 1,
            },
          }
        : undefined,
    }
  }

  async recoverFromError(
    state: LoopStateSnapshot,
    messages: Message[],
    errorType: 'prompt_too_long' | 'image_error' | 'model_error' | 'max_output_tokens',
  ): Promise<CompactionDirective> {
    if (this.deps.recoverFromError) {
      return this.deps.recoverFromError(state, messages, errorType)
    }
    // A3c: P2+P3 逻辑与 loop.ts 局部变量深度耦合(~20 个:
    // streamingToolExecutor, assistantMessages, toolResults, tracking,
    // taskBudgetRemaining, messagesForQuery, contextCollapse, reactiveCompact 等),
    // 无法作为独立函数抽离。接口+回调注入已就位,
    // 实际 P2+P3 逻辑在主循环改造为 Orchestrator.execute() 时内联提取。
    //
    // 9 处交互点(P2 行905-1018 / P3 行1083-1240):
    //   #7  行925: hasAttemptedReactiveCompact → 读
    //   #8  行942: state = { hasAttemptedReactiveCompact: true, ... }
    //   #9  行960: yield createSystemMessage (fallback 通知)
    //   #10 行971: state = { transition: undefined, ... } → C1 continue
    //   #11 行1136: state = { transition: collapse_drain_retry, ... } → C2 continue
    //   #12 行1170: yield postCompactMessages (boundary)
    //   #13 行1186: state = { hasAttemptedReactiveCompact: true, ... } → C3 continue
    //   #14 行1196: return { reason: 'prompt_too_long' | 'image_error' }
    //   #15 行1241: state = { maxOutputTokensOverride: ESCALATED, ... } → C4 continue
    //
    // 默认不恢复——主循环自行处理错误恢复逻辑。
    return { action: 'proceed', messagesForQuery: messages }
  }
}
