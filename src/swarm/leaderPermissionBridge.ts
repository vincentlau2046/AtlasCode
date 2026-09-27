/**
 * Leader Permission Bridge（C 桶 ③ shell·swarm 波 S-E2b，§8.66）。
 *
 * 源 = 旧仓 a8af45b src/utils/swarm/leaderPermissionBridge.ts（54L，
 * register/get/unregister × 2 逐字；seam ① 模块级 null 缺省 setter 注入）。
 *
 * 用途：REPL 注册 setToolUseConfirmQueue / setToolPermissionContext，
 * in-process teammate 请求权限时走 leader 的标准 ToolUseConfirm 对话框
 * （而非 worker 权限徽章）。本桥使 REPL 的两个 setter 可被 in-process
 * runner（S-E2d）的非 React 代码消费。
 *
 * import 面重映射：
 *   - ToolPermissionContext → shared 域门面（types-session readonly 版，
 *     旧仓双定义之非 Tool.ts DeepImmutable 版）
 *   - ToolUseConfirm → 域内本地最小形（旧 React 全量面裁除，登记见下）
 *
 * 裁面登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - ToolUseConfirm 旧 React 面（components/permissions/PermissionRequest.tsx
 *     17 字段泛型全量：assistantMessage: AssistantMessage / tool: Tool<Input> /
 *     toolUseContext: ToolUseContext / permissionResult: PermissionDecision /
 *     回调族 + classifier* + workerBadge）→ 下方本地最小镜像：数据字段按
 *     inProcessRunner 生产端实置面反推（旧 inProcessRunner.ts:219-316 逐字段），
 *     泛型/React 依赖面各收窄：
 *       - assistantMessage 字段裁除（AssistantMessage 显示面 = TUI 波；显示端
 *         如需可从自身消息流取，S-E2d 生产端可补字段）
 *       - tool: Tool<Input> → { name; userFacingName? } 窄面（TUI 波消费）
 *       - input: z.infer<Input> → unknown（zod 泛型剥离）
 *       - toolUseContext: ToolUseContext 50+ 字段全量面 → unknown（recheck 支
 *         消费，TUI 波/D 波按 duck 型收窄，TeammateExecutorContext 先例）
 *       - permissionResult: PermissionDecision → { behavior; message? } 收窄
 *         （behavior 三值 = hasPermissionsToUseTool 返回支反推）
 *       - 旧 onAllow(updatedInput, permissionUpdates, feedback, contentBlocks)
 *         的 permissionUpdates/ContentBlockParam 两参裁除（面未落）
 *     S-E2d 生产端（inProcessRunner/permissionSync）与 TUI 显示端以本镜像为
 *     接缝单一事实源。
 */
import { type ToolPermissionContext } from '../shared'

/**
 * 权限对话框队列条目（本地最小形，头注登记见上）。
 * 生产端 = in-process runner（S-E2d）；消费端 = REPL 显示组件（TUI 波）+
 * queue.filter(item => item.toolUseID !== ...) 去重支。
 */
export type ToolUseConfirm = {
  /** 所属 tool call ID（队列去重键） */
  toolUseID: string
  /** 待批工具（窄面；旧 Tool<Input> 全量面裁除，TUI 波） */
  tool: {
    name: string
    userFacingName?: (input: unknown) => string
  }
  /** 权限请求描述（对话框主行，旧 tool.description() 异步求值结果） */
  description: string
  /** 工具调用入参（旧 z.infer<Input> 泛型剥离） */
  input: unknown
  /** 工具执行上下文（旧 ToolUseContext 全量面裁除；recheck 支消费） */
  toolUseContext: unknown
  /** 初始权限判定（behavior 三值 = hasPermissionsToUseTool 返回支反推） */
  permissionResult: {
    behavior: 'allow' | 'ask' | 'deny'
    message?: string
  }
  /** 权限提示开始时间戳（等待时长统计 + classifier 竞态比较） */
  permissionPromptStartTimeMs: number
  /** 群内身份徽章（TUI 显示；生产端按 identity.color 置位，无色 = undefined） */
  workerBadge?: { name: string; color: string }
  /** classifier 自动审批三态（teammate 无 classifier 自动批，生产端不置位，字段留形） */
  classifierCheckInProgress?: boolean
  classifierAutoApproved?: boolean
  classifierMatchedRule?: string
  /** 用户交互（防异步自动批弹框抢占）；teammate 生产端 = no-op */
  onUserInteraction?(): void
  /** 用户中断/abort 支 */
  onAbort?(): void
  onDismissCheckmark?(): void
  /** 用户允许（旧 permissionUpdates/contentBlocks 两参裁除，登记见头注） */
  onAllow?(updatedInput?: unknown, feedback?: string): void
  /** 用户拒绝 */
  onReject?(feedback?: string): void
  /** 复检（自动批准路径） */
  recheckPermission?(): Promise<void>
}

export type SetToolUseConfirmQueueFn = (
  updater: (prev: ToolUseConfirm[]) => ToolUseConfirm[],
) => void

export type SetToolPermissionContextFn = (
  context: ToolPermissionContext,
  options?: { preserveMode?: boolean },
) => void

let registeredSetter: SetToolUseConfirmQueueFn | null = null
let registeredPermissionContextSetter: SetToolPermissionContextFn | null = null

export function registerLeaderToolUseConfirmQueue(
  setter: SetToolUseConfirmQueueFn,
): void {
  registeredSetter = setter
}

export function getLeaderToolUseConfirmQueue(): SetToolUseConfirmQueueFn | null {
  return registeredSetter
}

export function unregisterLeaderToolUseConfirmQueue(): void {
  registeredSetter = null
}

export function registerLeaderSetToolPermissionContext(
  setter: SetToolPermissionContextFn,
): void {
  registeredPermissionContextSetter = setter
}

export function getLeaderSetToolPermissionContext(): SetToolPermissionContextFn | null {
  return registeredPermissionContextSetter
}

export function unregisterLeaderSetToolPermissionContext(): void {
  registeredPermissionContextSetter = null
}
