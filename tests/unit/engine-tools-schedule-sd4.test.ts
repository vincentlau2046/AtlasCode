/**
 * engine/tools S-D4 cron 三件套 + TaskStop + TodoWrite 本体 unit 面
 * （§8.56 任务工具本体子波 4；49 口径 11-15/49）。
 *
 * unit 层（零磁盘——同 S-D3 对象面纪律：纯对象面 + prompt 面 + mapResult
 * 纯函数面 + isEnabled 门 + checkPermissions allow 固化面 +
 * toAutoClassifierInput 逐字面 + validateInput 纯支，无 fixture 无写）：
 *  - cron 三件套对象面（新仓 shared Tool 契约 = 纯对象，非 buildTool；
 *    S-B5/S-D3 先例）：name（toolNames 单一事实源）/ JSON schema 字段面
 *    （delta ① 逐字段）/ TOOL_DEFAULTS 成员逐值 / checkPermissions
 *    allow 固化 / description() = 旧 prompt() 体（长 prompt 含
 *    DEFAULT_MAX_AGE_DAYS 面）/ mapResult 逐字行。
 *  - CronCreate validateInput 纯支（P-D3 探针锚点前 2 支）：非法 cron
 *    （parseCronExpression null 支，突变去校验 → 恰 1 红）/ 年内无
 *    历日匹配（Feb 31）。MAX_JOBS 支 + teammate durable 互斥支 +
 *    durable:false 接缝 + call 真盘 = func 面（sd4-fs）。
 *  - TaskStop validateInput 3 支守卫 + call StopTaskError 传播支
 *    （P-D5 探针锚点；stopTask 三态本体 = S-7a 已探，本探针 = 工具面）。
 *  - TodoWrite 反向门控接线（= !isTodoV2Enabled()，注册表 ⑯ 槽）+
 *    call todoKey 解析（agentId 位 / getSessionId 回落位）+ allDone 清空
 *    支 + setAppState todos 面（duck store，零磁盘）。
 *
 * 深度 import（门面归集，本文件经 tools 门面 = 双门面回归面）：
 *  ../../src/engine/tools（cron 三件套 + TaskStop + TodoWrite + schema 5）
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  CronCreateTool,
  CronDeleteTool,
  CronListTool,
  TaskStopTool,
  TodoWriteTool,
  CRON_CREATE_TOOL_INPUT_SCHEMA,
  CRON_DELETE_TOOL_INPUT_SCHEMA,
  CRON_LIST_TOOL_INPUT_SCHEMA,
  TASK_STOP_TOOL_INPUT_SCHEMA,
  TODO_WRITE_TOOL_INPUT_SCHEMA,
  isCronEnabled,
  isDurableCronEnabled,
  DEFAULT_MAX_AGE_DAYS,
  type CronCreateOutput,
  type CronDeleteOutput,
  type CronListOutput,
  type TaskStopOutput,
  type TodoWriteOutput,
} from '../../src/engine/tools'
import {
  CRON_CREATE_TOOL_NAME,
  CRON_DELETE_TOOL_NAME,
  CRON_LIST_TOOL_NAME,
  TASK_STOP_TOOL_NAME,
  TODO_WRITE_TOOL_NAME,
} from '../../src/engine/tools/toolNames'
import { StopTaskError } from '../../src/engine/coordinator/tasks'
import {
  createTaskStateBase,
  setDiskOutputEnv,
  resetDiskOutputEnv,
  type TaskStateBase,
} from '../../src/task'
import { getSessionId, setIsInteractive } from '../../src/bootstrap/state'
import { isTodoV2Enabled } from '../../src/engine/tasks'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// 零磁盘：setDiskOutputEnv 注入 tmpdir 仅满足 createTaskStateBase →
// getTaskOutputPath 的 fail-fast 路径计算（无 I/O；S-7a 同族纪律）。
let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'atlas-tools-sd4-unit-'))
  setDiskOutputEnv({
    getProjectTempDir: () => join(tmp, 'atlas'),
    getSessionId: () => 'sd4-unit',
  })
})
afterEach(() => {
  delete process.env.ATLAS_DISABLE_CRON
  delete process.env.ATLAS_ENABLE_TASKS
  setIsInteractive(true)
  resetDiskOutputEnv()
  rmSync(tmp, { recursive: true, force: true })
})

// ── CronCreateTool 对象面 ─────────────────────────────────────────────────

describe('CronCreateTool 对象面', () => {
  test('name/常量 + JSON schema 4 字段面（delta ① 逐字段）', () => {
    expect(CronCreateTool.name).toBe(CRON_CREATE_TOOL_NAME)
    expect(CRON_CREATE_TOOL_NAME).toBe('CronCreate')
    expect(CRON_CREATE_TOOL_INPUT_SCHEMA.type).toBe('object')
    const props = CRON_CREATE_TOOL_INPUT_SCHEMA.properties as Record<
      string,
      { type: string; description?: string }
    >
    expect(Object.keys(props).sort()).toEqual([
      'cron',
      'durable',
      'prompt',
      'recurring',
    ])
    expect(props.cron.type).toBe('string')
    expect(props.recurring.type).toBe('boolean')
    expect(props.durable.type).toBe('boolean')
    expect(props.recurring.description).toContain(
      String(DEFAULT_MAX_AGE_DAYS),
    )
    expect(CRON_CREATE_TOOL_INPUT_SCHEMA.required).toEqual(['cron', 'prompt'])
  })

  test('TOOL_DEFAULTS 成员逐值（delta ④）+ checkPermissions allow 固化 + isEnabled 门', () => {
    expect(CronCreateTool.maxResultSizeChars).toBe(100_000)
    expect(CronCreateTool.shouldDefer).toBe(true)
    expect(CronCreateTool.isConcurrencySafe({})).toBe(false)
    expect(CronCreateTool.isReadOnly({})).toBe(false)
    expect(CronCreateTool.isDestructive?.({})).toBe(false)
    expect(CronCreateTool.userFacingName({})).toBe('')
    expect(
      CronCreateTool.toAutoClassifierInput({ cron: '*/5 * * * *', prompt: 'p' }),
    ).toBe('*/5 * * * *: p')
    expect(CronCreateTool.renderToolUseMessage({}, { verbose: false })).toBeNull()
    // 注册表 ② AGENT_TRIGGERS 槽自门控（kill-switch env）
    expect(isCronEnabled()).toBe(true)
    expect(CronCreateTool.isEnabled()).toBe(true)
    process.env.ATLAS_DISABLE_CRON = '1'
    expect(isCronEnabled()).toBe(false)
    expect(CronCreateTool.isEnabled()).toBe(false)
    delete process.env.ATLAS_DISABLE_CRON
    // isDurableCronEnabled 常量真（GB 支裁，delta ③）
    expect(isDurableCronEnabled()).toBe(true)
    return expect(
      CronCreateTool.checkPermissions({ a: 1 }, {}),
    ).resolves.toEqual({ behavior: 'allow', updatedInput: { a: 1 } })
  })

  test('description() = 旧 prompt() 体（长 prompt 面，delta ③）', async () => {
    const d = await CronCreateTool.description(
      {},
      { isNonInteractiveSession: false, toolPermissionContext: {}, tools: [] },
    )
    expect(d).toContain('standard 5-field cron')
    expect(d).toContain(String(DEFAULT_MAX_AGE_DAYS))
    expect(d).toContain('Avoid the :00 and :30 minute marks')
  })

  test('validateInput 非法 cron 支（P-D3 探针锚点，突变去校验 → 恰 1 红）', async () => {
    const r = await CronCreateTool.validateInput(
      { cron: 'not a cron', prompt: 'x' },
      {},
    )
    expect(r).toEqual({
      result: false,
      message:
        "Invalid cron expression 'not a cron'. Expected 5 fields: M H DoM Mon DoW.",
      errorCode: 1,
    })
  })

  test('validateInput 年内无历日匹配支（Feb 31）', async () => {
    const r = await CronCreateTool.validateInput(
      { cron: '0 0 31 2 *', prompt: 'x' },
      {},
    )
    expect(r).toEqual({
      result: false,
      message:
        "Cron expression '0 0 31 2 *' does not match any calendar date in the next year.",
      errorCode: 2,
    })
  })

  test('mapResult 3 行逐字（recurring 双 where + one-shot）', () => {
    const recDurable: CronCreateOutput = {
      id: 'ab12cd34',
      humanSchedule: 'daily at 9:00 AM',
      recurring: true,
      durable: true,
    }
    const r1 = CronCreateTool.mapToolResultToToolResultBlockParam(
      recDurable,
      'tu1',
    )
    expect(r1.content).toBe(
      `Scheduled recurring job ab12cd34 (daily at 9:00 AM). Persisted to .atlas/scheduled_tasks.json. Auto-expires after ${DEFAULT_MAX_AGE_DAYS} days. Use CronDelete to cancel sooner.`,
    )
    const recSession: CronCreateOutput = {
      id: 'ab12cd34',
      humanSchedule: 'daily at 9:00 AM',
      recurring: true,
    }
    const r2 = CronCreateTool.mapToolResultToToolResultBlockParam(
      recSession,
      'tu1',
    )
    expect(r2.content).toBe(
      `Scheduled recurring job ab12cd34 (daily at 9:00 AM). Session-only (not written to disk, dies when Claude exits). Auto-expires after ${DEFAULT_MAX_AGE_DAYS} days. Use CronDelete to cancel sooner.`,
    )
    const oneShot: CronCreateOutput = {
      id: 'ef56ab78',
      humanSchedule: 'Feb 28 at 2:30 PM',
      recurring: false,
      durable: false,
    }
    const r3 = CronCreateTool.mapToolResultToToolResultBlockParam(
      oneShot,
      'tu1',
    )
    expect(r3.content).toBe(
      'Scheduled one-shot task ef56ab78 (Feb 28 at 2:30 PM). Session-only (not written to disk, dies when Claude exits). It will fire once then auto-delete.',
    )
    expect(r1.tool_use_id).toBe('tu1')
    expect(r1.type).toBe('tool_result')
  })
})

