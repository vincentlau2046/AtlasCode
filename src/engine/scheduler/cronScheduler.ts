/**
 * scheduler 域 — 非 React scheduler 核心（旧仓 src/utils/cronScheduler.ts 530L）
 *
 * 落位：engine/scheduler（E-7 第 2 leaf，§8.47 详案）。生命周期：加载
 * file-backed 任务 + 1s check timer → on fire 调 onFire(prompt) → stop()
 * 拆干净。真契约面 = file-backed（durable）路径（dir 显式、daemon 风格）——
 * 旧仓唯一真跑通的路径（REPL/bootstrap 路径在旧仓全是 `: any` stub，见
 * cronEnv.ts 头注）。
 *
 * 依赖映射（新仓）：
 *   - cronToHuman / cronTasks 族 / cronTasksLock / DEFAULT_CRON_JITTER_CONFIG →
 *     本域 sibling 模块。
 *   - logForDebugging → shared。
 *
 * 裁剪 + 登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - **chokidar watch-reload 整砍**（旧仓 L9 type import + L371 dynamic import +
 *     L409 watch）：新仓无 chokidar 依赖。改**每 owner tick 轮询文件**
 *     （check() 头 `tasks = await readCronTasks(dir)`）——比事件驱动更健壮
 *     （亦捕获外部编辑），代价 = owner 每秒一次文件读（cron scheduler 可接受）。
 *     非 owner 不轮询（lockProbe 拿到锁后首个 owner tick 才读）。
 *   - **session 任务读取整砍**（旧仓 `dir===undefined` 支 `getSessionCronTasks()`
 *     + `removeSessionCronTasks`）：session store 是旧仓 `: any` stub，归
 *     CLI/teammate 波。process() 去 isSession 支（全 file-backed）。
 *   - **REPL 自动使能轮询整砍**（旧仓 start() 的 getScheduledTasksEnabled
 *     poll + setScheduledTasksEnabled）：getScheduledTasksEnabled 是旧仓
 *     `: any` stub（恒 falsy → REPL 路径实际死代码）。start() 简化为恒 enable。
 *
 * 保留真行为（测试锚点）：lock 所有权门（isOwner 才处理 file 任务 + 批量
 * lastFiredAt 落盘）+ lockProbe 接管 + first-sight anchor（lastFiredAt ??
 * createdAt）+ recurring reschedule-from-now（jitter 避 :00）+ one-shot
 * inFlight 防双发 + aged-recurring 终态删 + missed-task 初载 surface +
 * getNextFireTime。
 */
import {
  DEFAULT_CRON_JITTER_CONFIG,
  findMissedTasks,
  hasCronTasksSync,
  jitteredNextCronRunMs,
  markCronTasksFired,
  oneShotJitteredNextCronRunMs,
  readCronTasks,
  removeCronTasks,
  type CronJitterConfig,
  type CronTask,
} from './cronTasks'
import {
  releaseSchedulerLock,
  tryAcquireSchedulerLock,
} from './cronTasksLock'
import { cronToHuman } from './cron'
import { logForDebugging } from '../../shared'

const CHECK_INTERVAL_MS = 1000
// How often a non-owning session re-probes the scheduler lock. Coarse
// because takeover only matters when the owning session has crashed.
const LOCK_PROBE_INTERVAL_MS = 5000
/**
 * True when a recurring task was created more than `maxAgeMs` ago and should
 * be deleted on its next fire. Permanent tasks never age. `maxAgeMs === 0`
 * means unlimited (never ages out). Sourced from
 * {@link CronJitterConfig.recurringMaxAgeMs} at call time.
 * Extracted for testability — the scheduler's check() is buried under
 * setInterval/lock machinery.
 */
export function isRecurringTaskAged(
  t: CronTask,
  nowMs: number,
  maxAgeMs: number,
): boolean {
  if (maxAgeMs === 0) return false
  return Boolean(t.recurring && !t.permanent && nowMs - t.createdAt >= maxAgeMs)
}

