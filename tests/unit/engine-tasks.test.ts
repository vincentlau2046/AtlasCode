/**
 * tasks 追踪层单测（E-7 S-7a，§8.46）：engine/coordinator/tasks 状态机
 * framework + LocalAgentTask/LocalShellTask + stopTask + registry +
 * 通知注入窗口 + ProgressTracker。
 *
 * 零磁盘：setDiskOutputEnv 注入 tmpdir 仅满足 createTaskStateBase →
 * getTaskOutputPath 的 fail-fast 路径计算（无 I/O）；真盘 delta/驱逐
 * 断言归 tests/func/tasks-framework-fs.test.ts（P-T3 探针锚点所在）。
 * 零网络 / 无 PTY → unit 层。
 *
 * 探针锚点（§8.45.3）：
 *   P-T1 registerTask merge 支 → 'registerTask re-register 保留 UI 持有态'
 *   P-T2 stopTask not_running 守卫 → 'not_running 拒非 running'
 *   P-T3 generateTaskAttachments terminal+notified 驱逐 → func 层
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
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  setDiskOutputEnv,
  resetDiskOutputEnv,
  createTaskStateBase,
  type SetAppState,
  type TaskAppState,
} from '../../src/task'
import type { ShellCommand } from '../../src/executor'
import {
  type AgentDefinition,
  type AgentToolResult,
  type LocalAgentTaskState,
  type LocalShellTaskState,
  type Message,
  type TaskNotification,
  type TaskState,
  SYNTHETIC_OUTPUT_TOOL_NAME,
  setTaskNotificationHandler,
  resetTaskNotificationHandler,
  updateTaskState,
  evictTerminalTask,
  getRunningTasks,
  applyTaskOffsetsAndEvictions,
  stopTask,
  StopTaskError,
  getAllTasks,
  getTaskByType,
  createProgressTracker,
  updateProgressFromMessage,
  getProgressUpdate,
  registerAsyncAgent,
  killAsyncAgent,
  killAllRunningAgentTasks,
  markAgentsNotified,
  updateAgentProgress,
  updateAgentSummary,
  completeAgentTask,
  failAgentTask,
  enqueueAgentNotification,
  isPanelAgentTask,
  queuePendingMessage,
  drainPendingMessages,
  registerAgentForeground,
  backgroundAgentTask,
  unregisterAgentForeground,
  spawnShellTask,
  registerForeground,
  hasForegroundTasks,
  backgroundAll,
  backgroundExistingForegroundTask,
  markTaskNotified,
  unregisterForeground,
  killTask,
  killShellTasksForAgent,
  looksLikePrompt,
} from '../../src/engine'

const taskTmp = mkdtempSync(join(tmpdir(), 'atlas-engine-tasks-unit-'))
beforeAll(() => {
  // 仅路径计算（createTaskStateBase → getTaskOutputPath fail-fast 面），无 I/O。
  setDiskOutputEnv({
    getProjectTempDir: () => taskTmp,
    getSessionId: () => 'unit-session',
  })
})
afterAll(() => {
  resetDiskOutputEnv()
  rmSync(taskTmp, { recursive: true, force: true })
})

// ── 测试基建 ─────────────────────────────────────────────────────

function makeStore() {
  let state: TaskAppState = { tasks: {} }
  const getAppState = () => state
  const setAppState: SetAppState = f => {
    state = f(state)
  }
  return {
    get state() {
      return state
    },
    getAppState,
    setAppState,
  }
}

function makeFakeAgent(agentType = 'general-purpose'): AgentDefinition {
  return {
    agentType,
    source: 'built-in',
    whenToUse: 'fake',
    getSystemPrompt: () => 'sys',
  }
}

function makeFakeTaskOutput(taskId: string): ShellCommand['taskOutput'] {
  return {
    taskId,
    path: `/tmp/fake/${taskId}`,
    stdoutToFile: false,
    writeStdout: () => {},
    writeStderr: () => {},
    getStdout: async () => '',
    getStderr: () => '',
    outputFileRedundant: false,
    outputFileSize: 0,
    spillToDisk: () => {},
    deleteOutputFile: async () => {},
    clear: () => {},
  }
}
interface FakeShellOpts {
  /** 缺省 = 立即 resolve 该结果；controllable = 外部 resolve（竞态测试）。 */
  outcome?: { code: number; interrupted?: boolean }
  controllable?: boolean
}
function makeFakeShellCommand(
  taskId: string,
  opts: FakeShellOpts = {},
): ShellCommand & {
  resolve?: (r: { code: number; interrupted?: boolean }) => void
} {
  let resolveOuter:
    | ((r: { code: number; interrupted?: boolean }) => void)
    | undefined
  let resultPromise: Promise<ShellCommand['result']>
  if (opts.controllable) {
    resultPromise = new Promise<ShellCommand['result']>(resolve => {
      resolveOuter = r =>
        resolve({
          stdout: '',
          stderr: '',
          code: r.code,
          interrupted: r.interrupted ?? false,
        })
    })
  } else {
    const o = opts.outcome ?? { code: 0, interrupted: false }
    resultPromise = Promise.resolve({
      stdout: '',
      stderr: '',
      code: o.code,
      interrupted: o.interrupted ?? false,
    })
  }
  const cmd = {
    background: () => true,
    result: resultPromise,
    kill: () => {},
    status: 'running' as const,
    cleanup: () => {},
    taskOutput: makeFakeTaskOutput(taskId),
  }
  if (resolveOuter) cmd.resolve = resolveOuter
  return cmd
}

