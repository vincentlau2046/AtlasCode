/**
 * engine/tools S-D4 cron 三件套本体 func 真盘面（§8.56 任务工具本体
 * 子波 4；49 口径 11-13/49，注册表 ② AGENT_TRIGGERS 槽 materialize）。
 *
 * func 层（真 fs——setSchedulerEnv 注入真 tmpdir 替 getProjectRoot，同
 * scheduler-fs 分层纪律）：
 *  - CronCreateTool.call durable:true 真盘落位（addCronTask → .atlas/
 *    scheduled_tasks.json 经 scheduler 域门面真写）+ output 面
 *    （id/humanSchedule/recurring/durable 透传面）。
 *  - durable:false 前向接缝 probe（addCronTask 抛域锁定接缝错，H6 不造假
 *    登记 = cronCreateTool delta ⑧）：缺省 durable 缺省值 false 的调用
 *    浮现该错误（域行为锁定）。
 *  - CronCreate validateInput 成功支 + MAX_JOBS 支（ec 3）+ teammate
 *    durable 互斥支（ec 4，P-D3 探针锚点全 4 支 = unit 前 2 支 + 本文件
 *    后 2 支）。
 *  - CronDeleteTool validateInput not-found 支（ec 1）/ teammate 归属支
 *    （ec 2，跨 agent 拒删）/ call 真盘删除。
 *  - CronListTool.call 真盘列面 + teammate 过滤支 + 空集行。
 *
 * 深度 import（门面归集）：../../src/engine/tools（cron 三件套）+
 * ../../src/engine（scheduler 域门面 setSchedulerEnv/addCronTask/
 * listAllCronTasks）+ ../../src/engine/messaging（teammate 上下文）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  CronCreateTool,
  CronDeleteTool,
  CronListTool,
  type CronListOutput,
} from '../../src/engine/tools'
import {
  addCronTask,
  listAllCronTasks,
  setSchedulerEnv,
} from '../../src/engine'
import {
  createTeammateContext,
  runWithTeammateContext,
} from '../../src/engine/messaging'

const OWNER = 'sd4-owner'
const VALID_CRON = '0 9 * * *'
let tmp: string

function teammateCtx(agentId: string) {
  return createTeammateContext({
    agentId,
    agentName: `${agentId}-name`,
    teamName: 'sd4-team',
    planModeRequired: false,
    parentSessionId: 'sd4-parent',
    abortController: new AbortController(),
  })
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'atlas-tools-sd4-'))
  setSchedulerEnv({ getProjectRoot: () => tmp, getOwnerKey: () => OWNER })
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

// ── CronCreateTool call 真盘面 ────────────────────────────────────────────

describe('CronCreateTool call（真盘）', () => {
  test('durable:true 落盘 + output 透传面', async () => {
    const res = await CronCreateTool.call({
      cron: VALID_CRON,
      prompt: 'hello',
      durable: true,
    })
    const data = res.data
    expect(typeof data.id).toBe('string')
    expect(data.id.length).toBeGreaterThan(0)
    expect(typeof data.humanSchedule).toBe('string')
    expect(data.humanSchedule.length).toBeGreaterThan(0)
    expect(data.recurring).toBe(true) // 缺省 recurring 位
    expect(data.durable).toBe(true)
    const tasks = await listAllCronTasks()
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.prompt).toBe('hello')
  })

  test('one-shot 位（recurring:false 显式）+ 真盘持久（读归一化 = 缺省位）', async () => {
    const res = await CronCreateTool.call({
      cron: '30 14 28 2 *',
      prompt: 'once',
      recurring: false,
      durable: true,
    })
    expect(res.data.recurring).toBe(false)
    const tasks = await listAllCronTasks()
    expect(tasks).toHaveLength(1)
    // 域锁定（S-7b cronTasks 读归一化）：recurring 仅 true 持久化，
    // one-shot = 字段缺省位（回读 undefined 非 false）
    expect(tasks[0]!.recurring).toBeUndefined()
  })

  test('durable:false 前向接缝 probe（缺省 durable 缺省值 false，域行为锁定）', async () => {
    await expect(
      CronCreateTool.call({ cron: VALID_CRON, prompt: 'x' }),
    ).rejects.toThrow(/forward seam/)
  })
})

// ── CronCreateTool validateInput 后 2 支（P-D3 探针锚点）──────────────────

describe('CronCreateTool validateInput（真盘面）', () => {
  test('成功支（合法 cron + 盘未满 + 无 teammate）', async () => {
    const r = await CronCreateTool.validateInput(
      { cron: VALID_CRON, prompt: 'x' },
      {},
    )
    expect(r).toEqual({ result: true })
  })

  test('MAX_JOBS 支（50 任务满 → ec 3，突变去限 → 恰 1 红）', async () => {
    for (let i = 0; i < 50; i++) {
      await addCronTask(VALID_CRON, `job ${i}`, true, true)
    }
    const r = await CronCreateTool.validateInput(
      { cron: VALID_CRON, prompt: 'x' },
      {},
    )
    expect(r).toEqual({
      result: false,
      message: 'Too many scheduled jobs (max 50). Cancel one first.',
      errorCode: 3,
    })
  })

  test('teammate durable 互斥支（ec 4）', async () => {
    await runWithTeammateContext(teammateCtx('t1'), async () => {
      const r = await CronCreateTool.validateInput(
        { cron: VALID_CRON, prompt: 'x', durable: true },
        {},
      )
      expect(r).toEqual({
        result: false,
        message:
          'durable crons are not supported for teammates (teammates do not persist across sessions)',
        errorCode: 4,
      })
    })
  })
})

// ── CronDeleteTool（真盘面）──────────────────────────────────────────────

describe('CronDeleteTool（真盘）', () => {
  test('validateInput not-found 支（ec 1）', async () => {
    const r = await CronDeleteTool.validateInput({ id: 'nope' }, {})
    expect(r).toEqual({
      result: false,
      message: "No scheduled job with id 'nope'",
      errorCode: 1,
    })
  })

  test('teammate 归属支（文件面 agentId 缺省 → teammate 一律 ec 2 / leader 放行）', async () => {
    const id = await addCronTask(
      VALID_CRON,
      'owned',
      true,
      true,
      'owner-a',
    )

    // 域锁定（S-7b cronTasks：addCronTask 第 5 参 _agentId 在 durable 面
    // 无消费者，session 路由 = 前向接缝）：文件任务回读 agentId 缺省 →
    // 任何 teammate ctx（task.agentId undefined !== ctx.agentId）一律
    // ec 2 拒删；本 agent 位（'owner-a'）同拒 = 文件面行为锁定
    await runWithTeammateContext(teammateCtx('t1'), async () => {
      const r = await CronDeleteTool.validateInput({ id }, {})
      expect(r).toEqual({
        result: false,
        message: `Cannot delete cron job '${id}': owned by another agent`,
        errorCode: 2,
      })
    })
    await runWithTeammateContext(teammateCtx('owner-a'), async () => {
      const r = await CronDeleteTool.validateInput({ id }, {})
      expect(r).toEqual({
        result: false,
        message: `Cannot delete cron job '${id}': owned by another agent`,
        errorCode: 2,
      })
    })
    // team lead（无 ctx）放行
    const r = await CronDeleteTool.validateInput({ id }, {})
    expect(r).toEqual({ result: true })

    // call 真盘删除
    const res = await CronDeleteTool.call({ id })
    expect(res.data).toEqual({ id })
    expect(await listAllCronTasks()).toHaveLength(0)
  })
})

// ── CronListTool.call（真盘面）───────────────────────────────────────────

describe('CronListTool.call（真盘）', () => {
  test('leader 列全部 + teammate 过滤支', async () => {
    await addCronTask(VALID_CRON, 'a-recurring', true, true, 'owner-a')
    await addCronTask('30 14 28 2 *', 'a-once', false, true, 'owner-a')
    await addCronTask(VALID_CRON, 'b-recurring', true, true, 'owner-b')

    // team lead（无 ctx）= 全量
    const all = (await CronListTool.call()).data as CronListOutput
    expect(all.jobs).toHaveLength(3)
    expect(all.jobs.map(j => j.prompt).sort()).toEqual([
      'a-once',
      'a-recurring',
      'b-recurring',
    ])
    const once = all.jobs.find(j => j.prompt === 'a-once')!
    // 域锁定（S-7b 读归一化 + CronList jobs 投影双缺省位）：one-shot
    // recurring 回读/投影均缺省（undefined 非 false）
    expect(once.recurring).toBeUndefined()
    // durable 剥离面：durable:true 任务回读无 durable 字段（非 false 位不投影）
    expect(once.durable).toBeUndefined()

    // teammate = 仅本 agent（域锁定：文件面任务 agentId 缺省，任何
    // teammate 过滤后 0 条；session 路由 = 前向接缝）
    await runWithTeammateContext(teammateCtx('owner-a'), async () => {
      const none = (await CronListTool.call()).data as CronListOutput
      expect(none.jobs).toHaveLength(0)
    })
    await runWithTeammateContext(teammateCtx('owner-x'), async () => {
      const none = (await CronListTool.call()).data as CronListOutput
      expect(none.jobs).toHaveLength(0)
    })
  })

  test('空集行 mapResult 面（真盘无任务）', async () => {
    const res = await CronListTool.call()
    const block = CronListTool.mapToolResultToToolResultBlockParam(
      res.data,
      'tu-list',
    )
    expect(block.content).toBe('No scheduled jobs.')
  })
})
