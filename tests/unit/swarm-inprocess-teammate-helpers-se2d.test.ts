/**
 * swarm 域 S-E2d（§8.66.1.5 测试面）unit 层（零盘零模型）：
 * inProcessTeammateHelpers 4 函数面（旧仓 utils/inProcessTeammateHelpers.ts
 * 102L 逐字，S-E2b 落位）。
 *
 * 测面 = task registry fake（TaskAppState + setAppState 捕获器）驱动：
 * findInProcessTeammateTaskId 查找/非 teammate 跳过两态 /
 * setAwaitingPlanApproval + handlePlanApprovalResponse 状态更新面（
 * updateTaskState 早退支 = 未知 taskId 状态零变化）/
 * isPermissionRelatedResponse 双 parser 判定面（permission /
 * sandbox_permission 两 type + 负例 3 支）。
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  findInProcessTeammateTaskId,
  handlePlanApprovalResponse,
  isPermissionRelatedResponse,
  setAwaitingPlanApproval,
} from '../../src/swarm'
import {
  type InProcessTeammateTaskState,
  type SetAppState,
  type TaskAppState,
  type TaskStateBase,
} from '../../src/task'

function makeTask(
  id: string,
  over: Partial<InProcessTeammateTaskState> = {},
): InProcessTeammateTaskState {
  return {
    id,
    type: 'in_process_teammate',
    status: 'running',
    description: 'd',
    startTime: 0,
    outputFile: '/tmp/o',
    outputOffset: 0,
    notified: false,
    identity: {
      agentId: `${id}-agent`,
      agentName: id,
      teamName: 't1',
      planModeRequired: false,
      parentSessionId: 'sess-1',
    },
    prompt: 'p',
    awaitingPlanApproval: false,
    permissionMode: 'default',
    isIdle: false,
    shutdownRequested: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    pendingUserMessages: [],
    ...over,
  }
}

function makeBashTask(id: string): TaskStateBase {
  return {
    id,
    type: 'local_bash',
    status: 'running',
    description: 'b',
    startTime: 0,
    outputFile: '/tmp/o',
    outputOffset: 0,
    notified: false,
  }
}

function makeAppState(tasks: TaskStateBase[]): TaskAppState {
  return {
    tasks: Object.fromEntries(tasks.map(t => [t.id, t])),
  }
}

function makeSetAppState(initial: TaskAppState) {
  let state = initial
  return {
    set: (f: (prev: TaskAppState) => TaskAppState) => {
      state = f(state)
    },
    get: () => state,
    setAppState: ((f: (prev: TaskAppState) => TaskAppState) => {
      state = f(state)
    }) as SetAppState,
  }
}

describe('findInProcessTeammateTaskId', () => {
  test('按 agentName 命中 → task id', () => {
    const appState = makeAppState([makeTask('t-1'), makeTask('t-2')])
    expect(findInProcessTeammateTaskId('t-2', appState)).toBe('t-2')
  })

  test('未命中 → undefined', () => {
    const appState = makeAppState([makeTask('t-1')])
    expect(findInProcessTeammateTaskId('absent', appState)).toBeUndefined()
  })

  test('非 in-process 任务跳过（bash 同 registry 不干扰）', () => {
    const appState = makeAppState([makeBashTask('b-1'), makeTask('t-1')])
    expect(findInProcessTeammateTaskId('t-1', appState)).toBe('t-1')
    expect(findInProcessTeammateTaskId('b-1', appState)).toBeUndefined()
  })

  test('空 registry → undefined', () => {
    expect(findInProcessTeammateTaskId('x', makeAppState([]))).toBeUndefined()
  })
})

describe('setAwaitingPlanApproval / handlePlanApprovalResponse', () => {
  beforeEach(() => {})

  test('awaiting true 更新面（余字段零扰动）', () => {
    const task = makeTask('t-1')
    const reg = makeSetAppState(makeAppState([task]))
    setAwaitingPlanApproval('t-1', reg.setAppState, true)
    const updated = reg.get().tasks['t-1'] as InProcessTeammateTaskState
    expect(updated.awaitingPlanApproval).toBe(true)
    expect(updated.identity.agentName).toBe('t-1')
    expect(updated.isIdle).toBe(false)
  })

  test('未知 taskId → 状态零变化（updateTaskState 早退支）', () => {
    const task = makeTask('t-1')
    const reg = makeSetAppState(makeAppState([task]))
    const before = reg.get()
    setAwaitingPlanApproval('absent', reg.setAppState, true)
    expect(reg.get()).toBe(before)
  })

  test('handlePlanApprovalResponse → awaiting 复位 false', () => {
    const task = makeTask('t-1', { awaitingPlanApproval: true })
    const reg = makeSetAppState(makeAppState([task]))
    handlePlanApprovalResponse(
      't-1',
      {
        type: 'plan_approval_response',
        request_id: 'p1',
        approved: true,
      } as never,
      reg.setAppState,
    )
    const updated = reg.get().tasks['t-1'] as InProcessTeammateTaskState
    expect(updated.awaitingPlanApproval).toBe(false)
  })
})

describe('isPermissionRelatedResponse（双 parser 判定面）', () => {
  test('permission_response JSON → true', () => {
    expect(
      isPermissionRelatedResponse(
        JSON.stringify({ type: 'permission_response', request_id: 'r1' }),
      ),
    ).toBe(true)
  })

  test('sandbox_permission_response JSON → true', () => {
    expect(
      isPermissionRelatedResponse(
        JSON.stringify({
          type: 'sandbox_permission_response',
          request_id: 's1',
        }),
      ),
    ).toBe(true)
  })

  test('其他 JSON type → false', () => {
    expect(
      isPermissionRelatedResponse(JSON.stringify({ type: 'shutdown_request' })),
    ).toBe(false)
  })

  test('非 JSON 文本 → false（parser 内 catch 面）', () => {
    expect(isPermissionRelatedResponse('plain text')).toBe(false)
  })

  test('空串 → false', () => {
    expect(isPermissionRelatedResponse('')).toBe(false)
  })
})
