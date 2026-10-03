/**
 * 组合根（唯一装配点: 注入 port → 域 create() → CoreDependencies）
 *
 * 实现波次: B6-func（★最小组合根，先于 engine 波）
 * 状态: 落地（§8.16/§8.17 4+7 前置清单 + 6 适配器）
 *
 * 职责（charter L4.7）：全仓唯一可跨 8 域 import 的装配点。注入序遵 §8.14
 * permissions→task→hooks（末步 hooks shell-port 先于首次带命令钩子 runHooks）；
 * executor 三 port 先于首次 exec（§8.8 C2）。域内 port 注入窗口 set 后，
 * 各域只面向端口编程（L3 自治），真实现/适配器在此收敛。
 *
 * 装配面（4+7 前置清单，§8.17 D18 终稿）：
 *   基项  setTaskOutputPort / setBootstrapStatePort / setExecutorSandboxPort
 *   D11   setDiskOutputEnv（task ← permissions getProjectTempDir + bootstrap getSessionId）
 *   D17   setHookShellPort（hooks ← executor 真 Shell）
 *   D18   setEndpointConfigSource（modelprovider ← engine/config settings 面 +
 *          env OpenAI 静态键车道，S-3d §8.29 替换 B6-func env-only 版）
 *   + setPermissionsBootstrapEnv（§8.14 注入序首步，permissions ← bootstrap 两 cwd 态）
 *   + S-3c（§8.28）setSettingsPathsProvider（permissions ← engine/config settings
 *     路径面）+ setHookConfigProvider + captureHooksConfigSnapshot（hooks ←
 *     engine/config settings.hooks 配置面，启动捕获一次）
 *   + E-5 S-5a（§8.39）setHooksBootstrapEnv（hooks ← bootstrap ⑤ 3 成员面，
 *     三层断补齐之第三断；先于首次带命令钩子 runHooks，未注入 fail-fast）
 *   + S-3d（§8.29）applySafeConfigEnvironmentVariables（engine/config managedEnv，
 *     旧仓启动序信任前位——trusted 源 env 先入 process.env，后 roles lane env 读）
 *   + S-E2（§8.52 A4-A10）⑧ setSandboxAccess（permissions ← sandbox 状态窄视图）
 *     + ⑨ setSessionEnv（session ← bootstrap 3 成员 + registerCleanup → tasks
 *     执行面）+ ⑩ setSessionMemoryPort/setSessionContextPort（Port 5/Port 1
 *     壳实现注入）+ ⑪ setTaskNotificationHandler（通知 ← messaging 真队列）
 *     + setSchedulerEnv（scheduler 退出清理 → tasks cleanupRegistry）
 *     + createAgentLoopDeps 构建器（A4：W3-3b §8.74.15 起落位 engine 层
 *     engine/loopDeps，本壳 re-export + 2 port 注册〔teammate 池同步 /
 *     MCP 连接快照〕）+ runCoreCleanup 暴露
 *   + S-E3（§8.52 A11/A12）⑨ setSessionEnv 增注 getCwd 活态成员（bootstrap
 *     getCwd() = try pwd() catch getOriginalCwd()，旧 utils/cwd.ts 逐字）+
 *     createAgentLoopDeps 构建器 deps.transcript 接线（session 域 record 族
 *     收敛 loop 写面；agentId 路由 config.agentId）
 *   + S-E2d（§8.66 C 桶 ③ shell·swarm 波）⑫ swarm 域组合根接线：
 *     wireBackends（backends ① 注入窗 = setBackendModule 4 成员）+
 *     setStartInProcessTeammate（inProcessRunner hub 1536L seam ② 真
 *     实现；inProcessRunner 模块零顶层副作用 PRT-2）+ setTeamServices
 *     （swarm team-file 9 面真实现 + 内存缺省 team-context store，
 *     engine↛swarm L3 隔离，teamServices.ts 头注）+ setTeamFileLoader
 *     （sendMessageTool 真读者 = teamHelpers readTeamFileAsync，
 *     §8.66.1.4 核销 ③ 缺省 loader 缺省报错面换血）+ ⑨⑮ baseTools
 *     注入（D 类 3 工具 Snip/TeamCreate/TeamDelete → 注册表，自门控
 *     isEnabled，注册表机制不变，registry 头 materialize 裁定）
 *   + S-E2d（§8.68 remote 波）⑭ MCP 组合根接线（mcpBridge 4 面）：
 *     initMcpConnections 显式动作（发现输入窗 getMcpDiscoveryInput →
 *     缺省 settings mcpServers + 项目 .mcp.json〔buildMcpServerConfigs
 *     最小 2 源〕→ manager 全量 connect allSettled → syncMcpClientRegistry
 *     实填 listResources/readResource + MCP skill 注册窗 setMcpSkillCommand
 *     Source 供给〔getMcpSkillCommands ⑥ 核销〕）；**builder 零意外 I/O
 *     裁定**：createAgentLoopDeps 路径不自动触发连接，mcpTools 供给 =
 *     构建时 manager 态快照（buildMcpEngineConnections → createMcpTools
 *     单入口不变，toolRegistryDeps.mcpTools 单入口），新连接先
 *     initMcpConnections 再重建 deps（LSP manager 态读同型）；CLI 波
 *     启动消费接缝 = initMcpConnections（前向接缝登记）
 *
 * 残留守（§8.29）：applyConfigEnvironmentVariables（信任后全量 env）→ 信任
 * 对话框面（新仓未落；§8.28 预声明消费接缝此处重登记，旧仓启动序
 * applySafe → 信任对话框 → applyConfig）。
 */
