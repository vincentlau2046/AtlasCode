/**
 * engine/tools/tasks S-D3 Task 四件套本体 func 真盘面（§8.56，任务工具
 * 本体子波 4）：call() 真盘支（createTask 落盘 / 钩子阻支回滚 /
 * P-D2 completed 钩子阻支 / deleted 早退 / 字段 diff 更新 / metadata
 * 合并 / owner 自动置位 / mailbox 通知 / blocks 级联 / TaskGet·TaskList
 * call 支）。
 *
 * 分层纪律：func 层真 fs（mkdtemp 真 tmpdir，ATLAS_CONFIG_DIR 指 tmp；
 * getAtlasConfigHomeDir 调用期读 env 无 memoize）/ 零网络 / 无 PTY。
 * 钩子执行器经注入面走假 shell 端口（setHookShellPort + setHookConfig
 * Provider + setHooksBootstrapEnv，unit hooks.test.ts 同形夹具）——
 * 零真钩子进程。
 *
 * 探针锚点（§8.56.5）：
 *   P-D2 TaskUpdate completed 钩子阻支 → success:false + error
 *   'TaskCompleted hook feedback:\n…'（格式化器 \n 拼接）+ 任务状态
 *   不迁移（单 expect 族；
 *   突变候选：阻支 return 丢失 / 状态先迁移后阻支 → 恰 1 断言红）
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  TaskCreateTool,
  TaskGetTool,
  TaskListTool,
  TaskUpdateTool,
  type TaskCreateOutput,
  type TaskGetOutput,
  type TaskListOutput,
  type TaskUpdateOutput,
} from '../../src/engine/tools'
import {
  getInboxPath,
  readMailbox,
  clearDynamicTeamContext,
  setDynamicTeamContext,
} from '../../src/engine/messaging'
import { getTask } from '../../src/engine/tasks'
import {
  setHooksBootstrapEnv,
  resetHooksBootstrapEnv,
  setHookConfigProvider,
  resetHookConfigProvider,
  setHookShellPort,
  resetHookShellPort,
  type HookShellPort,
  type HookShellExecution,
} from '../../src/hooks'
import type { HookEvent } from '../../src/hooks/hookEvents'
import type { HookMatcher } from '../../src/hooks/types'

const TMP = mkdtempSync(join(tmpdir(), 'atlas-tasktools-func-'))
const LIST_ID = 'sd3-func-list'
const PREV_CONFIG_DIR = process.env.ATLAS_CONFIG_DIR
const PREV_LIST_ID = process.env.ATLAS_TASK_LIST_ID

/** 假 shell 端口（unit hooks.test.ts FakeHookShell 同形，逐钩子出队）。 */
class FakeHookShell implements HookShellPort {
  calls: string[] = []
  private queue: HookShellExecution[] = []
  enqueue(exec: HookShellExecution): void {
    this.queue.push(exec)
  }
  async runCommand(
    command: string,
    _env: Record<string, string>,
    _signal: AbortSignal,
    _timeoutMs?: number,
  ): Promise<HookShellExecution> {
    this.calls.push(command)
    return this.queue.shift() ?? { stdout: '', stderr: '', code: 0 }
  }
}

/** 事件 → matcher 表注入（单事件单 matcher 命令钩子形态）。 */
function injectEventHooks(
  events: Partial<Record<HookEvent, string[]>>,
): void {
  setHookConfigProvider({
    getHookMatchersForEvent: (event: HookEvent): HookMatcher[] => {
      const cmds = events[event]
      if (!cmds || cmds.length === 0) return []
      return [
        {
          hooks: cmds.map(command => ({ type: 'command', command })),
        },
      ]
    },
  })
}

function blockStdout(reason: string): string {
  return JSON.stringify({ decision: 'block', reason })
}

