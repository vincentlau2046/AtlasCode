/**
 * engine/tools/schedule — cron 三件套 duck 型（§8.56 S-D4，任务工具本体
 * 子波 4）。
 *
 * 旧仓 buildTool(zod) input 型（z.infer）→ TS 鸭子型（S-C4/S-D3 先例）。
 * cron 三件套 call() 均零 context 参（旧 def 体不消费 toolUseContext，
 * teammate 判别走模块面 getTeammateContext()，S-D2 messaging 域已落）→
 * 本文件无 context duck 型（与 tasks/taskToolInput 的 TaskToolUseContext
 * 区别：任务四件套钩子支消费 abortController.signal）。
 */

export interface CronCreateToolInput {
  /** 5-field cron expression in local time: "M H DoM Mon DoW"。 */
  cron: string
  /** The prompt to enqueue at each fire time. */
  prompt: string
  /** true (default) = fire on every cron match; false = fire once then auto-delete。 */
  recurring?: boolean
  /** true = persist to .atlas/scheduled_tasks.json; false (default) = session-only。 */
  durable?: boolean
}

export interface CronDeleteToolInput {
  /** Job ID returned by CronCreate。 */
  id: string
}

export interface CronListToolInput {
  [key: string]: never
}