// ── CronDeleteTool 对象面 ─────────────────────────────────────────────────

describe('CronDeleteTool 对象面', () => {
  test('name/常量 + schema 1 字段面 + TOOL_DEFAULTS 逐值', () => {
    expect(CronDeleteTool.name).toBe(CRON_DELETE_TOOL_NAME)
    expect(CRON_DELETE_TOOL_NAME).toBe('CronDelete')
    expect(CRON_DELETE_TOOL_INPUT_SCHEMA.required).toEqual(['id'])
    expect(CronDeleteTool.maxResultSizeChars).toBe(100_000)
    expect(CronDeleteTool.isConcurrencySafe({})).toBe(false)
    expect(CronDeleteTool.isReadOnly({})).toBe(false)
    expect(CronDeleteTool.toAutoClassifierInput({ id: 'j1' })).toBe('j1')
    expect(CronDeleteTool.userFacingName({})).toBe('')
    expect(CronDeleteTool.isEnabled()).toBe(true)
  })

  test('mapResult 单行逐字', () => {
    const out: CronDeleteOutput = { id: 'j9' }
    const r = CronDeleteTool.mapToolResultToToolResultBlockParam(out, 'tu2')
    expect(r.content).toBe('Cancelled job j9.')
  })

  test('description() = 旧 prompt() 体（长 prompt 面）', async () => {
    const d = await CronDeleteTool.description(
      {},
      { isNonInteractiveSession: false, toolPermissionContext: {}, tools: [] },
    )
    // durable 缺省真（isDurableCronEnabled 常量）→ 双存储位文案
    expect(d).toContain('Cancel a cron job')
    expect(d).toContain(CRON_CREATE_TOOL_NAME)
    expect(d).toContain('.atlas/scheduled_tasks.json')
  })
})

