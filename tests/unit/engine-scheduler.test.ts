/**
 * scheduler 域单测（E-7 S-7b，§8.47）：纯函数层（cron 解析 / 下次运行 /
 * human 渲染 / jitter / missed 检测 / aged 判定 / missed 通知 / jitter
 * config schema 回落 / PID 存活探针）。零磁盘 / 零网络 → unit 层。
 *
 * 真盘面（scheduled_tasks CRUD / lease lock / scheduler 生命周期）归
 * tests/func/scheduler-fs.test.ts。
 *
 * 探针锚点（§8.47 详案，突变须恰好 1 red）：
 *   P-T1 parseCronExpression dow-7=Sunday 别名支 → 'dow 7 = Sunday 别名'
 *   P-T2 computeNextCronRun DOM-DOW OR 支 → 'DOM+DOW 双约束 OR 语义'
 *   P-T3 lease lock PID 存活探针（stale 恢复）→ func 层
 */
import { describe, test, expect, afterEach } from 'bun:test'
import {
  parseCronExpression,
  computeNextCronRun,
  cronToHuman,
  nextCronRunMs,
  jitteredNextCronRunMs,
  oneShotJitteredNextCronRunMs,
  findMissedTasks,
  isRecurringTaskAged,
  buildMissedTaskNotification,
  DEFAULT_CRON_JITTER_CONFIG,
  getCronJitterConfig,
  setCronJitterConfigProvider,
  isProcessRunning,
  type CronTask,
} from '../../src/engine'

// ── parseCronExpression ─────────────────────────────────────────────────────
describe('parseCronExpression', () => {
  test('全通配 5 字段', () => {
    const f = parseCronExpression('* * * * *')
    expect(f).not.toBeNull()
    expect(f!.minute).toHaveLength(60)
    expect(f!.hour).toHaveLength(24)
    expect(f!.dayOfMonth).toHaveLength(31)
    expect(f!.month).toHaveLength(12)
    expect(f!.dayOfWeek).toHaveLength(7)
  })

  test('固定值 + list + range + step 组合', () => {
    const f = parseCronExpression('0,15 9-17/2 1,15 * 1-5')
    expect(f!.minute).toEqual([0, 15])
    expect(f!.hour).toEqual([9, 11, 13, 15, 17])
    expect(f!.dayOfMonth).toEqual([1, 15])
    expect(f!.month).toHaveLength(12)
    expect(f!.dayOfWeek).toEqual([1, 2, 3, 4, 5])
  })

  test('dow 7 = Sunday 别名（单值）→ [0]', () => {
    // P-T1 探针锚点
    expect(parseCronExpression('0 0 * * 7')!.dayOfWeek).toEqual([0])
  })

  test('dow range 含 7 → 7 归一 0（5-7 = Fri,Sat,Sun）', () => {
    expect(parseCronExpression('0 0 * * 5-7')!.dayOfWeek).toEqual([0, 5, 6])
  })

  test('step */N 展开', () => {
    expect(parseCronExpression('*/15 * * * *')!.minute).toEqual([0, 15, 30, 45])
  })

  test('6 字段 → null', () => {
    expect(parseCronExpression('* * * * * *')).toBeNull()
  })

  test('minute 超界（60）→ null', () => {
    expect(parseCronExpression('60 * * * *')).toBeNull()
  })

  test('非法语法（L 别名 / 空）→ null', () => {
    expect(parseCronExpression('L * * * *')).toBeNull()
    expect(parseCronExpression('* * * *')).toBeNull()
  })

  test('lo > hi range → null', () => {
    expect(parseCronExpression('0 18-9 * * *')).toBeNull()
  })
})

// ── computeNextCronRun ──────────────────────────────────────────────────────
describe('computeNextCronRun', () => {
  test('基本：每日 09:30，从 10:00 起 → 次日 09:30', () => {
    const f = parseCronExpression('30 9 * * *')!
    const from = new Date(2026, 0, 15, 10, 0, 0)
    const next = computeNextCronRun(f, from)!
    expect(next.getTime()).toBe(new Date(2026, 0, 16, 9, 30, 0).getTime())
  })

  test('DOM+DOW 双约束 OR 语义（dom 命中早于 dow）', () => {
    // P-T2 探针锚点：dom=4（周日）命中早于 dow=Monday，OR → 取 dom 日
    // 覆写 dom/dow 约束：minute=[0] hour=[10] dom=[4] dow=[1] month 全
    const fields = {
      minute: [0],
      hour: [10],
      dayOfMonth: [4],
      month: Array.from({ length: 12 }, (_, i) => i + 1),
      dayOfWeek: [1],
    }
    // 2026-01-01 = Thursday；dom=4（Jan 4）命中早于 Monday（Jan 5）
    const from = new Date(2026, 0, 1, 0, 0, 0)
    const next = computeNextCronRun(fields, from)!
    // dom=4 → Jan 4 10:00（早于 Jan 5 Monday）
    expect(next.getTime()).toBe(new Date(2026, 0, 4, 10, 0, 0).getTime())
  })

  test('仅 dom 约束（dow 通配）', () => {
    const fields = {
      minute: [0],
      hour: [0],
      dayOfMonth: [15],
      month: Array.from({ length: 12 }, (_, i) => i + 1),
      dayOfWeek: Array.from({ length: 7 }, (_, i) => i),
    }
    const from = new Date(2026, 0, 20, 12, 0, 0)
    const next = computeNextCronRun(fields, from)!
    expect(next.getTime()).toBe(new Date(2026, 1, 15, 0, 0, 0).getTime())
  })

  test('无匹配 366 天窗口 → null（永不 crons）', () => {
    // 2/30 不存在 → 366 天内无命中
    const fields = {
      minute: [0],
      hour: [0],
      dayOfMonth: [30],
      month: [2],
      dayOfWeek: Array.from({ length: 7 }, (_, i) => i),
    }
    const from = new Date(2026, 0, 1, 0, 0, 0)
    expect(computeNextCronRun(fields, from)).toBeNull()
  })
})

