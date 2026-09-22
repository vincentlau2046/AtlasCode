/**
 * hooks 域 — 类型面（薄骨架裁剪，C-Deep 切片 3 T6）
 *
 * 旧仓来源（a8af45b）: src/types/hooks.ts + src/utils/hooks.ts 内联类型。
 * 薄骨架裁剪（复审勿当遗漏重提）：
 *  - HookInput 取基础形（hook_event_name + 通配字段），per-event 扩展字段
 *    （PreToolUse tool_name/tool_input / SessionStart source / SessionEnd reason 等）
 *    经通配字段承载，engine 波建完整 HookInput 联合时替换。
 *  - HookCommand 只保 command 型（薄骨架 5 高频命令钩子主路径）；callback /
 *    function 型归 engine（§8.14「function/HTTP/callback 内部归 engine」）。
 *  - MCP ElicitationResponse / PermissionRequestResult / agentSdk 类型面全砍
 *    （§8.14 裁量）。
 */
import type { HookEvent } from './hookEvents'

/**
 * 钩子输入基础形（旧仓 createBaseHookInput 产出）。
 * 注：显式列字段不用 `Omit<HookInput,'hook_event_name'>` —— HookInput 带
 * `[key:string]: unknown` 索引签名，`Omit` 会把 keyof 解到索引签名、抹掉具名字段。
 */
export type BaseHookInput = {
  session_id: string
  transcript_path: string
  cwd: string
  permission_mode?: string
  agent_id?: string
  agent_type?: string
}

/**
 * 完整钩子输入（BaseHookInput + per-event hook_event_name）。
 * 通配字段承载 per-event 扩展（tool_name / source / reason / additional_context …）。
 */
export type HookInput = BaseHookInput & {
  hook_event_name: HookEvent
  [key: string]: unknown
}

/** 命令型钩子（薄骨架主路径）。callback / function 型归 engine。 */
export type HookCommand = {
  type: 'command'
  command: string
  shell?: string
  timeoutMs?: number
  [key: string]: unknown
}

/** 统一钩子载荷（薄骨架 = command；engine 补 callback / function）。 */
export type HookPayload = HookCommand

/** 钩子匹配器（matcher 串 + 钩子列表）。 */
export type HookMatcher = {
  matcher?: string
  hooks: HookPayload[]
  source?: string
  [key: string]: unknown
}

/** 匹配到的单个钩子（携带来源 / 插件上下文）。 */
export type MatchedHook = {
  hook: HookPayload
  matcher: string
  source: string
  pluginRoot?: string
  pluginId?: string
  skillRoot?: string
}

/**
 * 钩子 JSON 输出（薄骨架主字段，engine 补全 per-event hookSpecificOutput 联合）。
 */
export type HookJSONOutput = {
  continue?: boolean
  suppressOutput?: boolean
  stopReason?: string
  decision?: 'approve' | 'block'
  reason?: string
  systemMessage?: string
  permissionDecision?: 'allow' | 'deny' | 'ask'
  permissionDecisionReason?: string
  additionalContext?: string
  updatedInput?: Record<string, unknown>
  [key: string]: unknown
}

/** 阻塞错误（PreToolUse / Stop 钩子）。 */
export type HookBlockingError = {
  blockingError: string
  command: string
}

/** 单钩子执行结果（薄骨架主面；通配字段承载 engine 扩展）。 */
export type HookResult = {
  command?: string
  stdout?: string
  stderr?: string
  output?: string
  status?: number
  succeeded: boolean
  blockingError?: HookBlockingError
  preventContinuation?: boolean
  stopReason?: string
  permissionBehavior?: 'ask' | 'deny' | 'allow' | 'passthrough'
  additionalContext?: string
  updatedInput?: Record<string, unknown>
  aborted?: boolean
  backgrounded?: boolean
  [key: string]: unknown
}

/** 多钩子聚合结果。 */
export type AggregatedHookResult = {
  blockingError?: HookBlockingError
  preventContinuation?: boolean
  stopReason?: string
  additionalContext?: string
  updatedInput?: Record<string, unknown>
  permissionBehavior?: 'ask' | 'deny' | 'allow' | 'passthrough'
  results: HookResult[]
}