// ── CronListTool 对象面 ───────────────────────────────────────────────────

describe('CronListTool 对象面', () => {
  test('name/常量 + 空 schema + 只读标志面', () => {
    expect(CronListTool.name).toBe(CRON_LIST_TOOL_NAME)
    expect(CRON_LIST_TOOL_NAME).toBe('CronList')
    expect(CRON_LIST_TOOL_INPUT_SCHEMA).toEqual({ type: 'object' })
    expect(CronListTool.isConcurrencySafe({})).toBe(true)
    expect(CronListTool.isReadOnly({})).toBe(true)
    expect(CronListTool.isDestructive?.({})).toBe(false)
    expect(CronListTool.toAutoClassifierInput({})).toBe('')
    expect(CronListTool.userFacingName({})).toBe('')
    expect(CronListTool.isEnabled()).toBe(true)
  })

  test('mapResult 空集行 + 行格式（recurring/one-shot/session-only 投影）', () => {
    const empty: CronListOutput = { jobs: [] }
    const r0 = CronListTool.mapToolResultToToolResultBlockParam(empty, 'tu3')
    expect(r0.content).toBe('No scheduled jobs.')

    const jobs: CronListOutput = {
      jobs: [
        {
          id: 'j1',
          cron: '0 9 * * *',
          humanSchedule: 'daily at 9:00 AM',
          prompt: 'run tests',
          recurring: true,
        },
        {
          id: 'j2',
          cron: '30 14 28 2 *',
          humanSchedule: 'Feb 28 at 2:30 PM',
          prompt: 'remind me',
          durable: false,
        },
      ],
    }
    const r1 = CronListTool.mapToolResultToToolResultBlockParam(jobs, 'tu3')
    expect(r1.content).toBe(
      'j1 — daily at 9:00 AM (recurring): run tests\nj2 — Feb 28 at 2:30 PM (one-shot) [session-only]: remind me',
    )
  })
})

