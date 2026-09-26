/**
 * engine/tools/files — Glob/Grep 本体 duck 型（§8.55 S-C4，高频族纵切
 * 子波 3）。
 *
 * 旧仓来源（a8af45b）：zod inputSchema 推断型（GlobTool InputSchema 2 字段
 * / GrepTool InputSchema 14 字段）+ ToolUseContext 消费子集
 * （GlobTool call 解构 { abortController, getAppState, globLimits }，
 * 旧 Tool.ts:268 `globLimits?: { maxResults?: number }`；GrepTool call
 * 解构 { abortController, getAppState }）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - duck 型 = 类型位单一事实源（S-B5 bashToolInput 先例）：新 shared
 *    Tool 契约 call 2 参（args: unknown / context: unknown），工具本体
 *    入口 cast 到本 duck 型；旧 zod 运行时校验层裁（S-C1 semantic delta
 *    同源裁定——纯 JSON schema 无 zod 运行时，字符串数字/布尔容忍 =
 *    GrepTool call 入口 semantic 转换，见 grepTool 头注）。
 *  - GrepToolInput 数值/布尔字段 = **转换后**类型（number/boolean）；
 *    运行时原始输入可能为字符串字面量（"30"/"true"），由 call 入口
 *    semanticToNumber/semanticToBoolean 转换（S-C1 语义 delta 逐字）。
 *  - FilesToolUseContext.getAppState 返回面 = toolPermissionContext 单
 *    成员 duck（Glob/Grep call + checkPermissions 仅消费该成员；全
 *    AppState 面 = 残留守，真 ToolUseContext 全字段面 D 波/TUI 波）。
 */
import type { ToolPermissionContext } from '../../../shared'

/** Glob 输入（旧 zod 2 字段逐字段对齐）。 */
export interface GlobToolInput {
  pattern: string
  path?: string
}

/** Grep 输入（旧 zod 14 字段逐字段对齐；语义容忍字段 = 转换后类型）。 */
export interface GrepToolInput {
  pattern: string
  path?: string
  glob?: string
  output_mode?: 'content' | 'files_with_matches' | 'count'
  '-B'?: number
  '-A'?: number
  '-C'?: number
  context?: number
  '-n'?: boolean
  '-i'?: boolean
  type?: string
  head_limit?: number
  offset?: number
  multiline?: boolean
}

/**
 * Glob/Grep call + checkPermissions 消费 context 子集（旧 ToolUseContext
 * 解构面 duck；globLimits 仅 Glob 消费）。
 */
export interface FilesToolUseContext {
  getAppState(): { toolPermissionContext: ToolPermissionContext }
  abortController: AbortController
  globLimits?: { maxResults?: number }
}
