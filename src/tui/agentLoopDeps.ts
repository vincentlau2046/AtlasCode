/**
 * W3-3c（§8.74.18 S8-agent 族）：子 loop 通用活态装配（engine 原语活态装配
 * 的第三消费面——REPL 活态装配 replLoopDeps 之外的子 loop 族：subagent
 * （runAgent）/ forked（forkedAgent）/ hook agent（execAgentHook）/ 后台主
 * session（LocalMainSessionTask））。
 *
 * 与 replLoopDeps 的差异（其余装配体逐字同）：
 *   - mainLoopModel：缺省 = toolUseContext.options.mainLoopModel（旧
 *     orchestrator loop.ts:542 `mainLoopModel: toolUseContext.options
 *     .mainLoopModel` 逐字——子 loop 跑会话主模型车道）；显式传入 = REPL 面。
 *   - 轮次语义（旧 loop.ts:1617 `if (maxTurns && nextTurnCount > maxTurns)`
 *     逐字：maxTurns 未设 = 无轮次上限，非 engine 缺省 20 兜底）：
 *     maxTurns 显式设 → 截断门；均未设 → unboundedTurns=true（保真）；
 *     REPL 面（replLoopDeps 包装）恒 unboundedTurns=true。
 *   - transcript = 主 session recordTranscript sink（旧 productionDeps 同面：
 *     子 loop 的 loop 内 persist 走主 session 面，消费方自带 sidechain
 *     逐消息记录面不变，双写保真）。
 *
 * 生产消费 = W3-3c 子 loop 切换（runAgent/forkedAgent/execAgentHook/
 * LocalMainSessionTask 的 `for await (message of query(...))` 面换
 * queryEngineLoopStream + 本装配产物）；判别单测面 = buildAgentLoopParams
 * 纯函数（fake modelProvider / canUseTool，断言槽位透传 + 面映射）。
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
  getAutoCompactEnvOverrides,
  getAutoCompactCircuitFailures,
  MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES,
  mergeAutoCompactOverrides,
  recordTranscript,
  recordContentReplacement,
  tryReactiveCompact,
  type AgentLoopArgs,
  type AgentLoopDeps,
  type AutoCompactDeps,
  type Message,
} from 'src/engine'
import { getInitialSettings } from './utils/settings/settings.js'
import { asSystemPrompt, type Tools } from 'src/shared'
import { getSessionId } from 'src/bootstrap'
import { appendSystemContext, prependUserContext } from './utils/api'
import { buildInteractiveGate } from './loopPermissionBridge'
import type { ToolUseContext } from './Tool'
import type { CanUseToolFn } from './hooks/useCanUseTool'

/** 子 loop 通用活态装配原料。 */
export interface AgentLoopMaterials {
  /** 全量消息序列（tui MessageType 形；入参面宽化 = unknown[]，装配体内部 cast）。 */
  messages: readonly unknown[]
  /** userContext（{[k]:string}；hook agent 面 = {} 逐字）。 */
  userContext: Record<string, string>
  /** buildEffectiveSystemPrompt / 子 loop 系统提示（SystemPrompt）。 */
  systemPrompt: Parameters<typeof appendSystemContext>[0]
  /** systemContext（{[k]:string}；子 loop 可 = {} 逐字）。 */
  systemContext: Record<string, string>
  /** 模型可见工具池（入参面宽化 = 装配体内部 cast 到 engine Tools）。 */
  tools: unknown
  /** 会话主模型显式覆写（REPL 面 mainLoopModelParam；缺省 =
   *  toolUseContext.options.mainLoopModel，旧 loop.ts:542 逐字）。 */
  mainLoopModel?: string
  /** skill 级 effort 覆写。 */
  effort?: string | number
  /** 取消信号。 */
  signal?: AbortSignal
  /**
   * 活 TPC（tui DeepImmutable 形；入参面宽化 = unknown，跨域 cast 单点在
   * loopPermissionBridge 内）。
   */
  toolPermissionContext: unknown
  /** 活 TPC 读面（() => toolUseContext.getAppState()）。 */
  getAppState?(): { toolPermissionContext: unknown }
  /** 权限权威（REPL = useCanUseTool 弹窗；子 loop = 各自 auto-allow/deny 体）。 */
  canUseTool: CanUseToolFn
  /** 本 turn 的 ToolUseContext。 */
  toolUseContext: ToolUseContext
  /** querySource（子 loop = 'agent:<type>' / 'hook_agent' / 后台 session 面）。 */
  querySource: string
  /** 轮次上限（显式设 = 截断门；未设 + unboundedTurns 未设 = 无上限，旧语义）。 */
  maxTurns?: number
  /** 无轮次上限（REPL 保真面；子 loop 缺省由 maxTurns 缺省推导）。 */
  unboundedTurns?: boolean
}

