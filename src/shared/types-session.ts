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