async function tick(ms = 20): Promise<void> {
  await new Promise(r => setTimeout(r, ms))
}

const captured: TaskNotification[] = []
beforeEach(() => {
  captured.length = 0
  setTaskNotificationHandler(n => captured.push(n))
})
afterEach(() => {
  resetTaskNotificationHandler()
})

function agentResult(agentId: string): AgentToolResult {
  return {
    agentId,
    content: [{ type: 'text', text: 'done' }],
    totalTokens: 42,
    totalToolUseCount: 3,
    totalDurationMs: 1000,
  }
}

function seedRunningAgent(
  store: ReturnType<typeof makeStore>,
  id: string,
  overrides: Partial<LocalAgentTaskState> = {},
): LocalAgentTaskState {
  const state = {
    ...createTaskStateBase(id, 'local_agent', 'desc'),
    type: 'local_agent' as const,
    status: 'running' as const,
    agentId: id,
    prompt: 'p',
    agentType: 'worker',
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: false,
    pendingMessages: [],
    retain: false,
    diskLoaded: false,
    ...overrides,
  }
  store.state.tasks[id] = state as LocalAgentTaskState
  return state
}

function seedRunningShell(
  store: ReturnType<typeof makeStore>,
  id: string,
  shellCommand: ShellCommand | null,
  overrides: Partial<LocalShellTaskState> = {},
): LocalShellTaskState {
  const state = {
    ...createTaskStateBase(id, 'local_bash', 'echo hi'),
    type: 'local_bash' as const,
    status: 'running' as const,
    command: 'echo hi',
    completionStatusSentInAttachment: false,
    shellCommand,
    lastReportedTotalLines: 0,
    isBackgrounded: false,
    ...overrides,
  }
  store.state.tasks[id] = state as LocalShellTaskState
  return state
}

// ── framework 状态机 ─────────────────────────────────────────────

