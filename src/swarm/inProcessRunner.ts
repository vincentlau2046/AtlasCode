/**
 * In-process teammate runner（C 桶 ③ shell·swarm 波 S-E2d hub 切片；§8.66）。
 *
 * 源 = 旧仓 a8af45b src/utils/swarm/inProcessRunner.ts（1536L）迁移（R2/R4 裁剪）。
 *
 * 定位：inProcessRunnerPort 接缝 ② 消费端本体 —— startInProcessTeammate =
 * StartInProcessTeammateFn 实现（InProcessBackend spawn 支经
 * requireStartInProcessTeammate 消费）；组合根（atlascode/compose.ts）调
 * setStartInProcessTeammate(startInProcessTeammate) 接线（PRT-2 装配语句）。
 *
 * import 面重映射：
 *   - runAgent（旧生成器 for-await 逐消息）→ engine 根 runAgent（R2 Promise 形：
 *     单次 await + result.messages 全序列；signal = 每轮 work abort controller，
 *     Escape 仅停当前轮不杀 teammate，旧 override.abortController 语义逐字）
 *   - canUseTool（旧 6 参 CanUseToolFn）→ engine pipeline PermissionGate
 *     （(tool, input) → GateVerdict）；决策体 = permissions 域 hasPermissionsToUseTool
 *     （同源旧 utils/permissions）；ask 支 = leader ToolUseConfirm 队列
 *     （leaderPermissionBridge 新形镜像）/ mailbox 回退（permissionSync +
 *     permissionPoller 双面，500ms 轮询逐字）
 *   - updateTaskState（旧域内本地 3 参）→ engine 根 updateTaskState
 *     （inProcessTeammateTask.ts 3 参形 (taskId, setAppState, updater)）
 *   - InProcessTeammateTaskState / TeammateIdentity / appendCappedMessage /
 *     MAX_TEAMMATE_DISPLAY_MESSAGES / evictTaskOutput / SetAppState → task 域根
 *   - createUserMessage / mailbox 8 面（readMailbox/writeToMailbox/
 *     markMessageAsReadByIndex/createIdleNotification/isShutdownRequest/
 *     getLastPeerDmSummary/isPermissionResponse/createPermission*Message）/
 *     createAbortController / createPermissionGate 族 / persistPermissionUpdates /
 *     autoCompact + compact + microCompact 面 / getTools / runAgent → engine 根
 *   - 任务列表面 listTasks / claimTask / updateTask / Task（旧 TaskListEntry /
 *     updateTaskInList 族）→ engine 根（engine/tasks 域 L741-757）；
 *     claimTask 第 3 参语义 = claimant 字符串（旧 agentName 逐字保留，
 *     新 Task.owner = 不透明 claimant 串）
 *   - runWithTeammateContext → 域内 teammateContext；appendTeammateMessage →
 *     域内 inProcessTeammateTask（S-E2b 落位）
 *   - hasPermissionsToUseTool（决策主体）→ permissions 域根（swarm 允许域）
 *   - getSystemPrompt（旧 4 参主系统提示词面）→ 裁（delta ① 登记）
 *   - model（旧 ModelAlias 字符串）→ modelprovider ModelRole（modelToRole 窄面）
 *   - tokenCountWithEstimation + getAutoCompactThreshold(model) → engine 根
 *     autoCompactIfNeeded（AutoCompactDeps 注入形：contextWindow =
 *     getProviderContextWindow(role 模型) ?? HARD_DEFAULT_CONTEXT_WINDOW；
 *     countTokens = estimateMessageTokens；compact = compactConversation
 *     （summarize = modelprovider chat 文本抽取注入））
 *
 * Delta 登记（H6 前向接缝，复审勿当遗漏重提）：
 *   ① 系统提示词 default/append 模式不再取旧主系统提示词（getSystemPrompt 4 参
 *      = tools/model/mcpClients 全量面，新仓未随迁，归 TUI/REPL 提示词面波）→
 *      default = TEAMMATE_SYSTEM_PROMPT_ADDENDUM（+ append 支 systemPrompt）；
 *      InProcessBackend spawn 支通常传显式 systemPrompt（replace 模式），default
 *      支为兜底。旧 agentDefinition 自定义 def 的 `# Custom Agent Instructions`
 *      追加面随 agentDefinition 参数裁除——S-E2d 接缝回填已落（port
 *      agentDefinition 字段 + buildTeammateSystemPrompt 自定义支，本条闭环）。
 *   ② R2 逐消息消费族整裁：progress tracker（createProgressTracker /
 *      updateProgressFromMessage / getProgressUpdate /
 *      createActivityDescriptionResolver）/ inProgressToolUseIDs 追踪 /
 *      per-message updateTaskState 镜像（新 runAgent 一次性返全序列 → 轮末
 *      task.messages = allMessages 末 100 截断镜像，等价 appendCappedMessage
 *      连添语义）/ contentReplacementState（createContentReplacementState）/
 *      cloneFileStateCache 隔离压缩上下文（新 compactConversation deps 注入形
 *      无 toolUseContext 参）/ runWithAgentContext + AgentContext（perfetto
 *      归因）/ evictTerminalTask（task 域无驱逐面）/ unregisterPerfettoAgent
 *      （perfetto 面）—— 裁除，新仓零活消费。emitTaskTerminatedSdk 已落
 *      （analytics 波 §8.69，completed/failed 两终态 bookend 复原
 *      alreadyTerminal/toolUseId 双发守卫，经 engine 根门面消费）。
 *   ③ R4 裁：BASH_CLASSIFIER 门（feature('BASH_CLASSIFIER') +
 *      awaitClassifierAutoApproval + BASH_TOOL_NAME pendingClassifierCheck 支）
 *      → permissions 域残留守 ①（BASH_CLASSIFIER 门归权限分类器波；新仓
 *      feature() 恒 false 不可测（bun-bundle-feature-untestable），整支按
 *      旧 feature-off 透传语义裁除）。
 *   ④ ToolUseConfirm 新形 onAllow(updatedInput?, feedback?) 无
 *      permissionUpdates/contentBlocks 参（leaderPermissionBridge 头注登记）→
 *      leader-queue 支 persistPermissionUpdates / applyPermissionUpdates 消费裁除
 *      （mailbox 回退支 poller onAllow 保留 permissionUpdates 参 →
 *      persistPermissionUpdates 保留消费，engine 根面）。
 *   ⑤ PermissionGate 面（tool, input）无 tool call ID（GateVerdict 无
 *      toolUseID 字段，pipeline 调用点不透传）→ 队列去重键 + mailbox 请求
 *      toolUseId = 每请求合成 `inproc-${randomUUID()}`（队列 filter 去重 +
 *      展示信息字段；leader 匹配恒按 request.id，零行为差）。
 *   ⑥ AgentDefinition.source：旧 'projectSettings' 不在新三态联合
 *      （'built-in'|'user'|'plugin'）→ 'user'（自定义 agent 语义）。
 *   ⑦ 旧 resolvedAgentDefinition 的 permissionMode:'default' 字段 + 每轮
 *      permissionMode 读取支（leader Shift+Tab cycle 面）整裁（R2：新
 *      AgentDefinition 无 permissionMode 字段；权限模式循环面归 TUI 波）。
 *   ⑧ availableTools（旧 toolUseContext.options.tools 父会话全量池）→ engine 根
 *      getTools(最小 TPC, teammateToolRegistryDeps 注入窗)（deny 过滤 +
 *      isEnabled；S-E3 A 路 blocker 修波回填注入窗 backends/
 *      teammateToolRegistryDeps.ts：组合根 compose ⑫ 注 registry 3 工具
 *      materialize 底线 + createAgentLoopDeps 以全量 toolRegistryDeps 重建
 *      = 父会话 loop 池 ≡ teammate 池等价面，旧仓 options.tools 同源；
 *      未设窗 fail-soft 零 deps 最小池。MCP/Ascend 池随注入 deps 面
 *      传导，in-process teammate 不单独继承父 MCP 池，登记）。
 *      旧 agentDefinition?.tools 的 7 工具名 Set-union 语义（自定义 def 限定池
 *      时保底 team-essential 7 件）随 agentDefinition 参数裁除——S-E2d 接缝
 *      回填已落（resolveTeammateAgentFace def.tools Set-union + resolveAgentTools
 *      池限制面，本条闭环）。
 *   ⑬ 描述面 isNonInteractiveSession 硬编码 true（S-E2d 初版）→ S-E3 A 路
 *      minor 1 修波：改读 bootstrap getIsNonInteractiveSession()（旧仓
 *      L182 toolUseContext.options.isNonInteractiveSession 同源 = 父会话
 *      交互态；in-process teammate 与父同进程，会话态继承语义逐字）。
 *   ⑭ port 输入面 allowedTools/allowPermissionPrompts 两参 = 登记死透传
 *      （S-E3 A 路 minor 3 核销：新 hub 零消费，旧生产调用方恒未设——
 *      旧 L1178 canShowPermissionPrompts ?? true / L1185 池 Set-union
 *      消费端随 delta ①⑧ 裁面归 D 波 agent 注册表 / leader 权限面波
 *      回填）——S-E2d 接缝回填已落，两参转活消费端（本条闭环）：
 *      allowedTools → createTeammateTpcBuilder session alwaysAllow 规则
 *      （旧 runAgent L475-488 session 规则语义逐字，session 规则 ≠ 池限制，
 *      cliArg 保留支 = hub TPC 本地构造恒空零差登记）；allowPermissionPrompts
 *      → canShowPermissionPrompts ?? true（旧 L1178 逐字）=== false →
 *      TPC.shouldAvoidPermissionPrompts（旧 runAgent L450-459 isAsync 显式支
 *      语义；新仓权限决策体无该 flag 消费端 → gate ask 支 auto-deny 为唯一
 *      消费点，无交互提示）；旧 isAsync awaitAutomatedChecksBeforeDialog 支
 *      随 delta ③ BASH_CLASSIFIER/hooks 自动检查面裁除（新仓零消费端，登记）。
 *      agent 注册表输入面 = port agentDefinition 字段（buildTeammateSystemPrompt
 *      自定义指令支 + resolveTeammateAgentFace 池限制/model 传播，见 delta ①⑧）。
 *   ⑨ LOCAL 常量 TEAMMATE_MESSAGE_TAG = 'teammate-message'（旧 constants/xml.ts:52
 *      逐字；新仓无 xml 常量域，域内本地镜像，单一消费点本文件）。
 *   ⑩ onPermissionWaitMs 回调 + task 态 totalPausedMs 记账支整裁：新
 *      InProcessTeammateTaskState 未重建 totalPausedMs 字段（S-E2b 反推面），
 *      等待时长统计消费端 = TUI spinner 面（未落）→ 零活消费不留死接缝
 *      （permissionPromptStartTimeMs 队列字段保留 = TUI 显示端消费面）。
 *   ⑪ 终态/失败支 error 字段（旧 LocalAgentTaskState.error）：新 task 态未重建
 *      该字段（S-E2b 反推面）→ 失败原因仅经 sendIdleNotification failureReason
 *      传达 leader（逐字保留），task 态不写。
 *   ⑫ 类型面 3 站点（S-E2d tsc 实测）：
 *      a. TeammateToolState.tasks 值槽位 = TaskStateBase（旧仓 discriminated
 *         union 收窄面缺失）→ `task.type === 'in_process_teammate'` 判定改
 *         isInProcessTeammateTask 类型守卫（task 域既存导出，逐字语义）
 *         （waitForNextPromptOrShutdown pending 检查 + 主循环 idle 检查 2 站）。
 *      b. createUserMessage 返 InDomainUserMessage 最小形（engine
 *         files/userMessage.ts §8.55，无索引签名）→ shared Message
 *         （[key: string]: unknown 索引签名）消费点 `as unknown as Message`
 *         双 cast（跨域 cast 先例 = compose.ts session Message 双 cast）。
 *      c. allMessages = shared Message[] 宽形（timestamp string|number）→
 *         engine getLastPeerDmSummary session Message[] 窄形参
 *         （timestamp string）消费点双 cast（同先例）。
 */