import { createSandboxManager, type SandboxManager } from '../sandbox'
import {
  getModelProvider,
  setEndpointConfigSource,
  setLlmTimeoutSettingsSource,
  type ModelProvider,
} from '../modelprovider'
import { FileSystemMemoryStore, type MemoryStore } from '../memory'
import {
  setTaskOutputPort,
  setBootstrapStatePort,
  setExecutorSandboxPort,
} from '../executor'
import {
  setPermissionsBootstrapEnv,
  setSettingsPathsProvider,
  setSandboxAccess,
} from '../permissions'
import { setDiskOutputEnv } from '../task'
import {
  setHookConfigProvider,
  setHooksBootstrapEnv,
  setHookShellPort,
} from '../hooks'
import {
  applySafeConfigEnvironmentVariables,
  captureHooksConfigSnapshot,
  createHooksConfigProvider,
  enqueuePendingNotification,
  getSettingsPaths,
  getSettingsWithErrors,
  registerCleanup,
  runCleanupFunctions,
  setAgentLoopDepsMcpConnectionsProvider,
  setAgentLoopDepsTeammatePoolSync,
  setMcpSkillCommandSource,
  setSchedulerEnv,
  setSessionContextPort,
  setSessionEnv,
  setSessionMemoryPort,
  setTaskNotificationHandler,
  // G-2（2026-09-30）：WebSearch 客户端 provider 层 settings 键供给缝
  // （engine web 域 setWebSearchSettingsKeyProvider，§8.74.27）+ 合并
  // settings 读面 getInitialSettings（engine/config 门面，S-3d settings-
  // adapter 消费先例同面；壳不深 import tui settings 模块 = entry-point
  // 规则面）
  getInitialSettings,
  setWebSearchSettingsKeyProvider,
  // C 桶 ③ S-E2d（§8.66）：D 类 3 工具本体 + TeamServices 接缝 +
  // TeamFileLoader 接缝（组合根消费面，engine root S-E2d 扩面）
  SnipTool,
  TeamCreateTool,
  TeamDeleteTool,
  setTeamServices,
  createDefaultTeamContextStore,
  setTeamFileLoader,
} from '../engine'
import {
  startInProcessTeammate,
  setStartInProcessTeammate,
  wireBackends,
  readTeamFileAsync,
  readTeamFile,
  writeTeamFileAsync,
  getTeamFilePath,
  registerTeamForSessionCleanup,
  unregisterTeamForSessionCleanup,
  cleanupTeamDirectories,
  assignTeammateColor,
  clearTeammateColors,
  sanitizeName,
  setTeammateToolRegistryDeps,
} from '../swarm'
import {
  getIsNonInteractiveSession,
  getMainThreadAgentType,
  getCwd,
  getCwdState,
  getSessionId,
  getOriginalCwd,
  getTranscriptPathForSession,
  hasTrustAccepted,
  switchSession,
} from '../bootstrap'
// S-E2d（§8.68 remote 波）⑭：mcp 域发现/连接生命周期 + skill 注册窗 +
// 组合根桥（L3 顶域 ↛ engine，映射面归组合根）
import { join } from 'node:path'
import {
  buildMcpServerConfigs,
  getMcpConnectionManager,
  getMcpDiscoveryInput,
  type McpDiscoveryInput,
} from '../mcp'
import {
  buildMcpEngineConnections,
  collectMcpPromptCommands,
  mapMcpPromptCommands,
  syncMcpClientRegistry,
} from './adapters/mcpBridge'