describe('framework 状态机', () => {
  test('updateTaskState 同引用早退（防无谓 re-render）', () => {
    const store = makeStore()
    const st = registerAsyncAgent({
      agentId: 'u1',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    const before = store.state
    updateTaskState<LocalAgentTaskState>('u1', store.setAppState, t => t)
    expect(store.state).toBe(before) // 早退 → 保引用
    updateTaskState<LocalAgentTaskState>('u1', store.setAppState, t => ({
      ...t,
      retrieved: true,
    }))
    expect(store.state).not.toBe(before)
    expect(store.state.tasks['u1']).not.toBe(st) // 新对象
  })

  test('registerTask re-register 保留 UI 持有态（P-T1 探针锚点）', () => {
    const store = makeStore()
    registerAsyncAgent({
      agentId: 'u2',
      description: 'first',
      prompt: 'p1',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    queuePendingMessage('u2', 'hello', store.setAppState)
    updateTaskState<LocalAgentTaskState>('u2', store.setAppState, t => ({
      ...t,
      retain: true,
      diskLoaded: true,
    }))
    const oldStartTime = store.state.tasks['u2']!.startTime
    // re-register（resume 替换）：新 prompt，但 UI 持有态保留
    registerAsyncAgent({
      agentId: 'u2',
      description: 'second',
      prompt: 'p2',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    const agent = store.state.tasks['u2'] as LocalAgentTaskState
    expect(agent.prompt).toBe('p2') // 新态生效
    expect(agent.pendingMessages).toEqual(['hello'])
    expect(agent.retain).toBe(true)
    expect(agent.diskLoaded).toBe(true)
    expect(agent.startTime).toBe(oldStartTime)
    expect(agent.status).toBe('running')
  })

  test('evictTerminalTask 三守卫 + panel grace', () => {
    const store = makeStore()
    registerAsyncAgent({
      agentId: 'u3',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    // 守卫 1：非终态不驱逐
    evictTerminalTask('u3', store.setAppState)
    expect(store.state.tasks['u3']).toBeDefined()
    // complete + notified 后：evictAfter = now + 30s（retain false）→ grace 挡住
    completeAgentTask(agentResult('u3'), store.setAppState)
    markAgentsNotified('u3', store.setAppState)
    evictTerminalTask('u3', store.setAppState)
    expect(store.state.tasks['u3']).toBeDefined()
    // evictAfter 过期 → 驱逐
    updateTaskState<LocalAgentTaskState>('u3', store.setAppState, t => ({
      ...t,
      evictAfter: Date.now() - 1,
    }))
    evictTerminalTask('u3', store.setAppState)
    expect(store.state.tasks['u3']).toBeUndefined()
  })

  test('evictTerminalTask 未 notified 不驱逐', () => {
    const store = makeStore()
    registerAsyncAgent({
      agentId: 'u4',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    completeAgentTask(agentResult('u4'), store.setAppState)
    // 不 markAgentsNotified → 保留
    evictTerminalTask('u4', store.setAppState)
    expect(store.state.tasks['u4']).toBeDefined()
  })

  test('getRunningTasks 仅 running', () => {
    const store = makeStore()
    registerAsyncAgent({
      agentId: 'u5',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    registerForeground(
      { command: 'a', description: 'da', shellCommand: makeFakeShellCommand('sb1') },
      store.setAppState,
    )
    failAgentTask('u5', 'boom', store.setAppState)
    expect(getRunningTasks(store.getAppState())).toEqual([store.state.tasks['sb1']])
  })

  test('applyTaskOffsetsAndEvictions 空列表早退（无 offset 无驱逐 → 不触 state）', () => {
    const store = makeStore()
    registerAsyncAgent({
      agentId: 'u7',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    const before = store.state
    applyTaskOffsetsAndEvictions(store.setAppState, {}, [])
    expect(store.state).toBe(before) // 早退在 setAppState 之前 → 保引用
    expect(captured).toEqual([])
  })
})

// ── stopTask 三态 ────────────────────────────────────────────────

describe('stopTask 三态守卫', () => {
  test('not_found', async () => {
    const store = makeStore()
    let code: string | undefined
    try {
      await stopTask('nope', {
        getAppState: store.getAppState,
        setAppState: store.setAppState,
      })
    } catch (e) {
      expect(e).toBeInstanceOf(StopTaskError)
      code = (e as StopTaskError).code
    }
    expect(code).toBe('not_found')
  })

  test('not_running 拒非 running（P-T2 探针锚点）', async () => {
    const store = makeStore()
    registerAsyncAgent({
      agentId: 's1',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    completeAgentTask(agentResult('s1'), store.setAppState)
    markAgentsNotified('s1', store.setAppState)
    let code: string | undefined
    try {
      await stopTask('s1', {
        getAppState: store.getAppState,
        setAppState: store.setAppState,
      })
    } catch (e) {
      expect(e).toBeInstanceOf(StopTaskError)
      code = (e as StopTaskError).code
    }
    expect(code).toBe('not_running')
  })

  test('unsupported_type 拒未注册任务态', async () => {
    const store = makeStore()
    const remote = createTaskStateBase('r1', 'remote_agent', 'remote desc')
    remote.status = 'running'
    store.state.tasks['r1'] = remote
    let code: string | undefined
    try {
      await stopTask('r1', {
        getAppState: store.getAppState,
        setAppState: store.setAppState,
      })
    } catch (e) {
      code = (e as StopTaskError).code
    }
    expect(code).toBe('unsupported_type')
  })

  test('agent kill 派发 + 结果面', async () => {
    const store = makeStore()
    const st = registerAsyncAgent({
      agentId: 's2',
      description: 'agent desc',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    const ac = st.abortController!
    const res = await stopTask('s2', {
      getAppState: store.getAppState,
      setAppState: store.setAppState,
    })
    expect(res).toEqual({
      taskId: 's2',
      taskType: 'local_agent',
      command: 'agent desc',
    })
    expect(ac.signal.aborted).toBe(true)
    const task = store.state.tasks['s2'] as LocalAgentTaskState
    expect(task.status).toBe('killed')
  })

  test('shell kill 抑制支（notified 原子置位）', async () => {
    const store = makeStore()
    const cmd = makeFakeShellCommand('s3', { controllable: true })
    registerForeground(
      { command: 'long-running', description: 'shell desc', shellCommand: cmd },
      store.setAppState,
    )
    const res = await stopTask('s3', {
      getAppState: store.getAppState,
      setAppState: store.setAppState,
    })
    expect(res.command).toBe('long-running')
    const task = store.state.tasks['s3'] as LocalShellTaskState
    expect(task.status).toBe('killed')
    expect(task.notified).toBe(true) // killTask 置位 → killed 通知被抑制
  })
})

// ── 注册表 ───────────────────────────────────────────────────────

describe('registry 两态注册表', () => {
  test('getTaskByType 派发 + 未迁态 undefined', () => {
    expect(getTaskByType('local_bash')?.name).toBe('LocalShellTask')
    expect(getTaskByType('local_agent')?.name).toBe('LocalAgentTask')
    expect(getTaskByType('remote_agent')).toBeUndefined()
    expect(getAllTasks().length).toBe(2)
  })
})

// ── ProgressTracker ──────────────────────────────────────────────

describe('ProgressTracker', () => {
  function assistantMsg(toolCount: number, namePrefix = 'Tool') {
    return {
      type: 'assistant',
      message: {
        usage: {
          input_tokens: 100,
          cache_creation_input_tokens: 5,
          cache_read_input_tokens: 7,
          output_tokens: 3,
        },
        content: Array.from({ length: toolCount }, (_, i) => ({
          type: 'tool_use',
          name: `${namePrefix}${i}`,
          input: { n: i },
        })),
      },
    } as unknown as Message
  }

  test('usage 计账 + tool_use 计数（SYNTHETIC 不入活动流）', () => {
    const tracker = createProgressTracker()
    const msg = {
      type: 'assistant',
      message: {
        usage: {
          input_tokens: 100,
          cache_creation_input_tokens: 5,
          cache_read_input_tokens: 7,
          output_tokens: 3,
        },
        content: [
          { type: 'tool_use', name: 'Read', input: { file_path: 'x.ts' } },
          { type: 'tool_use', name: SYNTHETIC_OUTPUT_TOOL_NAME, input: {} },
          { type: 'text', text: 'hi' },
        ],
      },
    } as unknown as Message
    updateProgressFromMessage(tracker, msg)
    expect(tracker.toolUseCount).toBe(2) // 两个 tool_use 块都计数
    expect(tracker.recentActivities).toHaveLength(1) // SYNTHETIC 不入活动流
    expect(tracker.recentActivities[0]!.toolName).toBe('Read')
    expect(tracker.latestInputTokens).toBe(112) // 100 + 5 + 7
    expect(tracker.cumulativeOutputTokens).toBe(3)
    const update = getProgressUpdate(tracker)
    expect(update.tokenCount).toBe(115)
    expect(update.lastActivity?.toolName).toBe('Read')
    expect(update.toolUseCount).toBe(2)
  })

  test('recentActivities 5 上限（shift 淘汰）', () => {
    const tracker = createProgressTracker()
    for (let i = 0; i < 7; i++) {
      // 每条消息 1 个 tool_use（block idx 恒 0），名带消息序号 → 可辨识淘汰序
      updateProgressFromMessage(tracker, assistantMsg(1, `T${i}`))
    }
    expect(tracker.recentActivities).toHaveLength(5)
    expect(tracker.recentActivities[0]!.toolName).toBe('T20')
    expect(tracker.toolUseCount).toBe(7)
  })

  test('非 assistant 消息跳过', () => {
    const tracker = createProgressTracker()
    updateProgressFromMessage(tracker, { type: 'user' } as unknown as Message)
    expect(tracker.toolUseCount).toBe(0)
    expect(tracker.latestInputTokens).toBe(0)
  })

  test('顶层 usage 兜底（flat 消息形态）', () => {
    const tracker = createProgressTracker()
    const flat = {
      type: 'assistant',
      usage: { input_tokens: 50, output_tokens: 10 },
    } as unknown as Message
    updateProgressFromMessage(tracker, flat)
    expect(tracker.latestInputTokens).toBe(50)
    expect(tracker.cumulativeOutputTokens).toBe(10)
    expect(tracker.toolUseCount).toBe(0)
  })
})

// ── agent 任务生命周期 ───────────────────────────────────────────

describe('agent 任务生命周期', () => {
  test('registerAsyncAgent 状态形状 + 立地后台化', () => {
    const store = makeStore()
    const st = registerAsyncAgent({
      agentId: 'a1',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    expect(st.status).toBe('running')
    expect(st.isBackgrounded).toBe(true)
    expect(st.pendingMessages).toEqual([])
    expect(st.retain).toBe(false)
    expect(store.state.tasks['a1']).toBe(st)
    expect(st.agentType).toBe('general-purpose')
  })

  test('父 abort 传播到子 agent', () => {
    const store = makeStore()
    const parent = new AbortController()
    const st = registerAsyncAgent({
      agentId: 'a2',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
      parentAbortController: parent,
    })
    expect(st.abortController?.signal.aborted).toBe(false)
    parent.abort()
    expect(st.abortController?.signal.aborted).toBe(true)
  })

  test('killAsyncAgent 状态机 + 幂等', () => {
    const store = makeStore()
    const st = registerAsyncAgent({
      agentId: 'a3',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    const ac = st.abortController!
    killAsyncAgent('a3', store.setAppState)
    const killed = store.state.tasks['a3'] as LocalAgentTaskState
    expect(killed.status).toBe('killed')
    expect(ac.signal.aborted).toBe(true)
    expect(killed.evictAfter).toBeTypeOf('number') // retain=false → grace 截止
    const endTime = killed.endTime
    killAsyncAgent('a3', store.setAppState) // 幂等：非 running no-op
    expect(store.state.tasks['a3']!.endTime).toBe(endTime)
  })

  test('killAllRunningAgentTasks 只动 local_agent running', () => {
    const store = makeStore()
    registerAsyncAgent({
      agentId: 'a4',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    failAgentTask('a4', 'x', store.setAppState)
    killAllRunningAgentTasks(
      store.state.tasks as Record<string, TaskState>,
      store.setAppState,
    )
    expect((store.state.tasks['a4'] as LocalAgentTaskState).status).toBe(
      'failed',
    ) // 非 running 不动
    registerAsyncAgent({
      agentId: 'a5',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    killAllRunningAgentTasks(
      store.state.tasks as Record<string, TaskState>,
      store.setAppState,
    )
    expect((store.state.tasks['a5'] as LocalAgentTaskState).status).toBe(
      'killed',
    )
  })

  test('completeAgentTask / failAgentTask 终态迁移', () => {
    const store = makeStore()
    registerAsyncAgent({
      agentId: 'a6',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    completeAgentTask(agentResult('a6'), store.setAppState)
    const done = store.state.tasks['a6'] as LocalAgentTaskState
    expect(done.status).toBe('completed')
    expect(done.result?.totalTokens).toBe(42)
    expect(done.selectedAgent).toBeUndefined() // 终态清 UI 面
    registerAsyncAgent({
      agentId: 'a7',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    failAgentTask('a7', 'boom', store.setAppState)
    const failed = store.state.tasks['a7'] as LocalAgentTaskState
    expect(failed.status).toBe('failed')
    expect(failed.error).toBe('boom')
  })

  test('enqueueAgentNotification 捕获 + notified 原子跳过', () => {
    const store = makeStore()
    registerAsyncAgent({
      agentId: 'a8',
      description: 'worker <x> & co',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    enqueueAgentNotification({
      taskId: 'a8',
      description: 'worker <x> & co',
      status: 'completed',
      setAppState: store.setAppState,
      finalMessage: 'final result',
      usage: { totalTokens: 10, toolUses: 2, durationMs: 100 },
      toolUseId: 'tu1',
      worktreePath: '/wt',
      worktreeBranch: 'b1',
    })
    expect(captured).toHaveLength(1)
    const value = captured[0]!.value
    expect(value).toContain('<task-notification>')
    expect(value).toContain('<task-id>a8</task-id>')
    expect(value).toContain('<tool-use-id>tu1</tool-use-id>')
    expect(value).toContain('worker &lt;x&gt; &amp; co') // escapeXml
    expect(value).toContain('<status>completed</status>')
    expect(value).toContain('Agent "worker &lt;x&gt; &amp; co" completed')
    expect(value).toContain('<result>final result</result>')
    expect(value).toContain(
      '<usage><total_tokens>10</total_tokens><tool_uses>2</tool_uses><duration_ms>100</duration_ms></usage>',
    )
    expect(value).toContain('<worktree>')
    expect(value).toContain('<worktreePath>/wt</worktreePath>')
    expect(value).toContain('<worktreeBranch>b1</worktreeBranch>')
    // notified 已置位 → 二次入队被跳过
    enqueueAgentNotification({
      taskId: 'a8',
      description: 'again',
      status: 'failed',
      setAppState: store.setAppState,
    })
    expect(captured).toHaveLength(1)
  })

  test('registerAgentForeground → backgroundAgentTask 信号链', async () => {
    const store = makeStore()
    const { taskId, backgroundSignal, cancelAutoBackground } =
      registerAgentForeground({
        agentId: 'a9',
        description: 'd',
        prompt: 'p',
        selectedAgent: makeFakeAgent(),
        setAppState: store.setAppState,
      })
    expect(cancelAutoBackground).toBeUndefined()
    let task = store.state.tasks[taskId] as LocalAgentTaskState
    expect(task.isBackgrounded).toBe(false)
    let resolved = false
    void backgroundSignal.then(() => {
      resolved = true
    })
    expect(backgroundAgentTask(taskId, store.getAppState, store.setAppState)).toBe(true)
    task = store.state.tasks[taskId] as LocalAgentTaskState
    expect(task.isBackgrounded).toBe(true)
    await tick(5)
    expect(resolved).toBe(true)
    // 已后台化 → 再后台化 false
    expect(backgroundAgentTask(taskId, store.getAppState, store.setAppState)).toBe(false)
  })

  test('registerAgentForeground autoBackgroundMs 定时器 + cancel', async () => {
    const store = makeStore()
    const { taskId, backgroundSignal, cancelAutoBackground } =
      registerAgentForeground({
        agentId: 'a10',
        description: 'd',
        prompt: 'p',
        selectedAgent: makeFakeAgent(),
        setAppState: store.setAppState,
        autoBackgroundMs: 30,
      })
    expect(cancelAutoBackground).toBeTypeOf('function')
    let resolved = false
    void backgroundSignal.then(() => {
      resolved = true
    })
    await tick(80)
    expect(resolved).toBe(true)
    expect((store.state.tasks[taskId] as LocalAgentTaskState).isBackgrounded).toBe(
      true,
    )
    // cancel 支：未触发即取消
    const c = registerAgentForeground({
      agentId: 'a11',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
      autoBackgroundMs: 20,
    })
    c.cancelAutoBackground?.()
    await tick(60)
    expect((store.state.tasks[c.taskId] as LocalAgentTaskState).isBackgrounded).toBe(
      false,
    )
  })

  test('unregisterAgentForeground 前台移除 / 后台保留', () => {
    const store = makeStore()
    const fg = registerAgentForeground({
      agentId: 'a12',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    unregisterAgentForeground(fg.taskId, store.setAppState)
    expect(store.state.tasks[fg.taskId]).toBeUndefined()
    const bg = registerAgentForeground({
      agentId: 'a13',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    backgroundAgentTask(bg.taskId, store.getAppState, store.setAppState)
    unregisterAgentForeground(bg.taskId, store.setAppState)
    expect(store.state.tasks[bg.taskId]).toBeDefined() // 已后台化 → 保留
  })

  test('queuePendingMessage / drainPendingMessages 序', () => {
    const store = makeStore()
    registerAsyncAgent({
      agentId: 'a14',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    queuePendingMessage('a14', 'm1', store.setAppState)
    queuePendingMessage('a14', 'm2', store.setAppState)
    expect(drainPendingMessages('a14', store.getAppState, store.setAppState)).toEqual([
      'm1',
      'm2',
    ])
    expect(
      (store.state.tasks['a14'] as LocalAgentTaskState).pendingMessages,
    ).toEqual([])
    expect(drainPendingMessages('a14', store.getAppState, store.setAppState)).toEqual(
      [],
    )
  })

  test('updateAgentProgress 保 summary / updateAgentSummary 保计数', () => {
    const store = makeStore()
    registerAsyncAgent({
      agentId: 'a15',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    updateAgentProgress(
      'a15',
      { toolUseCount: 3, tokenCount: 500 },
      store.setAppState,
    )
    updateAgentSummary('a15', 'sum1', store.setAppState)
    let task = store.state.tasks['a15'] as LocalAgentTaskState
    expect(task.progress?.summary).toBe('sum1')
    expect(task.progress?.toolUseCount).toBe(3)
    // progress 更新不得冲掉已存 summary
    updateAgentProgress(
      'a15',
      { toolUseCount: 4, tokenCount: 600 },
      store.setAppState,
    )
    task = store.state.tasks['a15'] as LocalAgentTaskState
    expect(task.progress?.summary).toBe('sum1')
    expect(task.progress?.toolUseCount).toBe(4)
    // 非 running 不更新
    failAgentTask('a15', 'x', store.setAppState)
    updateAgentProgress(
      'a15',
      { toolUseCount: 9, tokenCount: 1 },
      store.setAppState,
    )
    task = store.state.tasks['a15'] as LocalAgentTaskState
    expect(task.progress?.toolUseCount).toBe(4)
  })

  test('isPanelAgentTask 谓词（main-session 排除）', () => {
    const store = makeStore()
    seedRunningAgent(store, 'a16', { agentType: 'main-session' })
    seedRunningAgent(store, 'a17', { agentType: 'worker' })
    expect(isPanelAgentTask(store.state.tasks['a16'])).toBe(false)
    expect(isPanelAgentTask(store.state.tasks['a17'])).toBe(true)
    expect(isPanelAgentTask(store.state.tasks['zz'])).toBe(false)
  })
})

// ── shell 任务生命周期 ───────────────────────────────────────────

describe('shell 任务生命周期', () => {
  test('spawnShellTask → completed（通知捕获 + 状态迁移）', async () => {
    const store = makeStore()
    const cmd = makeFakeShellCommand('b1', { outcome: { code: 0 } })
    const handle = await spawnShellTask(
      { command: 'echo hi', description: 'say hi', shellCommand: cmd },
      {
        abortController: new AbortController(),
        getAppState: store.getAppState,
        setAppState: store.setAppState,
      },
    )
    expect(handle.taskId).toBe('b1')
    await tick()
    const task = store.state.tasks['b1'] as LocalShellTaskState
    expect(task.status).toBe('completed')
    expect(task.result).toEqual({ code: 0, interrupted: false })
    expect(task.shellCommand).toBeNull()
    expect(task.isBackgrounded).toBe(true)
    expect(captured).toHaveLength(1)
    expect(captured[0]!.priority).toBe('later') // MONITOR_TOOL 缺省 off
    expect(captured[0]!.value).toContain(
      'Background command "say hi" completed (exit code 0)',
    )
    expect(captured[0]!.value).toContain('<status>completed</status>')
  })

  test('spawnShellTask → failed（exit code 1 摘要）', async () => {
    const store = makeStore()
    const cmd = makeFakeShellCommand('b2', { outcome: { code: 1 } })
    await spawnShellTask(
      { command: 'false', description: 'fail cmd', shellCommand: cmd },
      {
        abortController: new AbortController(),
        getAppState: store.getAppState,
        setAppState: store.setAppState,
      },
    )
    await tick()
    const task = store.state.tasks['b2'] as LocalShellTaskState
    expect(task.status).toBe('failed')
    expect(captured[0]!.value).toContain(
      'Background command "fail cmd" failed with exit code 1',
    )
  })

  test('killed 竞态：kill 先于 result → 状态保留 killed + 通知抑制', async () => {
    const store = makeStore()
    const cmd = makeFakeShellCommand('b3', { controllable: true })
    await spawnShellTask(
      { command: 'sleep 999', description: 'sleeper', shellCommand: cmd },
      {
        abortController: new AbortController(),
        getAppState: store.getAppState,
        setAppState: store.setAppState,
      },
    )
    killTask('b3', store.setAppState) // notified=true 先置位
    cmd.resolve?.({ code: 0 })
    await tick()
    const task = store.state.tasks['b3'] as LocalShellTaskState
    expect(task.status).toBe('killed') // wasKilled 支：status 不被 result 冲掉
    expect(task.result).toBeUndefined() // wasKilled 支不写 result
    expect(task.shellCommand).toBeNull() // killTask 已置 null
    expect(captured).toEqual([]) // notified 已置 → killed 通知被抑制
  })

  test('hasForegroundTasks 三类判定', () => {
    const store = makeStore()
    expect(hasForegroundTasks(store.getAppState())).toBe(false)
    seedRunningAgent(store, 'fg1', { agentType: 'main-session' })
    expect(hasForegroundTasks(store.getAppState())).toBe(false) // main-session 排除
    seedRunningAgent(store, 'fg2', { agentType: 'worker' })
    expect(hasForegroundTasks(store.getAppState())).toBe(true)
    seedRunningShell(store, 'fg3', makeFakeShellCommand('fg3'))
    backgroundAgentTask('fg2', store.getAppState, store.setAppState)
    expect(hasForegroundTasks(store.getAppState())).toBe(true) // 前台 shell
  })

  test('backgroundAll 批量后台化（shell result handler 挂接）', async () => {
    const store = makeStore()
    const shell = makeFakeShellCommand('bg1', { controllable: true })
    seedRunningShell(store, 'bg1', shell)
    const agent = registerAgentForeground({
      agentId: 'bg2',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    backgroundAll(store.getAppState, store.setAppState)
    expect((store.state.tasks['bg1'] as LocalShellTaskState).isBackgrounded).toBe(
      true,
    )
    expect((store.state.tasks['bg2'] as LocalAgentTaskState).isBackgrounded).toBe(
      true,
    )
    // shell result handler 已挂（backgroundTask 支）：resolve → completed 通知
    shell.resolve?.({ code: 0 })
    await tick()
    expect((store.state.tasks['bg1'] as LocalShellTaskState).status).toBe(
      'completed',
    )
    expect(
      captured.some(n =>
        n.value.includes('Background command "echo hi" completed'),
      ),
    ).toBe(true)
    expect(agent.taskId).toBe('bg2')
  })

  test('backgroundExistingForegroundTask 原位翻转 + kind 缺省 bash 支', async () => {
    const store = makeStore()
    const shell = makeFakeShellCommand('bg3', { controllable: true })
    registerForeground(
      { command: 'build', description: 'build all', shellCommand: shell },
      store.setAppState,
      'tu-bg3',
    )
    expect(
      backgroundExistingForegroundTask(
        'bg3',
        shell,
        'build all',
        store.setAppState,
      ),
    ).toBe(true)
    expect((store.state.tasks['bg3'] as LocalShellTaskState).isBackgrounded).toBe(
      true,
    )
    shell.resolve?.({ code: 2 })
    await tick()
    expect((store.state.tasks['bg3'] as LocalShellTaskState).status).toBe(
      'failed',
    )
    expect(captured[0]!.value).toContain(
      'Background command "build all" failed with exit code 2',
    )
    // background() 失败 → false
    const failShell = makeFakeShellCommand('bg4')
    expect(
      backgroundExistingForegroundTask(
        'bg4',
        { ...failShell, background: () => false },
        'x',
        store.setAppState,
      ),
    ).toBe(false)
  })

  test('markTaskNotified 抑制 completion 通知（双发防护）', async () => {
    const store = makeStore()
    const shell = makeFakeShellCommand('bg5', { controllable: true })
    registerForeground(
      { command: 'quick', description: 'quick cmd', shellCommand: shell },
      store.setAppState,
    )
    // 附着 result handler（registerForeground 自身不挂 handler）——
    // 否则 shell.resolve 后无迁移支，status 停留 running
    expect(
      backgroundExistingForegroundTask(
        'bg5',
        shell,
        'quick cmd',
        store.setAppState,
      ),
    ).toBe(true)
    markTaskNotified('bg5', store.setAppState)
    shell.resolve?.({ code: 0 })
    await tick()
    expect((store.state.tasks['bg5'] as LocalShellTaskState).status).toBe(
      'completed',
    )
    expect(captured).toEqual([]) // 已 notified → 通知抑制
  })

  test('registerForeground → unregisterForeground 前台移除', () => {
    const store = makeStore()
    const id = registerForeground(
      { command: 'c', description: 'd', shellCommand: makeFakeShellCommand('fg4') },
      store.setAppState,
    )
    expect(store.state.tasks[id]).toBeDefined()
    unregisterForeground(id, store.setAppState)
    expect(store.state.tasks[id]).toBeUndefined()
  })

  test('looksLikePrompt 末行判别', () => {
    expect(looksLikePrompt('Install pkg? (y/n)')).toBe(true)
    expect(looksLikePrompt('build finished, 0 errors')).toBe(false)
    expect(
      looksLikePrompt('step 1 done\nstep 2 done\nPress Enter to continue'),
    ).toBe(true)
    expect(looksLikePrompt('Overwrite? [y/n]')).toBe(true)
  })

  test('killTask 非 running no-op', () => {
    const store = makeStore()
    const shell = makeFakeShellCommand('k1')
    seedRunningShell(store, 'k1', shell, { status: 'completed' })
    killTask('k1', store.setAppState)
    expect((store.state.tasks['k1'] as LocalShellTaskState).shellCommand).toBe(
      shell,
    ) // 非 running → 不 kill 不清 shellCommand
  })

  test('killShellTasksForAgent 按 agentId 清理孤儿', () => {
    const store = makeStore()
    const s1 = makeFakeShellCommand('ka1')
    const s2 = makeFakeShellCommand('ka2')
    seedRunningShell(store, 'ka1', s1, { agentId: 'agentX' })
    seedRunningShell(store, 'ka2', s2, { agentId: 'agentY' })
    killShellTasksForAgent('agentX', store.getAppState, store.setAppState)
    expect((store.state.tasks['ka1'] as LocalShellTaskState).status).toBe(
      'killed',
    )
    expect((store.state.tasks['ka2'] as LocalShellTaskState).status).toBe(
      'running',
    )
  })

  test('feature(MONITOR_TOOL) env 翻转：priority next + monitor 摘要支', async () => {
    const store = makeStore()
    const prev = process.env['FEATURE_MONITOR_TOOL']
    process.env['FEATURE_MONITOR_TOOL'] = 'true'
    try {
      const cmd = makeFakeShellCommand('m1', { outcome: { code: 0 } })
      await spawnShellTask(
        {
          command: 'watch',
          description: 'watcher',
          shellCommand: cmd,
          kind: 'monitor',
        },
        {
          abortController: new AbortController(),
          getAppState: store.getAppState,
          setAppState: store.setAppState,
        },
      )
      await tick()
      expect((store.state.tasks['m1'] as LocalShellTaskState).kind).toBe(
        'monitor',
      )
      expect(captured[0]!.priority).toBe('next') // feature on → next
      expect(captured[0]!.value).toContain('Monitor "watcher" stream ended')
    } finally {
      if (prev === undefined) delete process.env['FEATURE_MONITOR_TOOL']
      else process.env['FEATURE_MONITOR_TOOL'] = prev
    }
  })
})
