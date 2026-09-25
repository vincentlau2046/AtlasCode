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
 * 前向接缝（H6 预声明，复审勿当遗漏重提）：Bash 本体验证波落 inputSchema
 * 真 zod 定义后，本 duck 型替换为 `z.infer<typeof BashTool.inputSchema>`
 * （或经 tools 域门面消费真型），调用点零改动。
 */
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