import { adaptSandboxToExecutorPort } from './adapters/sandboxAdapter'
import { adaptBootstrapToExecutorPort } from './adapters/bootstrapAdapter'
import { adaptTaskOutputToExecutorPort } from './adapters/taskOutputAdapter'
import { adaptExecutorToHookShellPort } from './adapters/hookShellAdapter'
import { createDiskOutputEnv } from './adapters/diskOutputEnvAdapter'
import { createEndpointConfigSource } from './adapters/endpointConfigSourceAdapter'
import { createInMemorySandboxDeps } from './sandboxDeps'
import { createSessionMemoryPort } from './adapters/sessionMemoryPortAdapter'
import { createAppState, type AppState } from './state'

/** 组合根装配产物（engine 波/消费方持有的域对象 + 已就绪的注入窗口）。 */
export interface CoreDependencies {
  /** sandbox 域：placeholder runtime 禁用态 manager（真 bwrap runtime 包 B6-func/D 波单点换入）。 */
  sandboxManager: SandboxManager
  /** modelprovider 域：lazy 单例（smoke 可经 setModelProviderForTesting 换 fake，§8.13 L-2）。 */
  modelProvider: ModelProvider
  /** memory 域：文件系统 store（只读面；写经真 fs，§8.13 L-1）。 */
  memoryStore: MemoryStore
  /** state 域（D 波 B13）：AppState 真实现（EngineState<SessionSnapshot> 串行
   * apply 队列置换 React 批处理；Port 1 替换面，旧 QueryEngineConfig
   * getAppState/setAppState；注入窗 = setSessionContextPort(appState.port)）。 */
  appState: AppState
}

/**
 * 装配 CoreDependencies（唯一跨域 import 点）。幂等——各 set 窗口可重复调用；
 * 重复装配仅重建 sandboxManager（engine 波可换真 runtime 包后复用此入口）。
 */
