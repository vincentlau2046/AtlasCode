/**
 * tasks 存储层 func 真盘测试（§8.56 S-D2）：engine/tasks 任务列表 disk
 * JSON 存储域的真 fs 断言（CRUD / high watermark / 锁竞争 / claim 判别支 /
 * 团队文件读面）。
 *
 * 分层纪律：func 层真 fs（mkdtemp 真 tmpdir，ATLAS_CONFIG_DIR 指 tmp；
 * getAtlasConfigHomeDir 调用期读 env 无 memoize）/ 零网络 / 无 PTY。
 *
 * 探针锚点（§8.56.5）：
 *   P-D1 存储 id 递增（high watermark 防删后/重置后复用）→ 单 expect 恰 1 红
 *   （突变候选：findHighestTaskId 丢 mark 支 / deleteTask 丢 mark 写支 →
 *   下一 id 回落 '1'/'2'，恰 1 断言红）
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
} from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createTask,
  getTask,
  updateTask,
  deleteTask,
  listTasks,
  blockTask,
  claimTask,
  resetTaskList,
  getAgentStatuses,
  unassignTeammateTasks,
  getTaskPath,
  type Task,
} from '../../src/engine/tasks'

const TMP = mkdtempSync(join(tmpdir(), 'atlas-taskstore-func-'))
const PREV_CONFIG_DIR = process.env.ATLAS_CONFIG_DIR

beforeAll(() => {
  process.env.ATLAS_CONFIG_DIR = TMP
})

afterAll(() => {
  if (PREV_CONFIG_DIR === undefined) {
    delete process.env.ATLAS_CONFIG_DIR
  } else {
    process.env.ATLAS_CONFIG_DIR = PREV_CONFIG_DIR
  }
  rmSync(TMP, { recursive: true, force: true })
})

/** createTask 入参完整形（Task 必填字段，可选字段按需覆写）。 */
function baseTask(
  over: Partial<Omit<Task, 'id'>> = {},
): Omit<Task, 'id'> {
  return {
    subject: 'subj',
    description: 'desc',
    status: 'pending',
    blocks: [],
    blockedBy: [],
    ...over,
  }
}

describe('CRUD 核心面（真盘）', () => {
  test('createTask id 递增 + getTask 全字段 round-trip', async () => {
    const a = await createTask(
      'crud',
      baseTask({ subject: 'first', activeForm: 'Doing', metadata: { k: 1 } }),
    )
    const b = await createTask('crud', baseTask({ owner: 'agent-1' }))
    expect(a).toBe('1')
    expect(b).toBe('2')
    const t1 = await getTask('crud', '1')
    expect(t1).toEqual({
      id: '1',
      subject: 'first',
      description: 'desc',
      activeForm: 'Doing',
      status: 'pending',
      blocks: [],
      blockedBy: [],
      metadata: { k: 1 },
    })
    expect((await getTask('crud', '2'))?.owner).toBe('agent-1')
  })

  test('缺失态：getTask null / updateTask null / deleteTask false / listTasks []', async () => {
    expect(await getTask('nope', '1')).toBeNull()
    expect(await updateTask('nope', '1', { status: 'in_progress' })).toBeNull()
    expect(await deleteTask('nope', '1')).toBe(false)
    expect(await listTasks('nope')).toEqual([])
  })

  test('updateTask 持久化（未触字段保留）', async () => {
    const id = await createTask('upd', baseTask())
    const u = await updateTask('upd', id, {
      status: 'in_progress',
      owner: 'a1',
      subject: 'new',
    })
    expect(u?.status).toBe('in_progress')
    const re = await getTask('upd', id)
    expect(re?.owner).toBe('a1')
    expect(re?.subject).toBe('new')
    expect(re?.description).toBe('desc')
  })

  test('deleteTask 级联清理 blocks/blockedBy', async () => {
    const a = await createTask('casc', baseTask())
    const b = await createTask('casc', baseTask())
    expect(await blockTask('casc', a, b)).toBe(true)
    expect((await getTask('casc', a))?.blocks).toEqual([b])
    expect((await getTask('casc', b))?.blockedBy).toEqual([a])
    expect(await deleteTask('casc', a)).toBe(true)
    expect((await getTask('casc', b))?.blockedBy).toEqual([])
  })

  test('blockTask 缺失 → false / 幂等不重复', async () => {
    expect(await blockTask('blk', '99', '1')).toBe(false)
    const a = await createTask('blk', baseTask())
    const b = await createTask('blk', baseTask())
    await blockTask('blk', a, b)
    await blockTask('blk', a, b)
    expect((await getTask('blk', a))?.blocks).toEqual([b])
  })

  test('resetTaskList 清空任务文件', async () => {
    await createTask('rst', baseTask())
    await createTask('rst', baseTask())
    await resetTaskList('rst')
    expect(await listTasks('rst')).toEqual([])
    expect(existsSync(getTaskPath('rst', '1'))).toBe(false)
  })
})