import { randomUUID } from 'node:crypto'
import {
  logForDebugging,
  type Message,
  type PermissionMode,
  type PermissionUpdate,
  type Tool,
  type ToolPermissionContext,
  type Tools,
} from '../shared'
import {
  getProviderContextWindow,
  getRoleModel,
  getModelProvider,
  HARD_DEFAULT_CONTEXT_WINDOW,
  modelToRole,
  type ModelRole,
} from '../modelprovider'
// delta ⑬（S-E3 A 路 minor 1）：父会话交互态 = bootstrap 会话状态面
// （swarm backends/registry.ts 先例同源 import，L3 零新增交叉）。
import { getIsNonInteractiveSession } from '../bootstrap'
import {
  evictTaskOutput,
  MAX_TEAMMATE_DISPLAY_MESSAGES,
  isInProcessTeammateTask,
  type InProcessTeammateTaskState,
  type SetAppState,
  type TeammateIdentity,
} from '../task'
import {
  autoCompactIfNeeded,
  buildPostCompactMessages,
  compactConversation,
  createAbortController,
  createUserMessage,
  emitTaskTerminatedSdk,
  estimateMessageTokens,
  ERROR_MESSAGE_USER_ABORT,
  getTools,
  isPermissionResponse,
  readMailbox,
  resetMicrocompactState,
  runAgent,
  updateTaskState,
  writeToMailbox,
  createIdleNotification,
  isShutdownRequest,
  getLastPeerDmSummary,
  markMessageAsReadByIndex,
  persistPermissionUpdates,
  listTasks,
  claimTask,
  updateTask,
  // delta ⑭ agent 注册表回填（S-E2d）：池限制面 = agent 域 resolveAgentTools
  // + team-essential 7 件名（Set-union 保底，旧 L966-980 逐字）。
  resolveAgentTools,
  SEND_MESSAGE_TOOL_NAME,
  TEAM_CREATE_TOOL_NAME,
  TEAM_DELETE_TOOL_NAME,
  TASK_CREATE_TOOL_NAME,
  TASK_GET_TOOL_NAME,
  TASK_LIST_TOOL_NAME,
  TASK_UPDATE_TOOL_NAME,
  type AgentDefinition,
  type AutoCompactDeps,
  type AutoCompactTrackingState,
  type GateVerdict,
  type Message as SessionMessage,
  type PermissionGate,
  type Task,
} from '../engine'
import { hasPermissionsToUseTool, type PermissionTool } from '../permissions'
import { runWithTeammateContext } from './teammateContext'
import { appendTeammateMessage } from './inProcessTeammateTask'
import {
  processMailboxPermissionResponse,
  registerPermissionCallback,
  unregisterPermissionCallback,
} from './permissionPoller'
import {
  getLeaderToolUseConfirmQueue,
  type ToolUseConfirm,
} from './leaderPermissionBridge'
import {
  createPermissionRequest,
  sendPermissionRequestViaMailbox,
} from './permissionSync'
import { TEAM_LEAD_NAME } from './constants'
import { TEAMMATE_SYSTEM_PROMPT_ADDENDUM } from './teammatePromptAddendum'
import type { TeammateToolState } from './backends/types'
import type { StartInProcessTeammateArgs } from './backends/inProcessRunnerPort'
// delta ⑧ 回填（S-E3 A 路 blocker）：teammate 工具池 deps 注入窗。
import { getTeammateToolRegistryDeps } from './backends/teammateToolRegistryDeps'

type SetAppStateFn = SetAppState

const PERMISSION_POLL_INTERVAL_MS = 500

/** 旧 constants/xml.ts:52 逐字（delta ⑨）。 */
const TEAMMATE_MESSAGE_TAG = 'teammate-message'

