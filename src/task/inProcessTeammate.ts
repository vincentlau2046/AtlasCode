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

// ── 终止态单源谓词（0.1.93 W-D-A round 6，f4 根因锁面批复）──────────────
// TeamDelete A7 守卫 / WaitForTeammates working 判定 / inProcessRunner
// 生命周期收尾防重入三消费点经本组谓词读同一 task.status 状态机——禁
// 第二 idle/终态 notion（round 5 缝 = handleShutdownApproval「发消息即
// 退出」并行文案语义，member 侧闭合见 engine sendMessageTool 触发段）。

/** unknown → in-process teammate 收窄（类型判定单源 = isInProcessTeammateTask）。 */
function asInProcessTeammate(
  task: unknown,
): InProcessTeammateTaskState | undefined {
  if (
    typeof task === 'object' &&
    task !== null &&
    isInProcessTeammateTask(task as TaskStateBase)
  ) {
    return task as InProcessTeammateTaskState
  }
  return undefined
}

/**
 * F3 live 词汇谓词（单源）：in-process teammate 且生命周期态 = 'running'。
 * 消费点：inProcessRunner 收尾块防重入（completed/failed/killed 均终态）。
 */
export function isInProcessTeammateLive(
  task: unknown,
): task is InProcessTeammateTaskState {
  const t = asInProcessTeammate(task)
  return t !== undefined && t.status === 'running'
}

/**
 * working 谓词（WaitForTeammates 消费）：live 且非轮间 idle（isIdle =
 * 轮间标志非终态 notion，round 6 定性入档）。type guard：true 时调用点
 * 可直取 identity 窄形。
 */
export function isInProcessTeammateWorking(
  task: unknown,
): task is InProcessTeammateTaskState {
  const t = asInProcessTeammate(task)
  return t !== undefined && t.status === 'running' && !t.isIdle
}

/**
 * TeamDelete 守卫 fail-closed 谓词（判读逐字 = 旧守卫「status undefined
 * || status === 'running'」）：已知 in-process teammate 终态（completed/
 * killed）= 非活；其余（条目缺失 / 非 teammate 形态 / status 未知 /
 * running）= 活。status 字面比较单点收敛于本文件。
 */
export function isInProcessTeammateActiveOrUnknown(task: unknown): boolean {
  const t = asInProcessTeammate(task)
  const status =
    t !== undefined
      ? t.status
      : (task as { status?: unknown } | undefined)?.status
  return status === undefined || status === 'running'
}

/**
 * 按 agentId 定位成员 task（handleShutdownApproval 触发段消费；
 * findTeammateTaskByAgentId 等价面——旧支 delta ④ 裁除的定位腿复立）。
 */
export function findInProcessTeammateTaskByAgentId(
  tasks: Record<string, unknown> | undefined,
  agentId: string,
): InProcessTeammateTaskState | undefined {
  for (const task of Object.values(tasks ?? {})) {
    const t = asInProcessTeammate(task)
    if (t !== undefined && t.identity.agentId === agentId) return t
  }
  return undefined
}

// ── 0.1.93b 段 R 判别探针（工单 @c22716f6 §3 R-①；非修形，零行为变更）──
// controller 对象标识 stamp/read：WeakMap 模块级持有（非侵入对象面，免
// AppState 序列化泄漏）。判别性质：若 sessionContextPort/store 模块在
// bundle 双实例（RF-1），spawn 侧 stamp 与触发段 read 落不同 WeakMap →
// 触发段 read = 'untagged' —— 探针自身兼作 RF-1 分型直证信号。
const probeControllerIds = new WeakMap<object, string>()
let probeControllerSeq = 0

/** spawn 创建点调用：给 controller 打唯一标识并返回（幂等重入）。 */
export function probeStampAbortController(ac: AbortController): string {
  let id = probeControllerIds.get(ac)
  if (id === undefined) {
    probeControllerSeq += 1
    id = `ac-${probeControllerSeq}`
    probeControllerIds.set(ac, id)
  }
  return id
}

/** 触发段/runner 侧调用：读标识（跨实例 = 'untagged'；空值 = 'none'）。 */
export function probeReadAbortControllerId(
  ac: AbortController | undefined | null,
): string {
  if (!ac) return 'none'
  return probeControllerIds.get(ac) ?? 'untagged'
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
