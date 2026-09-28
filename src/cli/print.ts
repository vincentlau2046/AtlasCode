/**
 * Headless 驱动（S-C3 §8.71.1.4 · 旧仓 cli/print.ts headless 核心随迁 +
 * 新仓架构 remap）。
 *
 * 架构裁定（新仓引擎面重构，非旧仓 5046L 逐字）：
 *   旧仓 runHeadless（485L 设置体）+ runHeadlessStreaming（2900L 流式环）
 *   绑定旧 orchestrator `ask` 生成器 + 旧 AppState/React 面 + Grove/GrowthBook
 *   → 新仓 headless 核心 = engine 门面 queryAgentLoop（E-1b T-4a 多轮
 *   pre-turn autoCompact + maxTurns + terminal）+ 本文件的协议 / 输出 /
 *   权限路由层。wire 面逐字保留（NDJSON / 控制协议 / result 消息 / 输出
 *   三态 / drain 站点），驱动体换新引擎。
 *
 * 随迁面（逐字 / 同语义）：
 *   - 选项校验 5 支（resumeSessionAt / rewindFiles 约束 / 输入必需 /
 *     stream-json 需 verbose）
 *   - getCanUseToolFn 3 支（stdio / 无 prompt 工具 / MCP prompt 工具）
 *   - 输出三态 writer（text 终文 / json result 或全量 verbose /
 *     stream-json 逐消息）
 *   - drainSdkEvents 4 站点（analytics 波 §8.69 前向接缝核销）：
 *     站点 ① result 消息前 flush（SDK 事件先于 result 上流）/
 *     站点 ② 末 assistant 消息前 flush（task 进度实时上流）/
 *     站点 ③ 多回合 drain 环顶 flush（进度先于 task_notification）/
 *     站点 ④ finally idle 前 flush（idle session_state_changed 上流）
 *   - MCP 启动消费（组合根 initMcpConnections ①②③ 链的无壳形态：
 *     发现 → manager connect allSettled → 引擎连接 + 工具池 + 注册表
 *     同步，全经 mcp / engine 门面，壳零依赖）
 *   - 权限门：createPermissionGate 决策体（单一事实源）+ ask 支路由
 *     structuredIO can_use_tool SDK prompt（旧 getCanUseToolFn 'stdio' 支
 *     语义）；活 TPC ref（allow 支 permission updates 活更新，工具面 1c
 *     getAppState 活读不变量）
 *   - transcript 写面（session 域 record 族，S-E3 A11 先例同型）
 *
 * 裁 / 接缝登记（H6 防空洞，复审勿当遗漏重提）：
 *   - RemoteIO（旧仓 cli/remoteIO.ts 255L，--sdk-url 云传输）= 域外裁
 *     （remote 族波 [ATLAS-HOLD]）→ sdkUrl 选项校验保留，运行支 throw 明示。
 *   - 旧仓命令队列 + 后台 agent do-while 等待环（getRunningTasks /
 *     isBackgroundTask / heldBackResult 背压）→ drain pump 架构：
 *     后台 for-await 泵（启动即开跑，SDK host control_response 任意
 *     时点可达含第 1 回合权限 prompt 期间）+ user 消息顺序队列
 *     （driver 回合结果后按序消费 = 旧命令队列顺序语义；后台任务
 *     背压面 = tasks 域引擎内消费，headless 驱动不持有背压状态，
 *     登记）。
 *   - 控制请求 handlers（mcp_set_servers / rewind_files /
 *     set_permission_mode / reload_plugins）= S-C4 handlers/* 前向接缝
 *     （本文件 dispatch 登记支：log + control_response error 回应，host
 *     不悬挂）；initialize = 本文件最小本地支（MCP-SDK in-process server
 *     概念裁——新仓 mcp 域 = 外连型，无 SDK 内嵌 server）。
 *   - MCP 具名 permission-prompt-tool 支：新仓 MCP 工具包装器（engine
 *     buildMcpTool）无旧 PermissionPromptTool 契约（.call 4 参 /
 *     mapToolResultToToolResultBlockParam / inputJSONSchema）→ mcp 波
 *     前向接缝（支内 throw 明示，非假绿）。
 *   - 旧仓 sessionStartHooks 初始消息 / agent 恢复 / Grove / GrowthBook /
 *     headlessProfiler / extractMemories / streamlined 变换 / UDS inbox =
 *     各自归属波裁（hooks 波 / 壳波 / analytics 已删 / engine 残留守），
 *     登记不随迁。
 *   - PermissionGate 签名 gap（E-4 窄契约 (tool, input)）：SDK can_use_tool
 *     请求的 tool_use_id / agent_id wire 字段缺席（型面可选字段）→
 *     resolvedToolUseIds 防重放面降级（仅护开放 subtype 成员），引擎波
 *     扩门签名后回填（前向接缝登记）。
 *   - 会话域：setSessionEnv 未注入 = 域缺省（sessionId 随机 / cwd 活读 /
 *     projectsDir env 缺省）；壳侧活态注入 = 壳波消费接缝。
 *   - --continue 无最新 session 枚举面（transcript 目录扫描）= 壳波 /
 *     session 域前向接缝（本支 log + 全新会话，非假绿）。
 *   - boundaries allow 面扩展登记（S-C3，eslint.config.mjs cli 规则同
 *     登记）：cli → modelprovider（ModelProvider 实例 + modelToRole /
 *     getRoleModel 角色映射 + getProviderContextWindow 压缩阈值面）。
 */
