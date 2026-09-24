/**
 * scheduler 域 — scheduled prompts CRUD（旧仓 src/utils/cronTasks.ts 459L）
 *
 * 落位：engine/scheduler（E-7 第 2 leaf，§8.47 详案）。真契约面 =
 * file-backed（durable）路径：`<project>/.atlas/scheduled_tasks.json` 的
 * 读写 + 增删 + 批量 lastFiredAt 落盘 + jitter 计算 + missed-task 检测。
 *
 * 依赖映射（新仓）：
 *   - getProjectRoot / session-cron store → 域内注入口 cronEnv（见 cronEnv.ts 头注）。
 *   - getFsImplementation / isFsInaccessible / logForDebugging / getConfigDirName
 *     → shared（跨域共享叶，非 domain-internal，可引）。
 *   - safeParseJSON / jsonStringify → cronEnv 域内小工具（旧仓 json / slowOperations）。
 *   - logError → logForDebugging(String(e), { level:'error' })（新仓 logging port
 *     未落，logError 归一化到 debug 面）。
 *
 * 裁剪 + 登记（H6 前向接缝，复审勿当遗漏重提）：
 *   - **durable:false（session-only）路径整砍**：addCronTask 抛前向接缝错（旧仓
 *     addSessionCronTask 是 `: any` stub 返回 {}，durable:false 任务静默蒸发，
 *     本 port 拒绝"假装通过"——显式 throw 而非 no-op）。agentId 参数保留签名
 *     但 durable 路径下无意义（session 路由归 CLI/teammate 波）。
 *   - removeCronTasks 的 session-store sweep（旧仓 `dir===undefined &&
 *     removeSessionCronTasks(ids)===ids.length` 短路）→ 砍（session store 是
 *     stub）；durable 路径仅走文件读写。
 *   - listAllCronTasks 的 session 任务合并（旧仓 getSessionCronTasks().map）→
 *     砍；仅返回 file-backed 任务。
 *
 * 真行为（保留，测试锚点）：
 *   - readCronTasks 逐 task 校验（id/cron/prompt/createdAt 类型 + parseCron
 *     有效性），单条坏 task 不阻断整文件。
 *   - writeCronTasks 剥离 runtime-only `durable` 字段（落盘形状 { id, cron,
 *     prompt, createdAt, lastFiredAt?, recurring?, permanent? }）。
 *   - jitterFrac（8-hex taskId → [0,1)）+ jitteredNextCronRunMs（recurring
 *     forward jitter）+ oneShotJitteredNextCronRunMs（one-shot backward lead，
 *     minute-mod 门控）+ findMissedTasks。
 */
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  getFsImplementation,
  getConfigDirName,
  isFsInaccessible,
  logForDebugging,
} from '../../shared'
import {
  computeNextCronRun,
  parseCronExpression,
} from './cron'
import {
  getSchedulerEnv,
  jsonStringify,
  safeParseJSON,
} from './cronEnv'

export type CronTask = {
  id: string
  /** 5-field cron string (local time) — validated on write, re-validated on read. */
  cron: string
  /** Prompt to enqueue when the task fires. */
  prompt: string
  /** Epoch ms when the task was created. Anchor for missed-task detection. */
  createdAt: number
  /**
   * Epoch ms of the most recent fire. Written back by the scheduler after
   * each recurring fire so next-fire computation survives process restarts.
   * The scheduler anchors first-sight from `lastFiredAt ?? createdAt` — a
   * never-fired task uses createdAt (correct for pinned crons like
   * `30 14 27 2 *` whose next-from-now is next year); a fired-before task
   * reconstructs the same `nextFireAt` the prior process had in memory.
   * Never set for one-shots (they're deleted on fire).
   */
  lastFiredAt?: number
  /** When true, the task reschedules after firing instead of being deleted. */
  recurring?: boolean
  /**
   * When true, the task is exempt from recurringMaxAgeMs auto-expiry.
   * System escape hatch for assistant mode's built-in tasks (catch-up/
   * morning-checkin/dream). Not settable via the create API; only written
   * directly to scheduled_tasks.json.
   */
  permanent?: boolean
  /**
   * Runtime-only flag. false → session-scoped (never written to disk).
   * File-backed tasks leave this undefined; writeCronTasks strips it so
   * the on-disk shape stays { id, cron, prompt, createdAt, lastFiredAt?, recurring?, permanent? }.
   */
  durable?: boolean
  /**
   * Runtime-only. When set, the task was created by an in-process teammate.
   * The scheduler routes fires to that teammate's queue instead of the main
   * REPL's. Never written to disk. (Session-only routing is a forward seam —
   * see module 头注；durable 路径下无消费者。)
   */
  agentId?: string
}

