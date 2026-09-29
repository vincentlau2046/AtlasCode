/**
 * W3-3b（§8.74.15）：REPL 活链路 → engine loop 活态装配（config 驱动构建器
 * createAgentLoopDeps 之外的第二条消费面——REPL 的 TPC/tools 是 React 活态
 * （store.getState()），进程启动期无法构建，故经 engine 原语活态装配）。
 *
 * 面映射裁定（§8.74.15 ①，旧 orchestrator loop.ts 逐字）：
 *   - systemPrompt + systemContext → asSystemPrompt(appendSystemContext(...))
 *     （旧 loop.ts:442-444）
 *   - userContext → prependUserContext(messages, userContext)（旧 loop.ts:631）
 *   - mainLoopModelParam → sessionModel pin（getRoleModels 池头）+ role 车道
 *     （modelToRole；roles.ts:147-148 会话主模型优先语义）
 *   - 无轮次上限（unboundedTurns）——旧 REPL queryLoop while(true) 无 maxTurns
 *     门（maxTurns 缺省 = 不截断，仅自然终止 / abort 止；engine 缺省 20 轮兜底
 *     仅 headless 消费，REPL 面显式置 unboundedTurns 保真）。
 *   - checkPermission = buildInteractiveGate（engine 门 + ask-bridge → TUI
 *     canUseTool 弹窗，§8.74.15 ④）
 *   - autoCompact = engine 裁剪版（contextWindow/maxOutput 经 resolveModel；
 *     summarize 经 modelProvider.chat 主模型；countTokens 经 modelprovider 门面；
 *     session-memory / reactive / collapse = W-opt 残留守，engine 头注登记）。
 *
 * 生产消费 = REPL onQueryImpl（for await query(...) 面换 queryEngineLoopStream
 * + 本装配产物）；判别单测面 = buildReplLoopParams 纯函数（fake modelProvider /
 * canUseTool，断言槽位透传 + 面映射，无 React 无 store 无网络）。
 */
import {
  getModelProvider,
  getRoleModels,
  resolveModel,
  modelToRole,
  HARD_DEFAULT_CONTEXT_WINDOW,
  type ModelRole,
} from 'src/modelprovider'
import {
  compactConversation,
  createLoopHooks,
  recordTranscript,
  recordContentReplacement,
  type AgentLoopArgs,
  type AgentLoopDeps,
  type AutoCompactDeps,
  type Message,
} from 'src/engine'
import { asSystemPrompt, type Tools } from 'src/shared'
import { getSessionId } from 'src/bootstrap'
import { appendSystemContext, prependUserContext } from './utils/api'
import { buildInteractiveGate } from './loopPermissionBridge'
import type { ToolUseContext } from './Tool'
import type { CanUseToolFn } from './hooks/useCanUseTool'

/** REPL 活态装配原料（onQueryImpl 作用域内可得的活态值）。 */
export interface ReplLoopMaterials {
  /**
   * 全量消息序列（messagesIncludingNewMessages，tui MessageType 形）。入参面
   * 宽化 = unknown[]（tui/shared Message 双向结构兼容，装配体内部 cast 到
   * engine Message 面——REPL .tsx 侧零 cast，判别单测可传任意消息数组）。
   */
  messages: readonly unknown[]
  /** userContext（baseUserContext + coordinator 面，{[k]:string}）。 */
  userContext: Record<string, string>
  /** buildEffectiveSystemPrompt 产物（SystemPrompt）。 */
  systemPrompt: Parameters<typeof appendSystemContext>[0]
  /** getSystemContext 产物（{[k]:string}）。 */
  systemContext: Record<string, string>
  /** 本 turn 模型可见工具池（freshTools，入参面宽化 = 装配体内部 cast 到 engine Tools）。 */
  tools: unknown
  /** 会话主模型（mainLoopModelParam）。 */
  mainLoopModel: string
  /** skill 级 effort 覆写（本 turn 作用域）。 */
  effort?: string | number
  /** 取消信号（abortController.signal）。 */
  signal?: AbortSignal
  /**
   * 活 TPC（store.toolPermissionContext 闭包值，tui DeepImmutable 形）。入参面
   * 宽化 = unknown（跨域 cast 单点在 loopPermissionBridge 内；本装配体只读
   * .mode 经窄 cast）。
   */
  toolPermissionContext: unknown
  /** 活 TPC 读面（() => toolUseContext.getAppState()；活读 store 活 TPC）。 */
  getAppState?(): { toolPermissionContext: unknown }
  /** TUI 交互权限权威（useCanUseTool 产物）。 */
  canUseTool: CanUseToolFn
  /** 本 turn 的 ToolUseContext。 */
  toolUseContext: ToolUseContext
  /** querySource（getQuerySourceForREPL()；autoCompact 递归守卫 + transcript persist 门）。 */
  querySource: string
}

