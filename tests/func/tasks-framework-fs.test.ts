/**
 * tasks 追踪层 func 真盘测试（E-7 S-7a，§8.46）：framework 状态机的
 * 真盘 delta/驱逐面（unit 层零磁盘无法覆盖的 I/O 断言）。
 *
 * 断言面（§8.45.3 详案）：
 *   ① generateTaskAttachments running → offset 补丁（真盘 getTaskOutputDelta）
 *   ② terminal + notified → 驱逐（P-T3 探针锚点）+ apply 层 evictAfter grace
 *   ③ applyTaskOffsetsAndEvictions TOCTOU 重检（await 期间状态迁移 → 补丁失效）
 *   ④ pollTasks 端到端（delta + 驱逐 + 通知窗口零捕获 pin）
 *   ⑤ spawnShellTask 终态 + 真盘输出 delta 读
 *
 * 分层纪律：func 层真 fs（mkdtemp 真 tmpdir），diskOutput env 注入真
 * getProjectTempDir 替身（task-real-fs 同式注入序）。
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
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  setDiskOutputEnv,
  resetDiskOutputEnv,
  _clearOutputsForTest,
  _resetTaskOutputDirForTest,
  appendTaskOutput,
  flushTaskOutput,
  getTaskOutputDelta,
  getTaskOutputPath,
  type SetAppState,
  type TaskAppState,
} from '../../src/task'
import type { ShellCommand } from '../../src/executor'
import {
  type AgentDefinition,
  type LocalAgentTaskState,
  type LocalShellTaskState,
  type TaskNotification,
  registerAsyncAgent,
  registerForeground,
  completeAgentTask,
  markAgentsNotified,
  updateTaskState,
  generateTaskAttachments,
  applyTaskOffsetsAndEvictions,
  pollTasks,
  spawnShellTask,
  setTaskNotificationHandler,
  resetTaskNotificationHandler,
} from '../../src/engine'

// ── 真盘 fixture（同 task-real-fs 注入序）────────────────────────
const taskTmp = mkdtempSync(join(tmpdir(), 'atlas-tasks-framework-func-'))
const SESSION = 'tasks-framework-session'

beforeAll(() => {
  setDiskOutputEnv({
    getProjectTempDir: () => taskTmp,
    getSessionId: () => SESSION,
  })
})
afterAll(async () => {
  await _clearOutputsForTest()
  resetDiskOutputEnv()
  _resetTaskOutputDirForTest()
  rmSync(taskTmp, { recursive: true, force: true })
})

const captured: TaskNotification[] = []
beforeEach(() => {
  captured.length = 0
  setTaskNotificationHandler(n => captured.push(n))
})
afterEach(() => {
  resetTaskNotificationHandler()
})

// ── 测试基建（同 unit 层假 ShellCommand，func 层独立副本）────────

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

function makeFakeAgent(): AgentDefinition {
  return {
    agentType: 'general-purpose',
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

function makeControllableShell(
  taskId: string,
): ShellCommand & {
  resolve: (r: { code: number; interrupted?: boolean }) => void
} {
  let resolveOuter: (r: { code: number; interrupted?: boolean }) => void
  const resultPromise = new Promise<ShellCommand['result']>(resolve => {
    resolveOuter = r =>
      resolve({
        stdout: '',
        stderr: '',
        code: r.code,
        interrupted: r.interrupted ?? false,
      })
  })
  return {
    background: () => true,
    result: resultPromise,
    kill: () => {},
    status: 'running' as const,
    cleanup: () => {},
    taskOutput: makeFakeTaskOutput(taskId),
    resolve: (r: { code: number; interrupted?: boolean }) => resolveOuter(r),
  }
}

async function writeTaskOutput(taskId: string, content: string): Promise<void> {
  appendTaskOutput(taskId, content)
  await flushTaskOutput(taskId)
}

// ── ① running delta → offset 补丁（真盘）────────────────────────

describe('generateTaskAttachments 真盘 delta 面', () => {
  test('running 任务真盘输出 → offset 补丁 + 二次读取无新数据', async () => {
    const store = makeStore()
    registerForeground(
      {
        command: 'stream',
        description: 'streaming cmd',
        shellCommand: makeControllableShell('f1'),
      },
      store.setAppState,
    )
    await writeTaskOutput('f1', 'hello\n') // 6 字节真落盘

    const { updatedTaskOffsets, evictedTaskIds } = await generateTaskAttachments(
      store.getAppState(),
    )
    expect(updatedTaskOffsets['f1']).toBe(6)
    expect(evictedTaskIds).toEqual([])

    applyTaskOffsetsAndEvictions(
      store.setAppState,
      updatedTaskOffsets,
      evictedTaskIds,
    )
    expect(
      (store.state.tasks['f1'] as LocalShellTaskState).outputOffset,
    ).toBe(6)

    // 二次轮询：offset 已推进 → 无新数据 → 空补丁
    const second = await generateTaskAttachments(store.getAppState())
    expect(Object.keys(second.updatedTaskOffsets)).toEqual([])
    applyTaskOffsetsAndEvictions(
      store.setAppState,
      second.updatedTaskOffsets,
      second.evictedTaskIds,
    )
  })
})

// ── ② terminal + notified 驱逐（P-T3 探针锚点）+ grace ───────────

describe('terminal + notified 驱逐（P-T3 探针锚点）', () => {
  test('终态 notified → generateTaskAttachments 列出驱逐候选', async () => {
    const store = makeStore()
    registerAsyncAgent({
      agentId: 'f2',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    completeAgentTask(
      {
        agentId: 'f2',
        content: [{ type: 'text', text: 'done' }],
        totalTokens: 1,
        totalToolUseCount: 0,
        totalDurationMs: 1,
      },
      store.setAppState,
    )
    markAgentsNotified('f2', store.setAppState)

    const { evictedTaskIds } = await generateTaskAttachments(store.getAppState())
    expect(evictedTaskIds).toContain('f2')
  })

  test('apply 层 grace 重检：evictAfter 未过期不驱逐，过期后驱逐', async () => {
    const store = makeStore()
    registerAsyncAgent({
      agentId: 'f3',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    completeAgentTask(
      {
        agentId: 'f3',
        content: [{ type: 'text', text: 'done' }],
        totalTokens: 1,
        totalToolUseCount: 0,
        totalDurationMs: 1,
      },
      store.setAppState,
    )
    markAgentsNotified('f3', store.setAppState)
    // evictAfter = now + 30s（retain false）→ grace 挡住
    let r = await generateTaskAttachments(store.getAppState())
    applyTaskOffsetsAndEvictions(
      store.setAppState,
      r.updatedTaskOffsets,
      r.evictedTaskIds,
    )
    expect(store.state.tasks['f3']).toBeDefined()

    // evictAfter 过期 → 驱逐
    updateTaskState<LocalAgentTaskState>('f3', store.setAppState, t => ({
      ...t,
      evictAfter: Date.now() - 1,
    }))
    r = await generateTaskAttachments(store.getAppState())
    applyTaskOffsetsAndEvictions(
      store.setAppState,
      r.updatedTaskOffsets,
      r.evictedTaskIds,
    )
    expect(store.state.tasks['f3']).toBeUndefined()
  })
})

// ── ③ TOCTOU：await 期间状态迁移 → 补丁失效 ──────────────────────

describe('applyTaskOffsetsAndEvictions TOCTOU 重检', () => {
  test('generate 与 apply 之间任务完成 → offset 补丁不应用', async () => {
    const store = makeStore()
    registerForeground(
      {
        command: 'build',
        description: 'build cmd',
        shellCommand: makeControllableShell('f4'),
      },
      store.setAppState,
    )
    await writeTaskOutput('f4', 'data\n') // 5 字节
    const { updatedTaskOffsets, evictedTaskIds } = await generateTaskAttachments(
      store.getAppState(),
    )
    expect(updatedTaskOffsets['f4']).toBe(5)

    // 模拟 generate 的 await 期间任务并发完成（result handler 已迁移状态）
    updateTaskState<LocalShellTaskState>('f4', store.setAppState, t => ({
      ...t,
      status: 'completed',
      result: { code: 0, interrupted: false },
    }))

    applyTaskOffsetsAndEvictions(
      store.setAppState,
      updatedTaskOffsets,
      evictedTaskIds,
    )
    // fresh 重检 status ≠ running → 补丁不应用
    expect(
      (store.state.tasks['f4'] as LocalShellTaskState).outputOffset,
    ).toBe(0)
  })
})

// ── ④ pollTasks 端到端 ───────────────────────────────────────────

describe('pollTasks 端到端', () => {
  test('running delta + 终态驱逐 一次轮询落定，通知窗口零捕获（pin）', async () => {
    const store = makeStore()
    registerForeground(
      {
        command: 'live',
        description: 'live cmd',
        shellCommand: makeControllableShell('f5'),
      },
      store.setAppState,
    )
    await writeTaskOutput('f5', 'abcdef') // 6 字节
    // 终态 agent（evictAfter 已过期 → 本轮可驱逐）
    registerAsyncAgent({
      agentId: 'f6',
      description: 'd',
      prompt: 'p',
      selectedAgent: makeFakeAgent(),
      setAppState: store.setAppState,
    })
    completeAgentTask(
      {
        agentId: 'f6',
        content: [{ type: 'text', text: 'done' }],
        totalTokens: 1,
        totalToolUseCount: 0,
        totalDurationMs: 1,
      },
      store.setAppState,
    )
    markAgentsNotified('f6', store.setAppState)
    updateTaskState<LocalAgentTaskState>('f6', store.setAppState, t => ({
      ...t,
      evictAfter: Date.now() - 1,
    }))

    await pollTasks(store.getAppState, store.setAppState)

    expect((store.state.tasks['f5'] as LocalShellTaskState).outputOffset).toBe(6)
    expect(store.state.tasks['f6']).toBeUndefined() // 驱逐落定
    // 旧仓 generateTaskAttachments 不生成 completed 附件（per-type callback
    // 自持通知防 dual-delivery，头注保留）→ 通知窗口零捕获（语义 pin）
    expect(captured).toEqual([])
  })
})

// ── ⑤ spawnShellTask 终态 + 真盘输出 delta ───────────────────────

describe('spawnShellTask 真盘集成', () => {
  test('completed 终态 + 输出文件真盘可读 delta', async () => {
    const store = makeStore()
    const cmd = makeControllableShell('f7')
    await spawnShellTask(
      { command: 'gen', description: 'gen output', shellCommand: cmd },
      {
        abortController: new AbortController(),
        getAppState: store.getAppState,
        setAppState: store.setAppState,
      },
    )
    await writeTaskOutput('f7', 'x'.repeat(10))
    cmd.resolve({ code: 0 })
    await new Promise(r => setTimeout(r, 20))

    const task = store.state.tasks['f7'] as LocalShellTaskState
    expect(task.status).toBe('completed')
    expect(task.result).toEqual({ code: 0, interrupted: false })
    expect(existsSync(getTaskOutputPath('f7'))).toBe(true) // evict 不删文件
    const delta = await getTaskOutputDelta('f7', 0)
    expect(delta.content).toBe('x'.repeat(10))
    expect(delta.newOffset).toBe(10)
    expect(captured[0]!.value).toContain('Background command "gen output" completed')
  })
})