import { randomUUID } from 'crypto'
import { join } from 'path'
import {
  logForDebugging,
  type AssistantMessage,
  type Message,
  type PermissionDecision,
  type PermissionMode,
  type ToolPermissionContext,
  type Tools,
} from '../shared'
import {
  compactConversation,
  createAbortController,
  createLoopHooks,
  createMcpTools,
  createPermissionGate,
  drainSdkEvents,
  getSettingsWithErrors,
  getTools,
  getSessionEnv,
  initializeToolPermissionContext,
  queryAgentLoop,
  recordContentReplacement,
  recordTranscript,
  type AgentLoopDeps,
  type AgentLoopResult,
  type AutoCompactDeps,
  type CompactDeps,
  type CompactionResult,
  type ContentReplacementRecord,
  type MCPServerConnection,
  type McpClientEntry,
  type McpResourceContent,
  type PermissionGate,
  setMcpClientRegistry,
} from '../engine'
import {
  buildMcpServerConfigs,
  fetchResourcesForClient,
  fetchToolsForClient,
  getMcpConnectionManager,
  getMcpDiscoveryInput,
  type McpConnectionManager,
  type McpJsonRpcClient,
} from '../mcp'
import {
  getRoleModel,
  getProviderContextWindow,
  getModelProvider,
  modelToRole,
  type ModelProvider,
  type ModelRole,
} from '../modelprovider'
import {
  type RequiresActionDetails,
  StructuredIO,
} from './structuredIO'
import {
  type CanUseToolFn,
  type SDKControlRequest,
  type SDKMessage,
  type SdkToolUseContext,
  type SdkToolView,
  type SdkUserMessage,
  type StdoutMessage,
} from './sdkTypes'
import { installStreamJsonStdoutGuard } from './streamJsonStdoutGuard'

// ── 选项面（dispatch 侧 program.args 映射 = S-C4 回填；本文件定契约）────

export interface HeadlessOptions {
  continue?: boolean
  resume?: string | boolean
  resumeSessionAt?: string
  rewindFiles?: string
  verbose?: boolean
  outputFormat?: 'text' | 'json' | 'stream-json'
  allowedTools?: string[]
  disallowedTools?: string[]
  baseTools?: string[]
  permissionMode?: PermissionMode
  permissionPromptToolName?: string
  maxTurns?: number
  model?: string
  dangerouslySkipPermissions?: boolean
  addDirs?: string[]
  sdkUrl?: string
  replayUserMessages?: boolean
  agent?: string
  disablePersistence?: boolean
}

// 本地窄型（result wire 消息读面；writer 支类型自明，避免与 sdkTypes 循环）
type SdkResultLike = {
  subtype?: string
  result?: string
  is_error?: boolean
  [key: string]: unknown
}

// ── 本地转写件（shell 域 mcpBridge ①②③ 面同型，cli 公共域 ↛ 壳）─────

/** 本地 JSON-RPC 响应窄型（引擎 McpToolResult 同形：content 块数组 / 结构化段 / meta 段）。 */
type ToolsCallResult = {
  content?: unknown
  structuredContent?: Record<string, unknown>
  _meta?: Record<string, unknown>
}