/** queryEngineLoopStream 入参（deps + args）。 */
export interface ReplLoopParams {
  deps: AgentLoopDeps
  args: AgentLoopArgs
}

/**
 * 构造 REPL 活链路 engine loop 入参（deps + args）。纯函数（除 modelProvider
 * 单例读取外无 I/O）= 判别单测面。
 */
export function buildReplLoopParams(m: ReplLoopMaterials): ReplLoopParams {
  const modelProvider = getModelProvider()
  const role: ModelRole = modelToRole(m.mainLoopModel)
  const sessionModel = m.mainLoopModel

  // autoCompact 面（engine 裁剪版）：contextWindow / maxOutput 经 resolveModel
  // （池头 = 会话主模型 pin）；summarize 经 modelProvider.chat 主模型同车道
  // （旧 REPL compact 用 mainLoopModel）；countTokens 经 modelprovider 门面。
  const pool = getRoleModels(role, sessionModel)
  const resolved = pool.length > 0 ? resolveModel(pool[0]) : undefined
  const toolList = m.tools as unknown as Tools
  const countTokens = (msgs: Message[]) =>
    modelProvider.countTokens(role, sessionModel, msgs, toolList as unknown as any[])
  const autoCompact: AutoCompactDeps = {
    contextWindow: resolved?.contextWindow ?? HARD_DEFAULT_CONTEXT_WINDOW,
    maxOutputTokens: resolved?.maxTokens,
    countTokens,
    compact: (msgs) =>
      compactConversation(
        msgs,
        {
          summarize: async (compactMsgs, prompt) => {
            const resp = await modelProvider.chat({
              messages: [...compactMsgs, prompt],
              role,
              sessionModel,
              signal: m.signal,
            })
            const content = (resp as { message?: { content?: unknown } }).message
              ?.content
            const blocks = Array.isArray(content) ? content : []
            return blocks
              .filter((b): b is { type: string; text?: string } =>
                typeof b === 'object' && b !== null && (b as { type?: string }).type === 'text',
              )
              .map(b => b.text ?? '')
              .join('')
          },
          countTokens,
          keepRecent: 0,
        },
      ),
    querySource: m.querySource,
  }

  const deps: AgentLoopDeps = {
    modelProvider,
    role,
    // W3-3b（§8.74.15）：会话主模型 pin（getRoleModels 池头；未设 = 角色池原行为）
    sessionModel,
    signal: m.signal,
    // ④ 交互权限桥（engine 门 + ask → TUI canUseTool 弹窗）
    checkPermission: buildInteractiveGate({
      toolPermissionContext: m.toolPermissionContext,
      getAppState: m.getAppState,
      canUseTool: m.canUseTool,
      toolUseContext: m.toolUseContext,
    }),
    // ④ hooks 装配①（engine 生产路径；sessionId/permissionMode 活态）
    hooks: createLoopHooks({
      options: {
        sessionId: getSessionId(),
        permissionMode: (m.toolPermissionContext as { mode?: string }).mode,
        signal: m.signal,
      },
    }),
    // S-E3 A11：transcript 写面（engine session record 族；persist 门 querySource
    // 前缀判据在 loop 内）
    transcript: {
      record: (msgs) => recordTranscript(msgs as unknown as Parameters<typeof recordTranscript>[0]),
      recordContentReplacement: (recs) =>
        recordContentReplacement(
          recs as unknown as Parameters<typeof recordContentReplacement>[0],
        ),
    },
    // ① systemPrompt + systemContext 合并（旧 loop.ts:442-444 逐字）
    systemPrompt: asSystemPrompt(
      appendSystemContext(
        m.systemPrompt,
        m.systemContext,
      ),
    ),
    // D-5b：skill effort 覆写（EffortValue → string 槽；未设 = 模型缺省）
    effortValue: m.effort !== undefined ? String(m.effort) : undefined,
  }

  const args: AgentLoopArgs = {
    // ① userContext 前插 system-reminder（旧 loop.ts:631 逐字）
    messages: prependUserContext(
      m.messages as unknown as Parameters<typeof prependUserContext>[0],
      m.userContext,
    ),
    tools: toolList,
    context: {
      autoCompact,
      // 旧 REPL 无轮次上限保真（engine 缺省 20 轮兜底仅 headless）
      unboundedTurns: true,
    },
  }

  return { deps, args }
}