// ── TaskStopTool 对象面 + 守卫支（P-D5 探针锚点）──────────────────────────

describe('TaskStopTool 对象面', () => {
  test('name/常量 + aliases KillShell + schema 2 可选字段面', () => {
    expect(TaskStopTool.name).toBe(TASK_STOP_TOOL_NAME)
    expect(TASK_STOP_TOOL_NAME).toBe('TaskStop')
    expect(TaskStopTool.aliases).toEqual(['KillShell'])
    expect(TASK_STOP_TOOL_INPUT_SCHEMA.required).toBeUndefined()
    const props = TASK_STOP_TOOL_INPUT_SCHEMA.properties as Record<string, { type: string }>
    expect(Object.keys(props).sort()).toEqual(['shell_id', 'task_id'])
  })

  test('TOOL_DEFAULTS 成员逐值（delta ③）+ checkPermissions allow 固化', () => {
    expect(TaskStopTool.maxResultSizeChars).toBe(100_000)
    expect(TaskStopTool.shouldDefer).toBe(true)
    expect(TaskStopTool.isConcurrencySafe({})).toBe(true)
    expect(TaskStopTool.isReadOnly({})).toBe(false)
    expect(TaskStopTool.isDestructive?.({})).toBe(false)
    expect(TaskStopTool.userFacingName({})).toBe('Stop Task')
    expect(TaskStopTool.isEnabled()).toBe(true) // 无条件注册长尾
    expect(
      TaskStopTool.toAutoClassifierInput({ task_id: 'b1', shell_id: 's1' }),
    ).toBe('b1')
    expect(TaskStopTool.toAutoClassifierInput({ shell_id: 's1' })).toBe('s1')
    expect(TaskStopTool.toAutoClassifierInput({})).toBe('')
    return expect(
      TaskStopTool.checkPermissions({ a: 1 }, {}),
    ).resolves.toEqual({ behavior: 'allow', updatedInput: { a: 1 } })
  })

  test('validateInput 3 支守卫（缺 id / 未找到 / 非 running）', async () => {
    const running: TaskStateBase = createTaskStateBase('b1', 'local_bash', 'cmd')
    running.status = 'running'
    const done: TaskStateBase = createTaskStateBase('b2', 'local_bash', 'cmd')
    done.status = 'completed'
    const store = { tasks: { b1: running, b2: done } }
    const ctx = { getAppState: () => store, setAppState: () => {} }

    const r0 = await TaskStopTool.validateInput({}, ctx)
    expect(r0).toEqual({
      result: false,
      message: 'Missing required parameter: task_id',
      errorCode: 1,
    })

    const r1 = await TaskStopTool.validateInput({ task_id: 'nope' }, ctx)
    expect(r1).toEqual({
      result: false,
      message: 'No task found with ID: nope',
      errorCode: 1,
    })

    const r2 = await TaskStopTool.validateInput({ task_id: 'b2' }, ctx)
    expect(r2).toEqual({
      result: false,
      message: 'Task b2 is not running (status: completed)',
      errorCode: 3,
    })

    const r3 = await TaskStopTool.validateInput({ task_id: 'b1' }, ctx)
    expect(r3).toEqual({ result: true })
    // KillShell 兼容位：shell_id 回读
    const r4 = await TaskStopTool.validateInput({ shell_id: 'b1' }, ctx)
    expect(r4).toEqual({ result: true })
  })

  test('call 缺 id throw + StopTaskError 传播支（P-D5 探针锚点）', async () => {
    const ctx = { getAppState: () => ({ tasks: {} }), setAppState: () => {} }
    await expect(
      TaskStopTool.call({ shell_id: undefined }, ctx),
    ).rejects.toThrow('Missing required parameter: task_id')

    // not_found 支（stopTask 三态本体 S-7a 已探，本探针 = 工具面传播）
    let code: string | undefined
    try {
      await TaskStopTool.call({ task_id: 'nope' }, ctx)
    } catch (e) {
      expect(e).toBeInstanceOf(StopTaskError)
      code = (e as StopTaskError).code
    }
    expect(code).toBe('not_found')

    // unsupported_type 支（未注册任务态）
    const remote = createTaskStateBase('r1', 'remote_agent', 'remote desc')
    remote.status = 'running'
    const ctx2 = {
      getAppState: () => ({ tasks: { r1: remote } }),
      setAppState: () => {},
    }
    try {
      await TaskStopTool.call({ task_id: 'r1' }, ctx2)
      throw new Error('expected StopTaskError')
    } catch (e) {
      expect(e).toBeInstanceOf(StopTaskError)
      expect((e as StopTaskError).code).toBe('unsupported_type')
    }
  })

  test('mapResult = 整体 JSON 行逐字', () => {
    const out: TaskStopOutput = {
      message: 'Successfully stopped task: b1 (long-running)',
      task_id: 'b1',
      task_type: 'bash',
      command: 'long-running',
    }
    const r = TaskStopTool.mapToolResultToToolResultBlockParam(out, 'tu4')
    expect(r.content).toBe(JSON.stringify(out))
  })
})

