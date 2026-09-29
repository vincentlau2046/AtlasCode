// core/orchestrator/api.ts — Orchestrator 公共接口定义 (A1.1)
// 类型直接镜像 query.ts:179 的 QueryParams 签名与 loop.ts 的 10 条 return 路径,
// 零偏差。Phase A 完成后 query() 内部改造为 Orchestrator.execute(),签名不变。

import type { Message } from '../../types/message.js'
import type {
  StreamEvent,
  RequestStartEvent,
  TombstoneMessage,
  ToolUseSummaryMessage,
} from '../../types/message.js'
import type { SystemPrompt } from '../../utils/systemPromptType.js'
import type { ToolUseContext } from '../../Tool.js'
import type { QueryDeps } from './query/deps.js'

// ── CanUseToolFn 镜像（来自 Tool.ts，避免循环依赖此处重新声明） ──
type CanUseToolFn = (toolName: string, input: object, options: { canUseTool?: boolean }) => Promise<boolean>

// ── 输入 ──
// 镜像 QueryParams (query.ts:179), 13 字段一一对应。
export interface OrchestrationRequest {
  messages: Message[]
  systemPrompt: SystemPrompt
  userContext: { [k: string]: string }
  systemContext: { [k: string]: string }
  canUseTool: CanUseToolFn
  toolUseContext: ToolUseContext
  fallbackModel?: string
  querySource: string
  maxOutputTokensOverride?: number
  maxTurns?: number
  skipCacheWrite?: boolean
  toolChoice?: { type: 'auto' | 'any' | 'tool'; name?: string }
  taskBudget?: { total: number }
  deps?: QueryDeps
}

// ── 事件（yield 类型） ──
// 镜像 query() 的 AsyncGenerator 泛型参数 (loop.ts:223-229)。
export type OrchestrationEvent =
  | StreamEvent
  | RequestStartEvent
  | Message
  | TombstoneMessage
  | ToolUseSummaryMessage

// ── 输出（return 类型） ──
// 从 loop.ts 的 12 处 return { reason: ... } 提取,压缩为 10 个判别变体
// (同一 reason 多处 return 合并; 'completed' 2 处, 'image_error' 2 处,
//  'prompt_too_long' 2 处)。
export type OrchestrationResult =
  | { reason: 'completed' }
  | { reason: 'max_turns'; turnCount: number }
  | { reason: 'prompt_too_long' }
  | { reason: 'image_error' }
  | { reason: 'model_error'; error: Error }
  | { reason: 'stop_hook_prevented' }
  | { reason: 'blocking_limit' }
  | { reason: 'aborted_streaming' }
  | { reason: 'aborted_tools' }
  | { reason: 'hook_stopped' }

// ── Orchestrator 接口 ──
export interface Orchestrator {
  execute(
    request: OrchestrationRequest,
  ): AsyncGenerator<OrchestrationEvent, OrchestrationResult>
}

// ── 依赖注入 ──
export interface OrchestratorDependencies {
  callModel: QueryDeps['callModel']
  microcompact: QueryDeps['microcompact']
  autocompact: QueryDeps['autocompact']
  uuid: () => string
}
