/**
 * tasks 存储层单测（§8.56 S-D2）：engine/tasks 任务列表 disk JSON 存储域
 * 零磁盘判别支 + Todo 型面 + agentSwarmsEnabled + task/outputFormatting
 * 纯支 + hooks/taskHooks 格式化器与无配置源空结果。
 *
 * 分层纪律：零磁盘（CRUD/lock/claim 真盘断言归
 * tests/func/engine-taskstore-fs.test.ts）/ 零网络 / 无 PTY → unit 层。
 *
 * 探针锚点（§8.56.5）：
 *   P-D1 存储 id 递增（high watermark 防复用）→ func 层
 *   P-D2 TaskUpdate hook 阻支 → S-D3 工具层
 */
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
} from 'bun:test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  sanitizePathComponent,
  getTasksDir,
  getTaskPath,
  getTaskListId,
  setLeaderTeamName,
  clearLeaderTeamName,
  onTasksUpdated,
  isTodoV2Enabled,
  TASK_STATUSES,
  isTaskStatus,
  DEFAULT_TASKS_MODE_TASK_LIST_ID,
} from '../../src/engine/tasks'
import { isAgentSwarmsEnabled } from '../../src/engine/messaging'
import {
  TASK_MAX_OUTPUT_UPPER_LIMIT,
  TASK_MAX_OUTPUT_DEFAULT,
  getMaxTaskOutputLength,
  formatTaskOutput,
  setDiskOutputEnv,
  resetDiskOutputEnv,
  getTaskOutputPath,
} from '../../src/task'
import {
  runTaskCreatedHooks,
  runTaskCompletedHooks,
  getTaskCreatedHookMessage,
  getTaskCompletedHookMessage,
  setHooksBootstrapEnv,
  resetHooksBootstrapEnv,
} from '../../src/hooks'
import { getSessionId, setIsInteractive } from '../../src/bootstrap/state'

const CONFIG_TMP = mkdtempSync(join(tmpdir(), 'atlas-taskstore-unit-'))

beforeEach(() => {
  setDiskOutputEnv({
    getProjectTempDir: () => CONFIG_TMP,
    getSessionId: () => 'taskstore-unit-sess',
  })
})

afterEach(() => {
  resetDiskOutputEnv()
  delete process.env.TASK_MAX_OUTPUT_LENGTH
  delete process.env.ATLAS_ENABLE_TASKS
  delete process.env.ATLAS_CONFIG_DIR
  delete process.env.ATLAS_TASK_LIST_ID
  delete process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS
  setIsInteractive(true)
  clearLeaderTeamName()
})

describe('存储域路径面（纯路径计算，零 I/O）', () => {
  test('sanitizePathComponent 透传/替换两态', () => {
    expect(sanitizePathComponent('tasklist-01_x')).toBe('tasklist-01_x')
    expect(sanitizePathComponent('team/name x.json')).toBe('team-name-x-json')
  })

  test('getTasksDir/getTaskPath 走 ATLAS_CONFIG_DIR（调用期读 env）', () => {
    process.env.ATLAS_CONFIG_DIR = CONFIG_TMP
    expect(getTasksDir('team/name')).toBe(join(CONFIG_TMP, 'tasks', 'team-name'))
    expect(getTaskPath('abc', '7')).toBe(join(CONFIG_TMP, 'tasks', 'abc', '7.json'))
  })
})

describe('isTodoV2Enabled 判别支', () => {
  test('ATLAS_ENABLE_TASKS 强制开（非交互 SDK 面）', () => {
    setIsInteractive(true)
    process.env.ATLAS_ENABLE_TASKS = '1'
    expect(isTodoV2Enabled()).toBe(true)
  })

  test('未设 env + 交互 → true（TUI 默认 v2 任务列表）', () => {
    setIsInteractive(true)
    expect(isTodoV2Enabled()).toBe(true)
  })

  test('未设 env + 非交互 → false（SDK 缺省 TodoWrite v1 面）', () => {
    setIsInteractive(false)
    expect(isTodoV2Enabled()).toBe(false)
  })
})

describe('getTaskListId 优先级链', () => {
  test('env > leaderTeamName > sessionId', () => {
    process.env.ATLAS_TASK_LIST_ID = 'explicit-list'
    expect(getTaskListId()).toBe('explicit-list')
    delete process.env.ATLAS_TASK_LIST_ID
    setLeaderTeamName('leader-team')
    expect(getTaskListId()).toBe('leader-team')
    clearLeaderTeamName()
    expect(getTaskListId()).toBe(getSessionId())
  })
})

describe('leader team name + onTasksUpdated 信号', () => {
  test('变更 emit / 同值 no-op / 空 clear no-op', () => {
    let n = 0
    const unsub = onTasksUpdated(() => {
      n++
    })
    setLeaderTeamName('t1')
    expect(n).toBe(1)
    setLeaderTeamName('t1')
    expect(n).toBe(1)
    setLeaderTeamName('t2')
    expect(n).toBe(2)
    clearLeaderTeamName()
    expect(n).toBe(3)
    clearLeaderTeamName()
    expect(n).toBe(3)
    unsub()
  })
})

