/**
 * MCP permission prompt tool wire schema + 决策转换（旧仓
 * utils/permissions/PermissionPromptToolResultSchema.ts 127L 本地转写）。
 *
 * 接缝 / 裁登记（复审勿当遗漏重提）：
 *   - permissionUpdateSchema = permissions 根门面（S-4c 链）；
 *     applyPermissionUpdates = permissions 根门面，persistPermissionUpdates =
 *     engine 根门面（旧仓 utils/permissions/PermissionUpdate.ts 双消费面
 *     核销，§8.33 S-4c1/S-4c2 先例）。
 *   - decisionReason 型面：旧仓 { type: 'permissionPromptTool',
 *     permissionPromptToolName, toolResult } 变体不在新仓 shared 联合（7 变体
 *     rule/mode/classifier/workingDir/safetyCheck/other/subcommandResults）→
 *     deny 支映射 { type: 'other', reason }（reason 文本保留工具名）；旧
 *     allow 支 decisionReason 展开裁（新仓 PermissionAllowDecision 无
 *     decisionReason 字段，userModified 保留 = 旧仓 mobile {} 支语义标记）。
 *   - 旧仓 logForDiagnosticsNoPII 裁（诊断面缺席）；logForDebugging =
 *     shared 根门面（de-ANT delta：旧仓 de-ant 构建变体判据不随迁）。
 *   - zod 惯例：旧 `zod/v4` → 新仓 `zod` 主入口即 v4（permissionUpdateSchema
 *     同改法先例）；catch 上下文 = zod v4 面（ctx.issues，非 v3 ctx.error）。
 */
import { z, type ZodType } from 'zod'
import { logForDebugging, type PermissionDecision, type PermissionUpdate } from '../shared'
import {
  applyPermissionUpdates,
  permissionUpdateSchema,
} from '../permissions'
import { persistPermissionUpdates } from '../engine'
import type { SdkToolUseContext } from './sdkTypes'

/** 决策分类（SDK host 侧标记；malformed 值 fall-through undefined）。 */
export type DecisionClassification =
  | 'user_temporary'
  | 'user_permanent'
  | 'user_reject'

/**
 * permission prompt tool 输出（旧仓 outputSchema z.infer 显式化：allow /
 * deny 两支联合；wire 面逐字）。
 */
export type PermissionToolOutput =
  | {
      behavior: 'allow'
      updatedInput: Record<string, unknown>
      updatedPermissions?: PermissionUpdate[]
      toolUseID?: string
      decisionClassification?: DecisionClassification
    }
  | {
      behavior: 'deny'
      message: string
      interrupt?: boolean
      toolUseID?: string
      decisionClassification?: DecisionClassification
    }

/** permission prompt tool 输入 schema（旧仓 inputSchema 逐字）。 */
export const permissionToolInputSchema = z.object({
  tool_name: z
    .string()
    .describe('The name of the tool requesting permission'),
  input: z.record(z.string(), z.unknown()).describe('The input for the tool'),
  tool_use_id: z
    .string()
    .optional()
    .describe('The unique tool use request ID'),
})

// Matches PermissionDecisionClassificationSchema in entrypoints/sdk/coreSchemas.ts.
// Malformed values fall through to undefined (same pattern as updatedPermissions
// below) so a bad string from the SDK host doesn't reject the whole decision.
const decisionClassificationField = z
  .enum(['user_temporary', 'user_permanent', 'user_reject'])
  .optional()
  .catch(undefined)

const permissionAllowResultSchema = z.object({
  behavior: z.literal('allow'),
  updatedInput: z.record(z.string(), z.unknown()),
  // SDK hosts may send malformed entries; fall back to undefined rather
  // than rejecting the entire allow decision (anthropics/claude-code#29440，
  // 旧仓注释保真)
  updatedPermissions: z
    .array(permissionUpdateSchema())
    .optional()
    .catch(ctx => {
      logForDebugging(
        `Malformed updatedPermissions from SDK host ignored: ${ctx.issues[0]?.message ?? 'unknown'}`,
        { level: 'warn' },
      )
      return undefined
    }),
  toolUseID: z.string().optional(),
  decisionClassification: decisionClassificationField,
})

const permissionDenyResultSchema = z.object({
  behavior: z.literal('deny'),
  message: z.string(),
  interrupt: z.boolean().optional(),
  toolUseID: z.string().optional(),
  decisionClassification: decisionClassificationField,
})

/** permission prompt tool 结果 schema（旧仓 outputSchema 逐字 = 两支联合）。 */
export const permissionToolOutputSchema: ZodType<PermissionToolOutput> = z.union([
  permissionAllowResultSchema,
  permissionDenyResultSchema,
])

/**
 * 将 permission prompt tool 结果规范化为 PermissionDecision（旧仓
 * permissionPromptToolResultToPermissionDecision 逐字 + 新仓型面适配，见
 * 文件头裁登记）。
 */
export function permissionPromptToolResultToPermissionDecision(
  result: PermissionToolOutput,
  tool: { name: string },
  input: Record<string, unknown>,
  toolUseContext: SdkToolUseContext,
): PermissionDecision {
  if (result.behavior === 'allow') {
    const updatedPermissions = result.updatedPermissions
    if (updatedPermissions) {
      const updatedContext = applyPermissionUpdates(
        toolUseContext.getAppState().toolPermissionContext,
        updatedPermissions,
      )
      toolUseContext.setAppState(prev => ({
        ...prev,
        toolPermissionContext: updatedContext,
      }))
      persistPermissionUpdates(updatedPermissions)
    }
    // Mobile clients responding from a push notification don't have the
    // original tool input, so they send `{}` to satisfy the schema. Treat an
    // empty object as "use original" so the tool doesn't run with no args.
    const updatedInput =
      Object.keys(result.updatedInput).length > 0 ? result.updatedInput : input
    return { behavior: 'allow', updatedInput, userModified: false }
  }
  if (result.behavior === 'deny' && result.interrupt) {
    logForDebugging(
      `SDK permission prompt deny+interrupt: tool=${tool.name} message=${result.message}`,
    )
    toolUseContext.abortController.abort()
  }
  return {
    behavior: 'deny',
    message: result.message,
    toolUseID: result.toolUseID,
    decisionReason: {
      type: 'other',
      reason: `SDK permission prompt tool denied (${tool.name})`,
    },
  }
}