type CronSchedulerOptions = {
  /** Called when a task fires (regular or missed-on-startup). */
  onFire: (prompt: string) => void
  /** While true, firing is deferred to the next tick. */
  isLoading: () => boolean
  /**
   * When provided, receives the full CronTask on normal fires (and onFire is
   * NOT called for that fire). Lets daemon callers see the task id/cron/etc
   * instead of just the prompt string.
   */
  onFireTask?: (task: CronTask) => void
  /**
   * When provided, receives the missed one-shot tasks on initial load (and
   * onFire is NOT called with the pre-formatted notification). Daemon decides
   * how to surface them.
   */
  onMissed?: (tasks: CronTask[]) => void
  /**
   * Directory containing scheduled_tasks.json. When provided, the scheduler
   * never touches bootstrap state: getScheduledTasksEnabled() poll is skipped
   * (enable() runs immediately on start). Required for Agent SDK daemon
   * callers.
   */
  dir?: string
  /**
   * Owner key written into the lock file. Defaults to the scheduler owner key
   * (进程级 randomUUID, cronEnv 注入口). Daemon callers must pass a stable
   * per-process UUID since they have no session. PID remains the liveness
   * probe regardless.
   */
  lockIdentity?: string
  /**
   * Returns the cron jitter config to use for this tick. Called once per
   * check() cycle. REPL callers can pass a live-tuning implementation for
   * mid-session adjustment. Daemon/SDK callers omit this and get
   * DEFAULT_CRON_JITTER_CONFIG, which is safe since daemons restart on
   * config change anyway.
   */
  getJitterConfig?: () => CronJitterConfig
  /**
   * Killswitch: polled once per check() tick. When true, check() bails
   * before firing anything — existing crons stop dead mid-session.
   */
  isKilled?: () => boolean
  /**
   * Per-task gate applied before any side effect. Tasks returning false are
   * invisible to this scheduler: never fired, never stamped with
   * `lastFiredAt`, never deleted, never surfaced as missed, absent from
   * `getNextFireTime()`. The daemon cron worker uses `t => t.permanent` so
   * non-permanent tasks in the same scheduled_tasks.json are untouched.
   */
  filter?: (t: CronTask) => boolean
}

export type CronScheduler = {
  start: () => void
  stop: () => void
  /**
   * Epoch ms of the soonest scheduled fire across all loaded tasks, or null
   * if nothing is scheduled (no tasks, or all tasks already in-flight).
   * Daemon callers use this to decide whether to tear down an idle agent
   * subprocess or keep it warm for an imminent fire.
   */
  getNextFireTime: () => number | null
}

