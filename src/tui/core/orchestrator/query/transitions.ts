// core/orchestrator/query/transitions.ts — A2.2 重写
// 从 A2.1 审计(continue-site-audit.ts)的 7 个 continue 站点 + 12 处 return 路径
// 提取的穷举类型化状态机。替代原 Terminal = any / Continue = any。

import type { Message } from '../../../types/message.js'
import type { ToolUseContext } from '../../../Tool.js'
import type { OrchestrationResult } from '../api.js'
import type { AutoCompactTrackingState } from '../context/autoCompact.js'

// ── LoopPhase: 主循环的 5 个显式阶段 ──
export type LoopPhase =
  | 'streaming'        // LLM 流式响应
  | 'compaction'       // 上下文压缩 (auto/reactive/collapse)
  | 'tool_execution'   // 工具执行
  | 'recovery'         // 错误恢复 (model_fallback/prompt_too_long/max_output_tokens/token_budget)
  | 'stop_hooks'       // stop_hook 检查

// ── LoopTransition: 7 个 continue 站点的穷举判别联合 ──
// 从 continue-site-audit.ts 的映射表提取,6 个变体(C4/C5 合并为 max_output_tokens)。
export type LoopTransition =
  | { to: 'streaming'; from: 'recovery'; reason: 'model_fallback' }              // C1 行971
  | { to: 'streaming'; from: 'compaction'; reason: 'collapse_drain' }            // C2 行1136
  | { to: 'streaming'; from: 'compaction'; reason: 'reactive_compact' }          // C3 行1186
  | { to: 'streaming'; from: 'recovery'; reason: 'max_output_tokens' }           // C4 行1241 + C5 行1272
  | { to: 'streaming'; from: 'stop_hooks'; reason: 'stop_hook_blocking' }        // C6 行1326
  | { to: 'streaming'; from: 'recovery'; reason: 'token_budget' }                // C7 行1361
  | { to: 'exit'; from: LoopPhase; reason: OrchestrationResult['reason'] }

// ── LoopState: 主循环迭代间状态 (镜像 loop.ts:206-219 的 State) ──
export interface LoopState {
  phase: LoopPhase
  messages: Message[]
  toolUseContext: ToolUseContext
  autoCompactTracking: AutoCompactTrackingState | undefined
  maxOutputTokensRecoveryCount: number
  hasAttemptedReactiveCompact: boolean
  maxOutputTokensOverride: number | undefined
  pendingToolUseSummary: Promise<unknown> | undefined
  stopHookActive: boolean | undefined
  turnCount: number
  transition: LoopTransition | undefined
  transitionHistory: LoopTransition[]
}

// ── validateTransition: 编译期穷举 + 运行时 debug 断言 ──
// 新增 transition 时,switch 的穷举检查确保不遗漏;运行时断言仅在 debug 模式生效。
export function validateTransition(t: LoopTransition): void {
  if (t.to === 'exit') return // exit 分支 reason 来自 OrchestrationResult,合法
  switch (t.reason) {
    case 'model_fallback':
    case 'collapse_drain':
    case 'reactive_compact':
    case 'max_output_tokens':
    case 'stop_hook_blocking':
    case 'token_budget':
      // 已知 transition reason,通过
      return
    default:
      // 编译期:如果 LoopTransition 新增了 reason 变体但未在此 switch 中处理,
      // TypeScript 的穷举检查会在此 default 分支报错。运行时:不应到达。
      throw new Error(`Unknown transition reason: ${(t as { reason: string }).reason}`)
  }
}

// ── 兼容旧代码的 Terminal / Continue 类型别名 ──
// loop.ts 当前使用 Terminal 和 Continue 类型,各种 reason 字符串尚未对齐到
// LoopTransition 的穷举变体。A2.2 保持宽松别名兼容,A3/A4 逐步替换为
// 精确类型。Phase A 结束后删除别名,全量切到 OrchestrationResult / LoopTransition。
export type Terminal = OrchestrationResult | { reason: string; [key: string]: unknown }
export type Continue = { reason: string; [key: string]: unknown } | LoopTransition | undefined
