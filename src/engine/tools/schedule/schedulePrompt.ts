/**
 * engine/tools/schedule — cron 三件套 prompt 面 + 门 + 描述常量（§8.56 S-D4，
 * 任务工具本体子波 4，49 口径 11-13/49）。
 *
 * 旧仓来源（a8af45b）：src/tools/ScheduleCronTool/prompt.ts 133L 逐字随迁
 * （DEFAULT_MAX_AGE_DAYS + isCronEnabled/isDurableCronEnabled 双门 + 3
 * 短 DESCRIPTION 常量 + 3 长 prompt builder + 3 工具名）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  ① 旧 `feature('AGENT_TRIGGERS')` 构建门（bun:bundle DCE）→ 本子波注册表
 *    ② AGENT_TRIGGERS 槽 materialize 本身（工具本体落位 = 门开；构建期
 *    DCE 概念在新契约消失，门下沉 isEnabled = isCronEnabled 自门控）。
 *  ② 旧 growthbook 'atlas_cron' 5 分钟刷新支（getFeatureValue_CACHED_
 *    WITH_REFRESH 缺省 true）→ 裁（新仓无 GrowthBook 域，agentSwarmsEnabled
 *    delta ① 先例：缺省 true = 无远端配置态恒放行与旧缺省态行为等价，
 *    仅失「远端拉闸」能力，恢复归属 analytics 波）。ATLAS_DISABLE_CRON
 *    本地覆写语义逐字保留（旧注释：local override wins over GB）。
 *  ③ 旧 isDurableCronEnabled 的 growthbook 'atlas_cron_durable' 支 → 裁，
 *    恒 true（旧缺省即 true；前向接缝 = 未来 analytics 波可注
 *    GB-backed 实现整换，同 cronJitterConfig 注入口先例）。
 *  ④ 旧 3 工具名常量（prompt.ts 自声明）→ 新仓 toolNames 单一事实源
 *    （S-T5d/T-5e 已 seed，本文件不再重声明，builder 插值改引 toolNames）。
 *  ⑤ 旧注释中 REPL / useScheduledTasks hook 语义（enable 旗标驱动 tick
 *    循环）→ 新仓 scheduler = createCronScheduler 组合根实例（E-7 S-7b），
 *    无全局 enable 旗标（旧 bootstrap setScheduledTasksEnabled 即 any-stub
 *    no-op，S-D2 未落 = 本体保真无行为）；调用面裁见 cronCreateTool 头注。
 */
import { isEnvTruthy } from '../../../shared'
import { DEFAULT_CRON_JITTER_CONFIG } from '../../scheduler'
import {
  CRON_CREATE_TOOL_NAME,
  CRON_DELETE_TOOL_NAME,
} from '../toolNames'

/**
 * Unified gate for the cron scheduling system（delta ①② 后形态）：
 * 本地 kill-switch `ATLAS_DISABLE_CRON` 设真即关（设真静默跳过，不提示），
 * 否则开（/loop GA 缺省语义）。
 */
export function isCronEnabled(): boolean {
  return !isEnvTruthy(process.env.ATLAS_DISABLE_CRON)
}

/**
 * Kill switch for disk-persistent (durable) cron tasks（delta ③：旧 GB
 * 'atlas_cron_durable' 支裁后恒 true）。Narrower than {@link isCronEnabled}
 * — flipping isCronEnabled off kills the whole scheduler; this one only
 * forces `durable: false` at the call() site.
 */
export function isDurableCronEnabled(): boolean {
  return true
}

/** 旧仓逐字：recurring 任务自动过期天数（jitter config 单一事实源）。 */
export const DEFAULT_MAX_AGE_DAYS =
  DEFAULT_CRON_JITTER_CONFIG.recurringMaxAgeMs / (24 * 60 * 60 * 1000)

export function buildCronCreateDescription(durableEnabled: boolean): string {
  return durableEnabled
    ? 'Schedule a prompt to run at a future time — either recurring on a cron schedule, or once at a specific time. Pass durable: true to persist to .atlas/scheduled_tasks.json; otherwise session-only.'
    : 'Schedule a prompt to run at a future time within this Claude session — either recurring on a cron schedule, or once at a specific time.'
}