export function createCronScheduler(
  options: CronSchedulerOptions,
): CronScheduler {
  const {
    onFire,
    isLoading,
    onFireTask,
    onMissed,
    dir,
    lockIdentity,
    getJitterConfig,
    isKilled,
    filter,
  } = options
  const lockOpts = dir || lockIdentity ? { dir, lockIdentity } : undefined

  // File-backed tasks only. Session tasks (durable: false) are a forward
  // seam (see module 头注) — not loaded here, not merged into check().
  let tasks: CronTask[] = []
  // Per-task next-fire times (epoch ms).
  const nextFireAt = new Map<string, number>()
  // Ids we've already enqueued a "missed task" prompt for — prevents
  // re-asking on every reload before the user answers.
  const missedAsked = new Set<string>()
  // Tasks currently enqueued but not yet removed from the file. Prevents
  // double-fire if the interval ticks again before removeCronTasks lands.
  const inFlight = new Set<string>()

  let checkTimer: ReturnType<typeof setInterval> | null = null
  let lockProbeTimer: ReturnType<typeof setInterval> | null = null
  let stopped = false
  let isOwner = false

  async function load(initial: boolean) {
    const next = await readCronTasks(dir)
    if (stopped) return
    tasks = next

    // Only surface missed tasks on initial load. Reloads leave overdue tasks
    // to check() (which anchors from createdAt and fires immediately). This
    // avoids a misleading "missed while the CLI was not running" prompt for
    // tasks that became overdue mid-session.
    //
    // Recurring tasks are NOT surfaced or deleted — check() handles them
    // correctly (fires on first tick, reschedules forward). Only one-shot
    // missed tasks need user input (run once now, or discard forever).
    if (!initial) return

    const now = Date.now()
    const missed = findMissedTasks(next, now).filter(
      t => !t.recurring && !missedAsked.has(t.id) && (!filter || filter(t)),
    )
    if (missed.length > 0) {
      for (const t of missed) {
        missedAsked.add(t.id)
        // Prevent check() from re-firing the raw prompt while the async
        // removeCronTasks is in progress.
        nextFireAt.set(t.id, Infinity)
      }
      if (onMissed) {
        onMissed(missed)
      } else {
        onFire(buildMissedTaskNotification(missed))
      }
      void removeCronTasks(
        missed.map(t => t.id),
        dir,
      ).catch(e =>
        logForDebugging(`[ScheduledTasks] failed to remove missed tasks: ${e}`),
      )
      logForDebugging(
        `[ScheduledTasks] surfaced ${missed.length} missed one-shot task(s)`,
      )
    }
  }

  async function check() {
    if (isKilled?.()) return
    if (isLoading()) return
    const now = Date.now()
    const seen = new Set<string>()
    // File-backed recurring tasks that fired this tick. Batched into one
    // markCronTasksFired call after the loop so N fires = one write.
    const firedFileRecurring: string[] = []
    // Read once per tick. Callers can pass getJitterConfig for live tuning;
    // otherwise DEFAULT_CRON_JITTER_CONFIG.
    const jitterCfg = getJitterConfig?.() ?? DEFAULT_CRON_JITTER_CONFIG

    // Shared loop body. All tasks are file-backed (session tasks are a
    // forward seam — see module 头注), so one-shot cleanup always goes
    // through the async removeCronTasks + inFlight path.
    function process(t: CronTask) {
      if (filter && !filter(t)) return
      seen.add(t.id)
      if (inFlight.has(t.id)) return

      let next = nextFireAt.get(t.id)
      if (next === undefined) {
        // First sight — anchor from lastFiredAt (recurring) or createdAt.
        // Never-fired recurring tasks use createdAt: if isLoading delayed
        // this tick past the fire time, anchoring from `now` would compute
        // next-year for pinned crons (`30 14 27 2 *`). Fired-before tasks
        // use lastFiredAt: the reschedule below writes `now` back to disk,
        // so on next process spawn first-sight computes the SAME newNext we
        // set in-memory here. Without this, a child despawning on idle loses
        // nextFireAt and the next spawn re-anchors from an old createdAt →
        // fires every task every cycle.
        next = t.recurring
          ? (jitteredNextCronRunMs(
              t.cron,
              t.lastFiredAt ?? t.createdAt,
              t.id,
              jitterCfg,
            ) ?? Infinity)
          : (oneShotJitteredNextCronRunMs(
              t.cron,
              t.createdAt,
              t.id,
              jitterCfg,
            ) ?? Infinity)
        nextFireAt.set(t.id, next)
        logForDebugging(
          `[ScheduledTasks] scheduled ${t.id} for ${next === Infinity ? 'never' : new Date(next).toISOString()}`,
        )
      }

      if (now < next) return

      logForDebugging(
        `[ScheduledTasks] firing ${t.id}${t.recurring ? ' (recurring)' : ''}`,
      )
      if (onFireTask) {
        onFireTask(t)
      } else {
        onFire(t.prompt)
      }

      // Aged-out recurring tasks fall through to the one-shot delete path
      // below. Fires one last time, then is removed.
      const aged = isRecurringTaskAged(t, now, jitterCfg.recurringMaxAgeMs)
      if (aged) {
        const ageHours = Math.floor((now - t.createdAt) / 1000 / 60 / 60)
        logForDebugging(
          `[ScheduledTasks] recurring task ${t.id} aged out (${ageHours}h since creation), deleting after final fire`,
        )
      }

      if (t.recurring && !aged) {
        // Recurring: reschedule from now (not from next) to avoid rapid
        // catch-up if the session was blocked. Jitter keeps us off the
        // exact :00 wall-clock boundary every cycle.
        const newNext =
          jitteredNextCronRunMs(t.cron, now, t.id, jitterCfg) ?? Infinity
        nextFireAt.set(t.id, newNext)
        // Persist lastFiredAt=now so next process spawn reconstructs this
        // same newNext on first-sight.
        firedFileRecurring.push(t.id)
      } else {
        // One-shot (or aged-out recurring) file task: delete from disk.
        // inFlight guards against double-fire during the async
        // removeCronTasks.
        inFlight.add(t.id)
        void removeCronTasks([t.id], dir)
          .catch(e =>
            logForDebugging(
              `[ScheduledTasks] failed to remove task ${t.id}: ${e}`,
            ),
          )
          .finally(() => inFlight.delete(t.id))
        nextFireAt.delete(t.id)
      }
    }

    // File-backed tasks: only when we own the scheduler lock. The lock
    // exists to stop two sessions in the same cwd from double-firing the
    // same on-disk task.
    //
    // H6 前向接缝：chokidar watch-reload 整砍 → 每 owner tick 轮询文件
    // （见模块头注）。非 owner 不轮询（lockProbe 拿到锁后首个 owner tick
    // 才读）。
    if (isOwner) {
      tasks = await readCronTasks(dir)
      for (const t of tasks) process(t)
      // Batched lastFiredAt write. inFlight guards against double-fire
      // during the reload (same pattern as removeCronTasks below).
      if (firedFileRecurring.length > 0) {
        for (const id of firedFileRecurring) inFlight.add(id)
        void markCronTasksFired(firedFileRecurring, now, dir)
          .catch(e =>
            logForDebugging(
              `[ScheduledTasks] failed to persist lastFiredAt: ${e}`,
            ),
          )
          .finally(() => {
            for (const id of firedFileRecurring) inFlight.delete(id)
          })
      }
    }

    if (seen.size === 0) {
      // No live tasks this tick — clear the whole schedule so
      // getNextFireTime() returns null. The eviction loop below is
      // unreachable here (seen is empty), so stale entries would
      // otherwise survive indefinitely and keep the daemon agent warm.
      nextFireAt.clear()
      return
    }
    // Evict schedule entries for tasks no longer present. When !isOwner,
    // file-task ids aren't in `seen` and get evicted — harmless: they
    // re-anchor from createdAt on the first owned tick.
    for (const id of nextFireAt.keys()) {
      if (!seen.has(id)) nextFireAt.delete(id)
    }
  }

  async function enable() {
    // Acquire the per-project scheduler lock. Only the owning session runs
    // check(). Other sessions probe periodically to take over if the owner
    // dies. Prevents double-firing when multiple sessions share a cwd.
    isOwner = await tryAcquireSchedulerLock(lockOpts).catch(() => false)
    if (stopped) {
      if (isOwner) {
        isOwner = false
        void releaseSchedulerLock(lockOpts)
      }
      return
    }
    if (!isOwner) {
      lockProbeTimer = setInterval(() => {
        void tryAcquireSchedulerLock(lockOpts)
          .then(owned => {
            if (stopped) {
              if (owned) void releaseSchedulerLock(lockOpts)
              return
            }
            if (owned) {
              isOwner = true
              if (lockProbeTimer) {
                clearInterval(lockProbeTimer)
                lockProbeTimer = null
              }
            }
          })
          .catch(e => logForDebugging(String(e), { level: 'error' }))
      }, LOCK_PROBE_INTERVAL_MS)
      lockProbeTimer.unref?.()
    }

    void load(true)

    checkTimer = setInterval(
      () => {
        void check().catch(e =>
          logForDebugging(String(e), { level: 'error' }),
        )
      },
      CHECK_INTERVAL_MS,
    )
    // Don't keep the process alive for the scheduler alone — in headless
    // mode the process should exit after the single turn even if a cron was
    // created.
    checkTimer.unref?.()
  }

  return {
    start() {
      stopped = false
      // H6 前向接缝：REPL 自动使能轮询整砍（getScheduledTasksEnabled 旧仓
      // 是 `: any` stub → 死代码，见模块头注）。两条路径恒 enable。
      logForDebugging(
        `[ScheduledTasks] scheduler start() — dir=${dir ?? '<default>'}, hasTasks=${hasCronTasksSync(dir)}`,
      )
      void enable()
    },
    stop() {
      stopped = true
      if (checkTimer) {
        clearInterval(checkTimer)
        checkTimer = null
      }
      if (lockProbeTimer) {
        clearInterval(lockProbeTimer)
        lockProbeTimer = null
      }
      if (isOwner) {
        isOwner = false
        void releaseSchedulerLock(lockOpts)
      }
    },
    getNextFireTime() {
      // nextFireAt uses Infinity for "never" (in-flight one-shots, bad cron
      // strings). Filter those out so callers can distinguish "soon" from
      // "nothing pending".
      let min = Infinity
      for (const t of nextFireAt.values()) {
        if (t < min) min = t
      }
      return min === Infinity ? null : min
    },
  }
}

