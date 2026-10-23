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
  /**
   * C8-5（0.1.79 W-C）：PostToolUse 钩子配置项（CC 2.1.139）。true = 该钩子
   * 的 block 拒绝理由回喂 LLM 并继续回合；缺省 = 默认拒绝语义不变（fail-closed）。
   */
  continueOnBlock?: boolean
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
  /**
   * PreToolUse 权限决策（AD-45 0.1.52：'defer' = 挂起裁定，不产 tool_result，
   * 会话挂起待 --resume 重评；区别于规则面 3 值 PermissionBehavior）。
   */
  permissionDecision?: 'allow' | 'deny' | 'ask' | 'defer'
  permissionDecisionReason?: string
  additionalContext?: string
  updatedInput?: Record<string, unknown>
  /**
   * 0.1.56 B：PostToolUse 输出改写（CC 2.1.121 updatedToolOutput 全工具化）。
   * 在场则替换 tool_result content（engine toolExecution 消费点改写 block/
   * toolUseResult）；主形 = hookSpecificOutput.updatedToolOutput（CC 嵌套形），
   * 顶层形亦读（顶层 wins，与 updatedInput 双形读取序一致）。
   */
  updatedToolOutput?: string
  /**
   * C8-5（0.1.79 W-C）：终端转义序列（CC 2.1.141）。hook JSON 输出声明 →
   * harness 聚合后写 process.stdout（如响铃/设终端标题）；解析点 =
   * interpretHookOutput，写点 = runHooks 聚合收尾（写失败不冒泡）。
   */
  terminalSequence?: string
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
  permissionBehavior?: 'ask' | 'deny' | 'allow' | 'passthrough' | 'defer'
  /** AD-45 0.1.52：defer（及 deny/ask）理由载体，聚合面透传（mergeAggregated 随 winner 更替）。 */
  permissionDecisionReason?: string
  additionalContext?: string
  updatedInput?: Record<string, unknown>
  /** 0.1.56 B：PostToolUse 输出改写（interpretHookOutput 解析面，聚合透传）。 */
  updatedToolOutput?: string
  /** C8-5（0.1.79 W-C）：终端转义序列透传（runOneHook 标记，聚合拼接）。 */
  terminalSequence?: string
  /**
   * C8-5（0.1.79 W-C）：仅当钩子配置显式声明 continueOnBlock:true 且本钩子
   * 产出 block 拒绝时由 runOneHook 置真；缺省 = 默认拒绝语义不变。
   */
  continueOnBlock?: boolean
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
  /** 0.1.56 B：PostToolUse 输出改写聚合面（last wins，engine 适配器透传）。 */
  updatedToolOutput?: string
  /** AD-45 0.1.52：'defer' = 挂起控制值（rank 4 最严，胜权限裁定值）。 */
  permissionBehavior?: 'ask' | 'deny' | 'allow' | 'passthrough' | 'defer'
  /** defer/deny 理由（winner 更替语义，mergeAggregated 维护）。 */
  permissionDecisionReason?: string
  /** C8-5（0.1.79 W-C）：终端转义序列聚合面（mergeAggregated 拼接，非首胜）。 */
  terminalSequence?: string
  /**
   * C8-5（0.1.79 W-C）：胜出 blockingError 携显式 continueOnBlock 声明时置真
   * （首阻塞 wins 语义；engine 适配器据此决定拒绝理由是否回喂 LLM）。
   */
  continueOnBlock?: boolean
  results: HookResult[]
}