/** 旧 utils/messages.ts:227-230 逐字（裁面族：SUBAGENT_REJECT_MESSAGE 族本地常量）。 */
const SUBAGENT_REJECT_MESSAGE =
  'Permission for this tool use was denied. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). Try a different approach or report the limitation to complete your task.'
const SUBAGENT_REJECT_MESSAGE_WITH_REASON_PREFIX =
  'Permission for this tool use was denied. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). The user said:\n'

/**
 * 最小完整 ToolPermissionContext（delta 登记：TeammateToolState 窄视图
 * {mode} → 本地构造规则空 map / 目录空 Map 完整形：规则支 no-op、mode 支
 * 生效；全量规则面 = TUI 波）。
 */
function buildTeammateToolPermissionContext(
  narrow: { mode: PermissionMode },
): ToolPermissionContext {
  return {
    mode: narrow.mode,
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  }
}

/**
 * delta ⑭ 接缝回填（S-E2d）：teammate 系统提示词构造（旧 inProcessRunner
 * L915-955 逐字）。replace 支 = systemPrompt 逐字（无 addendum / 无自定义
 * 追加，旧逐字）；default/append 支 = ADDENDUM + 自定义 def 提示词追加
 *（旧 L937-947：`\n# Custom Agent Instructions\n${customPrompt}`；旧
 * agentDefinition.memory 空支（analytics 事件）随 delta ② 裁除，新
 * AgentDefinition 无 memory 字段）+ append 支 systemPrompt。新
 * getSystemPrompt 可异步（AgentDefinition 契约）→ await。
 */
export async function buildTeammateSystemPrompt(opts: {
  systemPrompt?: string
  systemPromptMode?: 'default' | 'replace' | 'append'
  agentDefinition?: InProcessRunnerConfig['agentDefinition']
}): Promise<string> {
  const { systemPrompt, systemPromptMode, agentDefinition } = opts
  if (systemPromptMode === 'replace' && systemPrompt) {
    return systemPrompt
  }
  const systemPromptParts = [TEAMMATE_SYSTEM_PROMPT_ADDENDUM]
  if (agentDefinition) {
    // delta ⑭（旧 L937-947 逐字；新面可异步 → await）。
    const customPrompt = await agentDefinition.getSystemPrompt({})
    if (customPrompt) {
      systemPromptParts.push(`\n# Custom Agent Instructions\n${customPrompt}`)
    }
  }
  if (systemPromptMode === 'append' && systemPrompt) {
    systemPromptParts.push(systemPrompt)
  }
  return systemPromptParts.join('\n')
}

/**
 * delta ⑭ 接缝回填（S-E2d）：teammate agent 定义 + 工具池解析（纯函数：
 * basePool 注入）。def.tools = def.tools ∪ team-essential 7 件 Set-union
 *（旧 L966-980 逐字：teammate 即使显式工具清单也总能响应 shutdown 请求 /
 * 发消息 / 经任务列表面协调）；无自定义 def → undefined ≡ 旧 ['*'] 通配
 *（resolveAgentTools 通配支全量池，剔 agent 禁用集，旧 resolveAgentTools
 * 机制逐字）。model = 旧 L984 传播（ModelAlias → ModelRole 面；新
 * resolveRole 优先级 overrideRole > def.model > parentRole，overrideRole
 * 由 runAgent 调用参单独传，本函数不掺 config.model）。disallowedTools
 * 透传（禁用集剔除消费端，旧 resolveAgentTools 逐字）。
 */
export function resolveTeammateAgentFace(params: {
  identity: TeammateIdentity
  teammateSystemPrompt: string
  agentDefinition?: InProcessRunnerConfig['agentDefinition']
  basePool: Tools
}): { def: AgentDefinition; tools: Tools } {
  const { identity, teammateSystemPrompt, agentDefinition, basePool } = params
  const def: AgentDefinition = {
    agentType: identity.agentName,
    whenToUse: `In-process teammate: ${identity.agentName}`,
    getSystemPrompt: () => teammateSystemPrompt,
    // delta ⑥：source 'projectSettings' → 'user'（新三态联合，逐字）。
    source: 'user',
    // delta ⑭（旧 L966-980 逐字）：Set-union 保底；无 def → undefined 通配。
    tools: agentDefinition?.tools
      ? [
          ...new Set([
            ...agentDefinition.tools,
            SEND_MESSAGE_TOOL_NAME,
            TEAM_CREATE_TOOL_NAME,
            TEAM_DELETE_TOOL_NAME,
            TASK_CREATE_TOOL_NAME,
            TASK_GET_TOOL_NAME,
            TASK_LIST_TOOL_NAME,
            TASK_UPDATE_TOOL_NAME,
          ]),
        ]
      : undefined,
    // delta ⑭（旧 L984 逐字，条件 spread 保留）：自定义 def 面透传。
    ...(agentDefinition?.disallowedTools
      ? { disallowedTools: agentDefinition.disallowedTools }
      : {}),
    ...(agentDefinition?.model ? { model: agentDefinition.model } : {}),
  }
  // 池限制面 = agent 域 resolveAgentTools（旧 runAgent L510-517 消费端逐字：
  // useExactTools 未设 → resolveAgentTools(agentDefinition, availableTools)；
  // 无效 spec 静默剔除落 invalidTools，旧机制逐字）。
  const tools: Tools = resolveAgentTools(def, basePool).resolvedTools
  return { def, tools }
}

/**
 * delta ⑭ 接缝回填（S-E2d）：teammate TPC 工厂（旧 runAgent L475-488
 * session 规则 + L450-459 shouldAvoidPrompts 语义逐字）。基 = live appState
 * mode 最小 TPC（buildTeammateToolPermissionContext）+ allowedTools →
 * alwaysAllowRules.session（session 规则 ≠ 池限制；cliArg 保留支：hub TPC
 * 本地构造 cliArg map 恒空，保留语义零差登记）+ avoidPermissionPrompts →
 * shouldAvoidPermissionPrompts（新仓权限决策体无该 flag 消费端 → gate ask
 * 支 auto-deny 为唯一消费点）。
 */
export function createTeammateTpcBuilder(
  getAppState: () => TeammateToolState,
  opts?: {
    allowedTools?: string[]
    avoidPermissionPrompts?: boolean
  },
): () => ToolPermissionContext {
  return () => {
    // 不可变合并（shared ToolPermissionContext 规则 map 只读面）：基 = live
    // appState mode 最小 TPC + 条件 spread 两字段。
    const base = buildTeammateToolPermissionContext(
      getAppState().toolPermissionContext,
    )
    return {
      ...base,
      ...(opts?.allowedTools !== undefined
        ? {
            alwaysAllowRules: {
              ...base.alwaysAllowRules,
              session: [...opts.allowedTools],
            },
          }
        : {}),
      ...(opts?.avoidPermissionPrompts
        ? { shouldAvoidPermissionPrompts: true }
        : {}),
    }
  }
}

