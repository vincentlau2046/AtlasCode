/**
 * engine/tools/bash — BashToolInput duck 型（§8.53 S-T2a，Bash 本体残留守裁定）。
 *
 * 旧仓消费形态 = `z.infer<typeof BashTool.inputSchema>`（BashTool 本体 3310L
 * ts 面 = 次子波残留守，§8.53 §1 登记；S-T2a 四文件仅 type 位消费 input 型 +
 * 值位消费 `BashTool.name`）。本文件 = 旧 inputSchema（BashTool.ts L13-47）
 * 的 z.infer 展开字面量逐字：
 *
 *   command（必填）+ description / timeout_ms / timeout（别名）/
 *   _simulatedSedEdit / run_in_background / dangerouslyDisableSandbox（可选）。
 *
 * `BashTool.name` 消费面（createPermissionRequestMessage 3 参位）→
 * engine/tools/toolNames BASH_TOOL_NAME（'Bash'，单一事实源，E-2 T-5d 已落）。
 *
 * 接缝消费登记（§8.54 ④，S-B5 2026-09-26，复审勿当遗漏重提）：
 *  - **已消费**：bashTool.ts 本体已落（BASH_TOOL_INPUT_SCHEMA 纯 JSON
 *    schema 对象，新仓 shared Tool 契约无 zod——旧「真 zod 定义」接缝改题
 *    为 JSON schema 对齐）；本 duck 型坐实为**类型位单一事实源**（7 字段
 *    与本体 schema 逐字段对齐，既有类型位消费 6 方零改动：
 *    bashPermissions / pathValidation / bashCommandHelpers / modeValidation /
 *    readOnlyValidation（S-B3 新增）/ bashTool（本切片）+ bash/index 门面
 *    re-export）。
 *  - 残留守：真 ToolUseContext 全字段面仍不随迁（BashToolUseContext duck
 *    最小形；本体 call 面 D-7 扩 1 成员 options.cwd）。
 */
import type { ToolPermissionContext } from '../../../shared'

export type BashToolInput = {
  command: string
  description?: string
  timeout_ms?: number
  timeout?: number
  _simulatedSedEdit?: {
    filePath: string
    before?: string
    after?: string
  }
  run_in_background?: boolean
  dangerouslyDisableSandbox?: boolean
}

/**
 * ToolUseContext duck 最小形（§8.53 S-T2b，旧仓 ToolUseContext 三消费面
 * 逐字收窄）：bashPermissions 唯一消费文件（getAppState →
 * toolPermissionContext / abortController.signal /
 * options.isNonInteractiveSession）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  - 旧 ToolUseContext 全字段面（messages/tools/options/appState 全族）不随迁
 *    ——duck 只留 bash 权限面 3 成员（AppState duck 先例 E-7 S-7e）；
 *    真 ToolUseContext 归 Bash 本体子波（⑧ 接线波随 tools 门面消费面
 *    一并换回）。
 *  - getAppState 返回型 = { toolPermissionContext } 单成员窄视图（grep
 *    核验 bashPermissions 唯一 appState 成员消费）。
 *  - **D-7**（§8.54 ⑥，S-B5 扩 1 成员）：options.cwd?: string——bashTool
 *    call 面 `ctx.options?.cwd ?? process.cwd()` 消费（旧 ToolUseContext
 *    options.cwd 字段位 duck 收窄）。
 */
export type BashToolUseContext = {
  getAppState(): { toolPermissionContext: ToolPermissionContext }
  abortController: { signal: AbortSignal }
  options: { isNonInteractiveSession: boolean; cwd?: string }
}