type CronFile = { tasks: CronTask[] }

const CRON_FILE_REL = join(getConfigDirName(), 'scheduled_tasks.json')

/**
 * Path to the cron file. `dir` defaults to the scheduler project root (cronEnv
 * 注入口；缺省 `.git` 上探) — pass it explicitly from contexts that don't run
 * through main.tsx (e.g. the Agent SDK daemon, which has no bootstrap state).
 */
export function getCronFilePath(dir?: string): string {
  return join(dir ?? getSchedulerEnv().getProjectRoot(), CRON_FILE_REL)
}

/**
 * Read and parse scheduled_tasks.json. Returns an empty task list if the file
 * is missing, empty, or malformed. Tasks with invalid cron strings are
 * silently dropped (logged at debug level) so a single bad entry never
 * blocks the whole file.
 */
export async function readCronTasks(dir?: string): Promise<CronTask[]> {
  const fs = getFsImplementation()
  let raw: string
  try {
    raw = await fs.readFile(getCronFilePath(dir), { encoding: 'utf-8' })
  } catch (e: unknown) {
    if (isFsInaccessible(e)) return []
    logForDebugging(String(e), { level: 'error' })
    return []
  }

  const parsed = safeParseJSON(raw)
  if (!parsed || typeof parsed !== 'object') return []
  const file = parsed as Partial<CronFile>
  if (!Array.isArray(file.tasks)) return []

  const out: CronTask[] = []
  for (const t of file.tasks) {
    if (
      !t ||
      typeof t.id !== 'string' ||
      typeof t.cron !== 'string' ||
      typeof t.prompt !== 'string' ||
      typeof t.createdAt !== 'number'
    ) {
      logForDebugging(
        `[ScheduledTasks] skipping malformed task: ${jsonStringify(t)}`,
      )
      continue
    }
    if (!parseCronExpression(t.cron)) {
      logForDebugging(
        `[ScheduledTasks] skipping task ${t.id} with invalid cron '${t.cron}'`,
      )
      continue
    }
    out.push({
      id: t.id,
      cron: t.cron,
      prompt: t.prompt,
      createdAt: t.createdAt,
      ...(typeof t.lastFiredAt === 'number'
        ? { lastFiredAt: t.lastFiredAt }
        : {}),
      ...(t.recurring ? { recurring: true } : {}),
      ...(t.permanent ? { permanent: true } : {}),
    })
  }
  return out
}

/**
 * Sync check for whether the cron file has any valid tasks. Used by
 * cronScheduler.start() for its startup debug log line (the old auto-enable
 * decision was cut with the dead getScheduledTasksEnabled poll — see the
 * cronScheduler 头注); start() unconditionally enables. One file read.
 */
export function hasCronTasksSync(dir?: string): boolean {
  let raw: string
  try {
    // 单次同步读（start() 决策用，一次文件读；旧仓有 custom-rules/no-sync-fs
    // 豁免注记，新仓无该规则）。
    raw = readFileSync(getCronFilePath(dir), 'utf-8')
  } catch {
    return false
  }
  const parsed = safeParseJSON(raw)
  if (!parsed || typeof parsed !== 'object') return false
  const tasks = (parsed as Partial<CronFile>).tasks
  return Array.isArray(tasks) && tasks.length > 0
}

/**
 * Overwrite scheduled_tasks.json with the given tasks. Creates .atlas/ if
 * missing. Empty task list writes an empty file (rather than deleting) so
 * the file watcher sees a change event on last-task-removed.
 */
export async function writeCronTasks(
  tasks: CronTask[],
  dir?: string,
): Promise<void> {
  const root = dir ?? getSchedulerEnv().getProjectRoot()
  await mkdir(join(root, getConfigDirName()), { recursive: true })
  // Strip the runtime-only `durable` flag — everything on disk is durable
  // by definition, and keeping the flag out means readCronTasks() naturally
  // yields durable: undefined without having to set it explicitly.
  const body: CronFile = {
    tasks: tasks.map(({ durable: _durable, ...rest }) => rest),
  }
  await writeFile(
    getCronFilePath(root),
    jsonStringify(body, null, 2) + '\n',
    'utf-8',
  )
}

/**
 * Append a task. Returns the generated id. Caller is responsible for having
 * already validated the cron string (the tool does this via validateInput).
 *
 * H6 前向接缝：durable=false（session-only）路径整砍（见模块头注）——旧仓
 * addSessionCronTask 是 `: any` stub，本 port 拒绝静默蒸发，显式 throw。
 * durable=true 走真 file-backed 路径。`agentId` 保留签名（session 路由归
 * CLI/teammate 波），durable 路径下无消费者。
 */
