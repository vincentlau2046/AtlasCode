/**
 * engine/tools/tasks S-D3 Task 四件套本体 unit 面（§8.56，任务工具本体
 * 子波 4；49 口径 7-10/49）。
 *
 * unit 层（零磁盘——同 S-C4 core-face 纪律：纯对象面 + prompt 面 +
 * mapResult 纯函数面 + isEnabled 门 + checkPermissions allow 固化面 +
 * toAutoClassifierInput 逐字面，无 fixture 无写）：
 *  - Task 四件套对象面（新仓 shared Tool 契约 = 纯对象，非 buildTool；
 *    S-B5 BashTool 先例）：name（toolNames 单一事实源）/ JSON schema
 *    字段面（delta ① 逐字段转写）/ maxResultSizeChars 100_000 /
 *    shouldDefer true / TOOL_DEFAULTS 成员逐值（delta ③④）/
 *    userFacingName / toAutoClassifierInput（TaskList '' 缺省逐值固化）/
 *    checkPermissions = 旧 buildTool 默认 { behavior:'allow',
 *    updatedInput } 显式固化（delta ④⑤）/ renderToolUseMessage null。
 *  - isEnabled 门 = isTodoV2Enabled 判别支（交互 true / 非交互+env false /
 *    非交互+ATLAS_ENABLE_TASKS true）——注册表 ⑯ isTodoV2 槽自门控面。
 *  - prompt 面 = 旧 prompt() 体（delta ②③）：TaskCreate/TaskList
 *    isAgentSwarmsEnabled 双支判别 + TaskGet/TaskUpdate 静态面。
 *  - mapToolResult 纯函数支：TaskCreate 成功行 / TaskGet 缺失+全字段+
 *    blocks/blockedBy 4 支 / TaskList 空集+行格式 / TaskUpdate 失败+
 *    成功 + completed 队友提醒支（dynamicTeamContext 判别）。
 *
 * 真盘 call 支（createTask 落盘 / 钩子阻支 P-D2 / 回滚 / mailbox /
 * deleted 早退）= tests/func/engine-tools-tasks-sd3-fs.test.ts。
 *
 * 深度 import（门面归集，本文件经 tools 门面 = 双门面回归面）：
 *  ../../src/engine/tools（Task 四件套 + JSON schema 4 + prompt 面）
 */
import {
  describe,
  test,
  expect,
  afterEach,
} from 'bun:test'
import {
  TaskCreateTool,
  TaskGetTool,
  TaskListTool,
  TaskUpdateTool,
  TASK_CREATE_TOOL_INPUT_SCHEMA,
  TASK_GET_TOOL_INPUT_SCHEMA,
  TASK_LIST_TOOL_INPUT_SCHEMA,
  TASK_UPDATE_TOOL_INPUT_SCHEMA,
  getTaskCreatePrompt,
  getTaskListPrompt,
  TASK_GET_PROMPT,
  TASK_UPDATE_PROMPT,
  type TaskCreateOutput,
  type TaskGetOutput,
  type TaskListOutput,
  type TaskUpdateOutput,
} from '../../src/engine/tools'
import {
  TASK_CREATE_TOOL_NAME,
  TASK_GET_TOOL_NAME,
  TASK_LIST_TOOL_NAME,
  TASK_UPDATE_TOOL_NAME,
} from '../../src/engine/tools/toolNames'
import { setIsInteractive } from '../../src/bootstrap/state'
import {
  clearDynamicTeamContext,
  setDynamicTeamContext,
} from '../../src/engine/messaging'

afterEach(() => {
  delete process.env.ATLAS_ENABLE_TASKS
  delete process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS
  setIsInteractive(true)
  clearDynamicTeamContext()
})

/** 动态队友上下文（getAgentId/getAgentName 判别支用）。 */
function setDynamicCtx() {
  setDynamicTeamContext({
    agentId: 'agent-1',
    agentName: 'alice',
    teamName: 'unit-team',
    planModeRequired: false,
  })
}

