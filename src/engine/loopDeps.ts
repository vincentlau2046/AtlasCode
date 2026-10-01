/**
 * engine/loopDeps — AgentLoopDeps 组合根构建器（S-E2 A4 自 atlascode/compose
 * 迁入，W3-3b §8.74.15 裁定）。
 *
 * 迁移裁定（临场裁回设计记录）：§8.74.4 #2「createAgentLoopDeps 单组合根」
 * 要求 headless（cli 公共域）消费本构建器替换行内组装——但 cli 边界不变式
 * 「公共层不反向依赖壳」（eslint.config.mjs cli 元素 allow 面 + §8.71 S-C1
 * 裁定）禁止 cli → atlascode，且 atlascode/cli.ts 已消费 cli（元素级环）。
 * 裁定 = 构建器落 engine 层（cli/swarm/壳/测试全层可消费；engine allow 面
 * 覆盖全部依赖），两个壳专属面改注册窗 port（engine ↛ swarm / 壳 mcpBridge
 * L3 隔离，未注册 = 窄缺省）：
 *   ① setAgentLoopDepsTeammatePoolSync — 壳 compose wire 步注册 swarm
 *      setTeammateToolRegistryDeps（teammate 工具池窗同步；headless/单测
 *      未注册 = 跳过，swarm 静态底线由壳 wire 步独立设置不变）
 *   ② setAgentLoopDepsMcpConnectionsProvider — 壳注册 mcpBridge
 *      buildMcpEngineConnections(manager) 快照面（未注册 = 零 MCP，调用方
 *      经 config.toolRegistryDeps.mcpTools 自供——headless 本地桥转写面）
 * modelProvider 源 = modelprovider 域单例 getModelProvider()（壳
 * getCoreDependencies().modelProvider 同单例，逐字等价）。
 *
 * 装配体（S-E2 A4 ①-⑤，原 compose 头注逐字随迁）：
 *   ① initializeToolPermissionContext（CLI 面 + 注册表 deps）
 *   ② getTools(ctx, deps)（注册表组合根消费点）
 *   ③ createPermissionGate(ctx)（S-E1 I-1 全决策体语义消费）
 *   ④ createLoopHooks（§8.42 项 1 hooks 装配① 生产路径）
 *   ⑤ AgentLoopDeps 组装（modelprovider 单例 + role 车道 + W3-3b 7 槽）
 */
import { getModelProvider, type ModelRole } from '../modelprovider'
import { getSessionId } from '../bootstrap'
import type { HookRunOptions } from '../hooks'
import type {
  PermissionMode,
  SystemPrompt,
  ThinkingConfig,
  ToolPermissionContext,
  Tools,
} from '../shared'
import type { MCPServerConnection } from './ports/mcpClient'
import { getDomainMount } from './ports/domainMount'
import { getTools, type ToolRegistryDeps } from './tools/toolRegistry'
import { initializeToolPermissionContext } from './permissions/permissionSetup'
import { createMcpTools } from './tools/mcp'
import { createPermissionGate } from './permissions/permissionGate'
import { createLoopHooks } from './hooks/toolHooks'
import {
  recordTranscript,
  recordContentReplacement,
  type ContentReplacementRecord,
  type Message as SessionMessage,
} from './session'
import { SnipTool } from './tools/team/snipTool'
import { TeamCreateTool } from './tools/team/teamCreateTool'
import { TeamDeleteTool } from './tools/team/teamDeleteTool'
import { type AgentLoopDeps } from './query/loop'

// ── 壳侧 port 注册窗（W3-3b §8.74.15：engine L3 隔离，未注册 = 窄缺省）──

/** ① teammate 工具池窗同步（壳 wire 步注册 swarm setTeammateToolRegistryDeps）。 */
let teammatePoolSync: ((deps: ToolRegistryDeps) => void) | undefined

export function setAgentLoopDepsTeammatePoolSync(
  fn: ((deps: ToolRegistryDeps) => void) | undefined,
): void {
  teammatePoolSync = fn
}

/** ② MCP 连接快照供给（壳 wire 步注册 mcpBridge buildMcpEngineConnections）。 */
let mcpConnectionsProvider: (() => Promise<MCPServerConnection[]>) | undefined

export function setAgentLoopDepsMcpConnectionsProvider(
  fn: (() => Promise<MCPServerConnection[]>) | undefined,
): void {
  mcpConnectionsProvider = fn
}

/**
 * loop 依赖装配配置（S-E2 A4，§8.52）：CLI 权限面 + 工具注册表注入 +
 * loop 执行面。W3-3b（§8.74.15）扩 7 槽：sessionModel / disablePersistence /
 * D-5b 5 槽（headless -- 选项 LLM 真消费面）。
 */