export async function addCronTask(
  cron: string,
  prompt: string,
  recurring: boolean,
  durable: boolean,
  _agentId?: string,
): Promise<string> {
  if (!durable) {
    throw new Error(
      '[ScheduledTasks] session-only cron (durable:false) is a forward seam ' +
        '(CLI/teammate wave) — the scheduler leaf only implements the durable ' +
        'file-backed path. Pass durable:true.',
    )
  }
  // Short ID — 8 hex chars is plenty for MAX_JOBS=50, avoids slice/prefix
  // juggling between the tool layer (shows short IDs) and disk.
  const id = randomUUID().slice(0, 8)
  const task = {
    id,
    cron,
    prompt,
    createdAt: Date.now(),
    ...(recurring ? { recurring: true } : {}),
  }
  const tasks = await readCronTasks()
  tasks.push(task)
  await writeCronTasks(tasks)
  return id
}

/**
 * Remove tasks by id. No-op if none match (e.g. another session raced us).
 * Used for both fire-once cleanup and explicit CronDelete.
 *
 * H6 前向接缝：旧仓的 session-store sweep（`dir===undefined &&
 * removeSessionCronTasks(ids)===ids.length` 短路）整砍（session store 是
 * `: any` stub）——本 port 仅走 durable 文件路径。
 */
export async function removeCronTasks(
  ids: string[],
  dir?: string,
): Promise<void> {
  if (ids.length === 0) return
  const idSet = new Set(ids)
  const tasks = await readCronTasks(dir)
  const remaining = tasks.filter(t => !idSet.has(t.id))
  if (remaining.length === tasks.length) return
  await writeCronTasks(remaining, dir)
}

/**
 * Stamp `lastFiredAt` on the given recurring tasks and write back. Batched
 * so N fires in one scheduler tick = one read-modify-write, not N. Only
 * touches file-backed tasks — session tasks die with the process, no point
 * persisting their fire time. No-op if none of the ids match (task was
 * deleted between fire and write — e.g. user ran CronDelete mid-tick).
 *
 * Scheduler lock means at most one process calls this; the watcher picks up
 * the write and triggers a reload which re-seeds `nextFireAt` from the
 * just-written `lastFiredAt` — idempotent (same computation, same answer).
 */
export async function markCronTasksFired(
  ids: string[],
  firedAt: number,
  dir?: string,
): Promise<void> {
  if (ids.length === 0) return
  const idSet = new Set(ids)
  const tasks = await readCronTasks(dir)
  let changed = false
  for (const t of tasks) {
    if (idSet.has(t.id)) {
      t.lastFiredAt = firedAt
      changed = true
    }
  }
  if (!changed) return
  await writeCronTasks(tasks, dir)
}

/**
 * File-backed tasks. Session-only tasks are a forward seam (see module 头注)
 * — the merged `durable:false` union is cut.
 */
export async function listAllCronTasks(dir?: string): Promise<CronTask[]> {
  return readCronTasks(dir)
}

/**
 * Next fire time in epoch ms for a cron string, strictly after `fromMs`.
 * Returns null if invalid or no match in the next 366 days.
 */
export function nextCronRunMs(cron: string, fromMs: number): number | null {
  const fields = parseCronExpression(cron)
  if (!fields) return null
  const next = computeNextCronRun(fields, new Date(fromMs))
  return next ? next.getTime() : null
}

/**
 * Cron scheduler tuning knobs. Defaults preserve the pre-config behavior
 * exactly. Sourced at runtime via cronJitterConfig (GrowthBook-backed live
 * tuning is a forward seam — see cronJitterConfig.ts 头注).
 */
export type CronJitterConfig = {
  /** Recurring-task forward delay as a fraction of the interval between fires. */
  recurringFrac: number
  /** Upper bound on recurring forward delay regardless of interval length. */
  recurringCapMs: number
  /** One-shot backward lead: maximum ms a task may fire early. */
  oneShotMaxMs: number
  /**
   * One-shot backward lead: minimum ms a task fires early when the minute-mod
   * gate matches. 0 = taskIds hashing near zero fire on the exact mark. Raise
   * this to guarantee nobody lands on the wall-clock boundary.
   */
  oneShotFloorMs: number
  /**
   * Jitter fires landing on minutes where `minute % N === 0`. 30 → :00/:30
   * (the human-rounding hotspots). 15 → :00/:15/:30/:45. 1 → every minute.
   */
  oneShotMinuteMod: number
  /**
   * Recurring tasks auto-expire this many ms after creation (unless marked
   * `permanent`). `0` = unlimited (tasks never auto-expire).
   */
  recurringMaxAgeMs: number
}

export const DEFAULT_CRON_JITTER_CONFIG: CronJitterConfig = {
  recurringFrac: 0.1,
  recurringCapMs: 15 * 60 * 1000,
  oneShotMaxMs: 90 * 1000,
  oneShotFloorMs: 0,
  oneShotMinuteMod: 30,
  recurringMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
}

