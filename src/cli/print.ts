/* eslint-disable custom-rules/no-process-exit -- W4 全量 lint 复原（§8.74.21）：CLI/壳合法进程出口点（exit 分发层/关闭工具/对话框退出动作），登记延后（exit 助手收敛 W-opt 波再议） */
/**
 * Headless 驱动（S-C3 §8.71.1.4 · 旧仓 cli/print.ts headless 核心随迁 +
 * 新仓架构 remap）。
 *
 * 架构裁定（新仓引擎面重构，非旧仓 5046L 逐字）：
 *   旧仓 runHeadless（485L 设置体）+ runHeadlessStreaming（2900L 流式环）
 *   绑定旧 orchestrator `ask` 生成器 + 旧 AppState/React 面 + GrowthBook
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
 *     （remote 族波 前向缝登记（§8.74.28 ⑭，#200））→ sdkUrl 选项校验保留，运行支 throw 明示。
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
 *   - 旧仓 sessionStartHooks 初始消息 / agent 恢复 / Grove（G-3 ⑦ 本波已裁）/ GrowthBook /
 *     headlessProfiler / extractMemories / streamlined 变换 / UDS inbox =
 *     各自归属波裁（hooks 波 / 壳波 / analytics 已删 / engine 残留守），
 *     登记不随迁。
 *   - PermissionGate 签名 gap（E-4 窄契约 (tool, input)）：SDK can_use_tool
 *     请求的 tool_use_id / agent_id wire 字段缺席（型面可选字段）→
 *     resolvedToolUseIds 防重放面降级（仅护开放 subtype 成员），引擎波
 *     扩门签名后回填（前向接缝登记）。
 *   - 会话域：setSessionEnv 未注入 = 域缺省（sessionId 随机 / cwd 活读 /
 *     projectsDir env 缺省）；壳侧活态注入 = 壳波消费接缝。
 *   - --continue 最新 session 枚举面 = S-C4 已回填（cli/sessionList.ts
 *     findLatestSessionId 目录 mtime 枚举；无会话 → 全新会话，旧语义）。
 *   - cron 消费点 = S-C4 已回填（engine 门面 createCronScheduler，旧仓
 *     L2515-2544 同形；旧 feature('AGENT_TRIGGERS') 门 + cronGate
 *     isCronEnabled 检查裁除——新仓裁定无 feature 门，登记不随迁；旧
 *     session 任务支〔dir 缺省 → session store〕旧仓即 `: any` stub
 *    〔scheduler 域头注整砍〕，本消费点走 file-backed durable 路径）。
 *    S-C5 修波 S1 登记（语义漂移，复审勿当遗漏重提）：旧仓 cron onFire
 *    enqueue 带 isMeta:true（system 生成，防 cron prompt 泄漏进 visible
 *    transcript）+ workload:WORKLOAD_CRON（线程进 cc_workload 计费 QoS）；
 *    新仓 shared Message 型无 isMeta 字段 + 无计费 QoS 消费面 → 两字段裁
 *    （transcript meta 域 / billing 域前向接缝，归 session·analytics 波，
 *    登记不随迁——cron 触发 prompt 现以普通 user 消息入队）。
 *   - boundaries allow 面扩展登记（S-C3，eslint.config.mjs cli 规则同
 *     登记）：cli → modelprovider（ModelProvider 实例 + modelToRole /
 *     getRoleModel 角色映射 + getProviderContextWindow 压缩阈值面）。
 */