// ── cronToHuman ─────────────────────────────────────────────────────────────
describe('cronToHuman', () => {
  test('每 N 分钟（N=1 特判）', () => {
    expect(cronToHuman('*/1 * * * *')).toBe('Every minute')
    expect(cronToHuman('*/5 * * * *')).toBe('Every 5 minutes')
  })

  test('每小时（:00 特判 + 非 0 分）', () => {
    expect(cronToHuman('0 * * * *')).toBe('Every hour')
    expect(cronToHuman('15 * * * *')).toBe('Every hour at :15')
  })

  test('每 N 小时', () => {
    expect(cronToHuman('0 */2 * * *')).toBe('Every 2 hours')
    expect(cronToHuman('30 */4 * * *')).toBe('Every 4 hours at :30')
  })

  test('每日固定时刻（返回原始串之外的分支）', () => {
    // daily 分支带时刻格式化，依赖本地 TZ → 只断言 "Every day at" 前缀稳定部分
    expect(cronToHuman('30 9 * * *')).toContain('Every day at')
  })

  test('工作日 1-5', () => {
    expect(cronToHuman('0 9 * * 1-5')).toContain('Weekdays at')
  })

  test('非数字 minute/hour 回落原始串', () => {
    expect(cronToHuman('*/5 9 * * *')).toBe('*/5 9 * * *')
  })

  test('非 5 字段 → 原样返回', () => {
    expect(cronToHuman('bad')).toBe('bad')
  })
})

// ── jitter / missed / aged（纯计算）────────────────────────────────────────
describe('jitteredNextCronRunMs (recurring forward)', () => {
  const from = new Date(2026, 0, 1, 0, 0, 0).getTime()
  const hourly = '0 * * * *'

  test('frac=0（taskId 全 0）→ 无 jitter，等于 t1', () => {
    const t1 = nextCronRunMs(hourly, from)
    expect(jitteredNextCronRunMs(hourly, from, '00000000')).toBe(t1)
  })

  test('frac=0.5（taskId 0x80000000）→ t1 + 0.5*frac*interval', () => {
    const t1 = nextCronRunMs(hourly, from)
    // hourly interval = 3600000；jitter = 0.5 * 0.1 * 3600000 = 180000
    expect(jitteredNextCronRunMs(hourly, from, '80000000')).toBe(t1! + 180000)
  })

  test('recurringCapMs 封顶', () => {
    const t1 = nextCronRunMs(hourly, from)!
    // 覆写 cfg：recurringFrac=1，recurringCapMs=1000 → jitter = min(0.5*1*3600000, 1000)=1000
    const cfg = {
      ...DEFAULT_CRON_JITTER_CONFIG,
      recurringFrac: 1,
      recurringCapMs: 1000,
    }
    expect(jitteredNextCronRunMs(hourly, from, '80000000', cfg)).toBe(
      t1 + 1000,
    )
  })

  test('非法 cron → null', () => {
    expect(jitteredNextCronRunMs('bad', from, '00000000')).toBeNull()
  })
})

describe('oneShotJitteredNextCronRunMs (one-shot backward lead)', () => {
  const from = new Date(2026, 0, 1, 0, 0, 0).getTime()

  test('minute 不被 minuteMod 整除 → 无 jitter（等于 t1）', () => {
    // 15:15 → minute 15，15 % 30 = 15 ≠ 0 → 无 jitter
    const cron = '15 15 * * *'
    const t1 = nextCronRunMs(cron, from)
    expect(oneShotJitteredNextCronRunMs(cron, from, '80000000')).toBe(t1)
  })

  test('命中 :00（frac=0.5）→ t1 - 0.5*max', () => {
    // 15:00 → minute 0，0 % 30 === 0 → jitter。lead = 0 + 0.5*(90000-0) = 45000
    const cron = '0 15 * * *'
    const t1 = nextCronRunMs(cron, from)!
    expect(oneShotJitteredNextCronRunMs(cron, from, '80000000')).toBe(
      t1 - 45000,
    )
  })

  test('clamp 到 fromMs（创建于自身 lead 窗口内）', () => {
    const cron = '0 15 * * *'
    const t1 = nextCronRunMs(cron, from)!
    const fromInside = t1 - 1000 // 落在 lead 窗口内
    // lead=45000 → t1-45000 < fromInside → max(·, fromInside) = fromInside
    expect(oneShotJitteredNextCronRunMs(cron, fromInside, '80000000')).toBe(
      fromInside,
    )
  })
})