/**
 * MCP client 桥（shell 域 atlascode/adapters/mcpBridge.ts ① 面同型本地
 * 转写：cli 公共域 ↛ 壳）。signal 面裁登记（delta ① 同先例）：本地
 * JSON-RPC 无 abort 通道。
 */
function bridgeMcpToolClientLocal(
  client: McpJsonRpcClient,
): MCPServerConnection['client'] {
  return {
    async callTool(toolName, args, _signal) {
      const result = (await client.request('tools/call', {
        name: toolName,
        arguments: args,
      })) as ToolsCallResult | undefined
      return {
        content: result?.content ?? [],
        ...(result?.structuredContent
          ? { structuredContent: result.structuredContent }
          : {}),
        ...(result?._meta ? { _meta: result._meta } : {}),
      }
    },
  }
}

/**
 * MCP 引擎连接构造（shell 域 mcpBridge ② 面同型本地转写）：manager
 * connected 态 → 引擎 MCPServerConnection[]（描述符经 mcp 域
 * fetchToolsForClient 预取 = LRU 缓存 + drop 失效面）。
 */
async function buildMcpEngineConnectionsLocal(
  manager: McpConnectionManager,
): Promise<MCPServerConnection[]> {
  const out: MCPServerConnection[] = []
  for (const conn of manager.list()) {
    if (conn.type !== 'connected') continue
    const tools = await fetchToolsForClient(conn)
    out.push({
      name: conn.name,
      client: bridgeMcpToolClientLocal(conn.client),
      tools,
    })
  }
  return out
}

/**
 * MCP 注册表同步（shell 域 mcpBridge ③ 面同型本地转写）：manager 4 态 →
 * 引擎 mcpClientRegistry（connected = listResources / readResource 实填；
 * pending 占位；failed / disabled 不进注册表 = 文案分歧面同先例登记）。
 */
function syncMcpClientRegistryLocal(
  manager: McpConnectionManager,
): void {
  const clients: McpClientEntry[] = []
  for (const conn of manager.list()) {
    if (conn.type !== 'connected') continue
    // 闭包绑定 manager 连接对象（fetchResourcesForClient 读其 type /
    // capabilities / client 面；drop 后降级 [] 面同先例）
    const connection = conn
    clients.push({
      name: connection.name,
      type: 'connected',
      capabilities: { resources: connection.capabilities.resources },
      listResources: async () => {
        const entries = await fetchResourcesForClient(connection)
        // server 字段 attach 面 = 引擎工具侧再 attach（同先例），本处剥除
        return entries.map(({ server: _server, ...item }) => item)
      },
      readResource: async (uri: string) => {
        const result = (await connection.client.request('resources/read', {
          uri,
        })) as { contents?: McpResourceContent[] } | undefined
        return { contents: result?.contents ?? [] }
      },
    })
  }
  for (const name of manager.getPendingServerNames()) {
    clients.push({ name, type: 'pending' })
  }
  setMcpClientRegistry({ clients })
}

// ── 本地 IO / 消息构造 ───────────────────────────────────────────────

/** 本地转写（旧仓 utils/uuid.ts validateUuid 同语义）：UUID 形态校验。 */
function validateUuidLocal(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  )
}

/** 本地转写（旧仓 utils/generators.ts fromArray 同语义）：数组 → AsyncIterable。 */
async function* fromArray<T>(items: readonly T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item
  }
}

/** headless 用户消息构造（旧 createUserMessage 最小面：type/role/content/uuid/timestamp 不变量）。 */
function makeUserMessage(text: string): Message {
  return {
    type: 'user',
    role: 'user',
    message: { role: 'user', content: text },
    uuid: randomUUID(),
    timestamp: String(Date.now()),
  }
}

/** SDK user 消息 wire 面 → 纯文本抽取（content = string | 块数组，text 块拼接）。 */
function extractUserText(message: SdkUserMessage): string {
  const content = message.message?.content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((block: { type?: string; text?: string }) =>
        block.type === 'text' && typeof block.text === 'string'
          ? block.text
          : '',
      )
      .join('')
  }
  return ''
}

