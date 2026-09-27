/**
 * backends 类型层 — R3 any-stub 零 any 类型重建（S-E2a；§8.66.1.2 R3）。
 *
 * 源面 = 旧仓 a8af45b src/utils/swarm/backends/types.ts（11L）：10 个 `: any`
 * 退化声明 + `export * from all-local-types` re-export 退化面（all-local-types
 * 同族 stub）。本文件按 4 消费端反推真形（H6：绝不当 `: any` stub 签名当真
 * 行为；stub 签名零信息量，真形以消费端调用/实现面为据）：
 *   - TmuxBackend（L104-368 公共面 14 成员）/ ITermBackend（L79-357）= PaneBackend 两实现
 *   - InProcessBackend（L38-339）/ PaneBackendExecutor（L39-339）= TeammateExecutor 两实现
 *   - registry（detectAndGetBackend 三成功支 + getBackendByType 判别）= 检测/注册消费面
 *   - teamHelpers L607/622 + teamDiscovery L71 = isPaneBackend 守卫消费面
 * 跨域：旧 ToolUseContext（Tool.ts 50+ 字段全量面）不随迁 = TUI 波/D 波 →
 *   本域窄视图 TeammateExecutorContext（duck 型先例 = TaskToolUseContext §8.56）；
 *   Message = shared 单一事实源（shared/types.ts，旧仓 types/message.ts 镜像）。
 * 注：messaging 域 BackendType = string（mailbox schema z.string() 对齐的退化最小形
 *   镜像，messaging/constants.ts 头注）为 schema 面命名；本域 BackendType = 3 值判别
 *   联合（executor type 判别用），两域各自 head 注登记，不互引（命名撞车面登记）。
 *
 * S-E2c backends 族扩面（§8.66 切片 3）：
 *   - TeammateToolState += tasks（InProcessBackend terminate/kill/isActive 支
 *     findTeammateTaskByAgentId(agentId, state.tasks) 消费；task 域单一事实源）。
 *   - TeammateExecutorContext += setAppState（InProcessBackend terminate/kill
 *     支 requestTeammateShutdown / killInProcessTeammate 消费）
 *     += toolUseId（spawnInProcess createTaskStateBase 第 4 参消费，旧
 *     ToolUseContext.toolUseId 窄视图；缺省 undefined 逐字透传）。
 *   - TeammateToolState.toolPermissionContext.mode: string → PermissionMode
 *     （shared types-session 冻结契约；PaneBackendExecutor.spawn 继承支
 *     buildInheritedCliFlags(options.permissionMode?: PermissionMode) 直接
 *     消费，string 宽形不可赋值；旧仓 AppState 真形即 PermissionMode）。
 */
import type { Message, PermissionMode } from '../../shared'
import type { SetAppState, TaskStateBase } from '../../task'
import type { TeammateContext } from '../teammateContext'

/** tmux/it2 pane 标识（旧 PaneId = any stub → 消费端 string 形：killPane('-t', paneId) 全链）。 */
export type PaneId = string

/**
 * Agent 配色 8 值（旧仓 AgentTool/agentColorManager.ts:4-12 逐字本地镜像；
 * UI 面 getAgentColor / AGENT_COLOR_TO_THEME_COLOR（keyof Theme）随 TUI 波，不镜像）。
 */
export type AgentColorName =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'purple'
  | 'orange'
  | 'pink'
  | 'cyan'

/**
 * 配色轮转序（旧仓 AgentTool/agentColorManager.ts:14-23 AGENT_COLORS 名序
 * 逐字镜像；S-E2b 增补——teammateLayoutManager round-robin 消费）。
 * AGENT_COLOR_TO_THEME_COLOR（keyof Theme UI 映射）不镜像 = TUI 波裁面。
 */
export const AGENT_COLORS: readonly AgentColorName[] = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'pink',
  'cyan',
]

/** Pane 系后端类型判别（tmux 内建 / iTerm2 it2 CLI）。 */
export type PaneBackendType = 'tmux' | 'iterm2'

/** 全部 teammate 后端类型（pane 两态 + in-process；InProcessBackend.type = 'in-process'）。 */
export type BackendType = PaneBackendType | 'in-process'

/**
 * 守卫：pane 系后端才可走 killPane/hidePane/sendCommandToPane 等 pane 操作。
 * 旧 isPaneBackend = `(() => ({})) as any` stub 零信息量 → 消费端语义重建
 *（teamHelpers L622 `!m.tmuxPaneId || !m.backendType || !isPaneBackend(...)` 守卫链）。
 */
export function isPaneBackend(
  type: BackendType | undefined | null,
): type is PaneBackendType {
  return type === 'tmux' || type === 'iterm2'
}

/** createTeammatePaneInSwarmView 返回形（TmuxBackend 内外两创建路径 + ITermBackend 反推）。 */
export type CreatePaneResult = {
  paneId: PaneId
  isFirstTeammate: boolean
}

/**
 * spawn 配置（两 executor spawn 消费面反推：PaneBackendExecutor L79-216 /
 * InProcessBackend L72-150；字段并集，pane 系独有 paneId 出参不入配置）。
 */