describe('TaskStatus 面', () => {
  test('TASK_STATUSES 三态 + isTaskStatus 守卫', () => {
    expect(TASK_STATUSES).toEqual(['pending', 'in_progress', 'completed'])
    for (const s of TASK_STATUSES) {
      expect(isTaskStatus(s)).toBe(true)
    }
    expect(isTaskStatus('bogus')).toBe(false)
    expect(isTaskStatus(42)).toBe(false)
    expect(isTaskStatus(null)).toBe(false)
  })

  test('DEFAULT_TASKS_MODE_TASK_LIST_ID', () => {
    expect(DEFAULT_TASKS_MODE_TASK_LIST_ID).toBe('tasklist')
  })
})

describe('isAgentSwarmsEnabled（growthbook killswitch 支裁后）', () => {
  test('env/flag 双缺 → false', () => {
    expect(isAgentSwarmsEnabled()).toBe(false)
  })

  test('ATLAS_EXPERIMENTAL_AGENT_TEAMS=1 → true', () => {
    process.env.ATLAS_EXPERIMENTAL_AGENT_TEAMS = '1'
    expect(isAgentSwarmsEnabled()).toBe(true)
  })

  test('--agent-teams flag → true', () => {
    const len = process.argv.push('--agent-teams')
    try {
      expect(isAgentSwarmsEnabled()).toBe(true)
    } finally {
      process.argv.length = len
    }
  })
})

describe('task/outputFormatting（纯支）', () => {
  test('常量 + 缺省 32000', () => {
    expect(TASK_MAX_OUTPUT_DEFAULT).toBe(32_000)
    expect(TASK_MAX_OUTPUT_UPPER_LIMIT).toBe(160_000)
    expect(getMaxTaskOutputLength()).toBe(32_000)
  })

  test('合法值透传', () => {
    process.env.TASK_MAX_OUTPUT_LENGTH = '64000'
    expect(getMaxTaskOutputLength()).toBe(64_000)
  })

  test('超上限 → cap', () => {
    process.env.TASK_MAX_OUTPUT_LENGTH = '999999'
    expect(getMaxTaskOutputLength()).toBe(160_000)
  })

  test('0/非法 → 默认（旧仓 min=1 语义：0 拒）', () => {
    process.env.TASK_MAX_OUTPUT_LENGTH = '0'
    expect(getMaxTaskOutputLength()).toBe(32_000)
    process.env.TASK_MAX_OUTPUT_LENGTH = 'abc'
    expect(getMaxTaskOutputLength()).toBe(32_000)
  })

  test('未截断透传', () => {
    const out = 'x'.repeat(100)
    expect(formatTaskOutput(out, 't-1')).toEqual({
      content: out,
      wasTruncated: false,
    })
  })

  test('截断 = 头注 + 尾部（总长恰 maxLen）', () => {
    process.env.TASK_MAX_OUTPUT_LENGTH = '100'
    const out = 'y'.repeat(200)
    const { content, wasTruncated } = formatTaskOutput(out, 't-9')
    expect(wasTruncated).toBe(true)
    const header = `[Truncated. Full output: ${getTaskOutputPath('t-9')}]\n\n`
    expect(content.startsWith(header)).toBe(true)
    expect(content.length).toBe(100)
    expect(content.endsWith('y'.repeat(100 - header.length))).toBe(true)
  })
})

describe('hooks/taskHooks', () => {
  test('格式化器措辞（旧仓 utils/hooks.ts 逐字）', () => {
    expect(
      getTaskCreatedHookMessage({ blockingError: 'nope', command: 'x' }),
    ).toBe('TaskCreated hook feedback:\nnope')
    expect(
      getTaskCompletedHookMessage({ blockingError: 'bad', command: 'y' }),
    ).toBe('TaskCompleted hook feedback:\nbad')
  })

  test('无配置源 → 空 results（不触碰 shell 端口）', async () => {
    setHooksBootstrapEnv({
      getSessionId: () => 'taskstore-unit-sess',
      getCwd: () => CONFIG_TMP,
      getTranscriptPath: (id) => join(CONFIG_TMP, `${id}.jsonl`),
      getMainThreadAgentType: () => undefined,
      isNonInteractive: () => true,
      hasTrustAccepted: () => true,
    })
    try {
      const created = await runTaskCreatedHooks(
        '7',
        'subj',
        'desc',
        'alice',
        'team-x',
      )
      expect(created.results).toEqual([])
      expect(created.blockingError).toBeUndefined()
      const completed = await runTaskCompletedHooks('7', 'subj')
      expect(completed.results).toEqual([])
    } finally {
      resetHooksBootstrapEnv()
    }
  })
})
