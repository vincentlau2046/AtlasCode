/**
 * shared 会话级类型骨架 — 契约冻结（B 波分叉前锁死）
 *
 * 旧仓来源（a8af45b）→ 新仓 shared 下沉：
 *   PermissionRule / ToolPermissionContext ← src/types/permissions.ts
 *   MCPServerConnection                    ← src/services/mcp/types.ts
 *   TaskState / TaskStateBase              ← src/tasks/types.ts（旧仓 = any stub）
 *
 * 关键发现（类型提取 agent 报告）：
 *  - ToolPermissionContext 旧仓双定义（Tool.ts DeepImmutable 版 + permissions.ts readonly 版），
 *    DeepImmutable 是 any stub → 此处冻结用 readonly 版（permissions.ts:427）
 *  - AlwaysAllowRule 等不存在 → 规则按 PermissionBehavior 区分非类型名
 *  - TaskState 旧仓 = any stub → 此处基于 TaskStateBase（Task.ts:45）定义
 */

// ════════════════════════════════════════════════════════════════
// Permission 类型（旧仓 src/types/permissions.ts）
// ════════════════════════════════════════════════════════════════

export type PermissionBehavior = "allow" | "deny" | "ask"

export type PermissionRuleSource =
  | "userSettings"
  | "projectSettings"
  | "localSettings"
  | "flagSettings"
  | "policySettings"
  | "cliArg"
  | "command"
  | "session"

export type PermissionRuleValue = {
  toolName: string
  ruleContent?: string
}

export type PermissionRule = {
  source: PermissionRuleSource
  ruleBehavior: PermissionBehavior
  ruleValue: PermissionRuleValue
}

export type ToolPermissionRulesBySource = {
  [T in PermissionRuleSource]?: string[]
}

// ════════════════════════════════════════════════════════════════
// PermissionMode（旧仓 src/types/permissions.ts:16-29）
// ════════════════════════════════════════════════════════════════

export type ExternalPermissionMode =
  | "acceptEdits"
  | "bypassPermissions"
  | "default"
  | "dontAsk"
  | "plan"

export type InternalPermissionMode = ExternalPermissionMode | "auto" | "bubble"

export type PermissionMode = InternalPermissionMode

// ════════════════════════════════════════════════════════════════
// AdditionalWorkingDirectory（旧仓 src/types/permissions.ts:138-146）
// ════════════════════════════════════════════════════════════════

export type WorkingDirectorySource = PermissionRuleSource

export type AdditionalWorkingDirectory = {
  path: string
  source: WorkingDirectorySource
}

// ════════════════════════════════════════════════════════════════
// ToolPermissionContext（旧仓 permissions.ts:427-441 readonly 版，非 Tool.ts DeepImmutable 版）
// ════════════════════════════════════════════════════════════════

export type ToolPermissionContext = {
  readonly mode: PermissionMode
  readonly additionalWorkingDirectories: ReadonlyMap<
    string,
    AdditionalWorkingDirectory
  >
  readonly alwaysAllowRules: ToolPermissionRulesBySource
  readonly alwaysDenyRules: ToolPermissionRulesBySource
  readonly alwaysAskRules: ToolPermissionRulesBySource
  readonly isBypassPermissionsModeAvailable: boolean
  readonly strippedDangerousRules?: ToolPermissionRulesBySource
  readonly shouldAvoidPermissionPrompts?: boolean
  readonly awaitAutomatedChecksBeforeDialog?: boolean
  readonly prePlanMode?: PermissionMode
}