// ── TodoWriteTool 对象面 + 反向门控 + call 面 ─────────────────────────────

describe('TodoWriteTool 对象面', () => {
  test('name/常量 + schema todos 数组面（minLength 1 承载位，delta ①）', () => {
    expect(TodoWriteTool.name).toBe(TODO_WRITE_TOOL_NAME)
    expect(TODO_WRITE_TOOL_NAME).toBe('TodoWrite')
    expect(TODO_WRITE_TOOL_INPUT_SCHEMA.required).toEqual(['todos'])
    const props = TODO_WRITE_TOOL_INPUT_SCHEMA.properties as Record<
      string,
      { type: string; items: Record<string, unknown> }
    >
    expect(props.todos.type).toBe('array')
    expect(props.todos.description).toBe('The updated todo list')
    const items = props.todos.items as {
      properties: Record<string, { type: string; minLength?: number }>
      required?: string[]
    }
    expect(Object.keys(items.properties).sort()).toEqual([
      'activeForm',
      'content',
      'status',
    ])
    expect(items.properties.content.minLength).toBe(1)
    expect(items.properties.activeForm.minLength).toBe(1)
    expect(items.required).toEqual(['content', 'status', 'activeForm'])
  })

  test('TOOL_DEFAULTS 成员逐值（delta ③）+ strict 位 + checkPermissions allow 固化', () => {
    expect(TodoWriteTool.maxResultSizeChars).toBe(100_000)
    expect(TodoWriteTool.shouldDefer).toBe(true)
    expect(TodoWriteTool.strict).toBe(true)
    expect(TodoWriteTool.isConcurrencySafe({})).toBe(false)
    expect(TodoWriteTool.isReadOnly({})).toBe(false)
    expect(TodoWriteTool.isDestructive?.({})).toBe(false)
    expect(TodoWriteTool.userFacingName({})).toBe('')
    expect(
      TodoWriteTool.toAutoClassifierInput({
        todos: [1, 2, 3] as unknown as never,
      }),
    ).toBe('3 items')
    return expect(
      TodoWriteTool.checkPermissions({ a: 1 }, {}),
    ).resolves.toEqual({ behavior: 'allow', updatedInput: { a: 1 } })
  })

  test('反向门控接线（= !isTodoV2Enabled()，注册表 ⑯ 槽 materialize）', () => {
    // 交互缺省 = v2 开（!非交互）→ v1 不可见
    setIsInteractive(true)
    delete process.env.ATLAS_ENABLE_TASKS
    expect(isTodoV2Enabled()).toBe(true)
    expect(TodoWriteTool.isEnabled()).toBe(false)
    // 非交互缺省 = v2 关 → v1 可见
    setIsInteractive(false)
    expect(isTodoV2Enabled()).toBe(false)
    expect(TodoWriteTool.isEnabled()).toBe(true)
    // 非交互 + ATLAS_ENABLE_TASKS 强制 = v2 开 → v1 不可见
    process.env.ATLAS_ENABLE_TASKS = '1'
    expect(isTodoV2Enabled()).toBe(true)
    expect(TodoWriteTool.isEnabled()).toBe(false)
  })

  test('description() = 旧 prompt() 体（长 prompt 面）+ 短 DESCRIPTION 导出不接线', async () => {
    const d = await TodoWriteTool.description(
      {},
      { isNonInteractiveSession: false, toolPermissionContext: {}, tools: [] },
    )
    expect(d).toContain('## When to Use This Tool')
    expect(d).toContain('in_progress')
  })
})