describe('TaskCreateTool 对象面', () => {
  test('name/常量 + JSON schema 4 字段面（delta ① 逐字段）', () => {
    expect(TaskCreateTool.name).toBe(TASK_CREATE_TOOL_NAME)
    expect(TASK_CREATE_TOOL_NAME).toBe('TaskCreate')
    expect(TASK_CREATE_TOOL_INPUT_SCHEMA.type).toBe('object')
    const props = TASK_CREATE_TOOL_INPUT_SCHEMA.properties as Record<
      string,
      { type: string; description: string }
    >
    expect(Object.keys(props).sort()).toEqual([
      'activeForm',
      'description',
      'metadata',
      'subject',
    ])
    expect(props.subject.type).toBe('string')
    expect(props.metadata.additionalProperties).toBe(true)
    expect(TASK_CREATE_TOOL_INPUT_SCHEMA.required).toEqual([
      'subject',
      'description',
    ])
  })

  test('TOOL_DEFAULTS 成员逐值（delta ③④）+ checkPermissions allow 固化', () => {
    expect(TaskCreateTool.maxResultSizeChars).toBe(100_000)
    expect(TaskCreateTool.shouldDefer).toBe(true)
    expect(TaskCreateTool.isConcurrencySafe({})).toBe(true)
    expect(TaskCreateTool.isReadOnly({})).toBe(false)
    expect(TaskCreateTool.isDestructive?.({})).toBe(false)
    expect(TaskCreateTool.userFacingName({})).toBe('TaskCreate')
    expect(TaskCreateTool.toAutoClassifierInput({ subject: 's' })).toBe('s')
    expect(TaskCreateTool.renderToolUseMessage({}, { verbose: false })).toBeNull()
    expect(TaskCreateTool.isEnabled()).toBe(true) // 交互缺省
    return expect(
      TaskCreateTool.checkPermissions({ a: 1 }, {}),
    ).resolves.toEqual({ behavior: 'allow', updatedInput: { a: 1 } })
  })

  test('mapResult 成功行逐字', () => {
    const out: TaskCreateOutput = { task: { id: '1', subject: 'subj' } }
    const r = TaskCreateTool.mapToolResultToToolResultBlockParam(
      out,
      'tu1',
    ) as { type: string; tool_use_id: string; content: string }
    expect(r.type).toBe('tool_result')
    expect(r.tool_use_id).toBe('tu1')
    expect(r.content).toBe('Task #1 created successfully: subj')
  })
})

describe('TaskGetTool 对象面', () => {
  test('name/常量 + JSON schema 1 字段 + TOOL_DEFAULTS 逐值', () => {
    expect(TaskGetTool.name).toBe(TASK_GET_TOOL_NAME)
    expect(TASK_GET_TOOL_NAME).toBe('TaskGet')
    expect(TASK_GET_TOOL_INPUT_SCHEMA.properties?.taskId).toMatchObject({
      type: 'string',
    })
    expect(TASK_GET_TOOL_INPUT_SCHEMA.required).toEqual(['taskId'])
    expect(TaskGetTool.isReadOnly({})).toBe(true)
    expect(TaskGetTool.toAutoClassifierInput({ taskId: 't7' })).toBe('t7')
  })

  test('mapResult 缺失支 / 全字段支 / blocks+blockedBy 4 支', () => {
    const none: TaskGetOutput = { task: null }
    expect(
      (TaskGetTool.mapToolResultToToolResultBlockParam(none, 't1') as {
        content: string
      }).content,
    ).toBe('Task not found')

    const full: TaskGetOutput = {
      task: {
        id: '2',
        subject: 's',
        description: 'd',
        status: 'pending',
        blocks: ['3'],
        blockedBy: ['1'],
      },
    }
    const content = (
      TaskGetTool.mapToolResultToToolResultBlockParam(full, 't2') as {
        content: string
      }
    ).content
    expect(content).toBe(
      [
        'Task #2: s',
        'Status: pending',
        'Description: d',
        'Blocked by: #1',
        'Blocks: #3',
      ].join('\n'),
    )
  })
})