describe('findMissedTasks', () => {
  const now = new Date(2026, 0, 10, 12, 0, 0).getTime()
  const mk = (id: string, cron: string, createdAt: number, extra?: Partial<CronTask>): CronTask => ({
    id,
    cron,
    prompt: 'p',
    createdAt,
    ...extra,
  })

  test('next-from-createdAt 在过去 → missed', () => {
    // 每日 15:00，创建于 01-09 10:00 → next = 01-09 15:00 < now(01-10 12:00)
    const t = mk('a', '0 15 * * *', new Date(2026, 0, 9, 10, 0, 0).getTime())
    expect(findMissedTasks([t], now)).toHaveLength(1)
  })

  test('next-from-createdAt 在未来 → 非 missed', () => {
    const t = mk('b', '0 15 * * *', now - 60_000)
    // next = 今日 15:00 > now(12:00)
    expect(findMissedTasks([t], now)).toHaveLength(0)
  })

  test('非法 cron 任务不计入', () => {
    const t = mk('c', 'bad', now - 60_000)
    expect(findMissedTasks([t], now)).toHaveLength(0)
  })
})

describe('isRecurringTaskAged', () => {
  const t: CronTask = {
    id: 'r',
    cron: '0 * * * *',
    prompt: 'p',
    createdAt: 1_000_000,
    recurring: true,
  }

  test('maxAgeMs=0 → 永不 aged', () => {
    expect(isRecurringTaskAged(t, 999_999_999, 0)).toBe(false)
  })

  test('permanent → 永不 aged', () => {
    expect(
      isRecurringTaskAged({ ...t, permanent: true }, 999_999_999, 1_000),
    ).toBe(false)
  })

  test('recurring 且超龄 → aged', () => {
    expect(isRecurringTaskAged(t, 1_000_000 + 1_001, 1_000)).toBe(true)
  })

  test('one-shot（recurring falsy）→ 非 aged', () => {
    expect(isRecurringTaskAged({ ...t, recurring: false }, 999_999_999, 1_000)).toBe(
      false,
    )
  })
})

describe('buildMissedTaskNotification', () => {
  test('单任务 header + fence 包裹', () => {
    const out = buildMissedTaskNotification([
      { id: 'x', cron: '0 9 * * *', prompt: 'do the thing', createdAt: 1 },
    ])
    expect(out).toContain('task was missed')
    expect(out).toContain('do the thing')
    // fence 包裹（至少 ``` 三层）
    expect(out).toMatch(/```/)
  })

  test('prompt 含反引号串 → fence 加长（防提前闭合）', () => {
    const out = buildMissedTaskNotification([
      { id: 'y', cron: '0 9 * * *', prompt: 'a ``` b', createdAt: 1 },
    ])
    // prompt 含 ```（3 反引号）→ fence 应 ≥ 4
    expect(out).toMatch(/`{4,}/)
  })

  test('多任务 → 复数 header + 分段', () => {
    const out = buildMissedTaskNotification([
      { id: '1', cron: '0 9 * * *', prompt: 'one', createdAt: 1 },
      { id: '2', cron: '0 9 * * *', prompt: 'two', createdAt: 2 },
    ])
    expect(out).toContain('tasks were missed')
    expect(out).toContain('one')
    expect(out).toContain('two')
  })
})

describe('getCronJitterConfig (schema + 注入口)', () => {
  afterEach(() => {
    setCronJitterConfigProvider(() => DEFAULT_CRON_JITTER_CONFIG)
  })

  test('缺省 provider → DEFAULT（恒通过 schema）', () => {
    expect(getCronJitterConfig()).toEqual(DEFAULT_CRON_JITTER_CONFIG)
  })

  test('注入井构 provider → 取值', () => {
    setCronJitterConfigProvider(() => ({
      ...DEFAULT_CRON_JITTER_CONFIG,
      recurringFrac: 0.5,
    }))
    expect(getCronJitterConfig().recurringFrac).toBe(0.5)
  })

  test('注入越界 provider（recurringFrac=5 ∉ [0,1]）→ 整对象回落 DEFAULT', () => {
    setCronJitterConfigProvider(() => ({
      ...DEFAULT_CRON_JITTER_CONFIG,
      recurringFrac: 5,
    }))
    expect(getCronJitterConfig()).toEqual(DEFAULT_CRON_JITTER_CONFIG)
  })
})

describe('isProcessRunning', () => {
  test('pid<=1 → false', () => {
    expect(isProcessRunning(0)).toBe(false)
    expect(isProcessRunning(1)).toBe(false)
  })

  test('当前进程 pid → true', () => {
    expect(isProcessRunning(process.pid)).toBe(true)
  })
})