export function createCoreDependencies(): CoreDependencies {
  // ① sandbox 域：placeholder runtime 禁用态（isSandboxingEnabled 恒 false，
  //    executor wrapWithSandbox 不被调用；真 deps 归 engine 波 settings 体系）。
  const sandboxManager = createSandboxManager(createInMemorySandboxDeps())

  // ② executor 三 port（§8.8 C2，先于首次 exec）
  setTaskOutputPort(adaptTaskOutputToExecutorPort())
  setBootstrapStatePort(adaptBootstrapToExecutorPort())
  setExecutorSandboxPort(adaptSandboxToExecutorPort(sandboxManager))

  // ③ permissions ← bootstrap（§8.14 注入序首步：两 cwd 态）+
  //    permissions ← engine/config（S-3c settings 路径面，桩① 接真）
  setPermissionsBootstrapEnv({
    getOriginalCwd,
    getCwd: getCwdState,
  })
  setSettingsPathsProvider(getSettingsPaths)

  // ④ task ← permissions+bootstrap（D11，permissions 之后）
  setDiskOutputEnv(createDiskOutputEnv())

  // ⑤ hooks ← bootstrap（E-5 S-5a 三层断补齐，§8.38 C-5 第三断：本接线缺失前
  //    生产路径 runHooks 必 fail-fast 抛「hooks bootstrap 未注入」）+
  //    hooks ← executor（D17，注入序末步；先于首次带命令钩子 runHooks）+
  //    hooks ← engine/config（S-3c settings.hooks 配置面，启动捕获一次快照）。
  //    实际注入序：setHooksBootstrapEnv → setHookShellPort → setHookConfigProvider
  //    → captureHooksConfigSnapshot（三窗口注入期互不依赖，无功能影响；hooks 域
  //    门面头注所列序为推荐序非约束——§8.42 审视 MINOR 注释失真订正）。
  //    3 成员源 = bootstrap 域 ⑤ 族（transcript path 窄适配 /
  //    agent type 缺省 undefined=CLI 面残留守 / trust 缺省 true=headless 信任隐式）。
  setHooksBootstrapEnv({
    getSessionId,
    getCwd: getCwdState,
    getTranscriptPath: getTranscriptPathForSession,
    getMainThreadAgentType,
    isNonInteractive: getIsNonInteractiveSession,
    hasTrustAccepted,
  })
  setHookShellPort(adaptExecutorToHookShellPort())
  setHookConfigProvider(createHooksConfigProvider())
  captureHooksConfigSnapshot()

  // ⑥ managedEnv ← engine/config（S-3d §8.29，旧仓启动序信任前位）：trusted 源
  //    （user/flag/policy）env → process.env（roles lane env 读之前生效）；
  //    applyConfig（信任后全量 env）= 信任对话框面残留守（见头注）。
  applySafeConfigEnvironmentVariables()

  // ⑦ modelprovider ← engine/config settings 面 + env 静态键车道（S-3d §8.29，
  //    替换 B6-func D18 env-only 版）
  setEndpointConfigSource(createEndpointConfigSource())

  // ⑧ S-E2 A8（§8.52）：permissions ← sandbox 状态（S-6a 窗口；placeholder
  //    禁用态 manager 闭包面，结构兼容窄视图 { allowOnly, denyWithinAllow }，
  //    不 import sandbox 域类型；placeholder runtime getFsWriteConfig 抛
  //    unavailable = 旧仓 disabled-stub 语义，消费点被 isSandboxingEnabled
  //    恒 false 短路不可达，测试判别见 loop-deps-compose T-8）
  //    areUnsandboxedCommandsAllowed = 工具本体波 S-T2b 扩面（§8.53，
  //    shouldUseSandbox 逃生支首消费者；旧仓 manager 同法 = settings.sandbox.
  //    allowUnsandboxedCommands ?? true，直绑 sandbox 域 manager 方法）+
  //    S-B4 扩面 4 成员（§8.54 ⑤，bashPrompt getSimpleSandboxSection
  //    配置读面首消费者；窄视图同构，直绑 manager 方法零映射；adapter 壳
  //    零改——executor 端口不消费新成员）
  setSandboxAccess({
    isSandboxingEnabled: sandboxManager.isSandboxingEnabled,
    isAutoAllowBashIfSandboxedEnabled: sandboxManager.isAutoAllowBashIfSandboxedEnabled,
    areUnsandboxedCommandsAllowed: sandboxManager.areUnsandboxedCommandsAllowed,
    getFsWriteConfig: () => {
      const c = sandboxManager.getFsWriteConfig()
      return { allowOnly: c.allowOnly, denyWithinAllow: c.denyWithinAllow }
    },
    getFsReadConfig: sandboxManager.getFsReadConfig,
    getNetworkRestrictionConfig: sandboxManager.getNetworkRestrictionConfig,
    getAllowUnixSockets: sandboxManager.getAllowUnixSockets,
    getIgnoreViolations: sandboxManager.getIgnoreViolations,
  })

  // ⑨ S-E2 A5+A9（§8.52）：session ← bootstrap 真值（3 成员——域缺省
  //    self-randomUUID 与 bootstrap 会话源分家 = 双 session id 隐患消除；
  //    getProjectsDir 不注 = 裁定偏离登记：域缺省 `ATLAS_CONFIG_DIR ??
  //    ~/.atlas` + projects 即旧仓 projects 车道真值自包含，bootstrap 私有
  //    sessions 目录系 hooks-input 辅路，混用会断 record 写面 FROZEN stamp）+
  //    registerCleanup → tasks cleanupRegistry 执行面（unregister 句柄丢弃
  //    = 窗口 void 契约）
  setSessionEnv({
    getSessionId,
    switchSession: id => switchSession(id),
    getOriginalCwd,
    // S-E3 A12（§8.52）：活态 cwd = bootstrap getCwd()（try pwd() catch
    // getOriginalCwd()，旧仓 utils/cwd.ts 逐字——新仓 bootstrap C-Deep 切片 3
    // T4 已落，回落支非裁面）。消费点 = project.ts insertMessageChain cwd 戳
    // （审视 A-1 值 delta 核销）；键控点 getProjectDir(getOriginalCwd()) 不动。
    getCwd,
    registerCleanup: handler => {
      registerCleanup(handler)
    },
  })

  // ⑩ S-E2 A6+A7（§8.52）→ S-E2d 提交 2 B13 置换（§8.67.1.5）：Port 5 壳
  //    实现 + Port 1 AppState 真实现（atlascode/state，EngineState<
  //    SessionSnapshot> 串行 apply 队列置换旧仓 React functional-update；
  //    strangler 整换 A7 闭包壳，适配器零引用后删）注入
  setSessionMemoryPort(createSessionMemoryPort())
  const appState = createAppState()
  setSessionContextPort(appState.port)

  // ⑪ S-E2 A9（§8.52）：通知 ← messaging 真队列（enqueuePendingNotification；
  //    delta 登记（S-E2 审视订正）：类型面两侧均保留 agentId
  //    （TaskNotification.agentId notification.ts:27 / QueuedCommand.agentId
  //    queueTypes.ts:133 旧仓逐字「Undefined = 主线程」）——本 handler 未接
  //    n.agentId → QueuedCommand.agentId 定向投递路由 = shell/swarm 波
  //    前向接缝（字段已在，届时仅需 handler 接线））+ scheduler 退出清理 →
  //    tasks cleanupRegistry（unregister 句柄签名逐字匹配；getProjectRoot/
  //    getOwnerKey 保持域缺省——S-7b 审视确证 = 旧仓真逻辑非 stub）
  setTaskNotificationHandler(n =>
    enqueuePendingNotification({
      value: n.value,
      mode: 'task-notification',
      priority: n.priority,
    }),
  )
  setSchedulerEnv({
    registerExitCleanup: fn => registerCleanup(fn),
  })

  // ⑫ S-E2d（§8.66 C 桶 ③ shell·swarm 波）：swarm 域组合根接线——
  //    backends ① 注入窗（wireBackends = setBackendModule 4 成员，R3
  //    零 any 重建）+ inProcessRunner hub 1536L seam ② 真实现
  //    （inProcessRunner 模块零顶层副作用，PRT-2 显式装配）+
  //    TeamServices 接缝（swarm team-file 9 面真实现 + 内存缺省
  //    team-context store；engine↛swarm L3 隔离，teamServices.ts 头注）+
  //    sendMessageTool TeamFileLoader 真读者（§8.66.1.4 核销 ③：
  //    缺省 loader 缺省报错面换血，readTeamFileAsync = team-file 域
  //    单一事实源）
  wireBackends()
  setStartInProcessTeammate(startInProcessTeammate)
  setTeamServices({
    readTeamFile,
    writeTeamFileAsync,
    getTeamFilePath,
    registerTeamForSessionCleanup,
    unregisterTeamForSessionCleanup,
    cleanupTeamDirectories,
    assignTeammateColor,
    clearTeammateColors,
    sanitizeName,
    ...createDefaultTeamContextStore(),
  })
  setTeamFileLoader(readTeamFileAsync)
  // S-E3 修波（A 路 blocker，§8.66 delta ⑧ 回填）：teammate 工具池
  //    deps 注入窗 ⑬——⑫ 静态底线 = registry 3 工具 materialize 面
  //    （与 createAgentLoopDeps ⑨⑮ baseTools 追加同源）；per-run 全量
  //    池由 createAgentLoopDeps 以全量 toolRegistryDeps 重建（= 父会话
  //    loop 池 ≡ teammate 池，旧仓 options.tools 等价面）。
  setTeammateToolRegistryDeps({
    baseTools: [SnipTool, TeamCreateTool, TeamDeleteTool],
  })

  // W3-3b（§8.74.15）：engine 层构建器（engine/loopDeps）壳侧 port 注册——
  //    ① teammate 池同步 = swarm setTeammateToolRegistryDeps（构建器全量
  //       deps 重建面，teammate 池 ≡ 父会话 loop 池不变量）
  //    ② MCP 连接快照 = mcpBridge buildMcpEngineConnections（manager 态
  //       快照裁定不变：新连接先 initMcpConnections 再重建 deps）
  setAgentLoopDepsTeammatePoolSync(setTeammateToolRegistryDeps)
  setAgentLoopDepsMcpConnectionsProvider(() =>
    buildMcpEngineConnections(getMcpConnectionManager()),
  )

  // ⑮ G-2（2026-09-30 R1 裁定，§8.74.27）：WebSearch 客户端化 settings 键
  //    面——settings.json search.tavilyApiKey（模板项见仓根 settings.template.json）；
  //    优先级 env TAVILY_API_KEY > 本键（provider 层 resolveWebSearchApiKey
  //    内裁定）。try/catch：启动早位 settings 读面未就绪/文件不可读 → 键面
  //    降级 env-only，不阻断组合根装配。
  setWebSearchSettingsKeyProvider(() => {
    try {
      const s = getInitialSettings()
      return s.search?.tavilyApiKey
    } catch {
      return undefined
    }
  })

  // #262 缺口③（llmTimeoutMs 死键，headless 设置源缝未接；与缺口①「headless
  //    公共 entry 层」同族，live 复现铁证）：headless 车道补 settings llmTimeoutMs
  //    超时档读侧缝——TUI 经 wireContextHostPorts 注（contextHostWiring.ts:235），
  //    headless 此前全死 → settings.json llmTimeoutMs 恒 600s（用户 #260
  //    remediation「改 settings 没用」主诉）。provider 活态 resolver（getModelProvider
  //    第三参）现读此源，与 getCurrentLlmTimeoutMs 提示面同源（两车道对齐不分裂）。
  //    try/catch：启动早位 settings 未就绪/不可读 → 降级 env-or-缺省，不阻断组合
  //    根装配（同 ⑮ WebSearch 键面纪律）。autoCompactWindow / timeBasedMCConfig 同类
  //    headless 缝未接 = 后续「headless settings 缝」族（本波聚焦 llmTimeoutMs =
  //    用户 #260 死键主诉 + 探针实证）。
  setLlmTimeoutSettingsSource(() => {
    try {
      const v = getInitialSettings().llmTimeoutMs
      return typeof v === 'number' ? v : undefined
    } catch {
      return undefined
    }
  })

  return {
    sandboxManager,
    modelProvider: getModelProvider(),
    memoryStore: new FileSystemMemoryStore(),
    appState,
  }
}