describe('TaskListTool 对象面', () => {
  test('name/常量 + 空 JSON schema + 空串分类器缺省逐值固化', () => {
    expect(TaskListTool.name).toBe(TASK_LIST_TOOL_NAME)
    expect(TASK_LIST_TOOL_NAME).toBe('TaskList')
    expect(TASK_LIST_TOOL_INPUT_SCHEMA).toEqual({ type: 'object' })
    expect(TaskListTool.toAutoClassifierInput({ anything: true })).toBe('')
    expect(TaskListTool.isReadOnly({})).toBe(true)
  })

  test('mapResult 空集支 / 行格式支（owner + blockedBy 两段拼接）', () => {
    const empty: TaskListOutput = { tasks: [] }
    expect(
      (TaskListTool.mapToolResultToToolResultBlockParam(empty, 't1') as {
        content: string
      }).content,
    ).toBe('No tasks found')

    const withTasks: TaskListOutput = {
      tasks: [
        {
          id: '1',
          subject: 'first',
          status: 'in_progress',
          owner: 'alice',
          blockedBy: ['2', '3'],
        },
        { id: '4', subject: 'solo', status: 'pending', blockedBy: [] },
      ],
    }
    const content = (
      TaskListTool.mapToolResultToToolResultBlockParam(withTasks, 't2') as {
        content: string
      }
    ).content
    expect(content).toBe(
      [
        '#1 [in_progress] first (alice) [blocked by #2, #3]',
        '#4 [pending] solo',
      ].join('\n'),
    )
  })
})

describe('TaskUpdateTool 对象面', () => {
  test('name/常量 + JSON schema 9 字段面 + TOOL_DEFAULTS 逐值', () => {
    expect(TaskUpdateTool.name).toBe(TASK_UPDATE_TOOL_NAME)
    expect(TASK_UPDATE_TOOL_NAME).toBe('TaskUpdate')
    const props = TASK_UPDATE_TOOL_INPUT_SCHEMA.properties as Record<
      string,
      unknown
    >
    expect(Object.keys(props).sort()).toEqual([
      'activeForm',
      'addBlockedBy',
      'addBlocks',
      'description',
      'metadata',
      'owner',
      'status',
      'subject',
      'taskId',
    ])
    expect((props.addBlocks as { items: { type: string } }).items.type).toBe(
      'string',
    )
    expect(TASK_UPDATE_TOOL_INPUT_SCHEMA.required).toEqual(['taskId'])
    expect(TaskUpdateTool.isReadOnly({})).toBe(false)
    // 三段拼接（缺段不拼）
    expect(
      TaskUpdateTool.toAutoClassifierInput({
        taskId: 't7',
        status: 'completed',
        subject: 'new',
      }),
    ).toBe('t7 completed new')
    expect(TaskUpdateTool.toAutoClassifierInput({ taskId: 't7' })).toBe('t7')
  })

  test('checkPermissions allow 固化 + mapResult 失败/成功支', () => {
    return expect(
      TaskUpdateTool.checkPermissions({ taskId: '1' }, {}),
    ).resolves.toEqual({ behavior: 'allow', updatedInput: { taskId: '1' } })

    const fail: TaskUpdateOutput = {
      success: false,
      taskId: '9',
      updatedFields: [],
    }
    expect(
      (TaskUpdateTool.mapToolResultToToolResultBlockParam(fail, 't1') as {
        content: string
      }).content,
    ).toBe('Task #9 not found')

    const failWithErr: TaskUpdateOutput = {
      success: false,
      taskId: '9',
      updatedFields: [],
      error: 'Task not found',
    }
    expect(
      (TaskUpdateTool.mapToolResultToToolResultBlockParam(failWithErr, 't2') as {
        content: string
      }).content,
    ).toBe('Task not found')

    const ok: TaskUpdateOutput = {
      success: true,
      taskId: '1',
      updatedFields: ['subject', 'status'],
      statusChange: { from: 'pending', to: 'completed' },
    }
    // 主会话（getAgentId 未定义）→ 无队友提醒尾段
    expect(
      (TaskUpdateTool.mapToolResultToToolResultBlockParam(ok, 't3') as {
        content: string
      }).content,
    ).toBe('Updated task #1 subject, status')
  })

  test('mapResult completed 队友提醒支（dynamicTeamContext 判别）', () => {
    process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS = '1'
    setDynamicCtx()
    const ok: TaskUpdateOutput = {
      success: true,
      taskId: '1',
      updatedFields: ['status'],
      statusChange: { from: 'in_progress', to: 'completed' },
    }
    const content = (
      TaskUpdateTool.mapToolResultToToolResultBlockParam(ok, 't4') as {
        content: string
      }
    ).content
    expect(content).toContain(
      'Task completed. Call TaskList now to find your next available task',
    )
    // 主会话无 getAgentId → 提醒不出现（同入参反向断言）
    clearDynamicTeamContext()
    const plain = (
      TaskUpdateTool.mapToolResultToToolResultBlockParam(ok, 't5') as {
        content: string
      }
    ).content
    expect(plain).toBe('Updated task #1 status')
  })
})

