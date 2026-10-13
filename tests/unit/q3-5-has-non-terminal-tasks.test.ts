/**
 * Q3-5（0.1.65）/goal P5 时序守卫回收 —— hasNonTerminalTasks 纯谓词判别单测。
 *
 * 工单 §2 判据：hasPendingBackgroundTasks 扩展 LocalAgentTask 族
 *   = 纯谓词 hasNonTerminalTasks（AppState.tasks 记录面 → boolean）
 *   覆盖 LocalShellTask + LocalAgentTask 族统一（同 TaskStateBase.status 面）。
 *
 * 非终态 = pending | running | needs_input（isTerminalTaskStatus 返 false 的态）。
 * Q3-3 新增 needs_input 态 = 非终态（允许恢复，不阻断评估器永驻）。
 *
 * 落码面：src/task/task.ts hasNonTerminalTasks 纯函数（isTerminalTaskStatus 旁）。
 * 接线面：src/tui/agentLoopDeps.ts hasPendingBackgroundTasks 注入（getAppState().tasks）。
 */
import { describe, expect, test } from 'bun:test'
import {
  isTerminalTaskStatus,
  type TaskStateBase,
} from '../../src/task/task'

// hasNonTerminalTasks 在测试修前不存在（RED = import 失败）；修后从 task.ts 导出。
// 用动态 require 面避免 TS 编译期报错阻断 RED 观察——Bun 运行时 resolve。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { hasNonTerminalTasks } = require('../../src/task/task') as {
  hasNonTerminalTasks?: (tasks: Record<string, TaskStateBase>) => boolean
}

function mkTask(
  status: TaskStateBase['status'],
  id = `task-${status}`,
): TaskStateBase {
  return {
    id,
    type: 'local_shell',
    status,
    description: `test task ${id}`,
    startTime: Date.now(),
    outputFile: '/tmp/test-output',
    outputOffset: 0,
    notified: false,
  }
}

describe('Q3-5 hasNonTerminalTasks 纯谓词（LocalShellTask + LocalAgentTask 族统一）', () => {
  test('函数存在（修前红 = 未导出）', () => {
    expect(typeof hasNonTerminalTasks).toBe('function')
  })

  test('空 tasks → false（无后台任务）', () => {
    expect(hasNonTerminalTasks!({})).toBe(false)
  })

  test('全终态 → false（completed/failed/killed 全终态）', () => {
    const tasks = {
      a: mkTask('completed', 'a'),
      b: mkTask('failed', 'b'),
      c: mkTask('killed', 'c'),
    }
    expect(hasNonTerminalTasks!(tasks)).toBe(false)
  })

  test('pending → true（LocalAgentTask 异步启动态）', () => {
    const tasks = { a: mkTask('pending', 'a') }
    expect(hasNonTerminalTasks!(tasks)).toBe(true)
  })

  test('running → true（LocalShellTask/LocalAgentTask 运行中）', () => {
    const tasks = { a: mkTask('running', 'a') }
    expect(hasNonTerminalTasks!(tasks)).toBe(true)
  })

  test('needs_input → true（Q3-3 新态，非终态——允许恢复不永驻阻断）', () => {
    const tasks = { a: mkTask('needs_input', 'a') }
    expect(hasNonTerminalTasks!(tasks)).toBe(true)
  })

  test('混合终态 + 非终态 → true（任一非终态即守卫触发）', () => {
    const tasks = {
      a: mkTask('completed', 'a'),
      b: mkTask('running', 'b'),
      c: mkTask('killed', 'c'),
    }
    expect(hasNonTerminalTasks!(tasks)).toBe(true)
  })

  test('与 isTerminalTaskStatus 语义一致（非终态 = !isTerminalTaskStatus）', () => {
    const statuses: TaskStateBase['status'][] = [
      'pending',
      'running',
      'completed',
      'failed',
      'killed',
      'needs_input',
    ]
    for (const s of statuses) {
      const expected = !isTerminalTaskStatus(s)
      const actual = hasNonTerminalTasks!({ [s]: mkTask(s) })
      expect(
        actual === expected,
        `status=${s}: hasNonTerminalTasks=${actual} vs !isTerminal=${expected}`,
      ).toBe(true)
    }
  })
})