/**
 * W3-3b（§8.74.15）：createAgentLoopDeps 构建器已迁 engine 层
 * （engine/loopDeps.ts——cli 公共域不反向依赖壳 + 元素级环防；壳侧 2 面
 * port 注册见 wire 步 ⑬ 后块，构建器头注 ①②）。本处薄 re-export 保留
 * 壳消费路径（atlascode/index 门面 + swarm 前向消费方 import 路径不变）。
 */
export {
  createAgentLoopDeps,
  setAgentLoopDepsTeammatePoolSync,
  setAgentLoopDepsMcpConnectionsProvider,
  type AgentLoopDepsConfig,
  type AgentLoopDepsBundle,
} from '../engine'

/**
 * ⑭ S-E2d（§8.68 remote 波）：MCP 连接生命周期组合根接线（显式动作；
 * CLI 波启动消费接缝）。链：
 *   ① 发现输入（注入窗 getMcpDiscoveryInput → 缺省 = settings mcpServers
 *      record + 项目 .mcp.json〔buildMcpServerConfigs 最小 2 源，scope
 *      user/project；坏台/坏文件跳过面域内保真〕）
 *   ② manager 全量 connect（Promise.allSettled：单台失败不沉全果；
 *      非 stdio 传输 = 前向接缝登记 failed 态，域内裁定面不变）
 *   ③ syncMcpClientRegistry 实填（listResources/readResource 真实现；
 *      重复调用 = 幂等覆写注册窗）
 *   ④ MCP skill 注册窗供给（collectMcpPromptCommands → mapMcpPrompt
 *      Commands → setMcpSkillCommandSource；getMcpSkillCommands ⑥
 *      核销，过滤面逐字 + 无参面读窗）
 * builder（createAgentLoopDeps）路径不自动触发本动作（零意外 I/O 裁定，
 * 见头注 ⑭ 块）；重复调用 = 重连 + 再 sync（connected 态去重直接返回，
 * failed 态重跑生命周期 = manager connect 语义不变）。
 */