beforeAll(() => {
  process.env.ATLAS_CONFIG_DIR = TMP
  process.env.ATLAS_TASK_LIST_ID = LIST_ID
  setHooksBootstrapEnv({
    getSessionId: () => 'sd3-func-sess',
    getCwd: () => TMP,
    getTranscriptPath: (id: string) => join(TMP, `${id}.jsonl`),
    getMainThreadAgentType: () => undefined,
    isNonInteractive: () => true,
    hasTrustAccepted: () => true,
  })
})

afterAll(() => {
  if (PREV_CONFIG_DIR === undefined) {
    delete process.env.ATLAS_CONFIG_DIR
  } else {
    process.env.ATLAS_CONFIG_DIR = PREV_CONFIG_DIR
  }
  if (PREV_LIST_ID === undefined) {
    delete process.env.ATLAS_TASK_LIST_ID
  } else {
    process.env.ATLAS_TASK_LIST_ID = PREV_LIST_ID
  }
  resetHooksBootstrapEnv()
  clearDynamicTeamContext()
  rmSync(TMP, { recursive: true, force: true })
})

beforeEach(() => {
  resetHookShellPort()
  resetHookConfigProvider()
  delete process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS
  clearDynamicTeamContext()
})

afterEach(() => {
  resetHookShellPort()
  resetHookConfigProvider()
  delete process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS
  clearDynamicTeamContext()
})

async function create(
  subject: string,
  over: Record<string, unknown> = {},
): Promise<string> {
  const res = await TaskCreateTool.call(
    {
      subject,
      description: `desc-${subject}`,
      ...over,
    },
    {},
  )
  return (res.data as TaskCreateOutput).task.id
}

describe('TaskCreate.call 真盘支', () => {
  test('落盘 + output 面 + mapResult 行', async () => {
    const id = await create('create-basic', { activeForm: 'Creating' })
    expect(id).toBe('1')
    const task = await getTask(LIST_ID, id)
    expect(task).toEqual({
      id: '1',
      subject: 'create-basic',
      description: 'desc-create-basic',
      activeForm: 'Creating',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })
    const out: TaskCreateOutput = { task: { id, subject: 'create-basic' } }
    expect(
      (TaskCreateTool.mapToolResultToToolResultBlockParam(out, 'tu1') as {
        content: string
      }).content,
    ).toBe('Task #1 created successfully: create-basic')
  })

  test('钩子阻支：TaskCreated block → 回滚 deleteTask + throw 逐字措辞', async () => {
    const port = new FakeHookShell()
    port.enqueue({ stdout: blockStdout('no-create'), stderr: '', code: 0 })
    setHookShellPort(port)
    injectEventHooks({ TaskCreated: ['echo guard'] })

    let threw: Error | undefined
    try {
      await TaskCreateTool.call(
        { subject: 'create-blocked', description: 'x' },
        {},
      )
    } catch (e) {
      threw = e as Error
    }
    // 格式化器逐字（S-D2 taskHooks delta ④）：'\n' 拼接非空格
    expect(threw?.message).toBe('TaskCreated hook feedback:\nno-create')
    // 回滚：任务文件已删
    const list = (await TaskListTool.call()).data as TaskListOutput
    expect(
      list.tasks.some(t => t.subject === 'create-blocked'),
    ).toBe(false)
    expect(port.calls).toEqual(['echo guard'])
  })
})

describe('TaskGet.call 真盘支', () => {
  test('命中 → 6 字段投影；未命中 → task null + mapResult not-found', async () => {
    const id = await create('get-target')
    const hit = (await TaskGetTool.call({ taskId: id })).data as TaskGetOutput
    expect(hit.task).toEqual({
      id,
      subject: 'get-target',
      description: 'desc-get-target',
      status: 'pending',
      blocks: [],
      blockedBy: [],
    })

    const miss = (await TaskGetTool.call({ taskId: '999' })).data as TaskGetOutput
    expect(miss.task).toBeNull()
    expect(
      (TaskGetTool.mapToolResultToToolResultBlockParam(miss, 'tu9') as {
        content: string
      }).content,
    ).toBe('Task not found')
  })
})