import { randomUUID } from 'crypto'
import { join } from 'path'
import {
  asSystemPrompt,
  logForDebugging,
  type AssistantMessage,
  type Message,
  type PermissionDecision,
  type PermissionMode,
  type SystemPrompt,
  type ThinkingConfig,
  type ToolPermissionContext,
  type Tools,
} from '../shared'
import {
  getBaseToolEntities,
  compactConversation,
  createAgentLoopDeps,
  createAbortController,
  createCronScheduler,
  createMcpTools,
  createPermissionGate,
  drainSdkEvents,
  getCronJitterConfig,
  getSchedulerEnv,
  getSettingsWithErrors,
  getSessionEnv,
  queryAgentLoop,
  type AgentLoopDeps,
  type AgentLoopResult,
  type AutoCompactDeps,
  type CompactDeps,
  type CompactionResult,
  type CronScheduler,
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
  toResponseFormat,
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
import { findLatestSessionId } from './sessionList'
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
  // D-5b（S-4，§8.73.2）：headless 高频 5 选项 + --effort 真消费回填（Path B
  // registered-unmapped 核销）——Stage 1 声明。Stage 2 = buildHeadlessOptions
  // 映射（含 -file 读支，parse.ts）；Stage 3 = AgentLoopDeps/queryOneRound 引擎
  // 面真消费（loop.ts + modelprovider chat/roles）。其余 8（taskBudget/teleport/
  // includePartialMessages/forkSession/enableAuthStatus/workload/setupTrigger/
  // sessionStartHooksPromise）留登记不回填。
  systemPrompt?: string
  appendSystemPrompt?: string
  fallbackModel?: string
  jsonSchema?: Record<string, unknown>
  thinkingConfig?: ThinkingConfig
  effort?: string
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

/**
 * P1-C（0405 收口二件）：headless 车道基础系统提示词（环境接地）。
 * 未设 --system-prompt/--append-system-prompt 时，引擎窄 spine 缺省 = 无 system
 * 消息 → 模型无环境上下文（cwd/平台/日期），弱模型按训练先验臆造绝对路径
 * （实测 Qwen38-27B-TXT 臆造 /root/.nvm/…/node_modules/.bin/out/hello.txt，
 * validateInput stat EACCES → error_during_execution；fs.promises.stat 拦截
 * 栈证据 fileWriteTool.validateInput → toolExecution → loop.queryOneRound）。
 * 基础环境块仅 headless 车道关切（TUI 车道有完整系统提示词面；引擎缺省不变）。
 */
function headlessBaseSystemPrompt(): SystemPrompt {
  return asSystemPrompt([
    [
      "You are AtlasCode, an interactive CLI coding agent operating in the user's terminal.",
      'You have tools for reading and writing files and for running shell commands.',
      'When a task requires file changes or command execution, you MUST call the matching tool (Write / Edit / Bash / Read, etc.); never describe or claim work that you did not perform via a tool call.',
      'Prefer paths relative to the working directory; use absolute paths only when the user provides them.',
    ].join(' '),
    [
      'Environment:',
      `- Primary working directory: ${process.cwd()}`,
      `- Platform: ${process.platform}`,
      `- Shell: ${process.env.SHELL ?? '(unknown)'}`,
      `- Today's date: ${new Date().toISOString().slice(0, 10)}`,
    ].join('\n'),
  ])
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
    // 域外裁（前向缝登记（§8.74.28 ⑭，#200））：--sdk-url 云传输（RemoteIO 255L）未随迁
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

/**
 * headless 终态 result.result 文本提取（W3-3d G-α 修波，自 runHeadless 内
 * finalAssistantText 闭包提为可测顶层面）：末位 assistant 消息优先，双形状
 * 提取 text 块——
 *   - 嵌套形（引擎 queryOneRound 实产形：content 在 m.message.content，无
 *     顶层 content——loop.ts AssistantMessage 构造序）
 *   - 扁平形（顶层 content 字符串/块数组——旧仓 transcript 回放形）
 * G-α 真跑发现源：原闭包只读顶层 m.content → 引擎产物消息恒 undefined →
 * result.result 恒 ""（-p text 面 stdout 空 / stream-json result.result 空）；
 * 双形状提取由 tests/unit/cli-headless-result-text.test.ts（H-1..H-4）锁定。
 */
export function extractFinalAssistantText(loopResult: AgentLoopResult): string {
  const contentOf = (m: AgentLoopResult['messages'][number]): unknown => {
    const msg = m.message as { content?: unknown } | undefined
    return m.content !== undefined ? m.content : msg?.content
  }
  for (let i = loopResult.messages.length - 1; i >= 0; i--) {
    const m = loopResult.messages[i]
    if (m.role === 'assistant') {
      const content = contentOf(m)
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

  // ── 权限上下文 + 工具池 + loop deps（组合根 createAgentLoopDeps，
  // W3-3b §8.74.15：①②③④⑤ 经构建器单入口，headless 行内组装块替换）──
  const hasPromptRoute =
    isUsingSdkUrl || options.permissionPromptToolName === 'stdio'
  const role: ModelRole = options.model
    ? modelToRole(options.model)
    : 'premium'
  const roleModel = getRoleModel(role)
  const bundle = await createAgentLoopDeps({
    allowedToolsCli: options.allowedTools ?? [],
    disallowedToolsCli: options.disallowedTools ?? [],
    baseToolsCli: options.baseTools,
    // P1-C 权限面：--dangerously-skip-permissions 语义 = bypassPermissions 模式
    //（旧仓逐字：flag 本身仅置 allowDangerouslySkipPermissions 可用性面，
    // 模式面须显式派生；用户显式 --permission-mode 优先）。root/sudo 安全门
    // 在 parse 层（setup.ts 同型）。
    permissionMode:
      options.permissionMode ??
      (options.dangerouslySkipPermissions ? 'bypassPermissions' : 'default'),
    allowDangerouslySkipPermissions:
      options.dangerouslySkipPermissions ?? false,
    addDirs: options.addDirs ?? [],
    // headless 无 prompt 路由（非 SDK host）：ask 决策转干净 auto-deny
    // （permissions.ts headless 支，旧仓同语义）
    shouldAvoidPermissionPrompts: !hasPromptRoute,
    // mcpTools = 本层本地转写面（mcpBridge ② 同型 local bridge，先入为主
    // 去重）；构建器 port ②（MCP 连接快照）headless 独立运行 = 壳 wire 未
    // 注册 → 构建器侧零 MCP，本面自供 = 旧行为逐字
    // P1-C（0405 core-2/fixture 族）收口：基础工具本体注入位——不注入则
    // headless 池仅 Agent+Snip（0405 任务族 6/6 FAIL 根因：模型无文件/Shell
    // 面，纯文本回合「声称完成」result=success 而磁盘 ground truth 证伪；
    // 定性证据=记录代理保真捕获 + 模型自述 + 直连网关 tool_calls 探测）。
    toolRegistryDeps: {
      mcpTools,
      env: process.env,
      // 惰性 getter：此处（runHeadless 内、全模块初始化后）求值 34 件基础工具本体
      baseTools: getBaseToolEntities(),
    },
    // W3-3b（§8.74.15）：角色车道 + 7 槽配置面（单组合根；role 由 --model
    // 派生，未设 = 'premium' 缺省不变）
    role,
    // 会话主模型 pin（--model 池头语义；未设 = 角色池原行为）
    sessionModel: options.model,
    disablePersistence: options.disablePersistence,
    // D-5b（S-4）：headless 5 选项 + --effort → LLM 调用真消费面（引擎链）。
    // systemPrompt = --system-prompt + --append-system-prompt 合并（SystemPrompt）；
    // 未设任一 → headlessBaseSystemPrompt() 基础环境块（P1-C 0405 收口：旧
    // 「窄 spine 缺省 = 无 system 消息」致弱模型按先验臆造绝对路径 EACCES，
    // 见 headlessBaseSystemPrompt 头注；用户显式 --system-prompt 仍整替）。
    systemPrompt:
      options.systemPrompt || options.appendSystemPrompt
        ? asSystemPrompt(
            [options.systemPrompt, options.appendSystemPrompt].filter(
              (s): s is string => Boolean(s),
            ),
          )
        : headlessBaseSystemPrompt(),
    thinkingConfig: options.thinkingConfig,
    // responseFormat = --json-schema 经 modelprovider toResponseFormat（结构化
    // 输出 response_format；未设 --json-schema → undefined = 非结构化）。
    responseFormat: options.jsonSchema
      ? toResponseFormat({ type: 'json_schema', schema: options.jsonSchema })
      : undefined,
    effortValue: options.effort,
    fallbackModel: options.fallbackModel,
  })
  const { toolPermissionContext: initialTpc, tools, warnings } = bundle
  if (warnings.length > 0) {
    process.stderr.write(warnings.join('\n') + '\n')
  }

  // 活 TPC ref（allow 支 permission updates 活更新；工具面 1c getAppState
  // 活读不变量——旧 appState.toolPermissionContext 活态语义等价）
  const tpcRef: { current: ToolPermissionContext } = { current: initialTpc }

  // ── canUseTool + 权限门（ask 支 SDK prompt 路由）──
  const onPermissionPrompt = (details: RequiresActionDetails): void => {
    // 旧仓 notifySessionStateChanged('requires_action', details) 裁（session
    // 域前向接缝）；log 观测面保留
    logForDebugging(
      `[headless] permission prompt: ${details.tool_name} — ${details.action_description}`,
    )
  }
  const abortController = createAbortController()
  // S-C5 修波 B1：-p 支 SIGINT = abort 在途 query（旧 print.ts L961 sigintHandler
  // 核心支逐字：abort 后 agent loop 经 deps.signal 干净 unwind → runHeadless
  // 返回 → 进程自然退出）。旧 sigintHandler 附 gracefulShutdown(0)（持久化 +
  // force-exit）= 残留守〔进程生命周期/壳波〕，本支只落 abort 核心支。
  // dispatch.ts 主面 SIGINT handler 对 -p 早退不抢占（其头注本支核销后为真）。
  process.on('SIGINT', () => {
    if (!abortController.signal.aborted) {
      abortController.abort()
    }
  })
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
  let conversation: Message[] = []
  if (typeof options.resume === 'string' || options.continue) {
    conversation = await loadResumedMessages(options)
  }
  // P0-B（0405 core-2）：sessionId 捕获必须在 resume 块之后——loadResumedMessages
  // 内 processResumedConversation 会 switchSession(resumedId)（engine session env
  // 切到被 resume 的会话），先捕获则 result/control 事件的 session_id 仍是启动随机
  // ID（r2 ID 漂移的残留面；转录写指针已由 resetSessionFilePointer 回挂，仅剩此常量）。
  const sessionId = getSessionEnv().getSessionId()
  if (typeof inputPrompt === 'string' && inputPrompt.trim() !== '') {
    conversation.push(makeUserMessage(inputPrompt))
  }

  // ── loop deps（组合根产物 + headless 覆写面，W3-3b §8.74.15）──
  const modelProvider: ModelProvider = getModelProvider()
  // D-5b（S-4）：--fallback-model === --model 守卫（旧 main.tsx L1180-1183 语义：
  // fallback 不得等于主模型）。headless 主模型 = options.model（role 由其派生）；
  // 未设 --model 时 role='premium' 缺省、无主模型可比，守卫空转（与旧仓一致）。
  // role/roleModel 上移 ①②③ 块（builder 配置面消费，单一计算点）。
  if (
    options.fallbackModel &&
    options.model &&
    options.fallbackModel === options.model
  ) {
    process.stderr.write(
      `Error: Fallback model cannot be the same as the main model. ` +
        `Please specify a different model for --fallback-model.\n`,
    )
    process.exit(1)
  }
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
  const loopDeps: AgentLoopDeps = {
    // 组合根产物（①③④⑤ + 7 槽配置面 + transcript disablePersistence 门，
    // builder 配置面——单组合根，行内组装块零残留）
    ...bundle.deps,
    // abortController 创建在 canUseTool 块（序依赖）：构建后赋值
    signal: abortController.signal,
    // SDK prompt 路由门（createPermissionGate 单次重建 + canUseTool ask 路由，
    // 构建点读活 TPC）——覆写构建器 ③ 缺省体
    checkPermission,
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

  // turnRunning = cron scheduler isLoading 面（旧仓 running 标志同义：回合
  // 执行期 fire 延迟到下一 tick，队列环顶 recheck 拾起）。
  let turnRunning = false
  const runTurn = (turnMessages: Message[]): Promise<AgentLoopResult> => {
    turnRunning = true
    return queryAgentLoop(loopDeps, {
      messages: turnMessages,
      tools,
      context: { autoCompact, maxTurns: options.maxTurns },
    }).finally(() => {
      turnRunning = false
    })
  }

  const writeMessage = async (message: StdoutMessage): Promise<void> => {
    if (options.outputFormat === 'stream-json' && options.verbose) {
      await structuredIO.write(message)
    }
  }

  const buildResultMessage = (
    loopResult: AgentLoopResult,
    isError: boolean,
  ): SDKMessage => {
    const resultText = extractFinalAssistantText(loopResult)
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
    // P1-C（0405 收口三件）：stream-json assistant 事件面 = 各轮 assistant
    // 消息全量上流。旧实仅 lastRound 上流——中间工具回合（tool_use 块）在
    // stream-json 不可见，harness toolUses 计数 / triage「零 tool_use 事件」
    // 证据面部分归此缺口（0405 fixture 族 tools=0 记录含此盲区成分）。
    // 实时（loop 内逐轮上流）= 引擎 loop 回调面，前向接缝登记。
    for (const m of loopResult.messages) {
      if (m.role !== 'assistant') continue
      const content = (
        m as unknown as { message?: { content?: unknown[] } }
      ).message?.content
      if (!content || content.length === 0) continue
      await writeMessage({
        type: 'assistant',
        session_id: sessionId,
        message: {
          role: 'assistant',
          content,
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

  // ── cron 消费点（S-C4 §8.71.1.4；旧仓 L2515-2544 同形回填）────────
  // onFire 语义旧 enqueue+run() 逐字转写：进顺序队列；回合执行期 = 队列
  // 环顶 recheck 拾起（旧 "post-run recheck" 语义），idle 阻塞 drainPump
  // 等待期 = idleWake 即时唤醒（旧 run() idle 支语义）。旧 inputClosed
  // 守卫逐字（host 输入关断后不再入队）。dir = scheduler 域 env
  // getProjectRoot（缺省 .git 上探，组合根可注）→ file-backed durable
  // 路径 <project>/.atlas/scheduled_tasks.json（真契约面；裁登记见头注）。
  let idleWake: (() => void) | null = null
  const waitIdle = (): Promise<void> =>
    new Promise(resolve => {
      idleWake = resolve
    })
  const cronScheduler: CronScheduler = createCronScheduler({
    onFire: prompt => {
      if (stdinClosed) return
      // S1 裁登记：旧仓此处 enqueue 带 isMeta:true + workload:WORKLOAD_CRON
      //（transcript 可见性 / 计费 QoS），新仓两字段裁（见头注 S-C5 S1 登记）。
      queuedUserTurns.push(prompt)
      idleWake?.()
    },
    isLoading: () => turnRunning || stdinClosed,
    getJitterConfig: () => getCronJitterConfig(),
    dir: getSchedulerEnv().getProjectRoot(),
  })
  cronScheduler.start()

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

    // ── stdin 多回合 drain + cron idle-wake 环（drain 站点 ③ = 环顶）──
    // 旧 run() "post-run recheck" 语义：回合执行期 / 等待期 fire 的 prompt
    // 均进顺序队列，环顶按序 drain；idle 等待等「pump 完成（stdin 关断）」
    // 或「cron fire 唤醒」（idle 期 fire 须即时 drain，旧 run() idle 支
    // 语义等价）。
    while (true) {
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
      if (stdinClosed) break
      await Promise.race([drainPump, waitIdle()])
    }

    // ── host 输入耗尽：cron 计时器关断（旧 L3781 inputClosed 支 stop 语义；
    //    1s timer 不拆会挂进程）+ drain 站点 ④（idle 前 flush，idle
    //    session_state_changed 事件先于阻塞下回合上流）──
    cronScheduler.stop()
    await drainToOutput()
  } catch (error) {
    cronScheduler.stop()
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
    getProjectDir,
    getTranscriptPathForSession,
    loadTranscriptFile,
    processResumedConversation,
  } = await import('../engine')
  let filePath: string
  let resumedId: string | undefined
  if (typeof options.resume === 'string') {
    resumedId = options.resume
    filePath = options.resume.endsWith('.jsonl')
      ? options.resume
      : getTranscriptPathForSession(options.resume)
  } else {
    // --continue：最新 session 枚举（S-C4 回填，S-C3 前向接缝核销）：
    // project 目录 mtime 最新 .jsonl = 最近会话（纯 fs stat，不解析内容）；
    // 无会话 / 目录缺失 → 全新会话（旧语义：continue 无会话 = fresh）。
    const latestId = await findLatestSessionId(
      getProjectDir(getSessionEnv().getOriginalCwd()),
    )
    if (!latestId) {
      logForDebugging(
        '[headless] --continue without a prior session; starting fresh',
      )
      return []
    }
    resumedId = latestId
    filePath = getTranscriptPathForSession(latestId)
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
  // P0-B（0405 core-2）：headless 车道 session ID 采纳缺失——不调 switchSession 时
  // 转录写入新 session 文件，--resume 多轮契约断（r2 session_id 漂移：0405 checkpoint
  // r2=ok 但 id 失配 FAIL；2026-10-01 复现 r1 d4aaa9ea… → r2 e0b1d950…）。
  // engine processResumedConversation = E-wave-end 组合根前向接缝调用点（TUI 走
  // sessionRestore.ts 变体，headless 一直未接线）：switchSession(resumedId) +
  // resetSessionFilePointer（转录写指针回挂被 resume 文件）+ 元数据恢复。
  // forkSession 恒 false（headless 无 --fork-session 面；contentReplacements 播种
  // 仅 fork 分支消费，本车道不需要）。文件缺失/空转录走上方 early-return，
  // 行为不变（fresh session，优雅降级）。
  await processResumedConversation(
    {
      // 边界类型差（shared Message.timestamp: string|number vs engine session
      // Message.timestamp: string）：restore 仅透传 messages（非 fork 分支不消费），
      // 按目标签名回注
      messages: chain as unknown as Parameters<
        typeof processResumedConversation
      >[0]['messages'],
      sessionId: resumedId,
    },
    { forkSession: false, sessionIdOverride: resumedId },
  )
  return chain as unknown as Message[]
}
