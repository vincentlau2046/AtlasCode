/**
 * task-notification 注入窗口（S-7a）
 *
 * 旧仓来源（a8af45b）: src/utils/messageQueueManager.ts enqueuePendingNotification
 * 的 task-notification 消费面（{ value, mode: 'task-notification', priority?,
 * agentId? }）。
 *
 * 裁剪登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - 旧仓 enqueuePendingNotification 走 messageQueueManager 全量队列（S-7e
 *     messaging 波未迁，teammateMailbox 54 export 随 S-7e 落）→ 本层收敛为
 *     窄注入窗口：组合根 / E-wave-end 装配真实队列（messaging 波）；默认
 *     handler = logForDebugging 打印（非静默黑洞，H6 防空洞裁定）+ 头注登记。
 *   - PRT-2：setTaskNotificationHandler 为函数导出注入窗口（非顶层 register
 *     调用），合规。
 *   - priority 'next' | 'later' 枚举随旧仓消息队列优先级口径保留（messaging
 *     波队列消费时按优先级排程）。
 */
import { logForDebugging } from '../../../shared'

export type TaskNotification = {
  /** 已拼好的 <task-notification> XML（含 <summary>）。 */
  value: string
  mode: 'task-notification'
  /** 'next' = 下轮优先投递（stall watchdog / monitor）；'later' = 常规排程。 */
  priority?: 'next' | 'later'
  /** 投递目标 agent（主线程 = undefined）。messaging 波消费。 */
  agentId?: string
}

type NotificationHandler = (n: TaskNotification) => void

/** 默认 handler：debug 日志（非静默黑洞）。组合根装配后替换。 */
const defaultHandler: NotificationHandler = n => {
  logForDebugging(`[task-notification:${n.priority ?? 'later'}] ${n.value}`)
}

let handler: NotificationHandler = defaultHandler

/** 组合根 / messaging 波注入真实通知队列。 */
export function setTaskNotificationHandler(h: NotificationHandler): void {
  handler = h
}

/** 测试复位。 */
export function resetTaskNotificationHandler(): void {
  handler = defaultHandler
}

/** 通知入队（唯一投递点；stall watchdog / agent / shell 三处消费）。 */
export function enqueueTaskNotification(n: TaskNotification): void {
  handler(n)
}
