/**
 * engine/tools/skill — SkillTool 输入/输出/上下文 duck 型族（§8.67 D 波 S-E2b；
 * 旧仓 src/tools/SkillTool/SkillTool.ts zod schema 族 → 纯 TS 型 + JSON schema）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 lazySchema(zod) 输入/输出 schema → 输入 = 纯 JSON schema 对象
 *    （SKILL_TOOL_INPUT_SCHEMA，skillTool.ts；旧 z.object 非 strict → 无
 *    strict 字段，readTool delta ① 先例）；输出 = SkillToolOutput TS
 *    联合（inline/forked 两形，旧 outputSchema z.union 逐字形状）。
 *  ② 旧 ToolUseContext（富 context：options/getAppState/queryTracking/
 *    discoveredSkillNames…）→ SkillToolCallContext 窄 duck（pipeline
 *    只填 { signal, checkPermission }；组合根可再填 getAppState/agentId/
 *    tools/modelProvider/parentRole，AgentToolCallContext 先例同语义）；
 *    旧遥测字段族（queryTracking/discoveredSkillNames/getAgentContext）
 *    = 裁（遥测面已删，新仓 0 消费）。
 *  ③ 旧 fork executeForkedSkill 的 toolUseContext spread（modifiedGetAppState
 *    注入）→ 新 runAgent 无 appState 消费面（权限面 = checkPermission 门
 *    透传，F1 先例）→ fork skill 的 allowedTools TPC union 面 = 前向接缝
 *    （skill 域 createGetAppStateWithAllowedTools 已落同形，runAgent
 *    注入窗随后续波回填，勿当遗漏重提）。
 */
import type { ToolPermissionContext, Tools } from '../../../shared'
import type { ModelProvider, ModelRole } from '../../../modelprovider'
import type { PermissionGate } from '../../pipeline'

/** Skill 工具输入（旧 inputSchema：skill 必填 + args 可选，逐字）。 */
export type SkillToolInput = {
  skill: string
  args?: string
}

/** inline 技能输出（旧 inlineOutputSchema 逐字形状）。 */
export type SkillToolInlineOutput = {
  success: boolean
  commandName: string
  allowedTools?: string[]
  model?: string
  status?: 'inline'
}

/** forked 技能输出（旧 forkedOutputSchema 逐字形状）。 */
export type SkillToolForkedOutput = {
  success: boolean
  commandName: string
  status: 'forked'
  agentId: string
  result: string
}

/** Skill 工具输出（旧 outputSchema z.union 两形 → TS 联合）。 */
export type SkillToolOutput = SkillToolInlineOutput | SkillToolForkedOutput

/**
 * call 第 2 参 context（旧 ToolUseContext 裁剪，delta ②）。pipeline
 * （toolExecution.ts call 站点）只填 { signal, checkPermission }；组合根
 * 可再填 getAppState/agentId/tools/modelProvider/parentRole（未填 →
 * 空工具池 / 单例 provider / 'small' / 无 agentId = 安全退化，非假能力）。
 */
export type SkillToolCallContext = {
  signal?: AbortSignal
  /** 权限门（F1 透传）：父 loop 门 → fork 子 loop 同门执行（runAgent 透传）。 */
  checkPermission?: PermissionGate
  /** appState 读面（TPC Set-union 覆写消费；未提供 = 跳过）。 */
  getAppState?: () => unknown
  /** 子代理标识（coordinator 分支判定；worker = 有值 → 穿透取真内容）。 */
  agentId?: string
  /** 父线程工具池（fork 子代理工具池；未填 = 空池）。 */
  tools?: Tools
  /** provider 注入窗（未填 = 单例 modelProvider）。 */
  modelProvider?: ModelProvider
  /** 父线程 role（未填 = 'small'）。 */
  parentRole?: ModelRole
}

/**
 * checkPermissions 上下文 duck（旧 context.getAppState() 面；窄 TPC 切片，
 * webFetch WebFetchToolContext 同型先例）。
 */
export type SkillToolCheckContext = {
  getAppState: () => { toolPermissionContext: ToolPermissionContext }
}

/** contextModifier 上下文 duck（旧 ToolUseContext 的 getAppState + options.mainLoopModel 两面）。 */
export type SkillToolContextModifierCtx = {
  getAppState?: () => unknown
  options?: { mainLoopModel?: string }
}