export function buildCronCreatePrompt(durableEnabled: boolean): string {
  const durabilitySection = durableEnabled
    ? `## Durability

By default (durable: false) the job lives only in this Claude session — nothing is written to disk, and the job is gone when Claude exits. Pass durable: true to write to .atlas/scheduled_tasks.json so the job survives restarts. Only use durable: true when the user explicitly asks for the task to persist ("keep doing this every day", "set this up permanently"). Most "remind me in 5 minutes" / "check back in an hour" requests should stay session-only.`
    : `## Session-only

Jobs live only in this Claude session — nothing is written to disk, and the job is gone when Claude exits.`

  const durableRuntimeNote = durableEnabled
    ? 'Durable jobs persist to .atlas/scheduled_tasks.json and survive session restarts — on next launch they resume automatically. One-shot durable tasks that were missed while the REPL was closed are surfaced for catch-up. Session-only jobs die with the process. '
    : ''

  return `Schedule a prompt to be enqueued at a future time. Use for both recurring schedules and one-shot reminders.

Uses standard 5-field cron in the user's local timezone: minute hour day-of-month month day-of-week. "0 9 * * *" means 9am local — no timezone conversion needed.

## One-shot tasks (recurring: false)

For "remind me at X" or "at <time>, do Y" requests — fire once then auto-delete.
Pin minute/hour/day-of-month/month to specific values:
  "remind me at 2:30pm today to check the deploy" → cron: "30 14 <today_dom> <today_month> *", recurring: false
  "tomorrow morning, run the smoke test" → cron: "57 8 <tomorrow_dom> <tomorrow_month> *", recurring: false

## Recurring jobs (recurring: true, the default)

For "every N minutes" / "every hour" / "weekdays at 9am" requests:
  "*/5 * * * *" (every 5 min), "0 * * * *" (hourly), "0 9 * * 1-5" (weekdays at 9am local)

## Avoid the :00 and :30 minute marks when the task allows it

Every user who asks for "9am" gets \`0 9\`, and every user who asks for "hourly" gets \`0 *\` — which means requests from across the planet land on the API at the same instant. When the user's request is approximate, pick a minute that is NOT 0 or 30:
  "every morning around 9" → "57 8 * * *" or "3 9 * * *" (not "0 9 * * *")
  "hourly" → "7 * * * *" (not "0 * * * *")
  "in an hour or so, remind me to..." → pick whatever minute you land on, don't round

Only use minute 0 or 30 when the user names that exact time and clearly means it ("at 9:00 sharp", "at half past", coordinating with a meeting). When in doubt, nudge a few minutes early or late — the user will not notice, and the fleet will.

${durabilitySection}

## Runtime behavior

Jobs only fire while the REPL is idle (not mid-query). ${durableRuntimeNote}The scheduler adds a small deterministic jitter on top of whatever you pick: recurring tasks fire up to 10% of their period late (max 15 min); one-shot tasks landing on :00 or :30 fire up to 90 s early. Picking an off-minute is still the bigger lever.

Recurring tasks auto-expire after ${DEFAULT_MAX_AGE_DAYS} days — they fire one final time, then are deleted. This bounds session lifetime. Tell the user about the ${DEFAULT_MAX_AGE_DAYS}-day limit when scheduling recurring jobs.

Returns a job ID you can pass to ${CRON_DELETE_TOOL_NAME}.`
}

export const CRON_DELETE_DESCRIPTION = 'Cancel a scheduled cron job by ID'
export function buildCronDeletePrompt(durableEnabled: boolean): string {
  return durableEnabled
    ? `Cancel a cron job previously scheduled with ${CRON_CREATE_TOOL_NAME}. Removes it from .atlas/scheduled_tasks.json (durable jobs) or the in-memory session store (session-only jobs).`
    : `Cancel a cron job previously scheduled with ${CRON_CREATE_TOOL_NAME}. Removes it from the in-memory session store.`
}

export const CRON_LIST_DESCRIPTION = 'List scheduled cron jobs'
export function buildCronListPrompt(durableEnabled: boolean): string {
  return durableEnabled
    ? `List all cron jobs scheduled via ${CRON_CREATE_TOOL_NAME}, both durable (.atlas/scheduled_tasks.json) and session-only.`
    : `List all cron jobs scheduled via ${CRON_CREATE_TOOL_NAME} in this session.`
}