/**
 * taskId is an 8-hex-char UUID slice (see {@link addCronTask}) → parse as
 * u32 → [0, 1). Stable across restarts, uniformly distributed across the
 * fleet. Non-hex ids (hand-edited JSON) fall back to 0 = no jitter.
 */
function jitterFrac(taskId: string): number {
  const frac = parseInt(taskId.slice(0, 8), 16) / 0x1_0000_0000
  return Number.isFinite(frac) ? frac : 0
}

/**
 * Same as {@link nextCronRunMs}, plus a deterministic per-task delay to
 * avoid a thundering herd when many sessions schedule the same cron string
 * (e.g. `0 * * * *` → everyone hits inference at :00).
 *
 * The delay is proportional to the current gap between fires
 * ({@link CronJitterConfig.recurringFrac}, capped at
 * {@link CronJitterConfig.recurringCapMs}) so at defaults an hourly task
 * spreads across [:00, :06) but a per-minute task only spreads by a few
 * seconds.
 *
 * Only used for recurring tasks. One-shot tasks use
 * {@link oneShotJitteredNextCronRunMs} (backward jitter, minute-gated).
 */
export function jitteredNextCronRunMs(
  cron: string,
  fromMs: number,
  taskId: string,
  cfg: CronJitterConfig = DEFAULT_CRON_JITTER_CONFIG,
): number | null {
  const t1 = nextCronRunMs(cron, fromMs)
  if (t1 === null) return null
  const t2 = nextCronRunMs(cron, t1)
  // No second match in the next year (e.g. pinned date) → nothing to
  // proportion against, and near-certainly not a herd risk. Fire on t1.
  if (t2 === null) return t1
  const jitter = Math.min(
    jitterFrac(taskId) * cfg.recurringFrac * (t2 - t1),
    cfg.recurringCapMs,
  )
  return t1 + jitter
}

/**
 * Same as {@link nextCronRunMs}, minus a deterministic per-task lead time
 * when the fire time lands on a minute boundary matching
 * {@link CronJitterConfig.oneShotMinuteMod}.
 *
 * One-shot tasks are user-pinned ("remind me at 3pm") so delaying them
 * breaks the contract — but firing slightly early is invisible and spreads
 * the inference spike from everyone picking the same round wall-clock time.
 * At defaults (mod 30, max 90 s, floor 0) only :00 and :30 get jitter,
 * because humans round to the half-hour.
 *
 * Checks the computed fire time rather than the cron string so
 * `0 15 * * *`, step expressions, and `0,30 9 * * *` all get jitter
 * when they land on a matching minute. Clamped to `fromMs` so a task created
 * inside its own jitter window doesn't fire before it was created.
 */
export function oneShotJitteredNextCronRunMs(
  cron: string,
  fromMs: number,
  taskId: string,
  cfg: CronJitterConfig = DEFAULT_CRON_JITTER_CONFIG,
): number | null {
  const t1 = nextCronRunMs(cron, fromMs)
  if (t1 === null) return null
  // Cron resolution is 1 minute → computed times always have :00 seconds,
  // so a minute-field check is sufficient to identify the hot marks.
  // getMinutes() (local), not getUTCMinutes(): cron is evaluated in local
  // time, and "user picked a round time" means round in *their* TZ. In
  // half-hour-offset zones (India UTC+5:30) local :00 is UTC :30 — the
  // UTC check would jitter the wrong marks.
  if (new Date(t1).getMinutes() % cfg.oneShotMinuteMod !== 0) return t1
  // floor + frac * (max - floor) → uniform over [floor, max). With floor=0
  // this reduces to the original frac * max. With floor>0, even a taskId
  // hashing to 0 gets `floor` ms of lead — nobody fires on the exact mark.
  const lead =
    cfg.oneShotFloorMs +
    jitterFrac(taskId) * (cfg.oneShotMaxMs - cfg.oneShotFloorMs)
  // t1 > fromMs is guaranteed by nextCronRunMs (strictly after), so the
  // max() only bites when the task was created inside its own lead window.
  return Math.max(t1 - lead, fromMs)
}

/**
 * A task is "missed" when its next scheduled run (computed from createdAt)
 * is in the past. Surfaced to the user at startup. Works for both one-shot
 * and recurring tasks — a recurring task whose window passed while the CLI
 * was down is still "missed".
 */
export function findMissedTasks(
  tasks: CronTask[],
  nowMs: number,
): CronTask[] {
  return tasks.filter(t => {
    const next = nextCronRunMs(t.cron, t.createdAt)
    return next !== null && next < nowMs
  })
}
