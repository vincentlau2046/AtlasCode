/**
 * InProcessTeammate 任务态（C 桶 ③ shell·swarm 波 S-E2b，§8.66）。
 *
 * 源 = 旧仓 a8af45b src/tasks/InProcessTeammateTask/types.ts——旧仓该文件为
 * 5 行 any-stub（InProcessTeammateTaskState / TeammateIdentity /
 * isInProcessTeammateTask / appendCappedMessage 全 `: any`，H6 零信息量）→
 * 本文件按 4 消费端反推真形（spawnInProcess 状态构造 L150-180 /
 * InProcessTeammateTask 6 框架函数 / inProcessRunner 消息/idle 支 L707-1477 /
 * messaging/teammate 尾 3 消费面），H6 防空洞：stub 签名不当真行为。
 *
 * 归 task 域（非 swarm 域）原因：coordinator types.ts 的 TaskState 联合扩三态
 * 需 import 本型（engine 允许 task；swarm 亦允许 task——两域共用单一事实源，
 * 避免 engine→swarm 反向边）。
 *
 * 重建裁定（复审勿当遗漏重提）：
 * ① appendCappedMessage 上限常量不可恢复（旧仓 any-stub 无真值）→
 *    MAX_TEAMMATE_DISPLAY_MESSAGES = 100 命名常量重建（消费端语义 =
 *    zoomed-view 会话展示历史防无界增长；100 保守取值，登记）。
 * ② TeammateIdentity.color 旧仓 InProcessSpawnConfig.color?: string（非
 *    AgentColorName 8 值联合——spawn 配置面 string 宽形逐字保留）。
 * ③ kill 支可清面（旧 killInProcessTeammate 置 undefined 的
 *    inProgressToolUseIDs / currentWorkAbortController 为 LocalAgentTaskState
 *    同族字段，in-process 态不持）→ 本型不置位，kill 更新面不写。
 * ④ 消息字段两生产端并集（S-E2b）：appendTeammateMessage 的 TUI 显示端传
 *    shared Message 全形；injectUserMessageToTeammate 的 S-E2d 生产端传
 *    engine createUserMessage 窄形 InDomainUserMessage——task 域不引 engine
 *    （L3 依赖方向）→ 窄形内联 UserMessageLike（字段集 = engine/tools/files/
 *    userMessage.ts InDomainUserMessage 逐字，单一事实源仍在 engine 域，字段
 *    变更同步改；零跨域引用，登记）。
 */
import type { Message } from '../shared'
import type { TaskStateBase } from './task'

/**
 * 域内用户消息窄形（engine InDomainUserMessage 逐字内联，重建 ④ 登记见头注）。
 */
export type UserMessageLike = {
  type: 'user'
  uuid: string
  timestamp: string
  isMeta?: boolean
  message: {
    role: 'user'
    content: string | unknown[]
  }
}

/** 会话消息条目 = 两生产端并集（TUI 端 Message 全形 + S-E2d 端窄形）。 */
export type TeammateMessageEntry = Message | UserMessageLike

/** teammate 身份（spawnInProcess 构造面反推；存 AppState 纯数据）。 */
export type TeammateIdentity = {
  agentId: string
  agentName: string
  teamName: string
  color?: string
  planModeRequired: boolean
  parentSessionId: string
}

/**
 * In-process teammate 任务态（TaskStateBase & teammate 专属面）。
 * 字段并集 = spawnInProcess 初始构造 + inProcessRunner 运行时支 +
 * kill 更新面反推。messages/onIdleCallbacks 可空（kill 支可清面）。
 */
export type InProcessTeammateTaskState = TaskStateBase & {
  type: 'in_process_teammate'
  identity: TeammateIdentity
  prompt: string
  model?: string
  abortController?: AbortController
  /** registerCleanup 句柄（graceful shutdown abort；kill 支清除）。 */
  unregisterCleanup?: () => void
  awaitingPlanApproval: boolean
  permissionMode: string
  isIdle: boolean
  shutdownRequested: boolean
  lastReportedToolCount: number
  lastReportedTokenCount: number
  /** 注入待处理用户消息队列（inProcessRunner 每轮取 [0] 消费）。 */
  pendingUserMessages: string[]
  /** 会话展示历史（appendCappedMessage 上限 100；kill 支保留末条或清）。 */
  messages?: TeammateMessageEntry[]
  /** idle 回调（waitForTeammatesToBecomeIdle 注册；idle 转换时 forEach + 清）。 */
  onIdleCallbacks?: Array<() => void>
}

/** 守卫（消费端 `task.type === 'in_process_teammate'` 判定逐字重建）。 */
export function isInProcessTeammateTask(
  task: TaskStateBase,
): task is InProcessTeammateTaskState {
  return task.type === 'in_process_teammate'
}

/**
 * 上限追加消息（重建 ①：cap = 100 命名常量；消费端 = teammate 会话
 * 展示历史，防无界增长）。
 */
export const MAX_TEAMMATE_DISPLAY_MESSAGES = 100

export function appendCappedMessage(
  messages: TeammateMessageEntry[] | undefined,
  message: TeammateMessageEntry,
  cap: number = MAX_TEAMMATE_DISPLAY_MESSAGES,
): TeammateMessageEntry[] {
  const next = [...(messages ?? []), message]
  if (next.length > cap) {
    return next.slice(next.length - cap)
  }
  return next
}