/**
 * Build the missed-task notification text. Guidance precedes the task list
 * and the list is wrapped in a code fence so a multi-line imperative prompt
 * is not interpreted as immediate instructions (avoid self-inflicted prompt
 * injection). The full prompt body is preserved — this path DOES need the
 * model to execute the prompt after user confirmation, and tasks are already
 * deleted from JSON before the model sees this notification.
 */
export function buildMissedTaskNotification(missed: CronTask[]): string {
  const plural = missed.length > 1
  const header =
    `The following one-shot scheduled task${plural ? 's were' : ' was'} missed while Atlas was not running. ` +
    `${plural ? 'They have' : 'It has'} already been removed from .atlas/scheduled_tasks.json.\n\n` +
    `Do NOT execute ${plural ? 'these prompts' : 'this prompt'} yet. ` +
    `First use the AskUserQuestion tool to ask whether to run ${plural ? 'each one' : 'it'} now. ` +
    `Only execute if the user confirms.`

  const blocks = missed.map(t => {
    const meta = `[${cronToHuman(t.cron)}, created ${new Date(t.createdAt).toLocaleString()}]`
    // Use a fence one longer than any backtick run in the prompt so a
    // prompt containing ``` cannot close the fence early and un-wrap the
    // trailing text (CommonMark fence-matching rule).
    const longestRun = ((t.prompt.match(/`+/g) ?? []) as string[]).reduce(
      (max, run) => Math.max(max, run.length),
      0,
    )
    const fence = '`'.repeat(Math.max(3, longestRun + 1))
    return `${meta}\n${fence}\n${t.prompt}\n${fence}`
  })

  return `${header}\n\n${blocks.join('\n\n')}`
}