/**
 * 本地结构化 IO 构造（旧 getStructuredIO L4651 随迁；RemoteIO 支裁——
 * sdkUrl 云传输 = 域外裁〔remote 族波〕，运行支 throw 明示）。
 * 字符串 prompt = 首回合直消费（makeUserMessage 进 messages，不经 stdin 环）；
 * 多回合 stdin 流由 AsyncIterable 入参承载。
 */
function createStructuredIO(
  inputPrompt: string | AsyncIterable<string>,
  options: { sdkUrl: string | undefined; replayUserMessages?: boolean },
): StructuredIO {
  if (options.sdkUrl) {
    // 域外裁（[ATLAS-HOLD]）：--sdk-url 云传输（RemoteIO 255L）未随迁
    throw new Error(
      '--sdk-url is not available in this build (cloud transport cut; see cli 域裁登记)',
    )
  }
  const inputStream =
    typeof inputPrompt === 'string' ? fromArray([]) : inputPrompt
  return new StructuredIO(inputStream, options.replayUserMessages)
}

// ── canUseTool 工厂（旧 getCanUseToolFn L3922 3 支随迁）──────────────

export function getCanUseToolFn(
  permissionPromptToolName: string | undefined,
  structuredIO: StructuredIO,
  getMcpTools: () => Tools,
  onPermissionPrompt?: (details: RequiresActionDetails) => void,
): CanUseToolFn {
  if (permissionPromptToolName === 'stdio' || !permissionPromptToolName) {
    // stdio / 无 prompt 工具支：SDK host can_use_tool control_request 路由
    // （无 onPermissionPrompt 观察回调时静默）
    return structuredIO.createCanUseTool(onPermissionPrompt)
  }
  // MCP 具名 prompt 工具支（旧仓 lazy lookup + 契约校验）：新仓 MCP 工具
  // 包装器无旧 PermissionPromptTool 契约（.call 4 参 / mapToolResult /
  // inputJSONSchema）→ mcp 波前向接缝（支内 throw 明示，非假绿；lookup
  // 时机 = 首次调用，同旧仓 lazy 语义）
  return async (
    _tool,
    _input,
    _toolUseContext,
    _assistantMessage,
    _toolUseID,
    _forceDecision,
  ) => {
    const mcpTools = getMcpTools()
    const permissionPromptTool = mcpTools.find(
      t => t.name === permissionPromptToolName,
    )
    if (!permissionPromptTool) {
      const error = `Error: MCP tool ${permissionPromptToolName} (passed via --permission-prompt-tool) not found. Available MCP tools: ${
        mcpTools.map(t => t.name).join(', ') || 'none'
      }`
      process.stderr.write(`${error}\n`)
      throw new Error(error)
    }
    // 前向接缝（mcp 波）：MCP 工具 → PermissionPromptTool 适配未落
    throw new Error(
      `Error: MCP permission-prompt-tool ${permissionPromptToolName} adapter is not yet available (forward seam: mcp wave)`,
    )
  }
}

// ── 控制请求分派（S-C4 handlers/* 前向接缝 + initialize 最小支）────

function handleControlRequestLocal(
  request: SDKControlRequest,
  structuredIO: StructuredIO,
  sessionId: string,
): void {
  switch (request.request.subtype) {
    case 'initialize': {
      // 最小本地支（旧 handleInitializeRequest 170L 的 MVP：MCP-SDK
      // in-process server 概念裁 → capabilities 空面 + 版本应答）
      void structuredIO.write({
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: request.request_id,
          response: {
            protocol_version: '1.0',
            capabilities: {},
            server_name: 'atlascode',
            session_id: sessionId,
          },
        },
      })
      return
    }
    case 'mcp_set_servers':
    case 'rewind_files':
    case 'set_permission_mode': {
      // S-C4 handlers/* 前向接缝：log + error 回应（host 不悬挂）
      logForDebugging(
        `[headless] control_request ${request.request.subtype} unhandled (S-C4 handler seam)`,
      )
      void structuredIO.write({
        type: 'control_response',
        response: {
          subtype: 'error',
          request_id: request.request_id,
          error: `control_request subtype '${String(
            request.request.subtype,
          )}' not yet supported (S-C4 forward seam)`,
        },
      })
      return
    }
    default:
      logForDebugging(
        `[headless] unknown control_request subtype: ${String(
          request.request.subtype,
        )}`,
      )
  }
}