export async function initMcpConnections(): Promise<void> {
  const input: McpDiscoveryInput =
    getMcpDiscoveryInput() ??
    ({
      settingsServers: getSettingsWithErrors().settings?.mcpServers,
      projectMcpJsonPath: join(getOriginalCwd(), '.mcp.json'),
    })
  const configs = await buildMcpServerConfigs(input)
  const manager = getMcpConnectionManager()
  await Promise.allSettled(
    Object.entries(configs).map(([name, config]) =>
      manager.connect(name, config),
    ),
  )
  syncMcpClientRegistry(manager)
  // ④ MCP skill 注册窗供给（快照语义 = 注册时点 connected 态命令面，
  // 与 builder mcpTools 快照裁定同型；新连接 = 再 initMcpConnections
  // 重注册。collectMcpPromptCommands 走 mcpFetch LRU 缓存（② 已
  // settle，缓存命中零 I/O；drop 后 miss = 重拉面供应商早退 []
  // 降级，非假绿）
  const mcpPromptCommands = await collectMcpPromptCommands(manager)
  setMcpSkillCommandSource(() => mapMcpPromptCommands(mcpPromptCommands))
}

/**
 * 进程关闭清理（S-E2 A9）：tasks cleanupRegistry 全量执行（CLI 关闭路径
 * D 波消费；本波只暴露不消费）。
 */
export function runCoreCleanup(): Promise<void> {
  return runCleanupFunctions()
}

let _core: CoreDependencies | undefined

/** lazy 单例（旧仓 factory.ts 同款 idiom）：首访问装配，其后复用。 */
export function getCoreDependencies(): CoreDependencies {
  return (_core ??= createCoreDependencies())
}

/** 测试复位（teardown 用）：清掉装配缓存，恢复未装配态。 */
export function resetCoreDependencies(): void {
  _core = undefined
}