/** queryEngineLoopStream 入参（deps + args）。 */
export interface AgentLoopParams {
  deps: AgentLoopDeps
  args: AgentLoopArgs
}

/**
 * 构造子 loop / REPL 活链路 engine loop 入参（deps + args）。纯函数（除
 * modelProvider 单例读取外无 I/O）= 判别单测面。
 */
export function buildAgentLoopParams(m: AgentLoopMaterials): AgentLoopParams {
  const modelProvider = getModelProvider()
  // 模型车道：显式覆写（REPL 面）缺省回落 toolUseContext.options.mainLoopModel
  const mainLoopModel =
    m.mainLoopModel ?? m.toolUseContext.options.mainLoopModel
  const role: ModelRole = modelToRole(mainLoopModel)
  const sessionModel = mainLoopModel

  // autoCompact 面（engine 裁剪版，replLoopDeps 同款装配体）
  const pool = getRoleModels(role, sessionModel)
  const resolved = pool.length > 0 ? resolveModel(pool[0]) : undefined
  const toolList = m.tools as unknown as Tools
  const countTokens = (msgs: Message[]) =>
    modelProvider.countTokens(
      role,
      sessionModel,
      msgs,
      toolList as unknown as any[],
    )
  // autoCompact 档位覆写（#250 concern 2：/autocompact 命令）：
  // settings.autoCompactWindow 档位（/autocompact 持久化 userSettings）⊕ env
  // 覆写（ATLAS_AUTOCOMPACT_PCT_OVERRIDE / ATLAS_AUTO_COMPACT_WINDOW /
  // DISABLE_COMPACT / DISABLE_AUTO_COMPACT）——mergeAutoCompactOverrides 纯
  // 合并（env 胜 settings；与 engine model-string 便捷形同一单一事实源，防
  // UI 阈值面与 loop 触发面两车道分裂）。
  const mergedAutoCompact = mergeAutoCompactOverrides(
    getAutoCompactEnvOverrides(),
    getInitialSettings().autoCompactWindow,
  )
  const autoCompact: AutoCompactDeps = {
    contextWindow: resolved?.contextWindow ?? HARD_DEFAULT_CONTEXT_WINDOW,
    maxOutputTokens: resolved?.maxTokens,
    countTokens,
    enabled: mergedAutoCompact.autoCompactDisabled ? false : undefined,
    pctOverride: mergedAutoCompact.pctOverride,
    windowOverride: mergedAutoCompact.windowOverride,
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
            const content = (
              resp as { message?: { content?: unknown } }
            ).message?.content
            const blocks = Array.isArray(content) ? content : []
            return blocks
              .filter(
                (b): b is { type: string; text?: string } =>
                  typeof b === 'object' &&
                  b !== null &&
                  (b as { type?: string }).type === 'text',
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

  // D2（0.1.37 ③，P2 恢复层 C2 缺口）：断路器跳闸态模型侧告知（deepseek
  // NEVER_SENTENCE 模式——跳闸态下注入声明式一句话，告知模型 auto-compact
  // 不可用，防 futile 请求（模型不再发起注定超窗的长请求）；纯加性，仅
  // 跳闸态注入，未跳闸 = systemContext 原引用零改动，零行为面变更）。
  const circuitFailures = getAutoCompactCircuitFailures()
  const systemContext =
    circuitFailures >= MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES
      ? {
          ...m.systemContext,
          autoCompactCircuit: `Auto-compact is paused after ${circuitFailures} consecutive failures: respond concisely and avoid requests that expand the context — manual /compact, switching to a smaller model, or starting a new session are the recovery paths.`,
        }
      : m.systemContext

  const deps: AgentLoopDeps = {
    modelProvider,
    role,
    sessionModel,
    signal: m.signal,
    // D1（0.1.37 ③，P2 恢复层 C3 缺口）：413/PTL 反应式压缩消费者槽
    // （engine loop 消费点，CC query.ts:1119 同构）——宿主侧经 engine 门面
    // tryReactiveCompact 委托宿主体（contextBodies/reactiveCompact 全量
    // compactConversation 委托 + 内置门；highGapPorts port 未注册 = THROW，
    // 由 loop 消费点 consumer try/catch 兜底为「恢复不可用 → 回显原错误」，
    // fail-safe 零行为变更）。hasAttempted 恒 false：本回合一次性门在 engine
    // loop 消费点（reactiveRetried），闭包每至多调用一次（TUI 车道；headless
    // 车道经 createAgentLoopDeps 同槽注 engine 窄体消费者）。
    reactiveCompact: (params) =>
      tryReactiveCompact({
        hasAttempted: false,
        querySource: m.querySource,
        aborted: m.signal?.aborted ?? false,
        messages: params.messages,
        cacheSafeParams: {
          systemPrompt: m.systemPrompt,
          userContext: m.userContext,
          systemContext: m.systemContext,
          toolUseContext: m.toolUseContext,
          // fork 缓存共享路径读 forkContextMessages（非 messages 参，见
          // compact.ts:452）——= 本 loop 出错前的活消息序列（params.messages，
          // 同 REPL compact 支语义；非 m.messages 预 loop 静态序列，loop 内
          // tool 轮后已分叉）。PTL 截断由 compactConversation 内建重试拥有。
          forkContextMessages: params.messages,
        },
      }),
    // 交互权限桥（engine 门 + ask → canUseTool；子 loop canUseTool = 非交互
    // auto 决策体，同桥 remap 语义）
    checkPermission: buildInteractiveGate({
      toolPermissionContext: m.toolPermissionContext,
      getAppState: m.getAppState,
      canUseTool: m.canUseTool,
      toolUseContext: m.toolUseContext,
    }),
    // R6（P0）：工具调用 context 桥——活 ToolUseContext 入 engine pipeline（工具
    // call/validateInput 第 2 参全活面：getAppState/setAppState/abortController/
    // readFileState/options）；Write/TaskCreate/WebFetch/WebSearch 崩溃族单点修复
    // （engine 侧合并 { ...toolContext, signal, checkPermission }，engine 字段优先）。
    // 跨域面 = object 型（engine React-free 红线，loopPermissionBridge 同型）。
    // 覆盖 REPL（replLoopDeps 包装）+ 子 loop 族（runAgent/forkedAgent/
    // execAgentHook/LocalMainSessionTask 直接消费本装配体）。
    toolContext: m.toolUseContext,
    hooks: createLoopHooks({
      options: {
        sessionId: getSessionId(),
        permissionMode: (m.toolPermissionContext as { mode?: string }).mode,
        signal: m.signal,
      },
    }),
    // 主 session transcript 面（旧 productionDeps 同面，replLoopDeps 同款）
    transcript: {
      record: (msgs) =>
        recordTranscript(
          msgs as unknown as Parameters<typeof recordTranscript>[0],
        ),
      recordContentReplacement: (recs) =>
        recordContentReplacement(
          recs as unknown as Parameters<typeof recordContentReplacement>[0],
        ),
    },
    // D2（0.1.37 ③）：跳闸态 systemContext 注入面（非跳闸 = 原引用透传）
    systemPrompt: asSystemPrompt(
      appendSystemContext(m.systemPrompt, systemContext),
    ),
    effortValue: m.effort !== undefined ? String(m.effort) : undefined,
  }

  // 轮次语义（旧 loop.ts:1617 逐字：maxTurns 未设 = 无上限）
  const unboundedTurns = m.unboundedTurns ?? m.maxTurns === undefined

  const args: AgentLoopArgs = {
    messages: prependUserContext(
      m.messages as unknown as Parameters<typeof prependUserContext>[0],
      m.userContext,
    ),
    tools: toolList,
    context: {
      autoCompact,
      unboundedTurns,
      ...(m.maxTurns !== undefined ? { maxTurns: m.maxTurns } : {}),
    },
  }

  return { deps, args }
}