describe('TaskList.call 真盘支', () => {
  test('_internal 元数据过滤 + resolved 依赖过滤 + 行格式', async () => {
    const visId = await create('list-visible')
    await TaskUpdateTool.call(
      { taskId: visId, status: 'in_progress', metadata: { _internal: true } },
      {},
    )
    // 内部任务被过滤
    const list1 = (await TaskListTool.call()).data as TaskListOutput
    expect(
      list1.tasks.some(t => t.subject === 'list-visible'),
    ).toBe(false)

    // 依赖过滤：b blockedBy a（a completed）→ b.blockedBy 过滤空
    const a = await create('list-dep-a')
    const b = await create('list-dep-b')
    await TaskUpdateTool.call({ taskId: b, addBlockedBy: [a] }, {})
    await TaskUpdateTool.call({ taskId: a, status: 'completed' }, {})
    const list2 = (await TaskListTool.call()).data as TaskListOutput
    const bTask = list2.tasks.find(t => t.id === b)
    expect(bTask?.blockedBy).toEqual([])
    // 行格式（mapResult 同源）
    const content = (
      TaskListTool.mapToolResultToToolResultBlockParam(
        { tasks: [bTask as TaskListOutput['tasks'][number]] },
        'tuL',
      ) as { content: string }
    ).content
    expect(content).toBe(`#${b} [pending] list-dep-b`)
  })
})