export interface AgentLoopDepsConfig {
  /** --allowedTools CLI 面（缺省空）。 */
  allowedToolsCli?: string[]
  /** --disallowedTools CLI 面（缺省空）。 */
  disallowedToolsCli?: string[]
  /** --tools 预设名池（非空 → 池外全 deny 补拒）。 */
  baseToolsCli?: string[]
  /** 权限模式（缺省 'default'）。 */
  permissionMode?: PermissionMode
  /** --dangerously-skip-permissions（缺省 false）。 */
  allowDangerouslySkipPermissions?: boolean
  /** 附加工作目录（缺省空）。 */
  addDirs?: string[]
  /** headless 主会话（ask 决策转 auto-deny 不弹框）。 */
  shouldAvoidPermissionPrompts?: boolean
  /** 工具注册表注入（49 本体经 deps 增量注入的前向面；47 = 历史口径 §8.53 审计④）。 */
  toolRegistryDeps?: ToolRegistryDeps
  /** 主模型角色车道（缺省 'premium' = 旧仓主模型车道）。 */
  role?: ModelRole
  /** 取消信号透传（AgentLoopDeps.signal）。 */
  signal?: AbortSignal
  /**
   * 钩子选项追加面（HookRunOptions 透传；spread 于 ctx 基值之后——调用方
   * 可覆写 sessionId/permissionMode，缺省时 = 构建器注入值）。
   */
  hookOptions?: HookRunOptions
  /**
   * 子代理 id（S-E3 A11，§8.52）：recordContentReplacement 路由面（主会话 =
   * undefined = 旧仓逐字「Undefined = 主线程」）。runAgent 子代理 loop 注入 =
   * shell/swarm 波前向接缝（本波仅主会话构建器消费）。
   */
  agentId?: string
  /**
   * W3-3b（§8.74.15）：会话级主模型 pin（AgentLoopDeps.sessionModel 透传；
   * getRoleModels 池头语义，未设 = 角色池原行为）。
   */
  sessionModel?: string
  /** W3-3b（§8.74.15）：持久化裁面（true = transcript 不注入，headless --no-persist 面）。 */
  disablePersistence?: boolean
  /**
   * W3-3b（§8.74.15）：D-5b 5 槽透传面（headless --system-prompt 合并 /
   * --thinking / --json-schema / --effort / --fallback-model → LLM 调用
   * 真消费，经 AgentLoopDeps 同名槽 → queryOneRound → modelprovider.chat）。
   */
  systemPrompt?: SystemPrompt
  thinkingConfig?: ThinkingConfig
  responseFormat?: unknown
  effortValue?: string
  fallbackModel?: string
}

/** loop 依赖装配产物（S-E2 A4）：权限上下文 + 模型可见工具池 + loop deps。 */
export interface AgentLoopDepsBundle {
  /** initializeToolPermissionContext 产物（门 + 工具池 + 快照共用源）。 */
  toolPermissionContext: ToolPermissionContext
  /** getTools(ctx, deps) 模型可见工具池（deny 过滤 + isEnabled 尾行）。 */
  tools: Tools
  /** queryOneRound/queryAgentLoop 直接消费面（门 + hooks 已接线）。 */
  deps: AgentLoopDeps
  /**
   * W3-3b（§8.74.15）：① initializeToolPermissionContext 告警透出（headless
   * stderr 逐字面——旧行内块 warnings 消费点归调用方）。
   */
  warnings: string[]
}

/**
 * loop 依赖构建器（S-E2 A4，§8.52 裁定 2 A 桶）——组合根消费 getTools /
 * 权限门 / hooks 装配① 的唯一入口（loop.ts:108「本纵切不造全局注册表」
 * 消费接缝兑现；hook option 先例 = 旧仓 orchestrator/tools/toolHooks.ts:409
 * （executePreToolHooks 现读 appState.toolPermissionContext.mode；注：
 * QueryEngine.ts:543 系 buildSystemInitMessage 系统初始化消息面非 hook
 * option 面——S-E2 审视 A 路 NOTE-1 锚点订正））：
 *   ① initializeToolPermissionContext（CLI 面 + 注册表 deps）
 *   ② getTools(ctx, deps)（注册表组合根消费点：getAllBaseTools + deny
 *      过滤 + isEnabled 尾行，49 本体仍经 deps 注入前向（47 = 历史口径 §8.53 审计④））
 *   ③ createPermissionGate(ctx)（S-E1 I-1 全决策体语义消费）
 *   ④ createLoopHooks（§8.42 项 1 hooks 装配① 生产路径）
 *   ⑤ AgentLoopDeps 组装（modelprovider 单例 + role 车道）
 *
 * delta 登记（S-E2 审视 A 路 NOTE-1）：sessionId/permissionMode 于本构建器
 * 构建期固化进 HookRunOptions（旧仓 hook 执行时活态解析）——CLI 单进程
 * 生命周期等价；长驻 TUI/bridge 会话中 switchSession 后复用本构建器须
 * 重建 deps 或经 config.hookOptions 覆写（前向接缝）。
 */
