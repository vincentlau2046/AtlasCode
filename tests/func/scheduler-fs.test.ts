/**
 * scheduler 域 func 真盘测试（E-7 S-7b，§8.47）：scheduled_tasks CRUD 真盘
 * 往返 + lease lock（fresh / 幂等 / 活锁阻塞 / stale 恢复 / release 守卫）
 * + scheduler 生命周期（初载 surface missed + recurring 排程）。
 *
 * 分层纪律：func 层真 fs（mkdtemp / 真读写 / 真 lock 文件），setSchedulerEnv
 * 注入真 tmpdir 替 getProjectRoot（§8.14 注入序；func 层用真 tmpdir）。
 *
 * 探针锚点（§8.47 详案）：P-T3 lease lock PID 存活探针 stale 恢复支 →
 * 'stale 锁（dead pid=1）→ 恢复 true + 重写活 pid'。
 */
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from 'bun:test'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  readCronTasks,
  writeCronTasks,
  addCronTask,
  removeCronTasks,
  markCronTasksFired,
  hasCronTasksSync,
  listAllCronTasks,
  getCronFilePath,
  tryAcquireSchedulerLock,
  releaseSchedulerLock,
  createCronScheduler,
  setSchedulerEnv,
  DEFAULT_CRON_JITTER_CONFIG,
  type CronTask,
} from '../../src/engine'

const OWNER = 'test-owner'
let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'atlas-scheduler-func-'))
  setSchedulerEnv({ getProjectRoot: () => tmp, getOwnerKey: () => OWNER })
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

const lockPath = () => join(tmp, '.atlas', 'scheduled_tasks.lock')

async function until(
  cond: () => boolean | Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now()
  for (;;) {
    if (await cond()) return
    if (Date.now() - start > timeoutMs) throw new Error('until() timeout')
    await new Promise(r => setTimeout(r, 20))
  }
}

// ── cronTasks CRUD（真盘往返）──────────────────────────────────────────────
describe('cronTasks CRUD（真盘）', () => {
  test('writeCronTasks + readCronTasks 往返（durable 剥离）', async () => {
    await writeCronTasks([
      { id: 'a', cron: '0 9 * * *', prompt: 'hi', createdAt: 123, recurring: true },
    ])
    const read = await readCronTasks()
    expect(read).toHaveLength(1)
    expect(read[0]!.id).toBe('a')
    expect(read[0]!.recurring).toBe(true)
    expect(read[0]!.durable).toBeUndefined()
  })

  test('writeCronTasks 剥离 durable 字段（落盘形状无 durable 键）', async () => {
    await writeCronTasks([
      { id: 'x', cron: '0 9 * * *', prompt: 'p', createdAt: 1, durable: false },
    ])
    const raw = readFileSync(getCronFilePath(), 'utf8')
    expect(raw).not.toContain('"durable"')
  })

  test('readCronTasks 空目录 → []（ENOENT 容忍）', async () => {
    expect(await readCronTasks()).toEqual([])
  })

  test('addCronTask durable:true → 落盘 + 8-hex id', async () => {
    const id = await addCronTask('0 9 * * *', 'p', true, true)
    expect(id).toMatch(/^[0-9a-f]{8}$/)
    const read = await readCronTasks()
    expect(read).toHaveLength(1)
    expect(read[0]!.id).toBe(id)
  })

  test('addCronTask durable:false → 抛前向接缝错（session-only 整砍）', async () => {
    await expect(
      addCronTask('0 9 * * *', 'p', false, false),
    ).rejects.toThrow('forward seam')
  })

  test('removeCronTasks 删命中 + 无命中 no-op', async () => {
    await writeCronTasks([
      { id: 'a', cron: '0 9 * * *', prompt: 'p', createdAt: 1 },
      { id: 'b', cron: '0 9 * * *', prompt: 'p', createdAt: 2 },
    ])
    await removeCronTasks(['a'])
    expect((await readCronTasks()).map(t => t.id)).toEqual(['b'])
    await removeCronTasks(['zzz'])
    expect((await readCronTasks()).map(t => t.id)).toEqual(['b'])
  })

  test('markCronTasksFired 批量落 lastFiredAt', async () => {
    await writeCronTasks([
      { id: 'r', cron: '0 * * * *', prompt: 'p', createdAt: 1, recurring: true },
    ])
    await markCronTasksFired(['r'], 999_999)
    expect((await readCronTasks())[0]!.lastFiredAt).toBe(999_999)
  })

  test('hasCronTasksSync 无文件/有任务/空数组', async () => {
    expect(hasCronTasksSync()).toBe(false)
    await writeCronTasks([{ id: 'a', cron: '0 9 * * *', prompt: 'p', createdAt: 1 }])
    expect(hasCronTasksSync()).toBe(true)
    await writeCronTasks([])
    expect(hasCronTasksSync()).toBe(false)
  })

  test('listAllCronTasks 仅 file-backed（session 合并整砍）', async () => {
    await writeCronTasks([{ id: 'a', cron: '0 9 * * *', prompt: 'p', createdAt: 1 }])
    expect(await listAllCronTasks()).toHaveLength(1)
  })
})