// ════════════════════════════════════════════════════════════════
// Permission 决策 / 更新类型（旧仓 src/types/permissions.ts，C-Deep 切片 3 T5）
//
// 薄骨架裁量（复审勿当遗漏重提）：
//  - PermissionDecisionReason 只留薄骨架 checkRead/checkWrite 实际产出的
//    变体（rule/mode/workingDir/safetyCheck/other）；classifier/hook/
//    asyncAgent/sandboxOverride/permissionPromptTool 变体归 engine 波
//    （随 yoloClassifier/permissionSetup 真求值）。
//  - subcommandResults 变体 = 工具本体波 S-T2a 恢复（2026-09-25，§8.53）：
//    bashCommandHelpers.checkCommandOperatorPermissions 为第一真消费者
//    （分段 ask 决策逐字产 { type:'subcommandResults', reasons }）；
//    纯加性 union 扩展，既有消费者零影响。
//  - contentBlocks（ContentBlockParam）/ pendingClassifierCheck 字段不随迁
//    （classifier 归 auto-mode 纵切波）——薄骨架 ask 决策不携内容块/异步
//    分类器。isBashSecurityCheckForMisparsing = 工具本体波 S-T2a 已恢复
//    （2026-09-25，§8.53；bashSecurity 8 生产点，见 PermissionAskDecision）。
// ════════════════════════════════════════════════════════════════

/**
 * 权限元数据挂的命令最小形（旧仓刻意用 Command 子集避免 import 环）。
 */
export type PermissionCommandMetadata = {
  name: string
  description?: string
  // 前向兼容留额外字段
  [key: string]: unknown
}

/** 权限决策附带的元数据。 */
export type PermissionMetadata =
  | { command: PermissionCommandMetadata }
  | undefined

/**
 * 权限决策原因（薄骨架裁剪版）。
 */
export type PermissionDecisionReason =
  | {
      type: "rule"
      rule: PermissionRule
    }
  | {
      type: "mode"
      mode: PermissionMode
    }
  | {
      type: "workingDir"
      reason: string
    }
  | {
      type: "safetyCheck"
      reason: string
      /**
       * 为 true 时自动模式让分类器代判而非强制弹框（敏感文件路径
       * .atlas/、.git/、shell 配置）；为 false 是 Windows 路径绕过尝试等
       * 不可代判情形。薄骨架恒按静态判定，分类器代判归 engine。
       */
      classifierApprovable: boolean
    }
  | {
      type: "other"
      reason: string
    }
  | {
      /**
       * 分段命令（splitCommand 多段）逐段权限结果聚合（工具本体波 S-T2a
       * 恢复，bashCommandHelpers 第一真消费者；见文件头裁量登记）。
       */
      type: "subcommandResults"
      reasons: Map<string, PermissionResult>
    }

/** 权限授予时的结果。 */
export type PermissionAllowDecision<
  Input extends { [key: string]: unknown } = { [key: string]: unknown },
> = {
  behavior: "allow"
  updatedInput?: Input
  userModified?: boolean
  decisionReason?: PermissionDecisionReason
  toolUseID?: string
  acceptFeedback?: string
}

/** 需弹框询问时的结果。 */
export type PermissionAskDecision<
  Input extends { [key: string]: unknown } = { [key: string]: unknown },
> = {
  behavior: "ask"
  message: string
  updatedInput?: Input
  decisionReason?: PermissionDecisionReason
  suggestions?: PermissionUpdate[]
  blockedPath?: string
  metadata?: PermissionMetadata
  /**
   * If true, this ask decision was triggered by a bashCommandIsSafe_DEPRECATED
   * security check for patterns that splitCommand_DEPRECATED could misparse
   * (e.g. line continuations, shell-quote transformations). Used by
   * bashToolHasPermission to block early before splitCommand_DEPRECATED
   * transforms the command. Not set for simple newline compound commands.
   *（工具本体波 S-T2a 恢复：bashSecurity 8 生产点为第一真消费者，§8.53 登记；
   * 旧仓同族的 pendingClassifierCheck / contentBlocks 仍裁——分类器波消费。）
   */
  isBashSecurityCheckForMisparsing?: boolean
}

/** 权限拒绝时的结果。 */
export type PermissionDenyDecision = {
  behavior: "deny"
  message: string
  decisionReason: PermissionDecisionReason
  toolUseID?: string
}