// ── 驱动主体 ─────────────────────────────────────────────────────────

export async function runHeadless(
  inputPrompt: string | AsyncIterable<string>,
  options: HeadlessOptions,
): Promise<void> {
  // ── 选项校验（旧仓 L495-735 逐字 5 支）──
  if (options.resumeSessionAt && !options.resume) {
    process.stderr.write(`Error: --resume-session-at requires --resume\n`)
    process.exit(1)
  }
  if (options.rewindFiles && !options.resume) {
    process.stderr.write(`Error: --rewind-files requires --resume\n`)
    process.exit(1)
  }
  if (
    options.rewindFiles &&
    typeof inputPrompt === 'string' &&
    inputPrompt.trim() !== ''
  ) {
    process.stderr.write(
      `Error: --rewind-files is a standalone operation and cannot be used with a prompt\n`,
    )
    process.exit(1)
  }

  const hasValidResumeSessionId =
    typeof options.resume === 'string' &&
    (validateUuidLocal(options.resume) || options.resume.endsWith('.jsonl'))
  const isUsingSdkUrl = Boolean(options.sdkUrl)
  if (!inputPrompt && !hasValidResumeSessionId && !isUsingSdkUrl) {
    process.stderr.write(
      `Error: Input must be provided either through stdin or as a prompt argument when using --print\n`,
    )
    process.exit(1)
  }
  if (options.outputFormat === 'stream-json' && !options.verbose) {
    process.stderr.write(
      `Error: When using --print, --output-format=stream-json requires --verbose\n`,
    )
    process.exit(1)
  }

  const structuredIO = createStructuredIO(inputPrompt, {
    sdkUrl: options.sdkUrl,
    replayUserMessages: options.replayUserMessages,
  })

  // stream-json：安装 stdout 守卫（首条 structuredIO.write 之前）
  if (options.outputFormat === 'stream-json') {
    installStreamJsonStdoutGuard()
  }

  // ── MCP 启动消费（组合根 initMcpConnections ①②③ 无壳形态）──
  const mcpManager = getMcpConnectionManager()
  const settings = getSettingsWithErrors()
  const discoveryInput =
    getMcpDiscoveryInput() ??
    ({
      settingsServers: (
        settings.settings as { mcpServers?: Record<string, unknown> }
      ).mcpServers,
      projectMcpJsonPath: join(process.cwd(), '.mcp.json'),
    })
  const mcpConfigs = await buildMcpServerConfigs(discoveryInput)
  await Promise.allSettled(
    Object.entries(mcpConfigs).map(([name, config]) =>
      mcpManager.connect(name, config),
    ),
  )
  const mcpConnections = await buildMcpEngineConnectionsLocal(mcpManager)
  const mcpTools = createMcpTools(mcpConnections)
  syncMcpClientRegistryLocal(mcpManager)

  // ── 权限上下文 + 工具池（旧 appState 面 → engine 注册表机制层）──
  const hasPromptRoute =
    isUsingSdkUrl || options.permissionPromptToolName === 'stdio'
  const { toolPermissionContext: initialTpc, warnings } =
    await initializeToolPermissionContext({
      allowedToolsCli: options.allowedTools ?? [],
      disallowedToolsCli: options.disallowedTools ?? [],
      baseToolsCli: options.baseTools,
      permissionMode: options.permissionMode ?? 'default',
      allowDangerouslySkipPermissions:
        options.dangerouslySkipPermissions ?? false,
      addDirs: options.addDirs ?? [],
      // headless 无 prompt 路由（非 SDK host）：ask 决策转干净 auto-deny
      // （permissions.ts headless 支，旧仓同语义）
      shouldAvoidPermissionPrompts: !hasPromptRoute,
    })
  if (warnings.length > 0) {
    process.stderr.write(warnings.join('\n') + '\n')
  }

  // 活 TPC ref（allow 支 permission updates 活更新；工具面 1c getAppState
  // 活读不变量——旧 appState.toolPermissionContext 活态语义等价）
  const tpcRef: { current: ToolPermissionContext } = { current: initialTpc }
  const tools = getTools(tpcRef.current, {
    mcpTools,
    env: process.env,
  })

  // ── canUseTool + 权限门（ask 支 SDK prompt 路由）──
  const onPermissionPrompt = (details: RequiresActionDetails): void => {
    // 旧仓 notifySessionStateChanged('requires_action', details) 裁（session
    // 域前向接缝）；log 观测面保留
    logForDebugging(
      `[headless] permission prompt: ${details.tool_name} — ${details.action_description}`,
    )
  }
  const abortController = createAbortController()
  const makeCtx = (): SdkToolUseContext => ({
    abortController,
    getAppState: () => ({ toolPermissionContext: tpcRef.current }),
    setAppState: updater => {
      tpcRef.current =
        updater({ toolPermissionContext: tpcRef.current }).toolPermissionContext
    },
    options: { isNonInteractiveSession: true },
  })
  const canUseTool = getCanUseToolFn(
    isUsingSdkUrl ? 'stdio' : options.permissionPromptToolName,
    structuredIO,
    () => mcpTools,
    hasPromptRoute ? onPermissionPrompt : undefined,
  )

  const checkPermission: PermissionGate = async (tool, input) => {
    // 单次重建门（createPermissionGate 决策体单一事实源；构建点读
    // tpcRef.current = 活 TPC，工具面 getAppState 活读）
    const gate = createPermissionGate(tpcRef.current, {
      getAppState: () => ({ toolPermissionContext: tpcRef.current }),
    })
    const verdict = await gate(tool, input)
    if (verdict.ask && hasPromptRoute) {
      // SDK prompt 路由：ask 决断 → structuredIO can_use_tool control_request
      // （PermissionGate 签名 gap：tool_use_id / agent_id wire 字段缺席，
      // 前向接缝登记见文件头）
      const sTool: SdkToolView = { name: (tool as { name: string }).name }
      const decision: PermissionDecision = await canUseTool(
        sTool,
        (input ?? {}) as Record<string, unknown>,
        makeCtx(),
        {} as AssistantMessage,
        '',
      )
      if (decision.behavior === 'allow') {
        return { allowed: true, updatedInput: decision.updatedInput }
      }
      if (decision.behavior === 'deny') {
        return { allowed: false, reason: decision.message }
      }
    }
    return verdict
  }

  // ── 初始消息（session 域 resume 面 + 首 prompt）──
  const sessionId = getSessionEnv().getSessionId()
  let conversation: Message[] = []
  if (typeof options.resume === 'string' || options.continue) {
    conversation = await loadResumedMessages(options)
  }
  if (typeof inputPrompt === 'string' && inputPrompt.trim() !== '') {
    conversation.push(makeUserMessage(inputPrompt))
  }

  // ── loop deps（组合根 createAgentLoopDeps headless 形态）──
  const modelProvider: ModelProvider = getModelProvider()
  const role: ModelRole = options.model
    ? modelToRole(options.model)
    : 'premium'
  const roleModel = getRoleModel(role)
  const compactDeps: CompactDeps = {
    summarize: async (msgs, prompt) => {
      const resp = await modelProvider.chat({
        messages: [...msgs, prompt],
        role: 'small',
        signal: abortController.signal,
      })
      return (
        resp.message.content
          .filter(
            (block: { type?: string; text?: string }) =>
              block.type === 'text' && typeof block.text === 'string',
          )
          .map((block: { text: string }) => block.text)
          .join('')
      )
    },
    // token 计数注入（modelprovider 门面 countTokens；未注入 = fail-safe
    // 不压缩面——本处实注入，压缩阈值真判）
    countTokens: msgs => modelProvider.countTokens('small', undefined, msgs),
  }
  const deps: AgentLoopDeps = {
    modelProvider,
    role,
    signal: abortController.signal,
    checkPermission,
    hooks: createLoopHooks({
      options: { sessionId, permissionMode: tpcRef.current.mode },
    }),
    // S-E3 A11 先例同型：transcript 写面 = session 域 record 族（dedup
    // 幂等在内，重记安全；persistSession 裁面 = disablePersistence 支）
    transcript: options.disablePersistence
      ? undefined
      : {
          // shared Message ↔ session 域 Message 型面差（timestamp string|number
          // → string；makeUserMessage 产点恒 string）：cast 登记
          record: (msgs: readonly Message[]) =>
            recordTranscript(
              [...msgs] as unknown as Parameters<typeof recordTranscript>[0],
            ),
          recordContentReplacement: (
            recs: readonly ContentReplacementRecord[],
          ) => recordContentReplacement([...recs]),
        },
  }

  // autoCompact 构建（AutoCompactDeps 最小面：contextWindow = modelprovider
  // capabilities 面 + 缺省 200k；compact = compactConversation 绑定）
  const autoCompact: AutoCompactDeps = {
    contextWindow:
      (roleModel ? getProviderContextWindow(roleModel) : undefined) ??
      200_000,
    compact: (msgs: Message[]): Promise<CompactionResult> =>
      compactConversation(msgs, compactDeps),
  }

  const runTurn = (turnMessages: Message[]): Promise<AgentLoopResult> =>
    queryAgentLoop(deps, {
      messages: turnMessages,
      tools,
      context: { autoCompact, maxTurns: options.maxTurns },
    })

  const writeMessage = async (message: StdoutMessage): Promise<void> => {
    if (options.outputFormat === 'stream-json' && options.verbose) {
      await structuredIO.write(message)
    }
  }

  const finalAssistantText = (loopResult: AgentLoopResult): string => {
    for (let i = loopResult.messages.length - 1; i >= 0; i--) {
      const m = loopResult.messages[i]
      if (m.role === 'assistant') {
        const content = m.content
        if (typeof content === 'string') return content
        if (Array.isArray(content)) {
          const text = content
            .filter(
              (block: { type?: string; text?: string }) =>
                block.type === 'text' && typeof block.text === 'string',
            )
            .map((block: { text: string }) => block.text)
            .join('')
          if (text) return text
        }
      }
    }
    return ''
  }

  const buildResultMessage = (
    loopResult: AgentLoopResult,
    isError: boolean,
  ): SDKMessage => {
    const resultText = finalAssistantText(loopResult)
    return {
      type: 'result',
      subtype: loopResult.terminated ? 'success' : 'error_max_turns',
      session_id: sessionId,
      is_error: isError || !loopResult.terminated,
      num_turns: loopResult.turns,
      result: resultText,
      uuid: randomUUID(),
    } as SDKMessage
  }

  const drainToOutput = async (): Promise<void> => {
    // drain 站点公共体：SDK 事件先于后续消息上流（旧仓 4 站点逐字语义）
    for (const event of drainSdkEvents()) {
      await structuredIO.write(event as unknown as StdoutMessage)
    }
  }

  const writeTurnOutputs = async (
    loopResult: AgentLoopResult,
  ): Promise<SDKMessage> => {
    // drain 站点 ②：末 assistant 消息前 flush（task 进度实时上流）
    await drainToOutput()
    if (loopResult.lastRound) {
      await writeMessage({
        type: 'assistant',
        session_id: sessionId,
        message: {
          role: 'assistant',
          content: loopResult.lastRound.assistantContent,
        },
        uuid: randomUUID(),
      } as unknown as StdoutMessage)
    }
    const resultMessage = buildResultMessage(loopResult, false)
    // drain 站点 ①：result 消息前 flush（SDK 事件先于 result 上流）
    await drainToOutput()
    await writeMessage(resultMessage)
    return resultMessage
  }

  // ── stdin drain pump（启动即开跑）────────────────────────────────
  // structuredIO.read() 生成器须持续驱动：SDK host 的 control_response
  // （权限 prompt 应答）可在任意时点到达——含第 1 回合执行期间（权限
  // 门 ask 支挂起等应答）。pump = 后台 for-await 消费体：user 消息进
  // 顺序队列（driver 每回合结果后按序消费 = 旧命令队列顺序语义），
  // control_request 即时分派（S-C4 接缝 / initialize 最小支）。
  const queuedUserTurns: string[] = []
  let stdinClosed = false
  const drainPump = (async () => {
    for await (const turn of structuredIO.structuredInput) {
      if (turn.type === 'user') {
        const text = extractUserText(turn as SdkUserMessage)
        if (text) {
          queuedUserTurns.push(text)
        }
      } else if (turn.type === 'control_request') {
        handleControlRequestLocal(turn as SDKControlRequest, structuredIO, sessionId)
      }
    }
    stdinClosed = true
  })()

  try {
    // ── 执行 + 输出（旧 runHeadlessStreaming 流式环 → 新引擎阻塞环 + 输出面）──
    let loopResult = await runTurn(conversation)
    conversation = loopResult.messages
    const firstResult = await writeTurnOutputs(loopResult)

    // ── 输出三态 writer（旧仓 L820-860 逐字语义）──
    switch (options.outputFormat) {
      case 'json': {
        if (options.verbose) {
          // 全量消息数组（json + verbose 独需面；stream-json / text 只读终消息）
          process.stdout.write(JSON.stringify(conversation) + '\n')
        } else {
          process.stdout.write(JSON.stringify(firstResult) + '\n')
        }
        break
      }
      case 'stream-json':
        // 逐消息已上流（writeMessage 支）
        break
      default: {
        const result = firstResult as SdkResultLike
        switch (result.subtype) {
          case 'success':
            process.stdout.write(
              result.result?.endsWith('\n')
                ? (result.result as string)
                : (result.result ?? '') + '\n',
            )
            break
          case 'error_during_execution':
            process.stdout.write(`Execution error`)
            break
          case 'error_max_turns':
            process.stdout.write(
              `Error: Reached max turns (${String(options.maxTurns)})`,
            )
            break
          default:
            break
        }
      }
    }

    // ── stdin 多回合 drain（pump 顺序队列消费；drain 站点 ③ = 环顶）──
    while (queuedUserTurns.length > 0) {
      // drain 站点 ③：回合 drain 环顶 flush（进度先于 task_notification）
      await drainToOutput()
      const userText = queuedUserTurns.shift()!
      conversation.push(makeUserMessage(userText))
      loopResult = await runTurn(conversation)
      conversation = loopResult.messages
      const nextResult = await writeTurnOutputs(loopResult)
      if (options.outputFormat === 'json' || !options.outputFormat) {
        process.stdout.write(
          options.outputFormat === 'json'
            ? JSON.stringify(nextResult) + '\n'
            : ((nextResult as SdkResultLike).result ?? '') +
              (((nextResult as SdkResultLike).result ?? '').endsWith('\n')
                ? ''
                : '\n'),
        )
      }
    }

    // ── stdin 关断等待（pump 完成 = host 输入耗尽）+ drain 站点 ④（idle
    //    前 flush，idle session_state_changed 事件先于阻塞下回合上流）──
    if (!stdinClosed) {
      await drainPump
    }
    await drainToOutput()
  } catch (error) {
    // 旧仓错误 result 消息逐字面（error_during_execution + is_error +
    // 零值 usage 面；getInMemoryErrors 族裁登记——新仓 errorUtils 域缺席）
    try {
      await structuredIO.write({
        type: 'result',
        subtype: 'error_during_execution',
        duration_ms: 0,
        duration_api_ms: 0,
        is_error: true,
        num_turns: 0,
        stop_reason: null,
        session_id: sessionId,
        uuid: randomUUID(),
        errors: [String(error)],
      } as unknown as StdoutMessage)
    } catch {
      // 错误 result 也写不出 → 继续关断
    }
    abortController.abort()
    process.exitCode = 1
  }
}

