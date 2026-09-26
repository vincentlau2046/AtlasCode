/**
 * engine/tools S-D5 TaskOutput 本体 func 真盘面（§8.56 任务工具本体
 * 子波 4 末件；49 口径 16/49）。
 *
 * func 层（真 fs——setDiskOutputEnv 注入真 tmpdir，同 task-real-fs
 * 分层纪律）：
 *  - getTaskOutput 真盘读回支：local_bash 无 taskOutput 句柄（shellCommand
 *    null）→ 磁盘输出文件内容读回（unit 面仅 ENOENT '' 读探测，真内容
 *    读回归本层）。
 *  - local_agent 磁盘回落支：无内存 result（cleanResult undefined）→
 *    磁盘读回落位（result/output 双字段 = 盘内容）。
 *  - block=true 端到端真盘支：running → 完成态翻转 + 真盘读回 +
 *    notified 标记 + retrieval_status success（双分支 × 真盘闭环）。
 *
 * 深度 import（门面归集）：../../src/engine/tools（TaskOutputTool）+
 * ../../src/task（createTaskStateBase/getTaskOutputPath/setDiskOutputEnv
 * 注入位）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  TaskOutputTool,
  type LocalAgentTaskState,
  type LocalShellTaskState,
  type TaskOutputToolOutput,
  type TaskStateBase,
} from '../../src/engine/tools'
import {
  createTaskStateBase,
  getTaskOutputDir,
  getTaskOutputPath,
  setDiskOutputEnv,
  resetDiskOutputEnv,
  type TaskAppState,
} from '../../src/task'

let tmp: string

function makeBashTask(
  id: string,
  over: Partial<LocalShellTaskState> = {},
): LocalShellTaskState {
  return {
    ...(createTaskStateBase(id, 'local_bash', 'disk cmd') as LocalShellTaskState),
    command: 'echo disk',
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
    ...(createTaskStateBase(id, 'local_agent', 'agent disk') as LocalAgentTaskState),
    agentId: 'ag-func',
    prompt: 'disk thing',
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
  tmp = mkdtempSync(join(tmpdir(), 'atlas-tools-sd5-func-'))
  setDiskOutputEnv({
    getProjectTempDir: () => join(tmp, 'atlas'),
    getSessionId: () => 'sd5-func',
  })
  // 真盘：输出目录预建（getTaskOutput 读支 ENOENT 吞错，写面须父目录在位）
  mkdirSync(getTaskOutputDir(), { recursive: true })
})
afterEach(() => {
  resetDiskOutputEnv()
  rmSync(tmp, { recursive: true, force: true })
})

describe('TaskOutputTool 真盘读回支', () => {
  test('local_bash 无句柄 → 磁盘输出文件内容读回（block=false 终态支）', async () => {
    writeFileSync(getTaskOutputPath('b1'), 'disk line one\ndisk line two\n')
    const done = makeBashTask('b1', {
      status: 'completed',
      result: { code: 0, interrupted: false },
    })
    const store = makeStore({ b1: done as unknown as TaskStateBase })
    const res = await TaskOutputTool.call(
      { task_id: 'b1', block: false },
      store.ctx,
    )
    const task = (res.data as TaskOutputToolOutput).task
    expect(task?.output).toBe('disk line one\ndisk line two\n')
    expect(task?.exitCode).toBe(0)
  })

  test('local_agent 无内存 result → 磁盘读回落位（result/output 双字段）', async () => {
    writeFileSync(getTaskOutputPath('a1'), 'agent final answer\n')
    const done = makeAgentTask('a1', { status: 'completed' })
    const store = makeStore({ a1: done as unknown as TaskStateBase })
    const res = await TaskOutputTool.call(
      { task_id: 'a1', block: false },
      store.ctx,
    )
    const task = (res.data as TaskOutputToolOutput).task
    expect(task?.output).toBe('agent final answer\n')
    expect(task?.result).toBe('agent final answer\n')
    expect(task?.prompt).toBe('disk thing')
  })

  test('block=true 端到端真盘支（running → 完成态翻转 + 真盘读回 + notified）', async () => {
    writeFileSync(getTaskOutputPath('b9'), 'e2e payload')
    const running = makeBashTask('b9', { status: 'running' })
    const store = makeStore({ b9: running as unknown as TaskStateBase })
    setTimeout(() => {
      running.status = 'completed'
    }, 100)
    const res = await TaskOutputTool.call(
      { task_id: 'b9', block: true, timeout: 2000 },
      store.ctx,
    )
    const data = res.data as TaskOutputToolOutput
    expect(data.retrieval_status).toBe('success')
    expect(data.task?.output).toBe('e2e payload')
    expect(store.getState().tasks['b9']!.notified).toBe(true)
  })
})
