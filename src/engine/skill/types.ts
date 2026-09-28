/**
 * engine/skill — 命令/技能类型面（§8.67 D 波 S-E2a，D 桶 ①）。
 *
 * 旧仓 src/types/command.ts 迁面：PromptCommand + CommandBase + Command
 * 判别联合 + getCommandName/isCommandEnabled + LoadedFrom。
 *
 * 裁面登记（复审勿当遗漏重提）：
 *   ① LocalCommand / LocalJSXCommand 族（type 'local'/'local-jsx'，TUI
 *      命令实现面：LocalJSXCommandContext 的 theme/ide/resume 字段 +
 *      LocalCommandResult/LocalJSXCommandOnDone/ResumeEntrypoint 型）→
 *      TUI 波。新仓 getCommands 池 = prompt 源（bundled/skill 目录/
 *      dynamic/插件·MCP 注入窗），无 local/local-jsx 实例 → 联合裁为
 *      PromptCommand 单形（Command = CommandBase & PromptCommand）。
 *   ② PromptCommand.source 的 'mcp' 值保留（MCP skill 加载面 = remote 波
 *      前向接缝；注入窗未注册时池内无 mcp 实例）。
 *   ③ 旧 ToolUseContext（富 context：options.agentDefinitions/messages/
 *      setAppState…）→ SkillCommandContext duck（新 loop 传最小 context
 *      { signal, checkPermission }，pipeline/toolExecution.ts:314-319 面）。
 *      getPromptForCommand 消费面 = getAppState（TPC Set-union 覆写，窄
 *      spine 未提供时跳过）+ checkPermission（shell 块权限门）+ signal。
 */
import type { ContentBlockParam, EffortValue } from '../../shared'
import type { HooksSettings } from '../config'

/**
 * 新 loop 最小工具 context duck（pipeline/toolExecution.ts 透传面：
 * { signal, checkPermission }）。skill 域按面消费，字段全部可选（窄
 * spine 语义：未注入 = 默认放行 / 跳过）。
 */
export type SkillCommandContext = {
  signal?: AbortSignal
  /** 权限门透传（旧仓 hasPermissionsToUseTool 面；未注入 = 窄 spine 放行）。 */
  checkPermission?: unknown
  /** appState 读面（TPC alwaysAllowRules Set-union 覆写消费；未提供 = 跳过）。 */
  getAppState?: () => unknown
  /**
   * 子代理标识（coordinator 分支判定消费：主线程 = undefined → 走
   * coordinator 摘要支；worker 子代理 = 有值 → 穿透取真 skill 内容）。
   * 旧仓 ToolUseContext.agentId 面。
   */
  agentId?: string
}

/**
 * 声明命令/技能在哪些 auth/provider 环境可用（旧仓 CommandAvailability
 * 逐字语义）。与 isEnabled() 分离：availability = 静态谁能用，
 * isEnabled() = 当下是否开着。
 */
export type CommandAvailability =
  // claude.ai OAuth 订阅者（新仓 auth 车道 = OpenAI 静态键，此支恒不可达
  // 保留字面量 = meetsAvailabilityRequirement 穷尽 switch 的判别面）。
  | 'claude-ai'
  // Console API key 用户（一方网关直连）。
  | 'console'
  // 国产 vendor（OpenAI 协议 endpoint/key）。
  | 'vendor'

export type CommandBase = {
  availability?: CommandAvailability[]
  description: string
  hasUserSpecifiedDescription?: boolean
  /** 默认 true。仅当命令有条件启用（feature flag / env 检查）时设置。 */
  isEnabled?: () => boolean
  /** 默认 false。仅当命令应从 typeahead/help 隐藏时设置。 */
  isHidden?: boolean
  name: string
  aliases?: string[]
  isMcp?: boolean
  argumentHint?: string // 命令参数的提示文本（显示在命令后灰色）
  whenToUse?: string // 来自 "Skill" 规范：详细使用场景
  version?: string // 命令/技能版本
  disableModelInvocation?: boolean // 是否禁止模型调用此命令
  userInvocable?: boolean // 用户是否可 /skill-name 调用
  loadedFrom?:
    | 'commands_DEPRECATED'
    | 'skills'
    | 'plugin'
    | 'managed'
    | 'bundled'
    | 'mcp' // 命令加载来源
  kind?: 'workflow' // 区分 workflow 支撑的命令（本波裁，字面量保留）
  immediate?: boolean // true = 不等 stop point 立即执行（TUI 波消费）
  isSensitive?: boolean // true = 参数从会话历史脱敏
  /** 默认 `name`。仅当显示名不同时覆盖（如插件前缀剥离）。 */
  userFacingName?: () => string
}

export type PromptCommand = {
  type: 'prompt'
  progressMessage: string
  contentLength: number // 命令内容字符长度（token 估算用）
  argNames?: string[]
  allowedTools?: string[]
  model?: string
  source: string // SettingSource | 'builtin' | 'mcp' | 'plugin' | 'bundled'
  pluginInfo?: {
    pluginManifest: Record<string, unknown>
    repository: string
  }
  disableNonInteractive?: boolean
  /** 此 skill 调用时注册 hooks */
  hooks?: HooksSettings
  /** skill 资源基础目录（skill hooks 的 ATLAS_PLUGIN_ROOT 环境变量） */
  skillRoot?: string
  /** 执行上下文：'inline'（默认，展开进当前会话）或 'fork'（子代理执行） */
  context?: 'inline' | 'fork'
  /** fork 时使用的 agent 类型（如 'general-purpose'）。仅 context='fork' 适用 */
  agent?: string
  effort?: EffortValue
  /** 本 skill 适用的文件路径 glob 模式；设置后仅在模型触碰匹配文件后可见 */
  paths?: string[]
  getPromptForCommand(
    args: string,
    context: SkillCommandContext,
  ): Promise<ContentBlockParam[]>
}

/**
 * 新仓 Command = prompt 单形（裁面 ①：local/local-jsx 族 → TUI 波）。
 */
export type Command = CommandBase & PromptCommand

/** 命令加载来源（旧仓 loadSkillsDir LoadedFrom 逐字）。 */
export type LoadedFrom =
  | 'commands_DEPRECATED'
  | 'skills'
  | 'plugin'
  | 'managed'
  | 'bundled'
  | 'mcp'

/** 解析用户可见名，未覆盖时回落 `cmd.name`。 */
export function getCommandName(cmd: CommandBase): string {
  return cmd.userFacingName?.() ?? cmd.name
}

/** 解析命令是否启用，默认 true。 */
export function isCommandEnabled(cmd: CommandBase): boolean {
  return cmd.isEnabled?.() ?? true
}