/** 权限决策——allow / ask / deny 三态。 */
export type PermissionDecision<
  Input extends { [key: string]: unknown } = { [key: string]: unknown },
> =
  | PermissionAllowDecision<Input>
  | PermissionAskDecision<Input>
  | PermissionDenyDecision

/** 带 passthrough（内部路径检查续查）的权限结果。 */
export type PermissionResult<
  Input extends { [key: string]: unknown } = { [key: string]: unknown },
> =
  | PermissionDecision<Input>
  | {
      behavior: "passthrough"
      message: string
      decisionReason?: PermissionDecision<Input>["decisionReason"]
      suggestions?: PermissionUpdate[]
      blockedPath?: string
    }

/** 权限更新应持久化的落点。 */
export type PermissionUpdateDestination =
  | "userSettings"
  | "projectSettings"
  | "localSettings"
  | "session"
  | "cliArg"

/** 权限配置的更新操作。 */
export type PermissionUpdate =
  | {
      type: "addRules"
      destination: PermissionUpdateDestination
      rules: PermissionRuleValue[]
      behavior: PermissionBehavior
    }
  | {
      type: "replaceRules"
      destination: PermissionUpdateDestination
      rules: PermissionRuleValue[]
      behavior: PermissionBehavior
    }
  | {
      type: "removeRules"
      destination: PermissionUpdateDestination
      rules: PermissionRuleValue[]
      behavior: PermissionBehavior
    }
  | {
      type: "setMode"
      destination: PermissionUpdateDestination
      mode: ExternalPermissionMode
    }
  | {
      type: "addDirectories"
      destination: PermissionUpdateDestination
      directories: string[]
    }
  | {
      type: "removeDirectories"
      destination: PermissionUpdateDestination
      directories: string[]
    }

// ════════════════════════════════════════════════════════════════
// MCPServerConnection（旧仓 src/services/mcp/types.ts:180-226）
// ════════════════════════════════════════════════════════════════

export type ScopedMcpServerConfig = {
  scope: unknown
  pluginSource?: string
  [key: string]: unknown
}

export type ConnectedMCPServer = {
  client: unknown
  name: string
  type: "connected"
  capabilities: unknown
  serverInfo?: { name: string; version: string }
  instructions?: string
  config: ScopedMcpServerConfig
  cleanup: () => Promise<void>
}

export type FailedMCPServer = {
  name: string
  type: "failed"
  config: ScopedMcpServerConfig
  error?: string
}

export type NeedsAuthMCPServer = {
  name: string
  type: "needs-auth"
  config: ScopedMcpServerConfig
}

export type PendingMCPServer = {
  name: string
  type: "pending"
  config: ScopedMcpServerConfig
  reconnectAttempt?: number
  maxReconnectAttempts?: number
}

export type DisabledMCPServer = {
  name: string
  type: "disabled"
  config: ScopedMcpServerConfig
}

export type MCPServerConnection =
  | ConnectedMCPServer
  | FailedMCPServer
  | NeedsAuthMCPServer
  | PendingMCPServer
  | DisabledMCPServer

// ════════════════════════════════════════════════════════════════
// TaskState（旧仓 src/tasks/types.ts:3 = any stub → 基于 TaskStateBase 冻结）
// ════════════════════════════════════════════════════════════════

export type TaskStatus = "running" | "completed" | "failed" | "cancelled"

export type TaskType = string // 旧仓 TaskType 联合，迁移时补全

export type TaskStateBase = {
  id: string
  type: TaskType
  status: TaskStatus
  description: string
  toolUseId?: string
  startTime: number
  endTime?: number
  totalPausedMs?: number
  outputFile: string
  outputOffset: number
  notified: boolean
}

/** 旧仓 = any stub；C 波迁移各 task 子类型时基于 TaskStateBase 扩展 */
export type TaskState = TaskStateBase