/** 本地窄助手消息（裁面族：旧 createAssistantAPIErrorMessage 全形裁除，仅 interrupt 支消费）。 */
function createAssistantAPIErrorMessage(content: string): Message {
  return {
    type: 'assistant',
    role: 'assistant',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    message: { role: 'assistant', content: [{ type: 'text', text: content }] },
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

/**
 * Creates a permission gate for in-process teammates that properly resolves
 * 'ask' permissions via the leader UI rather than treating them as denials.
 *
 * Always uses the leader's ToolUseConfirm dialog with a worker badge when
 * the bridge is available, giving teammates the same tool-specific UI
 * (BashPermissionRequest, FileEditToolDiff, etc.) as the leader's own tools.
 *
 * Falls back to the mailbox system when the bridge is unavailable:
 * sends a permission request to the leader's inbox, waits for the response
 * in the teammate's own mailbox.
 */
export function createInProcessPermissionGate(
  identity: TeammateIdentity,
  abortController: AbortController,
  tools: Tools,
  getAppState: () => TeammateToolState,
  /**
   * delta ⑭ 消费端注入（S-E2d 接缝回填）：TPC 工厂（createTeammateTpcBuilder
   * 产物：session alwaysAllow 规则 + shouldAvoidPermissionPrompts 预合并）。
   * 未设 = 回填前行为（本地最小 TPC，规则空 map，leader 队列 / mailbox
   * 双支零规则面）。
   */
  buildTpc?: () => ToolPermissionContext,
): PermissionGate {
  const effectiveBuildTpc =
    buildTpc ??
    (() => buildTeammateToolPermissionContext(getAppState().toolPermissionContext))
  return async (tool, input) => {
    // 每请求合成队列去重键 + mailbox toolUseId（delta ⑤）。
    const toolUseKey = `inproc-${randomUUID()}`

    const appState = getAppState()
    const tpc = effectiveBuildTpc()

    const decision = await decidePermission(tool, input, tpc)

    // Pass through allow/deny decisions directly
    if (decision.behavior === 'allow') {
      return { allowed: true, updatedInput: decision.updatedInput ?? input }
    }
    if (decision.behavior === 'deny') {
      return { allowed: false, reason: decision.message }
    }

    // delta ③（R4）：BASH_CLASSIFIER 分类器自动批支裁除（permissions 残留守 ①）。

    // Check if aborted before showing UI
    if (abortController.signal.aborted) {
      return { allowed: false, ask: true, reason: SUBAGENT_REJECT_MESSAGE }
    }

    // delta ⑬（S-E3 A 路 minor 1）：会话交互态读 bootstrap 会话状态面
    //（旧 L182 options.isNonInteractiveSession 同源；in-process 继承父进程态）。
    const description = await tool.description(input, {
      isNonInteractiveSession: getIsNonInteractiveSession(),
      toolPermissionContext: tpc,
      tools,
    })

    if (abortController.signal.aborted) {
      return { allowed: false, ask: true, reason: SUBAGENT_REJECT_MESSAGE }
    }

    // delta ⑭ 消费端（旧 L1178 + runAgent L450-459 语义）：
    // allowPermissionPrompts === false → TPC.shouldAvoidPermissionPrompts →
    // ask 支 auto-deny（无交互提示；新仓权限决策体无该 flag 消费端，gate
    // 为唯一消费点；leader 队列 / mailbox 两支均不进）。
    if (tpc.shouldAvoidPermissionPrompts) {
      return { allowed: false, ask: true, reason: SUBAGENT_REJECT_MESSAGE }
    }

    const setToolUseConfirmQueue = getLeaderToolUseConfirmQueue()

    // Standard path: use ToolUseConfirm dialog with worker badge
    if (setToolUseConfirmQueue) {
      return new Promise<GateVerdict>(resolve => {
        let decisionMade = false
        const permissionStartMs = Date.now()

        const onAbortListener = () => {
          if (decisionMade) return
          decisionMade = true
          resolve({ allowed: false, ask: true, reason: SUBAGENT_REJECT_MESSAGE })
          setToolUseConfirmQueue(queue =>
            queue.filter(item => item.toolUseID !== toolUseKey),
          )
        }

        abortController.signal.addEventListener('abort', onAbortListener, {
          once: true,
        })

        const entry: ToolUseConfirm = {
          toolUseID: toolUseKey,
          tool: {
            name: tool.name,
            userFacingName: (i: unknown) => tool.userFacingName(i),
          },
          description,
          input,
          toolUseContext: appState,
          permissionResult: {
            behavior: decision.behavior,
            message: decision.message,
          },
          permissionPromptStartTimeMs: permissionStartMs,
          workerBadge: identity.color
            ? { name: identity.agentName, color: identity.color }
            : undefined,
          onUserInteraction() {
            // No-op for teammates (no classifier auto-approval)
          },
          onAbort() {
            if (decisionMade) return
            decisionMade = true
            abortController.signal.removeEventListener(
              'abort',
              onAbortListener,
            )
            resolve({
              allowed: false,
              ask: true,
              reason: SUBAGENT_REJECT_MESSAGE,
            })
          },
          onAllow(updatedInput?: unknown, _feedback?: string) {
            if (decisionMade) return
            decisionMade = true
            abortController.signal.removeEventListener('abort', onAbortListener)
            // delta ④：旧 onAllow permissionUpdates/contentBlocks 两参裁除（桥镜像头注）。
            resolve({
              allowed: true,
              updatedInput: updatedInput ?? input,
            })
          },
          onReject(feedback?: string) {
            if (decisionMade) return
            decisionMade = true
            abortController.signal.removeEventListener('abort', onAbortListener)
            const message = feedback
              ? `${SUBAGENT_REJECT_MESSAGE_WITH_REASON_PREFIX}${feedback}`
              : SUBAGENT_REJECT_MESSAGE
            resolve({ allowed: false, ask: true, reason: message })
          },
          async recheckPermission() {
            if (decisionMade) return
            const freshResult = await decidePermission(
              tool,
              input,
              // delta ⑭：recheck 走同一 TPC 工厂（session 规则 / flag 预合并面
              // 与主决策同源，live appState 重读）。
              effectiveBuildTpc(),
            )
            if (freshResult.behavior === 'allow') {
              decisionMade = true
              abortController.signal.removeEventListener(
                'abort',
                onAbortListener,
              )
              setToolUseConfirmQueue(queue =>
                queue.filter(item => item.toolUseID !== toolUseKey),
              )
              // 旧 L322 逐字：recheck allow 钉用户所见的原 input（userModified=
              // false 语义被新 GateVerdict 形收编，delta ④）——非新检 updatedInput
              //（用户所见所批 input 为权威）。
              resolve({
                allowed: true,
                updatedInput: input,
              })
            }
          },
        }

        setToolUseConfirmQueue(queue => [...queue, entry])
      })
    }

    // Fallback: use mailbox system when leader UI queue is unavailable
    return new Promise<GateVerdict>(resolve => {
      const request = createPermissionRequest({
        toolName: tool.name,
        toolUseId: toolUseKey,
        input: (input ?? {}) as Record<string, unknown>,
        description,
        permissionSuggestions:
          decision.behavior === 'ask' ? (decision.suggestions as unknown[]) : undefined,
        workerId: identity.agentId,
        workerName: identity.agentName,
        workerColor: identity.color,
        teamName: identity.teamName,
      })

      // Register callback to be invoked when the leader responds
      registerPermissionCallback({
        requestId: request.id,
        toolUseId: toolUseKey,
        onAllow(
          updatedInput: Record<string, unknown> | undefined,
          permissionUpdates: PermissionUpdate[],
          _feedback?: string,
        ) {
          cleanup()
          persistPermissionUpdates(permissionUpdates)
          const finalInput =
            updatedInput && Object.keys(updatedInput).length > 0
              ? updatedInput
              : ((input ?? {}) as Record<string, unknown>)
          resolve({
            allowed: true,
            updatedInput: finalInput,
          })
        },
        onReject(feedback?: string) {
          cleanup()
          const message = feedback
            ? `${SUBAGENT_REJECT_MESSAGE_WITH_REASON_PREFIX}${feedback}`
            : SUBAGENT_REJECT_MESSAGE
          resolve({ allowed: false, ask: true, reason: message })
        },
      })

      // Send request to leader's mailbox
      void sendPermissionRequestViaMailbox(request)

      // Poll teammate's mailbox for the response
      const pollInterval = setInterval(
        async (
          abortController,
          cleanup,
          resolve,
          identity,
          request,
        ) => {
          if (abortController.signal.aborted) {
            cleanup()
            resolve({
              allowed: false,
              ask: true,
              reason: SUBAGENT_REJECT_MESSAGE,
            })
            return
          }

          const allMessages = await readMailbox(
            identity.agentName,
            identity.teamName,
          )
          for (let i = 0; i < allMessages.length; i++) {
            const msg = allMessages[i]
            if (msg && !msg.read) {
              const parsed = isPermissionResponse(msg.text)
              if (parsed && parsed.request_id === request.id) {
                await markMessageAsReadByIndex(
                  identity.agentName,
                  identity.teamName,
                  i,
                )
                if (parsed.subtype === 'success') {
                  processMailboxPermissionResponse({
                    requestId: parsed.request_id,
                    decision: 'approved',
                    updatedInput: parsed.response?.updated_input,
                    permissionUpdates: parsed.response?.permission_updates,
                  })
                } else {
                  processMailboxPermissionResponse({
                    requestId: parsed.request_id,
                    decision: 'rejected',
                    feedback: parsed.error,
                  })
                }
                return // Callback already resolves the promise
              }
            }
          }
        },
        PERMISSION_POLL_INTERVAL_MS,
        abortController,
        cleanup,
        resolve,
        identity,
        request,
      )

      const onAbortListener = () => {
        cleanup()
        resolve({ allowed: false, ask: true, reason: SUBAGENT_REJECT_MESSAGE })
      }

      abortController.signal.addEventListener('abort', onAbortListener, {
        once: true,
      })

      function cleanup() {
        clearInterval(pollInterval)
        unregisterPermissionCallback(request.id)
        abortController.signal.removeEventListener('abort', onAbortListener)
      }
    })
  }
}

/**
 * 决策体薄封装（permissions 域 hasPermissionsToUseTool 决策主体同源旧仓
 * utils/permissions；context 面 = 本地构造 TPC，delta 登记见上
 * buildTeammateToolPermissionContext）。
 */
async function decidePermission(
  tool: Tool,
  input: unknown,
  tpc: ToolPermissionContext,
) {
  return hasPermissionsToUseTool(
    tool as PermissionTool,
    (input ?? {}) as Record<string, unknown>,
    { getToolPermissionContext: () => tpc },
  )
}

/**
 * Formats a message as <teammate-message> XML for injection into the conversation.
 * This ensures the model sees messages in the same format as tmux teammates.
 */
function formatAsTeammateMessage(
  from: string,
  content: string,
  color?: string,
  summary?: string,
): string {
  const colorAttr = color ? ` color="${color}"` : ''
  const summaryAttr = summary ? ` summary="${summary}"` : ''
  return `<${TEAMMATE_MESSAGE_TAG} teammate_id="${from}"${colorAttr}${summaryAttr}>\n${content}\n</${TEAMMATE_MESSAGE_TAG}>`
}

/**
 * Configuration for running an in-process teammate.
 * = inProcessRunnerPort 接缝 ② 输入面（生产端 InProcessBackend 产物形，
 * 单一事实源 inProcessRunnerPort.ts）。
 */
export type InProcessRunnerConfig = StartInProcessTeammateArgs

/**
 * Result from running an in-process teammate.
 */
export type InProcessRunnerResult = {
  /** Whether the run completed successfully */
  success: boolean
  /** Error message if failed */
  error?: string
  /** Messages produced by the agent */
  messages: Message[]
}

/**
 * Sends a message to the leader's file-based mailbox.
 * Uses the same mailbox system as tmux teammates for consistency.
 */
async function sendMessageToLeader(
  from: string,
  text: string,
  color: string | undefined,
  teamName: string,
): Promise<void> {
  await writeToMailbox(
    TEAM_LEAD_NAME,
    {
      from,
      text,
      timestamp: new Date().toISOString(),
      color,
    },
    teamName,
  )
}

/**
 * Sends idle notification to the leader via file-based mailbox.
 * Uses agentName (not agentId) for consistency with process-based teammates.
 */
async function sendIdleNotification(
  agentName: string,
  agentColor: string | undefined,
  teamName: string,
  options?: {
    idleReason?: 'available' | 'interrupted' | 'failed'
    summary?: string
    completedTaskId?: string
    completedStatus?: 'resolved' | 'blocked' | 'failed'
    failureReason?: string
  },
): Promise<void> {
  const notification = createIdleNotification(agentName, options)

  // 旧 L581 jsonStringify(notification)（slowOperations 慢操作计时 wrapper）
  // → 直接 JSON.stringify（输出逐字同，计时面随 slowOperations 族裁除；
  // S-E3 A 路 nit 登记，零行为差）。
  await sendMessageToLeader(
    agentName,
    JSON.stringify(notification),
    agentColor,
    teamName,
  )
}

/**
 * Find an available task from the team's task list.
 * A task is available if it's pending, has no owner, and is not blocked.
 */
function findAvailableTask(tasks: Task[]): Task | undefined {
  const unresolvedTaskIds = new Set(
    tasks.filter(t => t.status !== 'completed').map(t => t.id),
  )

  return tasks.find(task => {
    if (task.status !== 'pending') return false
    if (task.owner) return false
    return task.blockedBy.every(id => !unresolvedTaskIds.has(id))
  })
}

/**
 * Format a task as a prompt for the teammate to work on.
 */
function formatTaskAsPrompt(task: Task): string {
  let prompt = `Complete all open tasks. Start with task #${task.id}: \n\n ${task.subject}`

  if (task.description) {
    prompt += `\n\n${task.description}`
  }

  return prompt
}

/**
 * Try to claim an available task from the team's task list.
 * Returns the formatted prompt if a task was claimed, or undefined if none available.
 */
async function tryClaimNextTask(
  taskListId: string,
  agentName: string,
): Promise<string | undefined> {
  try {
    const tasks = await listTasks(taskListId)
    const availableTask = findAvailableTask(tasks)

    if (!availableTask) {
      return undefined
    }

    const result = await claimTask(taskListId, availableTask.id, agentName)

    if (!result.success) {
      logForDebugging(
        `[inProcessRunner] Failed to claim task #${availableTask.id}: ${result.reason}`,
      )
      return undefined
    }

    // Also set status to in_progress so the UI reflects it immediately
    await updateTask(taskListId, availableTask.id, {
      status: 'in_progress',
    })

    logForDebugging(
      `[inProcessRunner] Claimed task #${availableTask.id}: ${availableTask.subject}`,
    )

    return formatTaskAsPrompt(availableTask)
  } catch (err) {
    logForDebugging(`[inProcessRunner] Error checking task list: ${err}`)
    return undefined
  }
}

/**
 * Result of waiting for messages.
 */
type WaitResult =
  | {
      type: 'shutdown_request'
      request: ReturnType<typeof isShutdownRequest>
      originalMessage: string
    }
  | {
      type: 'new_message'
      message: string
      from: string
      color?: string
      summary?: string
    }
  | {
      type: 'aborted'
  }

/**
 * Waits for new prompts or shutdown request.
 * Polls the teammate's mailbox every 500ms, checking for:
 * - Shutdown request from leader (returned to caller for model decision)
 * - New messages/prompts from leader
 * - Abort signal
 *
 * This keeps the teammate alive in 'idle' state instead of terminating.
 * Does NOT auto-approve shutdown - the model should make that decision.
 */
async function waitForNextPromptOrShutdown(
  identity: TeammateIdentity,
  abortController: AbortController,
  taskId: string,
  getAppState: () => TeammateToolState,
  setAppState: SetAppStateFn,
  taskListId: string,
): Promise<WaitResult> {
  const POLL_INTERVAL_MS = 500

  logForDebugging(
    `[inProcessRunner] ${identity.agentName} starting poll loop (abort=${abortController.signal.aborted})`,
  )

  let pollCount = 0
  while (!abortController.signal.aborted) {
    // Check for in-memory pending messages on every iteration (from transcript viewing)
    const appState = getAppState()
    const task = appState.tasks[taskId]
    // delta ⑫：tasks 值槽位 = TaskStateBase（TeammateToolState 窄视图，
    // 旧仓 discriminated union 收窄面）→ 类型守卫收窄逐字重建
    if (
      task &&
      isInProcessTeammateTask(task) &&
      task.pendingUserMessages.length > 0
    ) {
      const message = task.pendingUserMessages[0]! // Safe: checked length > 0
      // Pop the message from the queue
      updateTaskState<InProcessTeammateTaskState>(
        taskId,
        setAppState,
        prevTask => {
          if (prevTask.type !== 'in_process_teammate') {
            return prevTask
          }
          return {
            ...prevTask,
            pendingUserMessages: prevTask.pendingUserMessages.slice(1),
          }
        },
      )
      logForDebugging(
        `[inProcessRunner] ${identity.agentName} found pending user message (poll #${pollCount})`,
      )
      return {
        type: 'new_message',
        message,
        from: 'user',
      }
    }

    // Wait before next poll (skip on first iteration to check immediately)
    if (pollCount > 0) {
      await sleep(POLL_INTERVAL_MS)
    }
    pollCount++

    // Check for abort
    if (abortController.signal.aborted) {
      logForDebugging(
        `[inProcessRunner] ${identity.agentName} aborted while waiting (poll #${pollCount})`,
      )
      return { type: 'aborted' }
    }

    // Check for messages in mailbox
    logForDebugging(
      `[inProcessRunner] ${identity.agentName} poll #${pollCount}: checking mailbox`,
    )
    try {
      // Read all messages and scan unread for shutdown requests first.
      // Shutdown requests are prioritized over regular messages to prevent
      // starvation when peer-to-peer messages flood the queue.
      const allMessages = await readMailbox(
        identity.agentName,
        identity.teamName,
      )

      // Scan all unread messages for shutdown requests (highest priority).
      // readMailbox() already reads all messages from disk, so this scan
      // adds only ~1-2ms of JSON parsing overhead.
      let shutdownIndex = -1
      let shutdownParsed: ReturnType<typeof isShutdownRequest> = null
      for (let i = 0; i < allMessages.length; i++) {
        const m = allMessages[i]
        if (m && !m.read) {
          const parsed = isShutdownRequest(m.text)
          if (parsed) {
            shutdownIndex = i
            shutdownParsed = parsed
            break
          }
        }
      }

      if (shutdownIndex !== -1) {
        const msg = allMessages[shutdownIndex]!
        const skippedUnread = allMessages
          .slice(0, shutdownIndex)
          .filter(m => m && !m.read).length
        logForDebugging(
          `[inProcessRunner] ${identity.agentName} received shutdown request from ${shutdownParsed?.from} (prioritized over ${skippedUnread} unread messages)`,
        )
        await markMessageAsReadByIndex(
          identity.agentName,
          identity.teamName,
          shutdownIndex,
        )
        return {
          type: 'shutdown_request',
          request: shutdownParsed,
          originalMessage: msg.text,
        }
      }

      // No shutdown request found. Prioritize team-lead messages over peer
      // messages — the leader represents user intent and coordination, so
      // their messages should not be starved behind peer-to-peer chatter.
      // Fall back to FIFO for peer messages.
      let selectedIndex = -1

      // Check for unread team-lead messages first
      for (let i = 0; i < allMessages.length; i++) {
        const m = allMessages[i]
        if (m && !m.read && m.from === TEAM_LEAD_NAME) {
          selectedIndex = i
          break
        }
      }

      // Fall back to first unread message (any sender)
      if (selectedIndex === -1) {
        selectedIndex = allMessages.findIndex(m => !m.read)
      }

      if (selectedIndex !== -1) {
        const msg = allMessages[selectedIndex]
        if (msg) {
          logForDebugging(
            `[inProcessRunner] ${identity.agentName} received new message from ${msg.from} (index ${selectedIndex})`,
          )
          await markMessageAsReadByIndex(
            identity.agentName,
            identity.teamName,
            selectedIndex,
          )
          return {
            type: 'new_message',
            message: msg.text,
            from: msg.from,
            color: msg.color,
            summary: msg.summary,
          }
        }
      }
    } catch (err) {
      logForDebugging(
        `[inProcessRunner] ${identity.agentName} poll error: ${err}`,
      )
      // Continue polling even if one read fails
    }

    // Check the team's task list for unclaimed tasks
    const taskPrompt = await tryClaimNextTask(taskListId, identity.agentName)
    if (taskPrompt) {
      return {
        type: 'new_message',
        message: taskPrompt,
        from: 'task-list',
      }
    }
  }

  logForDebugging(
    `[inProcessRunner] ${identity.agentName} exiting poll loop (abort=${abortController.signal.aborted}, polls=${pollCount})`,
  )
  return { type: 'aborted' }
}

/**
 * Runs an in-process teammate with a continuous prompt loop.
 *
 * Executes runAgent() within the teammate's AsyncLocalStorage context,
 * updates task state, sends idle notification on completion,
 * then waits for new prompts or shutdown requests.
 *
 * Unlike background tasks, teammates stay alive and can receive multiple prompts.
 * The loop only exits on abort or after shutdown is approved by the model.
 *
 * @param config - Runner configuration
 * @returns Result with messages and success status
 */
export async function runInProcessTeammate(
  config: InProcessRunnerConfig,
): Promise<InProcessRunnerResult> {
  const {
    identity,
    taskId,
    prompt,
    teammateContext,
    toolUseContext,
    abortController,
    model,
    systemPrompt,
    systemPromptMode,
    // delta ⑭ 消费端（S-E2d 接缝回填，port 死透传 → 活消费端，见 delta ⑭）。
    allowedTools,
    allowPermissionPrompts,
    agentDefinition,
  } = config
  const { setAppState, getAppState } = toolUseContext

  // 模型 role 解析（delta ⑦/⑧ 登记）：override = config.model（modelToRole）；
  // 缺省 = 'premium'（主循环角色，旧 mainLoopModel 语义等价）。
  const role: ModelRole = model ? modelToRole(model) : 'premium'
  const overrideRole: ModelRole | undefined = model
    ? modelToRole(model)
    : undefined
  const modelProvider = getModelProvider()
  const contextWindow =
    getProviderContextWindow(getRoleModel(role) ?? '') ??
    HARD_DEFAULT_CONTEXT_WINDOW

  logForDebugging(
    `[inProcessRunner] Starting agent loop for ${identity.agentId}`,
  )

  // Build system prompt based on systemPromptMode（delta ①/⑭ 登记）。
  const teammateSystemPrompt = await buildTeammateSystemPrompt({
    systemPrompt,
    systemPromptMode,
    agentDefinition,
  })

  // delta ⑭ 消费端（旧 L1178 逐字）：canShowPermissionPrompts =
  // allowPermissionPrompts ?? true（=== false → TPC.shouldAvoidPermissionPrompts
  // → gate ask 支 auto-deny，无交互提示）。
  const canShowPermissionPrompts = allowPermissionPrompts ?? true
  // delta ⑭ 消费端（旧 runAgent L475-488 session 规则语义逐字）：
  // allowedTools → session alwaysAllow 规则（非池限制）+ flag 预合并。
  const buildTeammateTpc = createTeammateTpcBuilder(getAppState, {
    allowedTools,
    avoidPermissionPrompts: !canShowPermissionPrompts,
  })

  // Agent 定义 + 工具池（delta ⑥⑧⑭ 登记）：基础池 = getTools(最小 TPC,
  // teammate deps 注入窗) ≡ 父会话 loop 池（旧 L1184 options.tools 等价面；
  // 窗未设 = 零 deps 最小池 fail-soft，登记）；def / 池限制 =
  // resolveTeammateAgentFace（旧 L966-984 + runAgent L510-517 消费端逐字：
  // 自定义 def tools ∪ team-essential 7 件 Set-union / 无 def → 通配全量池 /
  // model 传播 / 禁用集剔除）。
  const basePool: Tools = getTools(
    buildTeammateToolPermissionContext(getAppState().toolPermissionContext),
    getTeammateToolRegistryDeps(),
  )
  const { def: resolvedAgentDefinition, tools } = resolveTeammateAgentFace({
    identity,
    teammateSystemPrompt,
    agentDefinition,
    basePool,
  })

  // All messages across all prompts
  const allMessages: Message[] = []
  // Wrap initial prompt with XML for proper styling in transcript view
  const wrappedInitialPrompt = formatAsTeammateMessage(
    'team-lead',
    prompt,
    undefined,
    undefined, // delta ①：旧 description 参（port 输入面无该字段）裁除
  )
  let currentPrompt = wrappedInitialPrompt
  let shouldExit = false

  // Try to claim an available task immediately so the UI can show activity
  // from the very start. The idle loop handles claiming for subsequent tasks.
  // Use parentSessionId as the task list ID since the leader creates tasks
  // under its session ID, not the team name.
  await tryClaimNextTask(identity.parentSessionId, identity.agentName)

  // 压缩跟踪态（loop.ts 初始值逐字）。
  let compactTracking: AutoCompactTrackingState = {
    compacted: false,
    turnCounter: 0,
    turnId: 'turn-0',
  }

  try {
    // Add initial prompt to task.messages for display (wrapped with XML)
    updateTaskState<InProcessTeammateTaskState>(taskId, setAppState, task => ({
      ...task,
      messages: [
        ...(task.messages ?? []),
        createUserMessage({ content: wrappedInitialPrompt }),
      ].slice(-MAX_TEAMMATE_DISPLAY_MESSAGES),
    }))

    // Main teammate loop - runs until abort or shutdown approved
    while (!abortController.signal.aborted && !shouldExit) {
      logForDebugging(
        `[inProcessRunner] ${identity.agentId} processing prompt: ${currentPrompt.substring(0, 50)}...`,
      )

      // Create a per-turn abort controller for this iteration.
      // This allows Escape to stop current work without killing the whole teammate.
      // The lifecycle abortController still kills the whole teammate if needed.
      const currentWorkAbortController = createAbortController()

      // Prepare prompt message for this iteration（上下文经
      // contextMessages = allMessages 累积支传递；旧 promptMessages 本地
      // 数组 = evictTerminalTask 裁剪后死码残留，S-E3 修波删除）
      // delta ⑫：InDomainUserMessage 最小形（engine files/userMessage.ts
      // §8.55）无 shared Message 索引签名 → 消费点 cast（跨域 cast 先例
      // = compose.ts session Message 双 cast，同语义）
      const userMessage = createUserMessage({
        content: currentPrompt,
      }) as unknown as Message

      // Check if compaction is needed before building context
      // （旧 tokenCountWithEstimation + 隔离 context 压缩面 → AutoCompactDeps 注入形，
      // delta ② 登记：cloneFileStateCache 隔离支随新 deps 形裁除。）
      let contextMessages = allMessages
      const compactDeps: AutoCompactDeps = {
        contextWindow,
        countTokens: estimateMessageTokens,
        compact: messages =>
          compactConversation(messages, {
            summarize: async (compactMessages, summaryPrompt) => {
              const res = await modelProvider.chat({
                messages: [...compactMessages, summaryPrompt],
                role,
                signal: currentWorkAbortController.signal,
              })
              return res.message.content
                .map((b: { type?: unknown; text?: unknown }) =>
                  b?.type === 'text' && typeof b.text === 'string'
                    ? b.text
                    : '',
                )
                .join('')
            },
            countTokens: estimateMessageTokens,
          }),
        querySource: 'agent:teammate',
      }
      const compactOutcome = await autoCompactIfNeeded(
        allMessages,
        compactTracking,
        compactDeps,
      )
      if (compactOutcome.wasCompacted && compactOutcome.compactionResult) {
        if (compactOutcome.tracking) {
          compactTracking = compactOutcome.tracking
        }
        contextMessages = buildPostCompactMessages(
          compactOutcome.compactionResult,
        )
        // Reset microcompact state since full compact replaces all
        // messages — old tool IDs are no longer relevant
        resetMicrocompactState()
        // Update allMessages in place with compacted version
        allMessages.length = 0
        allMessages.push(...contextMessages)

        // Mirror compaction into task.messages — otherwise the AppState
        // mirror grows unbounded (500 turns = 500+ messages, 10-50MB).
        // Replace with the compacted messages, matching allMessages.
        updateTaskState<InProcessTeammateTaskState>(
          taskId,
          setAppState,
          task => ({
            ...task,
            messages: [...contextMessages, userMessage].slice(
              -MAX_TEAMMATE_DISPLAY_MESSAGES,
            ),
          }),
        )
      }

      // Pass previous messages as context to preserve conversation history
      // allMessages accumulates all previous messages (user + assistant) from prior iterations
      const forkContextMessages =
        contextMessages.length > 0 ? [...contextMessages] : undefined

      // Add the user message to allMessages so it's included in future context
      // This ensures the full conversation (user + assistant turns) is preserved
      allMessages.push(userMessage)

      // Track if this iteration was interrupted by work abort (not lifecycle abort)
      let workWasAborted = false

      await runWithTeammateContext(teammateContext, async () => {
        // Mark task as running (not idle)
        updateTaskState<InProcessTeammateTaskState>(
          taskId,
          setAppState,
          task => ({ ...task, status: 'running', isIdle: false }),
        )

        // Run the normal agent loop - same runAgent() used by AgentTool/subagents.
        // In-process teammates are async but run in the same process as the leader,
        // so they CAN show permission prompts (unlike true background agents).
        // Use currentWorkAbortController so Escape stops this turn only, not the teammate.
        // delta ②：R2 Promise 形（旧 for-await 逐消息消费整裁；全序列一次性收集）。
        const agentResult = await runAgent({
          agentDefinition: resolvedAgentDefinition,
          prompt: currentPrompt,
          tools,
          modelProvider,
          parentRole: role,
          overrideRole,
          agentId: identity.agentId,
          signal: currentWorkAbortController.signal,
          forkContextMessages,
          checkPermission: createInProcessPermissionGate(
            identity,
            currentWorkAbortController,
            tools,
            getAppState,
            // delta ⑭ 消费端注入：session 规则 / shouldAvoidPermissionPrompts
            // 预合并 TPC 工厂（gate ask 支 auto-deny 消费点）。
            buildTeammateTpc,
          ),
        })

        // delta ②：新消息段 = 全序列去掉 [system, ...fork, user] 前缀。
        const prefixLen = 2 + (forkContextMessages?.length ?? 0)
        const newMessages = agentResult.messages.slice(prefixLen)
        allMessages.push(...newMessages)

        // delta ②：轮末 task.messages 镜像（等价旧 per-message appendCappedMessage
        // 连添语义：末 100 截断）。
        updateTaskState<InProcessTeammateTaskState>(
          taskId,
          setAppState,
          task => ({
            ...task,
            messages: allMessages.slice(-MAX_TEAMMATE_DISPLAY_MESSAGES),
          }),
        )

        // Check work abort (stops current turn only)
        if (currentWorkAbortController.signal.aborted) {
          logForDebugging(
            `[inProcessRunner] ${identity.agentId} current work aborted (Escape pressed)`,
          )
          workWasAborted = true
        }
      })

      // Check if lifecycle aborted during agent run (kills whole teammate)
      if (abortController.signal.aborted) {
        logForDebugging(`[inProcessRunner] ${identity.agentId} lifecycle aborted`)
        break
      }

      // If work was aborted (Escape), log it and add interrupt message, then continue to idle state
      if (workWasAborted) {
        logForDebugging(
          `[inProcessRunner] ${identity.agentId} work interrupted, returning to idle`,
        )

        // Add interrupt message to teammate's messages so it appears in their scrollback
        // （裁面族：本地窄助手消息，delta ② 登记。）
        const interruptMessage = createAssistantAPIErrorMessage(
          ERROR_MESSAGE_USER_ABORT,
        )
        updateTaskState<InProcessTeammateTaskState>(
          taskId,
          setAppState,
          task => ({
            ...task,
            messages: [
              ...(task.messages ?? []),
              interruptMessage,
            ].slice(-MAX_TEAMMATE_DISPLAY_MESSAGES),
          }),
        )
      }

      // Check if already idle before updating (to skip duplicate notification)
      const prevAppState = getAppState()
      const prevTask = prevAppState.tasks[taskId]
      // delta ⑫：类型守卫收窄（同 waitForNextPromptOrShutdown 站点）
      const wasAlreadyIdle =
        !!prevTask && isInProcessTeammateTask(prevTask) && prevTask.isIdle

      // Mark task as idle (NOT completed) and notify any waiters
      updateTaskState<InProcessTeammateTaskState>(
        taskId,
        setAppState,
        task => {
          // Call any registered idle callbacks
          task.onIdleCallbacks?.forEach(cb => cb())
          return { ...task, isIdle: true, onIdleCallbacks: [] }
        },
      )

      // Note: We do NOT automatically send the teammate's response to the leader.
      // Teammates should use the Teammate tool to communicate with the leader.
      // This matches process-based teammates where output is not visible to the leader.

      // Only send idle notification on transition to idle (not if already idle)
      if (!wasAlreadyIdle) {
        await sendIdleNotification(
          identity.agentName,
          identity.color,
          identity.teamName,
          {
            idleReason: workWasAborted ? 'interrupted' : 'available',
            // delta ⑫：allMessages = shared Message 宽形（timestamp
            // string|number）→ engine getLastPeerDmSummary session 窄形
            // 参（timestamp string）跨域 cast（compose 先例同语义）
            summary: getLastPeerDmSummary(
              allMessages as unknown as SessionMessage[],
            ),
          },
        )
      } else {
        logForDebugging(
          `[inProcessRunner] Skipping duplicate idle notification for ${identity.agentName}`,
        )
      }

      logForDebugging(
        `[inProcessRunner] ${identity.agentId} finished prompt, waiting for next`,
      )

      // Wait for next message or shutdown
      const waitResult = await waitForNextPromptOrShutdown(
        identity,
        abortController,
        taskId,
        getAppState,
        setAppState,
        identity.parentSessionId,
      )

      switch (waitResult.type) {
        case 'shutdown_request':
          // Pass shutdown request to model for decision
          // Format as teammate-message for consistency with how tmux teammates receive it
          // The model will use approveShutdown or rejectShutdown tool
          logForDebugging(
            `[inProcessRunner] ${identity.agentId} received shutdown request - passing to model`,
          )
          currentPrompt = formatAsTeammateMessage(
            waitResult.request?.from || 'team-lead',
            waitResult.originalMessage,
          )
          // Add shutdown request to task.messages for transcript display
          appendTeammateMessage(
            taskId,
            createUserMessage({ content: currentPrompt }),
            setAppState,
          )
          break

        case 'new_message':
          // New prompt from leader or teammate
          logForDebugging(
            `[inProcessRunner] ${identity.agentId} received new message from ${waitResult.from}`,
          )
          // Messages from the user should be plain text (not wrapped in XML)
          // Messages from other teammates get XML wrapper for identification
          if (waitResult.from === 'user') {
            currentPrompt = waitResult.message
          } else {
            currentPrompt = formatAsTeammateMessage(
              waitResult.from,
              waitResult.message,
              waitResult.color,
              waitResult.summary,
            )
            // Add to task.messages for transcript display (only for non-user messages)
            // Messages from 'user' come from pendingUserMessages which are already
            // added by injectUserMessageToTeammate
            appendTeammateMessage(
              taskId,
              createUserMessage({ content: currentPrompt }),
              setAppState,
            )
          }
          break

        case 'aborted':
          logForDebugging(
            `[inProcessRunner] ${identity.agentId} aborted while waiting`,
          )
          shouldExit = true
          break
      }
    }

    // Mark as completed when exiting the loop
    //（旧 alreadyTerminal/toolUseId 2 变量 = evictTerminalTask 消费的
    // 写而不读残留，随 delta ② 裁剪 S-E3 修波删除；analytics 波 §8.69
    // emitTaskTerminatedSdk 复原——SDK bookend 双发守卫重新读取
    // alreadyTerminal，非残留）。
    let alreadyTerminal = false
    let toolUseId: string | undefined
    updateTaskState<InProcessTeammateTaskState>(
      taskId,
      setAppState,
      task => {
        // killInProcessTeammate may have already set status:killed +
        // notified:true + cleared fields. Don't overwrite (would flip
        // killed → completed and double-emit the SDK bookend).
        if (task.status !== 'running') {
          alreadyTerminal = true
          return task
        }
        toolUseId = task.toolUseId
        task.onIdleCallbacks?.forEach(cb => cb())
        task.unregisterCleanup?.()
        return {
          ...task,
          status: 'completed',
          notified: true,
          endTime: Date.now(),
          messages: task.messages?.length ? [task.messages.at(-1)!] : undefined,
          pendingUserMessages: [],
          abortController: undefined,
          unregisterCleanup: undefined,
          onIdleCallbacks: [],
        }
      },
    )
    void evictTaskOutput(taskId)
    // delta ②：evictTerminalTask（task 域无驱逐面）/ unregisterPerfettoAgent
    // （perfetto 面）裁除；emitTaskTerminatedSdk 已落（analytics 波 §8.69）。
    // notified:true pre-set → no XML notification → print.ts won't emit
    // the SDK task_notification. Close the task_started bookend directly.
    if (!alreadyTerminal) {
      emitTaskTerminatedSdk(taskId, 'completed', {
        toolUseId,
        summary: identity.agentId,
      })
    }

    return { success: true, messages: allMessages }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'

    logForDebugging(
      `[inProcessRunner] Agent ${identity.agentId} failed: ${errorMessage}`,
    )

    // Mark task as failed and notify any waiters（delta ⑪：error 字段不写，
    // 失败原因经 idle notification failureReason 传达；analytics 波 §8.69
    // emitTaskTerminatedSdk 复原 alreadyTerminal/toolUseId 两变量——SDK
    // bookend 双发守卫读取 alreadyTerminal，非残留）。
    let alreadyTerminal = false
    let toolUseId: string | undefined
    updateTaskState<InProcessTeammateTaskState>(
      taskId,
      setAppState,
      task => {
        if (task.status !== 'running') {
          alreadyTerminal = true
          return task
        }
        toolUseId = task.toolUseId
        task.onIdleCallbacks?.forEach(cb => cb())
        task.unregisterCleanup?.()
        return {
          ...task,
          status: 'failed',
          notified: true,
          isIdle: true,
          endTime: Date.now(),
          onIdleCallbacks: [],
          messages: task.messages?.length ? [task.messages.at(-1)!] : undefined,
          pendingUserMessages: [],
          abortController: undefined,
          unregisterCleanup: undefined,
        }
      },
    )
    void evictTaskOutput(taskId)
    // delta ②：evictTerminalTask 裁除；emitTaskTerminatedSdk 已落
    // （analytics 波 §8.69）。notified:true pre-set → no XML notification →
    // close the SDK task_started bookend directly.
    if (!alreadyTerminal) {
      emitTaskTerminatedSdk(taskId, 'failed', {
        toolUseId,
        summary: identity.agentId,
      })
    }

    // Send idle notification with failure via file-based mailbox
    await sendIdleNotification(
      identity.agentName,
      identity.color,
      identity.teamName,
      {
        idleReason: 'failed',
        completedStatus: 'failed',
        failureReason: errorMessage,
      },
    )

    return {
      success: false,
      error: errorMessage,
      messages: allMessages,
    }
  }
}

/**
 * Starts an in-process teammate in the background.
 *
 * This is the main entry point called after spawn. It starts the agent
 * execution loop in a fire-and-forget manner.
 * = inProcessRunnerPort 接缝 ② 消费端：组合根调
 * setStartInProcessTeammate(startInProcessTeammate) 接线（PRT-2）。
 *
 * @param config - Runner configuration
 */
export function startInProcessTeammate(
  args: StartInProcessTeammateArgs,
): void {
  // Extract agentId before the closure so the catch handler doesn't retain
  // the full config object (including toolUseContext) while the promise
  // is pending - which can be hours for a long-running teammate.
  const agentId = args.identity.agentId
  void runInProcessTeammate(args).catch(error => {
    logForDebugging(`[inProcessRunner] Unhandled error in ${agentId}: ${error}`)
  })
}

// PRT-2：本文件零模块级副作用 —— setStartInProcessTeammate 接线调用 =
// 组合根显式装配语句（atlascode/compose.ts；幂等 last-wins，测试可
// resetStartInProcessTeammate 复位）。
