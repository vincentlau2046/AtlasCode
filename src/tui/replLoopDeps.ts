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
import type { RoundContextRefresh, Message } from 'src/engine'
import type { appendSystemContext } from './utils/api'
import type { ToolUseContext, Tools } from './Tool'
import type { CanUseToolFn } from './hooks/useCanUseTool'
import { assembleToolPool } from './tools.js'
import {
  createAttachmentMessage,
  getDeferredToolsDeltaAttachment,
  getMcpInstructionsDeltaAttachment,
} from './utils/attachments.js'
import type { MCPServerConnection } from './services/mcp/types.js'

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
  /**
   * 0.1.62 /goal（CC 2.1.139）：goal 续跑轮次硬上限覆写（缺省 =
   * DEFAULT_MAX_GOAL_TURNS；透传 buildAgentLoopParams → args.context）。
   */
  maxGoalTurns?: number
}

/** queryEngineLoopStream 入参（deps + args）。= AgentLoopParams（通用型）。 */
export type ReplLoopParams = AgentLoopParams

/**
 * 构造 REPL 活链路 engine loop 入参（deps + args）= 通用装配体 REPL 特化
 * （unboundedTurns 恒 true；mainLoopModel 显式）。纯函数（判别单测面）。
 */
export function buildReplLoopParams(m: ReplLoopMaterials): ReplLoopParams {
  // 0.1.81 V3-2 K2 #13：REPL 车道回合前上下文刷新缝——压缩后/loop 中段迟连
  // server 的工具/指令即时注入（压缩时刻已连 server 无缺口：三触发面同构走
  // composePostCompactAttachments 三 delta 重宣告，0.1.68 F-1 已落；残余缝 =
  // loop 入口捕获 args.tools 数组引用 + system prompt 静态 → 迟连面滞留下
  // 一条 user message）。工具面 = assembleToolPool 活态重装配（REPL 池本就
  // = assembleToolPool 产物，useMergedTools 单一事实源，重装配同源幂等）；
  // 指令面 = mcp_instructions_delta / deferred_tools_delta 附件（delta 门 OFF
  // 时两 helper 恒 [] → 仅工具面刷新；门 OFF 的 system prompt 指令面不
  // per-round 重建 = C 类登记，迟连指令仍等下 user turn）。防抖 = 工具名序
  // 无变化且无 delta → null（不换池引用，保 prompt-cache 稳定）。闭包落本
  // 包装（非 agentLoopDeps）= 防 tools.ts 模块环；子 loop 族（runAgent
  // per-agent 受限域池 #10）不注入本缝 = 缺省零行为。
  let prevPoolSig = ((m.tools as unknown as Tools) ?? [])
    .map(t => t.name)
    .join(',')
  const refreshRoundContext = (
    messages: readonly Message[],
  ): RoundContextRefresh | null => {
    // 活态 MCP 工具读面（appState.mcp.tools = useMergedTools 同源）；缺省
    // （无活 appState / 无 mcp 面）= null 不刷新
    const appState = m.toolUseContext?.getAppState?.() as
      | { mcp?: { tools?: Tools } }
      | undefined
    const liveMcpTools = appState?.mcp?.tools
    if (!liveMcpTools) return null
    const pool = assembleToolPool(
      m.toolPermissionContext as unknown as Parameters<
        typeof assembleToolPool
      >[0],
      liveMcpTools,
    )
    const sig = pool.map(t => t.name).join(',')
    const tuiMessages =
      messages as unknown as Parameters<typeof getMcpInstructionsDeltaAttachment>[3]
    const atts = [
      ...getDeferredToolsDeltaAttachment(pool, m.mainLoopModel, tuiMessages, {
        callSite: 'round_refresh',
        querySource: m.querySource,
      }),
      ...getMcpInstructionsDeltaAttachment(
        (m.toolUseContext.options as { mcpClients?: MCPServerConnection[] })
          .mcpClients ?? [],
        pool,
        m.mainLoopModel,
        tuiMessages,
      ),
    ]
    if (sig === prevPoolSig && atts.length === 0) return null
    prevPoolSig = sig
    return {
      tools: pool as unknown as RoundContextRefresh['tools'],
      ...(atts.length > 0
        ? {
            appendedMessages: atts.map(att =>
              createAttachmentMessage(att),
            ) as unknown as NonNullable<RoundContextRefresh['appendedMessages']>,
          }
        : {}),
    }
  }
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
    maxGoalTurns: m.maxGoalTurns,
    // 0.1.81 V3-2 K2 #13：REPL 车道回合前上下文刷新缝注入（见上方闭包）
    refreshRoundContext,
  })
}
