/**
 * permissions 域 — hasPermissionsToUseTool 薄骨架（no-op-allow 起步，C-Deep 切片 3 T5）
 *
 * 旧仓来源（a8af45b）: src/utils/permissions/permissions.ts（1326L 取最小面，§8.14）。
 * 薄骨架 = no-op-allow 起步：恒 allow（default 模式），保证工具链在组合根
 * 落地 engine 前可跑通。
 *
 * 裁掉归 engine 波（复审勿当遗漏重提）：
 *   ① hasPermissionsToUseToolInner —— 规则求值 + 工具面 checkPermissions 分发
 *   ② dontAsk 模式 ask→deny 转换
 *   ③ 自动模式 AI 分类器（TRANSCRIPT_CLASSIFIER / yoloClassifier 1332L）
 *   ④ 连续拒绝跟踪（recordSuccess / persistDenialState）
 *   ⑤ executePermissionRequestHooks —— hooks→permissions 反向边
 *      （§8.14 注入序 permissions 先于 hooks，此边落地时接回；当前 no-op）
 *   ⑥ sandbox 自动放行 / Bash·PowerShell 工具面特判
 *
 * 签名收窄（薄骨架）：旧仓 CanUseToolFn 依赖完整 Tool / ToolUseContext /
 *   AssistantMessage（engine 类型，未随迁）；此处以窄视图 PermissionTool +
 *   泛型 context 承载。engine 波换回全量类型时本函数体（no-op-allow）不变。
 */
import type {
  PermissionDecision,
  ToolPermissionContext,
} from '../shared'
import type { PermissionTool } from './filesystem'

/**
 * 薄骨架 CanUseToolFn 窄视图（旧仓全量 CanUseToolFn 的 name/getPath 子集）。
 * context 收窄为可选 getToolPermissionContext —— engine 波换回完整
 * ToolUseContext（getAppState / localDenialTracking / options 等）。
 */
export type CanUseToolFn<
  Input extends Record<string, unknown> = Record<string, unknown>,
> = (
  tool: PermissionTool,
  input: Input,
  context: { getToolPermissionContext?(): ToolPermissionContext },
  assistantMessage?: unknown,
  toolUseID?: string,
  forceDecision?: PermissionDecision<Input>,
) => Promise<PermissionDecision<Input>>

/**
 * no-op-allow 起步（§8.14）：恒 allow（default 模式）。
 * forceDecision（engine 波透传入口）非空时优先返回之 —— 薄骨架仅此一分支。
 */
export const hasPermissionsToUseTool: CanUseToolFn = async (
  _tool,
  input,
  _context,
  _assistantMessage,
  _toolUseID,
  forceDecision,
): Promise<PermissionDecision> => {
  if (forceDecision !== undefined) {
    return forceDecision
  }
  return {
    behavior: 'allow',
    updatedInput: input,
    decisionReason: { type: 'mode', mode: 'default' },
  }
}