describe('TaskUpdate.call 真盘支', () => {
  test('未命中 → success:false + error 逐字', async () => {
    const res = await TaskUpdateTool.call(
      { taskId: '404', status: 'in_progress' },
      {},
    )
    expect(res.data).toEqual({
      success: false,
      taskId: '404',
      updatedFields: [],
      error: 'Task not found',
    })
  })

  test('字段 diff 更新（未变字段不进 updatedFields）+ metadata 合并（null 删 key）', async () => {
    const id = await create('upd-fields', { metadata: { keep: 1, drop: 2 } })
    const res = await TaskUpdateTool.call(
      {
        taskId: id,
        subject: 'upd-fields', // 未变 → 不进
        description: 'new-desc',
        activeForm: 'Updating',
        metadata: { drop: null, add: 'x' },
      },
      {},
    )
    expect((res.data as TaskUpdateOutput).updatedFields.sort()).toEqual([
      'activeForm',
      'description',
      'metadata',
    ])
    const task = await getTask(LIST_ID, id)
    expect(task?.description).toBe('new-desc')
    expect(task?.activeForm).toBe('Updating')
    expect(task?.metadata).toEqual({ keep: 1, add: 'x' })
    expect(task?.subject).toBe('upd-fields')
  })

  test('status deleted 早退：文件删 + updatedFields [deleted] + statusChange', async () => {
    const id = await create('upd-delete')
    const res = await TaskUpdateTool.call(
      { taskId: id, status: 'deleted' },
      {},
    )
    const out = res.data as TaskUpdateOutput
    expect(out).toEqual({
      success: true,
      taskId: id,
      updatedFields: ['deleted'],
      statusChange: { from: 'pending', to: 'deleted' },
    })
    expect(await getTask(LIST_ID, id)).toBeNull()
  })

  test('常规状态迁移：statusChange from/to + mapResult 行', async () => {
    const id = await create('upd-status')
    const res = await TaskUpdateTool.call(
      { taskId: id, status: 'in_progress' },
      {},
    )
    expect(res.data).toEqual({
      success: true,
      taskId: id,
      updatedFields: ['status'],
      statusChange: { from: 'pending', to: 'in_progress' },
    })
    const out: TaskUpdateOutput = {
      success: true,
      taskId: id,
      updatedFields: ['status'],
      statusChange: { from: 'pending', to: 'in_progress' },
    }
    expect(
      (TaskUpdateTool.mapToolResultToToolResultBlockParam(out, 'tuS') as {
        content: string
      }).content,
    ).toBe(`Updated task #${id} status`)
  })

  test('P-D2 探针：completed 钩子阻支 → success:false + 状态不迁移', async () => {
    const id = await create('upd-blocked-completed')
    await TaskUpdateTool.call({ taskId: id, status: 'in_progress' }, {})

    const port = new FakeHookShell()
    port.enqueue({ stdout: blockStdout('verify first'), stderr: '', code: 0 })
    setHookShellPort(port)
    injectEventHooks({ TaskCompleted: ['echo verify'] })

    const res = await TaskUpdateTool.call(
      { taskId: id, status: 'completed' },
      {},
    )
    expect(res.data).toEqual({
      success: false,
      taskId: id,
      updatedFields: [],
      error: 'TaskCompleted hook feedback:\nverify first',
    })
    // 状态未迁移（阻支早退，updateTask 未执行）
    expect((await getTask(LIST_ID, id))?.status).toBe('in_progress')
    expect(port.calls).toEqual(['echo verify'])
  })

  test('completed 无钩子配置 → 正常迁移', async () => {
    const id = await create('upd-completed-plain')
    const res = await TaskUpdateTool.call(
      { taskId: id, status: 'completed' },
      {},
    )
    expect((res.data as TaskUpdateOutput).success).toBe(true)
    expect((await getTask(LIST_ID, id))?.status).toBe('completed')
  })

  test('teammate 自动置位 owner（in_progress + 无 owner + 动态队友上下文）', async () => {
    process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS = '1'
    setDynamicTeamContext({
      agentId: 'a-alice',
      agentName: 'alice',
      teamName: 'sd3-team',
      planModeRequired: false,
    })
    const id = await create('upd-auto-owner')
    const res = await TaskUpdateTool.call(
      { taskId: id, status: 'in_progress' },
      {},
    )
    const out = res.data as TaskUpdateOutput
    expect(out.updatedFields).toContain('owner')
    expect((await getTask(LIST_ID, id))?.owner).toBe('alice')
  })

  test('owner 变更 → mailbox 通知（task_assignment 消息落 inbox 文件）', async () => {
    process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS = '1'
    const id = await create('upd-mailbox')
    const res = await TaskUpdateTool.call(
      { taskId: id, owner: 'bob' },
      {},
    )
    expect((res.data as TaskUpdateOutput).updatedFields).toContain('owner')
    const inbox = await readMailbox('bob', LIST_ID)
    const assignment = inbox.find(
      m => m.text.includes('"type":"task_assignment"'),
    )
    expect(assignment).toBeDefined()
    const payload = JSON.parse(assignment?.text ?? '{}') as {
      taskId: string
      assignedBy: string
      type: string
    }
    expect(payload.taskId).toBe(id)
    expect(payload.assignedBy).toBe('team-lead') // 主会话 getAgentName undefined
    expect(payload.type).toBe('task_assignment')
    expect(readFileSync(getInboxPath('bob', LIST_ID), 'utf8')).toContain(
      'task_assignment',
    )
  })

  test('addBlocks/addBlockedBy 级联（blockTask 双向写）', async () => {
    const a = await create('upd-blk-a')
    const b = await create('upd-blk-b')
    const c = await create('upd-blk-c')
    const res = await TaskUpdateTool.call(
      { taskId: a, addBlocks: [b], addBlockedBy: [c] },
      {},
    )
    const out = res.data as TaskUpdateOutput
    expect(out.updatedFields.sort()).toEqual(['blockedBy', 'blocks'])
    expect((await getTask(LIST_ID, a))?.blocks).toEqual([b])
    expect((await getTask(LIST_ID, b))?.blockedBy).toEqual([a])
    expect((await getTask(LIST_ID, a))?.blockedBy).toEqual([c])
    expect((await getTask(LIST_ID, c))?.blocks).toEqual([a])
  })
})