// ── scheduler lease lock（真盘）────────────────────────────────────────────
describe('scheduler lease lock（真盘）', () => {
  test('fresh acquire → true + 锁文件写 owner+活 pid', async () => {
    expect(await tryAcquireSchedulerLock()).toBe(true)
    expect(existsSync(lockPath())).toBe(true)
    const body = JSON.parse(readFileSync(lockPath(), 'utf8')) as {
      sessionId: string
      pid: number
    }
    expect(body.sessionId).toBe(OWNER)
    expect(body.pid).toBe(process.pid)
    await releaseSchedulerLock()
    expect(existsSync(lockPath())).toBe(false)
  })

  test('幂等再 acquire（同 owner）→ true', async () => {
    expect(await tryAcquireSchedulerLock()).toBe(true)
    expect(await tryAcquireSchedulerLock()).toBe(true)
    await releaseSchedulerLock()
  })

  test('异 owner 活锁 → 阻塞 false', async () => {
    mkdirSync(join(tmp, '.atlas'), { recursive: true })
    writeFileSync(
      lockPath(),
      JSON.stringify({ sessionId: 'other', pid: process.pid, acquiredAt: Date.now() }),
    )
    expect(await tryAcquireSchedulerLock()).toBe(false)
  })

  test('stale 锁（dead pid=1）→ 恢复 true + 重写活 pid（P-T3 探针锚点）', async () => {
    mkdirSync(join(tmp, '.atlas'), { recursive: true })
    writeFileSync(
      lockPath(),
      JSON.stringify({ sessionId: 'dead-owner', pid: 1, acquiredAt: Date.now() }),
    )
    expect(await tryAcquireSchedulerLock()).toBe(true)
    const body = JSON.parse(readFileSync(lockPath(), 'utf8')) as {
      sessionId: string
      pid: number
    }
    expect(body.pid).toBe(process.pid)
    expect(body.sessionId).toBe(OWNER)
    await releaseSchedulerLock()
  })

  test('releaseSchedulerLock 非 owner → no-op（锁文件保留）', async () => {
    mkdirSync(join(tmp, '.atlas'), { recursive: true })
    writeFileSync(
      lockPath(),
      JSON.stringify({ sessionId: 'someone-else', pid: process.pid, acquiredAt: Date.now() }),
    )
    await releaseSchedulerLock()
    expect(existsSync(lockPath())).toBe(true)
  })
})

// ── scheduler 生命周期（真盘 + lock + load）────────────────────────────────
describe('scheduler 生命周期（真盘）', () => {
  test('getNextFireTime 初态（无任务）→ null', () => {
    const sched = createCronScheduler({
      onFire: () => {},
      isLoading: () => false,
      dir: tmp,
    })
    expect(sched.getNextFireTime()).toBeNull()
    sched.stop()
  })

  test('初载 surface missed one-shot（onMissed）+ 删除', async () => {
    const now = Date.now()
    // 每分钟 cron + createdAt 2h 前 → next-from-createdAt（2h 前那一分钟）
    // 恒在过去 → 可靠 missed（与当前时刻无关，避免每日固定时刻的"永不 missed"陷阱）
    await writeCronTasks([
      {
        id: 'missed1',
        cron: '* * * * *',
        prompt: 'late task',
        createdAt: now - 2 * 3_600_000,
      },
    ])
    let missed: CronTask[] | null = null
    const sched = createCronScheduler({
      onFire: () => {},
      isLoading: () => false,
      onMissed: ts => {
        missed = ts
      },
      dir: tmp,
    })
    sched.start()
    await until(() => missed !== null, 3000)
    expect(Array.isArray(missed)).toBe(true)
    expect(missed!.some(t => t.id === 'missed1')).toBe(true)
    // removeCronTasks 异步删除 → 轮询文件清空
    await until(async () => (await readCronTasks(tmp)).length === 0, 3000)
    expect((await readCronTasks(tmp)).length).toBe(0)
    sched.stop()
  })

  test('recurring 任务 → getNextFireTime 返回未来时刻', async () => {
    await writeCronTasks([
      {
        id: 'rec1',
        cron: '0 * * * *',
        prompt: 'hourly',
        createdAt: Date.now(),
        recurring: true,
      },
    ])
    const sched = createCronScheduler({
      onFire: () => {},
      isLoading: () => false,
      dir: tmp,
      // 零 jitter → 排程确定性（next 整点）
      getJitterConfig: () => ({ ...DEFAULT_CRON_JITTER_CONFIG, recurringFrac: 0 }),
    })
    sched.start()
    await until(() => sched.getNextFireTime() !== null, 3000)
    expect(sched.getNextFireTime()!).toBeGreaterThan(Date.now())
    sched.stop()
  })

  test('轮询 reload：运行中新增 overdue recurring 任务 → tick 内 fire（chokidar 替代锚点）', async () => {
    await writeCronTasks([])
    let fired: string | null = null
    const sched = createCronScheduler({
      onFire: () => {},
      onFireTask: t => {
        fired = t.id
      },
      isLoading: () => false,
      dir: tmp,
      // 零 jitter → overdue 任务（createdAt 2h 前）首 sight 即 due → 立即 fire
      getJitterConfig: () => ({ ...DEFAULT_CRON_JITTER_CONFIG, recurringFrac: 0 }),
    })
    sched.start()
    // 运行中写入 overdue recurring 任务（createdAt 2h 前 → next-from-createdAt
    // 恒过去 → 首 sight due）。无论被初载还是 per-owner-tick 文件轮询拾取，
    // 皆证"免重启即排程"（旧仓 chokidar watch-reload 的替代面，见模块头注）。
    await writeCronTasks([
      {
        id: 'late',
        cron: '* * * * *',
        prompt: 'p',
        createdAt: Date.now() - 2 * 3_600_000,
        recurring: true,
      },
    ])
    await until(() => fired === 'late', 3000)
    expect(fired).toBe('late')
    sched.stop()
  })
})