// ── session 域 resume 面（旧 loadInitialMessages 核心支 + 裁登记）────

async function loadResumedMessages(
  options: HeadlessOptions,
): Promise<Message[]> {
  // 裁登记：sessionStartHooks 初始消息 / agent 恢复 / turnInterruptionState
  // = hooks 波 / 壳波前向接缝（登记不随迁）
  const {
    buildConversationChain,
    getTranscriptPathForSession,
    loadTranscriptFile,
  } = await import('../engine')
  let filePath: string
  if (typeof options.resume === 'string') {
    filePath = options.resume.endsWith('.jsonl')
      ? options.resume
      : getTranscriptPathForSession(options.resume)
  } else {
    // --continue：最新 session 枚举面 = 壳波 / session 域前向接缝
    logForDebugging(
      '[headless] --continue without latest-session enumeration (forward seam); starting fresh',
    )
    return []
  }
  const loaded = await loadTranscriptFile(filePath)
  if (loaded.messages.size === 0) {
    return []
  }
  const leafUuid = [...loaded.leafUuids].pop()
  if (!leafUuid) {
    return []
  }
  const leafMessage = loaded.messages.get(leafUuid)
  if (!leafMessage) {
    return []
  }
  const chain = buildConversationChain(loaded.messages, leafMessage)
  return chain as unknown as Message[]
}