describe('P-D1 探针：存储 id 递增', () => {
  test('P-D1 存储 id 递增：high watermark 防删后/重置后复用', async () => {
    await createTask('pd1', baseTask()) // 1
    await createTask('pd1', baseTask()) // 2
    expect(await deleteTask('pd1', '2')).toBe(true) // 写 high watermark = 2
    await resetTaskList('pd1') // 清任务文件，保留 high watermark
    const next = await createTask('pd1', baseTask())
    // 突变 findHighestTaskId 丢 mark 支 / deleteTask 丢 mark 写支 → '1'/'2'
    expect(next).toBe('3')
  })
})

describe('锁竞争', () => {
  test('10 路并发 createTask → 10 唯一 id（proper-lockfile 串行化）', async () => {
    const ids = await Promise.all(
      Array.from({ length: 10 }, () => createTask('conc', baseTask())),
    )
    expect(new Set(ids).size).toBe(10)
    const nums = ids.map((s) => parseInt(s, 10)).sort((x, y) => x - y)
    expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})

describe('claimTask 判别支', () => {
  test('task_not_found', async () => {
    const r = await claimTask('claim', '99', 'agent-1')
    expect(r).toEqual({ success: false, reason: 'task_not_found' })
  })

  test('success → already_claimed → already_resolved 三态链', async () => {
    const t = await createTask('claim', baseTask())
    const ok = await claimTask('claim', t, 'agent-1')
    expect(ok.success).toBe(true)
    expect(ok.task?.owner).toBe('agent-1')
    const other = await claimTask('claim', t, 'agent-2')
    expect(other).toMatchObject({ success: false, reason: 'already_claimed' })
    expect(await updateTask('claim', t, { status: 'completed' })).not.toBeNull()
    const done = await claimTask('claim', t, 'agent-1')
    expect(done).toMatchObject({ success: false, reason: 'already_resolved' })
  })

  test('blocked（未决 blockedBy）→ 依赖完成后放行', async () => {
    const dep = await createTask('claim-b', baseTask())
    const t = await createTask('claim-b', baseTask({ blockedBy: [dep] }))
    const r = await claimTask('claim-b', t, 'agent-1')
    expect(r).toMatchObject({
      success: false,
      reason: 'blocked',
      blockedByTasks: [dep],
    })
    await updateTask('claim-b', dep, { status: 'completed' })
    const ok = await claimTask('claim-b', t, 'agent-1')
    expect(ok.success).toBe(true)
  })

  test('checkAgentBusy：agent_busy vs 空闲放行', async () => {
    const t1 = await createTask('claim-busy', baseTask())
    const t2 = await createTask('claim-busy', baseTask())
    await claimTask('claim-busy', t1, 'agent-9') // agent-9 持未决任务
    const busy = await claimTask('claim-busy', t2, 'agent-9', {
      checkAgentBusy: true,
    })
    expect(busy).toMatchObject({
      success: false,
      reason: 'agent_busy',
      busyWithTasks: [t1],
    })
    const idle = await claimTask('claim-busy', t2, 'agent-fresh', {
      checkAgentBusy: true,
    })
    expect(idle.success).toBe(true)
  })
})

describe('团队文件读面（shell·swarm 波 TeamCreate 落盘消费面）', () => {
  const teamDir = join(TMP, 'teams', 'team-x')

  beforeAll(() => {
    mkdirSync(teamDir, { recursive: true })
    writeFileSync(
      join(teamDir, 'config.json'),
      JSON.stringify({
        leadAgentId: 'lead-1',
        members: [
          { agentId: 'lead-1', name: 'lead' },
          { agentId: 'a1', name: 'alice' },
          { agentId: 'a2', name: 'bob' },
        ],
      }),
    )
  })

  test('getAgentStatuses idle/busy 判别', async () => {
    const t = await createTask('team-x', baseTask({ owner: 'alice' }))
    const statuses = await getAgentStatuses('team-x')
    expect(statuses).not.toBeNull()
    const alice = statuses?.find((s) => s.name === 'alice')
    const bob = statuses?.find((s) => s.name === 'bob')
    expect(alice).toMatchObject({ status: 'busy', currentTasks: [t] })
    expect(bob).toMatchObject({ status: 'idle', currentTasks: [] })
  })

  test('getAgentStatuses 团队不存在 → null', async () => {
    expect(await getAgentStatuses('no-such-team')).toBeNull()
  })

  test('unassignTeammateTasks 释放 owner + pending + 通知措辞', async () => {
    const t = await createTask('team-x', baseTask({ owner: 'bob' }))
    await updateTask('team-x', t, { status: 'in_progress' })
    const r = await unassignTeammateTasks('team-x', 'a2', 'bob', 'terminated')
    expect(r.unassignedTasks).toEqual([{ id: t, subject: 'subj' }])
    expect(r.notificationMessage).toContain('bob was terminated')
    expect(r.notificationMessage).toContain(`#${t} "subj"`)
    const re = await getTask('team-x', t)
    expect(re?.owner).toBeUndefined()
    expect(re?.status).toBe('pending')
  })
})