export async function createAgentLoopDeps(
  config: AgentLoopDepsConfig = {},
): Promise<AgentLoopDepsBundle> {
  // S-E2d（§8.66）：⑨⑮ materialize = D 类 3 工具入注册表 baseTools
  // （registry 头注 ⑨ HISTORY_SNIP 恒注册 + ⑮ agentSwarms 自门控
  // isEnabled = isAgentSwarmsEnabled，注册表机制不变；消费方指定
  // baseTools 在前，先入为主 = 测试 fake 可替换，注册表先入为主
  // 去重语义不变）
  // W3-3b（§8.74.15）：MCP 快照经 port ②（壳注册 mcpBridge 供给；未注册
  // = 零 MCP 零 I/O 不变，调用方 config.toolRegistryDeps.mcpTools 自供面
  // 先入为主去重）
  const mcpProvider = mcpConnectionsProvider
  const mcpTools = mcpProvider
    ? await createMcpTools(await mcpProvider())
    : []
  const toolRegistryDeps: ToolRegistryDeps = {
    ...config.toolRegistryDeps,
    baseTools: [
      ...(config.toolRegistryDeps?.baseTools ?? []),
      SnipTool,
      TeamCreateTool,
      TeamDeleteTool,
    ],
    mcpTools: [...(config.toolRegistryDeps?.mcpTools ?? []), ...mcpTools],
    // M3-S5：ascend 16 工具经 DomainPackage 挂载面注入（mount.ts 注册 →
    // getDomainMount()?.tools；未挂载 = AtlasOffice 形态 → undefined → 门控跳过）
    ascendTools: getDomainMount()?.tools,
  }
  // S-E3 修波（A 路 blocker，§8.66 delta ⑧ 回填）：teammate 工具池窗
  // 以全量 deps 重建（= 本构建器模型可见池，旧仓 options.tools 等价面；
  // 后写覆盖 ⑫ 静态底线，幂等）。W3-3b：经 port ①（壳 wire 步注册
  // swarm 侧；未注册 = 跳过，窄缺省）。
  teammatePoolSync?.(toolRegistryDeps)
  // W3-3b（§8.74.15）：warnings 透出（headless stderr 逐字面，bundle 新字段）
  const { toolPermissionContext, warnings } =
    await initializeToolPermissionContext({
      allowedToolsCli: config.allowedToolsCli ?? [],
      disallowedToolsCli: config.disallowedToolsCli ?? [],
      baseToolsCli: config.baseToolsCli,
      permissionMode: config.permissionMode ?? 'default',
      allowDangerouslySkipPermissions:
        config.allowDangerouslySkipPermissions ?? false,
      addDirs: config.addDirs ?? [],
      shouldAvoidPermissionPrompts: config.shouldAvoidPermissionPrompts,
      deps: toolRegistryDeps,
    })
  const tools = getTools(toolPermissionContext, toolRegistryDeps)
  // S-E3 修波（审视 A 路 major-1）：工具面自决权限 context 面回填——
  // getAppState 活 TPC 窄视图（= 本构建器 ① 产物活对象，旧仓
  // context.getAppState().toolPermissionContext 活 TPC 不变量；工具面
  // 消费者 Skill/LSP checkPermissions 只读该字段，全字段面残留守）
  const checkPermission = createPermissionGate(toolPermissionContext, {
    getAppState: () => ({ toolPermissionContext }),
  })
  const hooks = createLoopHooks({
    options: {
      sessionId: getSessionId(),
      permissionMode: toolPermissionContext.mode,
      ...config.hookOptions,
    },
  })
  const deps: AgentLoopDeps = {
    modelProvider: getModelProvider(),
    role: config.role ?? 'premium',
    // W3-3b（§8.74.15）：会话主模型 pin 透传（未设 = 角色池原行为）
    sessionModel: config.sessionModel,
    signal: config.signal,
    checkPermission,
    hooks,
    // W3-3b（§8.74.15）：D-5b 5 槽透传（headless -- 选项真消费面，
    // queryOneRound → modelprovider.chat 逐槽消费，未设 = 窄 spine 缺省）
    systemPrompt: config.systemPrompt,
    thinkingConfig: config.thinkingConfig,
    responseFormat: config.responseFormat,
    effortValue: config.effortValue,
    fallbackModel: config.fallbackModel,
    // S-E3 A11（§8.52）：transcript 写面 = session 域 record 族（recordTranscript
    // dedup 幂等在内，重记安全；持久化门 = session 写面 shouldSkipPersistence
    // 内部态，本波不加构建器门 = 裁面登记——D 波/CLI persistSession 面）。
    // W3-3b（§8.74.15）：disablePersistence 构建器门（headless 持久化裁面，
    // 旧 print.ts 行内块 `options.disablePersistence ? undefined : {...}` 逐字）。
    // 类型面 delta：shared Message（timestamp string|number 宽型）→ session
    // Message（timestamp string 窄型）跨域 cast（运行态 loop 消息恒携 string
    // timestamp，构造面保证；readonly sink 参 → 可变 record 参 = 同值传递）。
    transcript: config.disablePersistence
      ? undefined
      : {
          record: msgs => recordTranscript(msgs as unknown as SessionMessage[]),
          recordContentReplacement: recs =>
            recordContentReplacement(
              recs as unknown as ContentReplacementRecord[],
              config.agentId,
            ),
        },
  }
  return { toolPermissionContext, tools, deps, warnings }
}