// ── TodoWriteTool call 面（duck store，零磁盘）────────────────────────────

describe('TodoWriteTool call 面', () => {
  function makeTodoStore(initialTodos: Record<string, unknown> = {}) {
    let state = { todos: initialTodos }
    return {
      getState: () => state,
      ctx: {
        getAppState: () => state,
        setAppState: (f: (p: typeof state) => typeof state) => {
          state = f(state)
        },
      },
    }
  }

  test('非全完成：passthrough + setAppState todos 面（agentId 位）', async () => {
    const seed = [
      { content: 'a', status: 'completed', activeForm: 'A' },
      { content: 'b', status: 'pending', activeForm: 'B' },
    ]
    const store = makeTodoStore({ 'agent-1': seed })
    const todos = [
      { content: 'a', status: 'completed', activeForm: 'A' },
      { content: 'b', status: 'in_progress', activeForm: 'B' },
    ]
    const res = await TodoWriteTool.call(
      { todos } as unknown as Parameters<typeof TodoWriteTool.call>[0],
      { ...store.ctx, agentId: 'agent-1' },
    )
    const data = res.data as TodoWriteOutput
    expect(data.oldTodos).toEqual(seed)
    expect(data.newTodos).toEqual(todos)
    expect(store.getState().todos['agent-1']).toEqual(todos)
  })

  test('allDone 清空支（newTodos []）', async () => {
    const store = makeTodoStore()
    const todos = [
      { content: 'a', status: 'completed', activeForm: 'A' },
      { content: 'b', status: 'completed', activeForm: 'B' },
    ]
    const res = await TodoWriteTool.call(
      { todos } as unknown as Parameters<typeof TodoWriteTool.call>[0],
      { ...store.ctx, agentId: 'agent-1' },
    )
    expect((res.data as TodoWriteOutput).newTodos).toEqual(todos) // 返回值 = 输入
    expect(store.getState().todos['agent-1']).toEqual([]) // 存储面 = 清空
  })

  test('无 agentId 回落位（getSessionId() 键位）', async () => {
    const store = makeTodoStore()
    const todos = [{ content: 'x', status: 'pending', activeForm: 'X' }]
    await TodoWriteTool.call(
      { todos } as unknown as Parameters<typeof TodoWriteTool.call>[0],
      store.ctx,
    )
    const key = getSessionId()
    expect(store.getState().todos[key]).toEqual(todos)
  })

  test('mapResult base 行逐字（nudge 行裁，delta ⑦）', () => {
    const r = TodoWriteTool.mapToolResultToToolResultBlockParam(
      { oldTodos: [], newTodos: [] },
      'tu5',
    )
    expect(r.content).toBe(
      'Todos have been modified successfully. Ensure that you continue to use the todo list to track your progress. Please proceed with the current tasks if applicable',
    )
  })
})
