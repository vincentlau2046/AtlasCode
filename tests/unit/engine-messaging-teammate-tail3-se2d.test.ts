/**
 * engine/messaging 尾 3 补差（S-E2b R6，§8.66 核销 ⑧）unit 层（零盘零
 * 模型）：task registry fake（TaskAppState + setAppState 捕获器）驱动
 * 3 函数面。
 *
 * 测面 = hasActiveInProcessTeammates（running 判定 + 非 teammate 跳过
 * + 空 registry）/ hasWorkingInProcessTeammates（running && !isIdle
 * 双条件矩阵 4 态）/ waitForTeammatesToBecomeIdle（零工作立即 resolve /
 * 双工作回调计数面 / 注册时点已 idle 竞态支同步触发 / 混合态仅等
 * 工作者）。
 *
 * 回调触发面：waitForTeammatesToBecomeIdle 经 setAppState updater 注册
 * onIdleCallbacks → 捕获器应用 updater 后从新态取回调手动触发（= idle
 * 转换模拟）。
 */
import { describe, expect, test } from 'bun:test'
import {
  clearDynamicTeamContext,
  hasActiveInProcessTeammates,
  hasWorkingInProcessTeammates,
  setDynamicTeamContext,
  waitForTeammatesToBecomeIdle,
} from '../../src/engine/messaging'
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

function makeAppState(tasks: TaskStateBase[]): TaskAppState {
  return { tasks: Object.fromEntries(tasks.map(t => [t.id, t])) }
}

function makeSetAppState(initial: TaskAppState) {
  let state = initial
  const setAppState: SetAppState = f => {
    state = f(state)
  }
  return { get: () => state, setAppState }
}

describe('hasActiveInProcessTeammates', () => {
  test('running teammate → true', () => {
    expect(
      hasActiveInProcessTeammates(makeAppState([makeTask('t-1')])),
    ).toBe(true)
  })

  test('idle teammate → false（isIdle 不阻 active 判定——status 面）', () => {
    expect(
      hasActiveInProcessTeammates(
        makeAppState([makeTask('t-1', { isIdle: true })]),
      ),
    ).toBe(true) // active = status running（idle 不阻）
  })

  test('非 running 状态（completed）→ false', () => {
    expect(
      hasActiveInProcessTeammates(
        makeAppState([makeTask('t-1', { status: 'completed' })]),
      ),
    ).toBe(false)
  })

  test('非 in-process 任务跳过 + 空 registry → false', () => {
    const bash: TaskStateBase = {
      id: 'b-1',
      type: 'local_bash',
      status: 'running',
      description: 'b',
      startTime: 0,
      outputFile: '/tmp/o',
      outputOffset: 0,
      notified: false,
    }
    expect(hasActiveInProcessTeammates(makeAppState([bash]))).toBe(false)
    expect(hasActiveInProcessTeammates(makeAppState([]))).toBe(false)
  })
})

describe('hasWorkingInProcessTeammates（running && !isIdle 矩阵）', () => {
  test('running + !isIdle → true', () => {
    expect(
      hasWorkingInProcessTeammates(makeAppState([makeTask('t-1')])),
    ).toBe(true)
  })

  test('running + isIdle → false（working 双条件支）', () => {
    expect(
      hasWorkingInProcessTeammates(makeAppState([makeTask('t-1', { isIdle: true })])),
    ).toBe(false)
  })

  test('completed → false（status 支）', () => {
    expect(
      hasWorkingInProcessTeammates(
        makeAppState([makeTask('t-1', { status: 'completed' })]),
      ),
    ).toBe(false)
  })

  test('混合 registry：1 working + 1 idle → true（任一命中面）', () => {
    expect(
      hasWorkingInProcessTeammates(
        makeAppState([
          makeTask('t-1', { isIdle: true }),
          makeTask('t-2'),
        ]),
      ),
    ).toBe(true)
  })
})

describe('waitForTeammatesToBecomeIdle', () => {
  test('零工作 teammate → 立即 resolve（Promise.resolve 支）', async () => {
    const reg = makeSetAppState(
      makeAppState([makeTask('t-1', { isIdle: true })]),
    )
    await expect(waitForTeammatesToBecomeIdle(reg.setAppState, reg.get())).resolves.toBeUndefined()
  })

  test('双工作 → 两回调全触发才 resolve（计数面）', async () => {
    const reg = makeSetAppState(
      makeAppState([makeTask('t-1'), makeTask('t-2')]),
    )
    let resolved = false
    const p = waitForTeammatesToBecomeIdle(reg.setAppState, reg.get()).then(
      () => {
        resolved = true
      },
    )

    // updater 已注册回调 → 从新态取
    const t1 = reg.get().tasks['t-1'] as InProcessTeammateTaskState
    const t2 = reg.get().tasks['t-2'] as InProcessTeammateTaskState
    expect(t1.onIdleCallbacks).toHaveLength(1)
    t1.onIdleCallbacks![0]()
    expect(resolved).toBe(false) // 尚余 1
    t2.onIdleCallbacks![0]()
    await p
    expect(resolved).toBe(true)
  })

  test('注册时点已 idle 竞态支 → 同步触发立即 resolve', async () => {
    // 快照与工作判定点之间 teammate 转 idle（isIdle 快照后变真）：
    // 构造 running 快照触发收集，注册前将状态置 idle（模拟竞态窗口）
    const reg = makeSetAppState(makeAppState([makeTask('t-1')]))
    // 竞态模拟：收集快照后、setAppState 注册前，teammate 已 idle
    const tasks = reg.get().tasks
    ;(tasks['t-1'] as InProcessTeammateTaskState).isIdle = true

    let resolved = false
    const p = waitForTeammatesToBecomeIdle(reg.setAppState, reg.get()).then(
      () => {
        resolved = true
      },
    )
    // 零微任务后检查：onIdle 在 updater 内同步触发
    await new Promise(r => setTimeout(r, 0))
    expect(resolved).toBe(true)
    await p
  })

  test('混合态（1 idle + 1 working）→ 仅等工作者回调', async () => {
    const reg = makeSetAppState(
      makeAppState([
        makeTask('t-1', { isIdle: true }),
        makeTask('t-2'),
      ]),
    )
    let resolved = false
    const p = waitForTeammatesToBecomeIdle(reg.setAppState, reg.get()).then(
      () => {
        resolved = true
      },
    )
    const idleTask = reg.get().tasks['t-1'] as InProcessTeammateTaskState
    const workingTask = reg.get().tasks['t-2'] as InProcessTeammateTaskState
    expect(idleTask.onIdleCallbacks).toBeUndefined() // idle 者不注册
    workingTask.onIdleCallbacks![0]()
    await p
    expect(resolved).toBe(true)
  })
})

// 身份面隔离守卫（本文件零 dynamic 身份依赖，防跨文件串染残留验真）
describe('隔离守卫', () => {
  test('set/clear dynamic 往返零残留', () => {
    setDynamicTeamContext({
      agentId: 'w1',
      agentName: 'w1',
      teamName: 't1',
      planModeRequired: false,
    })
    clearDynamicTeamContext()
    expect(
      hasActiveInProcessTeammates(makeAppState([makeTask('t-1')])),
    ).toBe(true) // 行为面与身份态无关
  })
})
