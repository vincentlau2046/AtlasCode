/**
 * engine/tools/plan — plan 族 duck 型（S-E2 §8.58 plan 族子波，
 * S-B5 D-7 duck context 先例：旧 ToolUseContext 全字段面 → 各工具
 * 实际消费面窄型）。
 *
 * 消费面登记（H6）：
 *  - ExitPlanModeV2ToolInput.plan/planFilePath = 旧 _sdkInputSchema
 *    normalizeToolInput 注入面（SDK 面裁，exitPlanModeV2Tool delta ③
 *    登记；duck 保留两键供 call 收窄 `'plan' in input` 判别支）。
 *  - Enter call 裁面后 getAppState 无消费（旧唯一消费位 = 已裁
 *    handlePlanModeTransition stub 调）→ duck 不含该键。
 */
import type { ToolPermissionContext } from '../../../shared'

/** 旧 AllowedPrompt（exitPlanModeV2Tool.ts 重导出口，旧 export type 位保留）。 */
export type AllowedPrompt = {
  tool: 'Bash'
  prompt: string
}

/** EnterPlanMode 输入（旧 z.strictObject({}) = 无参数面，S-C5 ① 宽骨架）。 */
export type EnterPlanModeToolInput = Record<string, never>

/**
 * ExitPlanModeV2 输入（旧 z.strictObject().passthrough()；内部 schema 无
 * plan/planFilePath 两键（旧 _sdkInputSchema 注入面），passthrough 放行）。
 */
export type ExitPlanModeV2ToolInput = {
  allowedPrompts?: AllowedPrompt[]
  plan?: string
  planFilePath?: string
}

export type EnterPlanModeAppState = {
  toolPermissionContext: ToolPermissionContext
}

/** EnterPlanMode call context duck（agentId 守卫 + setAppState 权限迁移面）。 */
export type EnterPlanModeToolContext = {
  agentId?: string
  setAppState(
    updater: (prev: EnterPlanModeAppState) => EnterPlanModeAppState,
  ): void
}

export type ExitPlanModeV2AppState = {
  toolPermissionContext: ToolPermissionContext
}

/** ExitPlanModeV2 validateInput context duck（getAppState mode 判别面）。 */
export type ExitPlanModeV2ValidateContext = {
  getAppState(): ExitPlanModeV2AppState
}

/**
 * ExitPlanModeV2 call context duck（agentId 后缀文件名面 + setAppState
 * prePlanMode 恢复链面；旧 addNotification/options.tools 消费支随
 * auto-mode gate 族（delta ④）/ teammate leader 审批支（delta ⑥）/
 * hasTaskTool 计算支（delta ⑧）裁，见 exitPlanModeV2Tool 头注 delta 登记）。
 */
export type ExitPlanModeV2ToolContext = {
  agentId?: string
  setAppState(
    updater: (prev: ExitPlanModeV2AppState) => ExitPlanModeV2AppState,
  ): void
}