describe('isEnabled 门 = isTodoV2Enabled 判别支（注册表 ⑯ 槽自门控）', () => {
  test('交互缺省 → true（TUI 默认 v2 任务列表）', () => {
    setIsInteractive(true)
    expect(TaskCreateTool.isEnabled()).toBe(true)
    expect(TaskGetTool.isEnabled()).toBe(true)
    expect(TaskListTool.isEnabled()).toBe(true)
    expect(TaskUpdateTool.isEnabled()).toBe(true)
  })

  test('非交互 + 未设 env → false（SDK 缺省 TodoWrite v1 面）', () => {
    setIsInteractive(false)
    expect(TaskCreateTool.isEnabled()).toBe(false)
    expect(TaskUpdateTool.isEnabled()).toBe(false)
  })

  test('非交互 + ATLAS_ENABLE_TASKS=1 → true（SDK 强制开）', () => {
    setIsInteractive(false)
    process.env.ATLAS_ENABLE_TASKS = '1'
    expect(TaskListTool.isEnabled()).toBe(true)
  })
})

describe('prompt 面（delta ②③：新契约唯一 prompt 面 = 旧 prompt() 体）', () => {
  test('TaskCreate getPrompt 双支（teammate 文案判别）', async () => {
    const plain = await TaskCreateTool.description({}, {
      isNonInteractiveSession: false,
      toolPermissionContext: {},
      tools: [],
    })
    expect(plain).toContain('create a structured task list')
    expect(plain).not.toContain('potentially assigned to teammates')
    expect(plain).not.toContain('Include enough detail')

    process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS = '1'
    const team = await TaskCreateTool.description({}, {
      isNonInteractiveSession: false,
      toolPermissionContext: {},
      tools: [],
    })
    expect(team).toContain('potentially assigned to teammates')
    expect(team).toContain('Include enough detail')
    // 门面同源回归
    expect(getTaskCreatePrompt()).toContain('create a structured task list')
  })

  test('TaskList getPrompt 双支（teammate workflow 判别）', async () => {
    const plain = await TaskListTool.description({}, {
      isNonInteractiveSession: false,
      toolPermissionContext: {},
      tools: [],
    })
    expect(plain).toContain('list all tasks in the task list')
    expect(plain).not.toContain('Before assigning tasks to teammates')
    expect(plain).not.toContain('## Teammate Workflow')

    process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS = '1'
    const team = await TaskListTool.description({}, {
      isNonInteractiveSession: false,
      toolPermissionContext: {},
      tools: [],
    })
    expect(team).toContain('Before assigning tasks to teammates')
    expect(team).toContain('## Teammate Workflow')
    expect(getTaskListPrompt()).toContain('list all tasks')
  })

  test('TaskGet / TaskUpdate 静态 PROMPT 面', async () => {
    expect(await TaskGetTool.description({}, {
      isNonInteractiveSession: false,
      toolPermissionContext: {},
      tools: [],
    })).toBe(TASK_GET_PROMPT)
    expect(TASK_GET_PROMPT).toContain('retrieve a task by its ID')
    expect(await TaskUpdateTool.description({}, {
      isNonInteractiveSession: false,
      toolPermissionContext: {},
      tools: [],
    })).toBe(TASK_UPDATE_PROMPT)
    expect(TASK_UPDATE_PROMPT).toContain('Status Workflow')
  })
})
