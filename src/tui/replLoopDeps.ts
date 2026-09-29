/**
 * W3-3b（§8.74.15）→ W3-3c（§8.74.18）：REPL 活链路装配 = 子 loop 通用装配体
 * （agentLoopDeps buildAgentLoopParams）的 REPL 特化包装（unboundedTurns 恒
 * true = 旧 REPL 无轮次上限保真；mainLoopModel 显式传入 = REPL mainLoopModelParam）。
 *
 * 面映射裁定（§8.74.15 ①，旧 orchestrator loop.ts 逐字）与装配体细节 =
 * agentLoopDeps.ts 头注（单一事实源移此；本包装零新增逻辑）。
 *
 * 生产消费 = REPL onQueryImpl（for await query(...) 面换 queryEngineLoopStream
 * + 本装配产物）；判别单测面 = buildReplLoopParams 纯函数
 * （tests/unit/repl-loop-deps.test.ts R-1..R-5 不变）。
 */
import {
  buildAgentLoopParams,
  type AgentLoopParams,
} from './agentLoopDeps'
import type { appendSystemContext } from './utils/api'
import type { ToolUseContext } from './Tool'
import type { CanUseToolFn } from './hooks/useCanUseTool'

/** REPL 活态装配原料（onQueryImpl 作用域内可得的活态值）。 */
export interface ReplLoopMaterials {
  /**
   * 全量消息序列（messagesIncludingNewMessages，tui MessageType 形）。入参面
   * 宽化 = unknown[]（装配体内部 cast 到 engine Message 面——REPL .tsx 侧
   * 零 cast，判别单测可传任意消息数组）。
   */
  messages: readonly unknown[]
  /** userContext（baseUserContext + coordinator 面，{[k]:string}）。 */
  userContext: Record<string, string>
  /** buildEffectiveSystemPrompt 产物（SystemPrompt）。 */
  systemPrompt: Parameters<typeof appendSystemContext>[0]
  /** getSystemContext 产物（{[k]:string}）。 */
  systemContext: Record<string, string>
  /** 本 turn 模型可见工具池（freshTools，入参面宽化 = 装配体内部 cast）。 */
  tools: unknown
  /** 会话主模型（mainLoopModelParam）。 */
  mainLoopModel: string
  /** skill 级 effort 覆写（本 turn 作用域）。 */
  effort?: string | number
  /** 取消信号（abortController.signal）。 */
  signal?: AbortSignal
  /**
   * 活 TPC（store.toolPermissionContext 闭包值，tui DeepImmutable 形）。入参面
   * 宽化 = unknown（跨域 cast 单点在 loopPermissionBridge 内）。
   */
  toolPermissionContext: unknown
  /** 活 TPC 读面（() => toolUseContext.getAppState()；活读 store 活 TPC）。 */
  getAppState?(): { toolPermissionContext: unknown }
  /** TUI 交互权限权威（useCanUseTool 产物）。 */
  canUseTool: CanUseToolFn
  /** 本 turn 的 ToolUseContext。 */
  toolUseContext: ToolUseContext
  /** querySource（getQuerySourceForREPL()）。 */
  querySource: string
}

/** queryEngineLoopStream 入参（deps + args）。= AgentLoopParams（通用型）。 */
export type ReplLoopParams = AgentLoopParams

/**
 * 构造 REPL 活链路 engine loop 入参（deps + args）= 通用装配体 REPL 特化
 * （unboundedTurns 恒 true；mainLoopModel 显式）。纯函数（判别单测面）。
 */
export function buildReplLoopParams(m: ReplLoopMaterials): ReplLoopParams {
  return buildAgentLoopParams({
    messages: m.messages,
    userContext: m.userContext,
    systemPrompt: m.systemPrompt,
    systemContext: m.systemContext,
    tools: m.tools,
    mainLoopModel: m.mainLoopModel,
    effort: m.effort,
    signal: m.signal,
    toolPermissionContext: m.toolPermissionContext,
    getAppState: m.getAppState,
    canUseTool: m.canUseTool,
    toolUseContext: m.toolUseContext,
    querySource: m.querySource,
    unboundedTurns: true,
  })
}