export type TeammateSpawnConfig = {
  /** Teammate display name（agentName 半，禁含 '@'） */
  name: string
  /** Team name（teamName 半） */
  teamName: string
  /** Initial instructions（经 mailbox 首条消息投递） */
  prompt: string
  color?: AgentColorName
  planModeRequired?: boolean
  /** Per-teammate model override（缺省走 getHardcodedTeammateModelFallback / 继承链） */
  model?: string
  systemPrompt?: string
  /** 系统提示词组装模式（旧 inProcessRunner.ts:487 真型；default = 全量 + addendum）。 */
  systemPromptMode?: 'default' | 'replace' | 'append'
  /** Allowed tools（InProcessBackend 透传 runAgent allowedTools 面） */
  permissions?: string[]
  allowPermissionPrompts?: boolean
  /** Working dir（pane 系 spawn 命令 cd 前缀） */
  cwd?: string
  /** Leader session ID 透传（缺省 = 当前 sessionId） */
  parentSessionId?: string
}

/**
 * spawn 结果形（两 executor 返回支反推：InProcessBackend 带 taskId/teammateContext/
 * abortController（agent loop 拉起面），pane 系带 paneId；error 仅失败支）。
 */
export type TeammateSpawnResult = {
  success: boolean
  agentId: string
  taskId?: string
  paneId?: PaneId
  teammateContext?: TeammateContext
  abortController?: AbortController
  error?: string
}

/** executor 层消息形（writeToMailbox 第二参消费面反推；mailbox 专属 schema 族在 messaging/mailbox）。 */
export type TeammateMessage = {
  text: string
  from: string
  color?: AgentColorName
  timestamp?: string
}

/**
 * 旧 AppState 窄视图（PaneBackendExecutor.spawn 消费面：
 * getAppState().toolPermissionContext.mode → buildInheritedCliFlags 继承支；
 * InProcessBackend terminate/kill/isActive 消费面：tasks → findTeammateTaskByAgentId）。
 * 全量 AppState 面 = TUI 波/D 波（残留守登记）。
 */
export interface TeammateToolState {
  /** 权限态窄视图（S-E2c：mode 收窄为 shared PermissionMode 冻结契约，登记见头注）。 */
  toolPermissionContext: { mode: PermissionMode }
  /** teammate 任务表（task 域 TaskStateBase 槽位单一事实源；S-E2c 扩面登记）。 */
  tasks: Record<string, TaskStateBase>
}

/**
 * 旧 ToolUseContext 窄视图（duck 型，TaskToolUseContext 先例 §8.56）：
 *   - PaneBackendExecutor.spawn：getAppState() 继承 CLI flags 支
 *   - InProcessBackend.spawn：{...context, messages: []} 剥离透传 agent loop
 *    （P-S1 裁定改直连：runAgent 已在 engine 根门面，S-E2d inProcessRunner 经
 *     engine 门面消费，零 port）
 *   - InProcessBackend terminate/kill：setAppState（S-E2c 扩面登记）
 *   - spawnInProcess createTaskStateBase 第 4 参：toolUseId（S-E2c 扩面登记）
 * 全量 ToolUseContext 50+ 字段面 = TUI 波/D 波（残留守登记）。
 */
export interface TeammateExecutorContext {
  getAppState(): TeammateToolState
  setAppState: SetAppState
  toolUseId?: string
  messages: Message[]
}

/**
 * Pane 后端接口（tmux / iTerm2 两实现）— 14 成员公共面并集
 *（TmuxBackend L104-368 + ITermBackend L79-357 逐签名反推；ITerm supportsHideShow=false，
 * hidePane/showPane 为 false 返回 stub 实现，签名同形）。
 */
export interface PaneBackend {
  readonly type: PaneBackendType
  readonly displayName: string
  readonly supportsHideShow: boolean
  isAvailable(): Promise<boolean>
  isRunningInside(): Promise<boolean>
  createTeammatePaneInSwarmView(
    name: string,
    color: AgentColorName,
  ): Promise<CreatePaneResult>
  sendCommandToPane(
    paneId: PaneId,
    command: string,
    useExternalSession?: boolean,
  ): Promise<void>
  setPaneBorderColor(
    paneId: PaneId,
    color: AgentColorName,
    useExternalSession?: boolean,
  ): Promise<void>
  setPaneTitle(
    paneId: PaneId,
    name: string,
    color: AgentColorName,
    useExternalSession?: boolean,
  ): Promise<void>
  enablePaneBorderStatus(
    windowTarget?: string,
    useExternalSession?: boolean,
  ): Promise<void>
  rebalancePanes(windowTarget: string, hasLeader: boolean): Promise<void>
  killPane(paneId: PaneId, useExternalSession?: boolean): Promise<boolean>
  hidePane(paneId: PaneId, useExternalSession?: boolean): Promise<boolean>
  showPane(
    paneId: PaneId,
    targetWindowOrPane: string,
    useExternalSession?: boolean,
  ): Promise<boolean>
}

/**
 * Teammate 执行器接口（pane 系 / in-process 两实现）— 8 成员公共面并集
 *（InProcessBackend L38-339 + PaneBackendExecutor L39-339 逐签名反推）。
 */
export interface TeammateExecutor {
  readonly type: BackendType
  setContext(context: TeammateExecutorContext): void
  isAvailable(): Promise<boolean>
  spawn(config: TeammateSpawnConfig): Promise<TeammateSpawnResult>
  sendMessage(agentId: string, message: TeammateMessage): Promise<void>
  terminate(agentId: string, reason?: string): Promise<boolean>
  kill(agentId: string): Promise<boolean>
  isActive(agentId: string): Promise<boolean>
}

/**
 * 后端检测结果（registry detectAndGetBackend 三成功支反推：
 * { backend, isNative, needsIt2Setup }；失败支 = throw，无空形）。
 */
export type BackendDetectionResult = {
  backend: PaneBackend
  isNative: boolean
  needsIt2Setup: boolean
}
