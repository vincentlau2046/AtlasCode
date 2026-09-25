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
 *     + createAgentLoopDeps 构建器（A4：getTools 组合根消费 + 权限门 +
 *     hooks 装配① 单入口）+ runCoreCleanup 暴露
 *
 * 残留守（§8.29）：applyConfigEnvironmentVariables（信任后全量 env）→ 信任
 * 对话框面（新仓未落；§8.28 预声明消费接缝此处重登记，旧仓启动序
 * applySafe → 信任对话框 → applyConfig）。
 */
import { createSandboxManager, type SandboxManager } from '../sandbox'
import {
  getModelProvider,
  setEndpointConfigSource,
  type ModelProvider,
  type ModelRole,
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
  type HookRunOptions,
} from '../hooks'
import {
  applySafeConfigEnvironmentVariables,
  captureHooksConfigSnapshot,
  createHooksConfigProvider,
  createLoopHooks,
  createPermissionGate,
  enqueuePendingNotification,
  getSettingsPaths,
  getTools,
  initializeToolPermissionContext,
  registerCleanup,
  runCleanupFunctions,
  setSchedulerEnv,
  setSessionContextPort,
  setSessionEnv,
  setSessionMemoryPort,
  setTaskNotificationHandler,
  type AgentLoopDeps,
  type ToolRegistryDeps,
} from '../engine'
import type { PermissionMode, ToolPermissionContext, Tools } from '../shared'
import {
  getIsNonInteractiveSession,
  getMainThreadAgentType,
  getCwdState,
  getSessionId,
  getOriginalCwd,
  getTranscriptPathForSession,
  hasTrustAccepted,
  switchSession,
} from '../bootstrap'

import { adaptSandboxToExecutorPort } from './adapters/sandboxAdapter'
import { adaptBootstrapToExecutorPort } from './adapters/bootstrapAdapter'
import { adaptTaskOutputToExecutorPort } from './adapters/taskOutputAdapter'
import { adaptExecutorToHookShellPort } from './adapters/hookShellAdapter'
import { createDiskOutputEnv } from './adapters/diskOutputEnvAdapter'
import { createEndpointConfigSource } from './adapters/endpointConfigSourceAdapter'
import { createInMemorySandboxDeps } from './sandboxDeps'
import { createSessionMemoryPort } from './adapters/sessionMemoryPortAdapter'
import { createSessionContextPort } from './adapters/sessionContextPortAdapter'

/** 组合根装配产物（engine 波/消费方持有的域对象 + 已就绪的注入窗口）。 */
export interface CoreDependencies {
  /** sandbox 域：placeholder runtime 禁用态 manager（真 bwrap runtime 包 B6-func/D 波单点换入）。 */
  sandboxManager: SandboxManager
  /** modelprovider 域：lazy 单例（smoke 可经 setModelProviderForTesting 换 fake，§8.13 L-2）。 */
  modelProvider: ModelProvider
  /** memory 域：文件系统 store（只读面；写经真 fs，§8.13 L-1）。 */
  memoryStore: MemoryStore
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
  setSandboxAccess({
    isSandboxingEnabled: sandboxManager.isSandboxingEnabled,
    isAutoAllowBashIfSandboxedEnabled: sandboxManager.isAutoAllowBashIfSandboxedEnabled,
    getFsWriteConfig: () => {
      const c = sandboxManager.getFsWriteConfig()
      return { allowOnly: c.allowOnly, denyWithinAllow: c.denyWithinAllow }
    },
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
    registerCleanup: handler => {
      registerCleanup(handler)
    },
  })

  // ⑩ S-E2 A6+A7（§8.52）：Port 5/Port 1 壳实现 + 注入（壳 = 组合根最小真
  //    实现防 H6 空洞；D 波/CLI 波注真实现经同一窗口整换）
  setSessionMemoryPort(createSessionMemoryPort())
  setSessionContextPort(createSessionContextPort())

  // ⑪ S-E2 A9（§8.52）：通知 ← messaging 真队列（enqueuePendingNotification；
  //    delta 登记：n.agentId 丢弃——新仓 QueuedCommand 裁 agentId 字段，
  //    定向投递路由 = shell/swarm 波前向接缝）+ scheduler 退出清理 →
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

  return {
    sandboxManager,
    modelProvider: getModelProvider(),
    memoryStore: new FileSystemMemoryStore(),
  }
}

/**
 * loop 依赖装配配置（S-E2 A4，§8.52）：CLI 权限面 + 工具注册表注入 +
 * loop 执行面。D 波 cli.ts 以 createAgentLoopDeps 为单入口消费。
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
  /** 工具注册表注入（47 本体经 deps 增量注入的前向面）。 */
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
}

/** loop 依赖装配产物（S-E2 A4）：权限上下文 + 模型可见工具池 + loop deps。 */
export interface AgentLoopDepsBundle {
  /** initializeToolPermissionContext 产物（门 + 工具池 + 快照共用源）。 */
  toolPermissionContext: ToolPermissionContext
  /** getTools(ctx, deps) 模型可见工具池（deny 过滤 + isEnabled 尾行）。 */
  tools: Tools
  /** queryOneRound/queryAgentLoop 直接消费面（门 + hooks 已接线）。 */
  deps: AgentLoopDeps
}

/**
 * loop 依赖构建器（S-E2 A4，§8.52 裁定 2 A 桶）——组合根消费 getTools /
 * 权限门 / hooks 装配① 的唯一入口（loop.ts:108「本纵切不造全局注册表」
 * 消费接缝兑现；旧仓 QueryEngine.ts:543 permissionMode ← ctx.mode 先例）：
 *   ① initializeToolPermissionContext（CLI 面 + 注册表 deps）
 *   ② getTools(ctx, deps)（注册表组合根消费点：getAllBaseTools + deny
 *      过滤 + isEnabled 尾行，47 本体仍经 deps 注入前向）
 *   ③ createPermissionGate(ctx)（S-E1 I-1 全决策体语义消费）
 *   ④ createLoopHooks（§8.42 项 1 hooks 装配① 生产路径）
 *   ⑤ AgentLoopDeps 组装（modelProvider 单例 + role 车道）
 */
export async function createAgentLoopDeps(
  config: AgentLoopDepsConfig = {},
): Promise<AgentLoopDepsBundle> {
  const toolRegistryDeps = config.toolRegistryDeps ?? {}
  const { toolPermissionContext } = await initializeToolPermissionContext({
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
  const checkPermission = createPermissionGate(toolPermissionContext)
  const hooks = createLoopHooks({
    options: {
      sessionId: getSessionId(),
      permissionMode: toolPermissionContext.mode,
      ...config.hookOptions,
    },
  })
  const deps: AgentLoopDeps = {
    modelProvider: getCoreDependencies().modelProvider,
    role: config.role ?? 'premium',
    signal: config.signal,
    checkPermission,
    hooks,
  }
  return { toolPermissionContext, tools, deps }
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
