/**
 * scheduler 域 — scheduler lease lock（旧仓 src/utils/cronTasksLock.ts 196L）
 *
 * 落位：engine/scheduler（E-7 第 2 leaf，§8.47 详案）。多 session 同 project
 * 时只应有一个驱动 cron scheduler；首个拿到本锁的 session 成为 scheduler，
 * 其余被动并周期性 probe 锁。owner 死（PID 不再 running）时被动 session
 * 接管。
 *
 * 模式沿用旧仓（computerUseLock 同款）：O_EXCL 原子创建、PID 存活探针、
 * stale-lock 恢复、cleanup-on-exit。
 *
 * 依赖映射（新仓）：
 *   - getProjectRoot / getSessionId → 域内注入口 cronEnv（getProjectRoot 缺省
 *     `.git` 上探、getOwnerKey 缺省进程级 randomUUID；旧仓二者皆真实现
 *     state.ts:84/:105，非 stub——stub 的是 session-cron store 与
 *     get/setScheduledTasksEnabled，见 cronEnv 头注）。
 *   - registerCleanup（旧仓 coordinator/tasks cleanupRegistry）→ 域内注入口
 *     registerExitCleanup（缺省 no-op，组合根注真清理）——不跨域 import。
 *   - isProcessRunning / safeParseJSON / jsonStringify → cronEnv 域内小工具。
 *   - getErrnoCode / logForDebugging / lazySchema → shared。
 *   - zod/v4 → zod（新仓主入口 = v4，见 §8.47 依赖面）。
 */
import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import {
  getErrnoCode,
  getConfigDirName,
  lazySchema,
  logForDebugging,
} from '../../shared'
import { z } from 'zod'
import {
  isProcessRunning,
  safeParseJSON,
  jsonStringify,
  getSchedulerEnv,
} from './cronEnv'

const LOCK_FILE_REL = join(getConfigDirName(), 'scheduled_tasks.lock')

const schedulerLockSchema = lazySchema(() =>
  z.object({
    sessionId: z.string(),
    pid: z.number(),
    acquiredAt: z.number(),
  }),
)
type SchedulerLock = z.infer<ReturnType<typeof schedulerLockSchema>>

/**
 * Options for out-of-REPL callers (Agent SDK daemon) that don't have
 * bootstrap state. When omitted, falls back to the scheduler project root
 * (cronEnv 注入口) + owner key (进程级 randomUUID). lockIdentity should be
 * stable for the lifetime of one daemon process (e.g. a randomUUID()
 * captured at startup).
 */
export type SchedulerLockOptions = {
  dir?: string
  lockIdentity?: string
}

let unregisterCleanup: (() => void) | undefined
// Suppress repeat "held by X" log lines when polling a live owner.
let lastBlockedBy: string | undefined

function getLockPath(dir?: string): string {
  return join(dir ?? getSchedulerEnv().getProjectRoot(), LOCK_FILE_REL)
}

async function readLock(
  dir?: string,
): Promise<SchedulerLock | undefined> {
  let raw: string
  try {
    raw = await readFile(getLockPath(dir), 'utf8')
  } catch {
    return undefined
  }
  const result = schedulerLockSchema().safeParse(safeParseJSON(raw))
  return result.success ? result.data : undefined
}

async function tryCreateExclusive(
  lock: SchedulerLock,
  dir?: string,
): Promise<boolean> {
  const path = getLockPath(dir)
  const body = jsonStringify(lock)
  try {
    await writeFile(path, body, { flag: 'wx' })
    return true
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    if (code === 'EEXIST') return false
    if (code === 'ENOENT') {
      // .atlas/ doesn't exist yet — create it and retry once. In steady
      // state the dir already exists (scheduled_tasks.json lives there),
      // so this path is hit at most once.
      await mkdir(dirname(path), { recursive: true })
      try {
        await writeFile(path, body, { flag: 'wx' })
        return true
      } catch (retryErr: unknown) {
        if (getErrnoCode(retryErr) === 'EEXIST') return false
        throw retryErr
      }
    }
    throw e
  }
}

function registerLockCleanup(opts?: SchedulerLockOptions): void {
  unregisterCleanup?.()
  unregisterCleanup = getSchedulerEnv().registerExitCleanup(async () => {
    await releaseSchedulerLock(opts)
  })
}

/**
 * Try to acquire the scheduler lock for the current session.
 * Returns true on success, false if another live session holds it.
 *
 * Uses O_EXCL ('wx') for atomic test-and-set. If the file exists:
 *   - Already ours → true (idempotent re-acquire)
 *   - Another live PID → false
 *   - Stale (PID dead / corrupt) → unlink and retry exclusive create once
 *
 * If two sessions race to recover a stale lock, only one create succeeds.
 */
export async function tryAcquireSchedulerLock(
  opts?: SchedulerLockOptions,
): Promise<boolean> {
  const dir = opts?.dir
  // "sessionId" in the lock file is really just a stable owner key. REPL
  // uses getOwnerKey(); daemon callers supply their own UUID. PID remains
  // the liveness signal regardless.
  const sessionId = opts?.lockIdentity ?? getSchedulerEnv().getOwnerKey()
  const lock: SchedulerLock = {
    sessionId,
    pid: process.pid,
    acquiredAt: Date.now(),
  }

  if (await tryCreateExclusive(lock, dir)) {
    lastBlockedBy = undefined
    registerLockCleanup(opts)
    logForDebugging(
      `[ScheduledTasks] acquired scheduler lock (PID ${process.pid})`,
    )
    return true
  }

  const existing = await readLock(dir)

  // Already ours (idempotent). After --resume the session ID is restored
  // but the process has a new PID — update the lock file so other sessions
  // see a live PID and don't steal it.
  if (existing?.sessionId === sessionId) {
    if (existing.pid !== process.pid) {
      await writeFile(getLockPath(dir), jsonStringify(lock))
      registerLockCleanup(opts)
    }
    return true
  }

  // Corrupt or unparseable — treat as stale.
  // Another live session — blocked.
  if (existing && isProcessRunning(existing.pid)) {
    if (lastBlockedBy !== existing.sessionId) {
      lastBlockedBy = existing.sessionId
      logForDebugging(
        `[ScheduledTasks] scheduler lock held by session ${existing.sessionId} (PID ${existing.pid})`,
      )
    }
    return false
  }

  // Stale — unlink and retry the exclusive create once.
  if (existing) {
    logForDebugging(
      `[ScheduledTasks] recovering stale scheduler lock from PID ${existing.pid}`,
    )
  }
  await unlink(getLockPath(dir)).catch(() => {})
  if (await tryCreateExclusive(lock, dir)) {
    lastBlockedBy = undefined
    registerLockCleanup(opts)
    return true
  }
  // Another session won the recovery race.
  return false
}

/**
 * Release the scheduler lock if the current session owns it.
 */
export async function releaseSchedulerLock(
  opts?: SchedulerLockOptions,
): Promise<void> {
  unregisterCleanup?.()
  unregisterCleanup = undefined
  lastBlockedBy = undefined

  const dir = opts?.dir
  const sessionId = opts?.lockIdentity ?? getSchedulerEnv().getOwnerKey()
  const existing = await readLock(dir)
  if (!existing || existing.sessionId !== sessionId) return
  try {
    await unlink(getLockPath(dir))
    logForDebugging('[ScheduledTasks] released scheduler lock')
  } catch {
    // Already gone.
  }
}
