/**
 * engine/tools S-D5 TaskOutput 本体 unit 面（§8.56 任务工具本体子波 4
 * 末件；49 口径 16/49）。
 *
 * unit 层（零磁盘——同 S-D4 对象面纪律：纯对象面 + schema 面 +
 * checkPermissions allow 固化 + description() = PROMPT 逐字 +
 * renderToolUseMessage 纯字符串体 + validateInput 纯支 + mapResult
 * 纯函数面 + call 双分支 duck store，无 fixture 无写）：
 *  - 对象面：name（toolNames 单一事实源）/ JSON schema 3 字段面
 *    （delta ① 逐字段，semanticBoolean → plain boolean 裁定锚点）/
 *    TOOL_DEFAULTS 成员逐值（delta ③/④）/ aliases 2 件 / isEnabled
 *    常真（delta ⑤ ant 面裁）/ userFacingName / toAutoClassifierInput
 *    逐字位 / checkPermissions allow 固化（delta ⑧）。
 *  - mapResult XML-ish 行逐字（retrieval_status/task_id/task_type/
 *    status/exit_code 双缺省位（undefined 与 null 均不投影）/output
 *    纯空白不投影/error/task:null 面 + 截断面（TASK_MAX_OUTPUT_LENGTH
 *    env 控长，纯 env 无大文件）+ '\n\n' join 位）。
 *  - validateInput 3 支守卫（缺 id ec 1 / 未找到 ec 2 / 找到真）。
 *  - call block=false 面（not-found throw / 终态 success + notified
 *    标记 / running not_ready 不标记 = P-D4 探针锚点，§8.56.5）+
 *    local_bash taskOutput 端口支
 *    （stdout/stderr join 面，纯内存假句柄）+ local_agent cleanResult
 *    支（内存 result 净文本优先 + prompt/error 透传面）。
 *  - call block=true 面（onProgress waiting_for_task 发射面 / 等待中
 *    完成 success + notified / 持续 running 超时回落（task 非 null）/
 *    任务消失超时（task null）/ abort 支 AbortError 传播）。
 *
 * 零磁盘口径注记：本地任务态无 shellCommand.taskOutput 句柄 / 无
 * local_agent 内存 result 时走 getTaskOutput(taskId) 磁盘读支 ——
 * 注入 tmpdir（setDiskOutputEnv）+ 无输出文件 → ENOENT → ''（读探测
 * 无写，S-D4 unit createTaskStateBase 同族纪律；真盘读回支归 func
 * 面 engine-tools-taskoutput-sd5-fs.test.ts）。
 *
 * 深度 import（门面归集，本文件经 tools 门面 = 双门面回归面）：
 *  ../../src/engine/tools（TaskOutputTool + schema + PROMPT + duck 型）
 *  + ../../src/task（createTaskStateBase/setDiskOutputEnv 注入位）+
 *  ../../src/engine/tools/bash（AbortError 类恒位断言）
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  TaskOutputTool,
  TASK_OUTPUT_TOOL_INPUT_SCHEMA,
  TASK_OUTPUT_PROMPT,
  type LocalAgentTaskState,
  type LocalShellTaskState,
  type TaskOutputToolOutput,
  type TaskOutputProgress,
  type TaskStateBase,
} from '../../src/engine/tools'
import { TASK_OUTPUT_TOOL_NAME } from '../../src/engine/tools/toolNames'
import { AbortError } from '../../src/engine/tools/bash'
import {
  createTaskStateBase,
  getTaskOutputPath,
  setDiskOutputEnv,
  resetDiskOutputEnv,
  type TaskAppState,
} from '../../src/task'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// 零磁盘：setDiskOutputEnv 注入 tmpdir 仅满足 getTaskOutputPath 路径
// 计算 + ENOENT 读探测（无 I/O 写；S-D4 同族纪律）。
let tmp: string

function makeBashTask(
  id: string,
  over: Partial<LocalShellTaskState> = {},
): LocalShellTaskState {
  return {
    ...(createTaskStateBase(id, 'local_bash', 'long cmd') as LocalShellTaskState),
    command: 'long-running',
    completionStatusSentInAttachment: false,
    shellCommand: null,
    lastReportedTotalLines: 0,
    isBackgrounded: false,
    ...over,
  }
}

function makeAgentTask(
  id: string,
  over: Partial<LocalAgentTaskState> = {},
): LocalAgentTaskState {
  return {
    ...(createTaskStateBase(id, 'local_agent', 'agent desc') as LocalAgentTaskState),
    agentId: 'ag-1',
    prompt: 'do the thing',
    agentType: 'general-purpose',
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: false,
    pendingMessages: [],
    retain: false,
    diskLoaded: false,
    ...over,
  }
}

function makeStore(tasks: Record<string, TaskStateBase>) {
  let state: TaskAppState = { tasks }
  return {
    getState: () => state,
    ctx: {
      getAppState: () => state,
      setAppState: (f: (p: TaskAppState) => TaskAppState) => {
        state = f(state)
      },
    },
  }
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'atlas-tools-sd5-unit-'))
  setDiskOutputEnv({
    getProjectTempDir: () => join(tmp, 'atlas'),
    getSessionId: () => 'sd5-unit',
  })
})
afterEach(() => {
  delete process.env.TASK_MAX_OUTPUT_LENGTH
  resetDiskOutputEnv()
  rmSync(tmp, { recursive: true, force: true })
})

// ── 对象面 ───────────────────────────────────────────────────────────────

describe('TaskOutputTool 对象面', () => {
  test('name/常量 + JSON schema 3 字段面（delta ① 逐字段）', () => {
    expect(TaskOutputTool.name).toBe(TASK_OUTPUT_TOOL_NAME)
    expect(TASK_OUTPUT_TOOL_NAME).toBe('TaskOutput')
    expect(TASK_OUTPUT_TOOL_INPUT_SCHEMA.type).toBe('object')
    const props = TASK_OUTPUT_TOOL_INPUT_SCHEMA.properties as Record<
      string,
      { type: string; description?: string; default?: unknown; minimum?: number; maximum?: number }
    >
    expect(Object.keys(props).sort()).toEqual(['block', 'task_id', 'timeout'])
    expect(props.task_id.type).toBe('string')
    expect(props.block.type).toBe('boolean')
    expect(props.block.default).toBe(true)
    expect(props.timeout.type).toBe('number')
    expect(props.timeout.minimum).toBe(0)
    expect(props.timeout.maximum).toBe(600_000)
    expect(props.timeout.default).toBe(30_000)
    expect(TASK_OUTPUT_TOOL_INPUT_SCHEMA.required).toEqual(['task_id'])
  })

  test('TOOL_DEFAULTS 成员逐值（delta ③/④）+ checkPermissions allow 固化', () => {
    expect(TaskOutputTool.maxResultSizeChars).toBe(100_000)
    expect(TaskOutputTool.shouldDefer).toBe(true)
    expect(TaskOutputTool.aliases).toEqual(['AgentOutputTool', 'BashOutputTool'])
    expect(TaskOutputTool.searchHint).toBe('read output/logs from a background task')
    expect(TaskOutputTool.isConcurrencySafe({})).toBe(true)
    expect(TaskOutputTool.isReadOnly({})).toBe(true)
    expect(TaskOutputTool.isDestructive?.({})).toBe(false)
    expect(TaskOutputTool.isEnabled()).toBe(true)
    expect(TaskOutputTool.userFacingName({})).toBe('Task Output')
    expect(TaskOutputTool.toAutoClassifierInput({ task_id: 'b1' })).toBe('b1')
    expect(TaskOutputTool.toAutoClassifierInput({})).toBe(undefined)
    return expect(
      TaskOutputTool.checkPermissions({ a: 1 }, {}),
    ).resolves.toEqual({ behavior: 'allow', updatedInput: { a: 1 } })
  })

  test('description() = 旧 prompt() 体（PROMPT 逐字面，delta ②）', async () => {
    const d = await TaskOutputTool.description(
      {},
      { isNonInteractiveSession: false, toolPermissionContext: {}, tools: [] },
    )
    expect(d).toBe(TASK_OUTPUT_PROMPT)
    expect(d).toContain('DEPRECATED: Prefer using the Read tool')
    expect(d).toContain('Works with all task types')
  })

  test('renderToolUseMessage 纯字符串体（delta ⑧：异 S-D3/D4 null 裁）', () => {
    expect(
      TaskOutputTool.renderToolUseMessage({ block: false }, { verbose: false }),
    ).toBe('non-blocking')
    expect(
      TaskOutputTool.renderToolUseMessage({ block: true }, { verbose: false }),
    ).toBe('')
    expect(TaskOutputTool.renderToolUseMessage({}, { verbose: false })).toBe('')
  })
})

// ── mapResult 逐字面 ─────────────────────────────────────────────────────

describe('TaskOutputTool mapResult', () => {
  test('task:null 面（timeout 无任务）', () => {
    const out: TaskOutputToolOutput = { retrieval_status: 'timeout', task: null }
    const r = TaskOutputTool.mapToolResultToToolResultBlockParam(out, 'tu0')
    expect(r.content).toBe('<retrieval_status>timeout</retrieval_status>')
    expect(r.tool_use_id).toBe('tu0')
    expect(r.type).toBe('tool_result')
  })

  test('success 全字段行（exit_code 数值投影 + output 面 + \n\n join）', () => {
    const out: TaskOutputToolOutput = {
      retrieval_status: 'success',
      task: {
        task_id: 'b1',
        task_type: 'local_bash',
        status: 'completed',
        description: 'long-running',
        output: 'done',
        exitCode: 0,
      },
    }
    const r = TaskOutputTool.mapToolResultToToolResultBlockParam(out, 'tu1')
    expect(r.content).toBe(
      [
        '<retrieval_status>success</retrieval_status>',
        '<task_id>b1</task_id>',
        '<task_type>local_bash</task_type>',
        '<status>completed</status>',
        '<exit_code>0</exit_code>',
        '<output>\ndone\n</output>',
      ].join('\n\n'),
    )
  })

  test('exit_code 双缺省位（null / undefined 均不投影，delta ① 旧 ?? null 面）', () => {
    const base = {
      task_id: 'b1',
      task_type: 'local_bash' as const,
      status: 'completed',
      description: 'd',
      output: 'x',
    }
    const nullRes = TaskOutputTool.mapToolResultToToolResultBlockParam(
      { retrieval_status: 'success', task: { ...base, exitCode: null } },
      'tu2',
    )
    expect(nullRes.content).not.toContain('<exit_code>')
    const undefRes = TaskOutputTool.mapToolResultToToolResultBlockParam(
      { retrieval_status: 'success', task: base },
      'tu2',
    )
    expect(undefRes.content).not.toContain('<exit_code>')
  })

  test('output 纯空白不投影 + error 面', () => {
    const out: TaskOutputToolOutput = {
      retrieval_status: 'success',
      task: {
        task_id: 'a1',
        task_type: 'local_agent',
        status: 'failed',
        description: 'd',
        output: '   \n  ',
        error: 'model blew up',
      },
    }
    const r = TaskOutputTool.mapToolResultToToolResultBlockParam(out, 'tu3')
    expect(r.content).not.toContain('<output>')
    expect(r.content).toContain('<error>model blew up</error>')
  })

  test('截断面（TASK_MAX_OUTPUT_LENGTH env 控长 + 真文件路径头，纯 env 无大文件）', () => {
    // 截断头含真文件路径（长度随 tmpdir 变）→ maxLen/输出长按头长相对取值
    // （availableSpace = maxLen - header.length = 30，恒正且 output 恒超长）
    const header = `[Truncated. Full output: ${getTaskOutputPath('b9')}]\n\n`
    process.env.TASK_MAX_OUTPUT_LENGTH = String(header.length + 30)
    const longOut = 'x'.repeat(header.length + 60)
    const out: TaskOutputToolOutput = {
      retrieval_status: 'success',
      task: {
        task_id: 'b9',
        task_type: 'local_bash',
        status: 'completed',
        description: 'd',
        output: longOut,
      },
    }
    const r = TaskOutputTool.mapToolResultToToolResultBlockParam(out, 'tu4')
    // 截断 = 头 + 尾（尾 = 最后 availableSpace 字符），经 <output> 块承载
    const truncatedBlock = `<output>\n${(header + 'x'.repeat(30)).trimEnd()}\n</output>`
    expect(r.content).toContain(truncatedBlock)
    delete process.env.TASK_MAX_OUTPUT_LENGTH
  })
})

// ── validateInput 3 支守卫 ───────────────────────────────────────────────

describe('TaskOutputTool validateInput', () => {
  test('3 支守卫（缺 id ec 1 / 未找到 ec 2 / 找到真）', async () => {
    const running = makeBashTask('b1')
    running.status = 'running'
    const store = makeStore({ b1: running as unknown as TaskStateBase })
    const ctx = store.ctx

    const r0 = await TaskOutputTool.validateInput({}, ctx)
    expect(r0).toEqual({
      result: false,
      message: 'Task ID is required',
      errorCode: 1,
    })

    const r1 = await TaskOutputTool.validateInput({ task_id: 'nope' }, ctx)
    expect(r1).toEqual({
      result: false,
      message: 'No task found with ID: nope',
      errorCode: 2,
    })

    const r2 = await TaskOutputTool.validateInput({ task_id: 'b1' }, ctx)
    expect(r2).toEqual({ result: true })
  })
})

// ── call block=false 面 ──────────────────────────────────────────────────

describe('TaskOutputTool call block=false', () => {
  test('not-found throw 支', async () => {
    const store = makeStore({})
    await expect(
      TaskOutputTool.call({ task_id: 'nope', block: false }, store.ctx),
    ).rejects.toThrow('No task found with ID: nope')
  })

  test('终态 success + notified 标记面（shellCommand null → ENOENT 空串读探测支）', async () => {
    const done = makeBashTask('b1', { status: 'completed' })
    const store = makeStore({ b1: done as unknown as TaskStateBase })
    const res = await TaskOutputTool.call(
      { task_id: 'b1', block: false },
      store.ctx,
    )
    const data = res.data as TaskOutputToolOutput
    expect(data.retrieval_status).toBe('success')
    expect(data.task?.task_id).toBe('b1')
    expect(data.task?.task_type).toBe('local_bash')
    expect(data.task?.output).toBe('') // ENOENT → ''（零写读探测支）
    expect(store.getState().tasks['b1']!.notified).toBe(true)
  })

  test('running → not_ready（P-D4 探针锚点，notified 不标记位）', async () => {
    const running = makeBashTask('b2', { status: 'running' })
    const store = makeStore({ b2: running as unknown as TaskStateBase })
    const res = await TaskOutputTool.call(
      { task_id: 'b2', block: false },
      store.ctx,
    )
    const data = res.data as TaskOutputToolOutput
    expect(data.retrieval_status).toBe('not_ready')
    expect(data.task?.status).toBe('running')
    expect(store.getState().tasks['b2']!.notified).toBe(false)
  })

  test('local_bash taskOutput 端口支（stdout/stderr join 面，纯内存假句柄）', async () => {
    const done = makeBashTask('b3', {
      status: 'completed',
      result: { code: 3, interrupted: false },
      shellCommand: {
        taskOutput: {
          getStdout: async () => 'OUT-LINE',
          getStderr: () => 'ERR-LINE',
        },
      } as never,
    })
    const store = makeStore({ b3: done as unknown as TaskStateBase })
    const res = await TaskOutputTool.call(
      { task_id: 'b3', block: false },
      store.ctx,
    )
    const data = res.data as TaskOutputToolOutput
    expect(data.task?.output).toBe('OUT-LINE\nERR-LINE')
    expect(data.task?.exitCode).toBe(3)
  })

  test('端口支 stderr 空面（filter(Boolean) 单行不拼接空串）', async () => {
    const done = makeBashTask('b4', {
      status: 'completed',
      result: { code: 0, interrupted: false },
      shellCommand: {
        taskOutput: {
          getStdout: async () => 'ONLY-OUT',
          getStderr: () => '',
        },
      } as never,
    })
    const store = makeStore({ b4: done as unknown as TaskStateBase })
    const res = await TaskOutputTool.call(
      { task_id: 'b4', block: false },
      store.ctx,
    )
    expect((res.data as TaskOutputToolOutput).task?.output).toBe('ONLY-OUT')
  })

  test('local_agent cleanResult 支（内存 result 净文本优先 + prompt/error 面）', async () => {
    const done = makeAgentTask('a1', {
      status: 'completed',
      result: {
        content: [
          { type: 'text', text: 'answer line 1' },
          { type: 'text', text: 'answer line 2' },
        ],
      } as never,
      error: 'partial failure',
    })
    const store = makeStore({ a1: done as unknown as TaskStateBase })
    const res = await TaskOutputTool.call(
      { task_id: 'a1', block: false },
      store.ctx,
    )
    const task = (res.data as TaskOutputToolOutput).task
    // cleanResult = extractTextContent(content, '\n') 优先于磁盘读支
    expect(task?.output).toBe('answer line 1\nanswer line 2')
    expect(task?.result).toBe('answer line 1\nanswer line 2')
    expect(task?.prompt).toBe('do the thing')
    expect(task?.error).toBe('partial failure')
  })

  test('local_agent 无内存 result 回落支（磁盘读支 ENOENT 空串 + result 空位）', async () => {
    const done = makeAgentTask('a2', { status: 'completed' })
    const store = makeStore({ a2: done as unknown as TaskStateBase })
    const res = await TaskOutputTool.call(
      { task_id: 'a2', block: false },
      store.ctx,
    )
    const task = (res.data as TaskOutputToolOutput).task
    expect(task?.output).toBe('')
    expect(task?.result).toBe('')
    expect(task?.prompt).toBe('do the thing')
  })
})

// ── call block=true 面 ───────────────────────────────────────────────────

describe('TaskOutputTool call block=true', () => {
  test('onProgress waiting_for_task 发射面（delta ⑦ 5 参消费位）', async () => {
    const running = makeBashTask('b5', { status: 'running' })
    const store = makeStore({ b5: running as unknown as TaskStateBase })
    // 100ms 后转终态 → 等待短（避免长测）
    setTimeout(() => {
      running.status = 'completed'
    }, 100)
    const seen: TaskOutputProgress[] = []
    const res = await TaskOutputTool.call(
      { task_id: 'b5', block: true, timeout: 2000 },
      store.ctx,
      undefined,
      undefined,
      p => seen.push(p),
    )
    expect(seen).toHaveLength(1)
    expect(seen[0]!.data).toEqual({
      type: 'waiting_for_task',
      taskDescription: 'long cmd',
      taskType: 'local_bash',
    })
    expect(seen[0]!.toolUseID.startsWith('task-output-waiting-')).toBe(true)
    expect((res.data as TaskOutputToolOutput).retrieval_status).toBe('success')
    expect(store.getState().tasks['b5']!.notified).toBe(true)
  })

  test('block/timeout 缺省位承旧 zod .default（不传 block → 阻塞支）', async () => {
    const running = makeBashTask('b6', { status: 'running' })
    const store = makeStore({ b6: running as unknown as TaskStateBase })
    const res = await TaskOutputTool.call(
      { task_id: 'b6', timeout: 150 },
      store.ctx,
    )
    // 持续 running → 超时回落（task 非 null 面，delta ⑦ 缺省位锁定）
    const data = res.data as TaskOutputToolOutput
    expect(data.retrieval_status).toBe('timeout')
    expect(data.task?.status).toBe('running')
    expect(store.getState().tasks['b6']!.notified).toBe(false)
  })

  test('任务消失支（超时回落 task null 面）', async () => {
    const running = makeBashTask('b7', { status: 'running' })
    const store = makeStore({ b7: running as unknown as TaskStateBase })
    setTimeout(() => {
      store.getState().tasks = {}
    }, 50)
    const res = await TaskOutputTool.call(
      { task_id: 'b7', block: true, timeout: 300 },
      store.ctx,
    )
    expect(res.data).toEqual({ retrieval_status: 'timeout', task: null })
  })

  test('abort 支（waitForTaskCompletion 首轮回 abort 信号 → AbortError 传播）', async () => {
    const running = makeBashTask('b8', { status: 'running' })
    const store = makeStore({ b8: running as unknown as TaskStateBase })
    const controller = new AbortController()
    controller.abort()
    const ctx = { ...store.ctx, abortController: controller }
    await expect(
      TaskOutputTool.call(
        { task_id: 'b8', block: true, timeout: 5000 },
        ctx,
      ),
    ).rejects.toBeInstanceOf(AbortError)
  })
})
