/**
 * atlascode/state（D 波 S-E2d 提交 2，B13 setAppState 置换）unit 测试。
 *
 * 被测能力（src/atlascode/state/index.ts）：
 *   - createAppState 缺省快照面（最小全新 TPC + 空 mcp + effort 'medium'
 *     预解析形 + advisorModel undefined + 空 tasks）/ 自定义 initial
 *   - AppState.set 串行 functional-update（M3a.3 不变量：f 恒看最新
 *     committed prev / 每次 apply 即提交不批处理合并 / 100 次零丢失 /
 *     updater 抛错 reject 该调用方 + state 不变 + 队列继续 drain）
 *   - port 面（SessionContextPort）= fire-and-forget 形（旧仓 React
 *     setState ground truth：同步 get 可先于提交 = 中间态可观测，非假
 *     通过断言——提交边界经宏任务 flush 后核验）
 *
 * 分层纪律：unit 层零 fs / 零网络 / 零模型（纯 store 原语，EngineState
 * co-located 并发不变量见 tests/unit/engine-state.test.ts，本文件测
 * atlascode 组合面（缺省面 + awaitable 形 + port fire-and-forget 形），
 * 不重测 engine 域原语本身）。
 *
 * compose ⑩ 注入面（createCoreDependencies → core.appState /
 * setSessionContextPort(appState.port)）= func 层（真装配），见
 * tests/func/b6-func-smoke.test.ts B13 块。
 */
import { describe, expect, test } from 'bun:test'
import { createAppState, type AppState } from '../../src/atlascode'
import type { SessionSnapshot } from '../../src/engine'

/** 宏任务 flush（EngineState 队列 drain 全微任务链）——fire-and-forget
 * port 面提交边界核验用。 */
function flushMacrotask(): Promise<void> {
  return new Promise(r => setTimeout(r, 0))
}

/** TaskState 全字段 fixture（shared/types-session.ts TaskStateBase 冻结面：
 * TaskType = string / TaskStatus 4 值；无 cast 假绿）。 */
function taskState(id: string): SessionSnapshot['tasks'][string] {
  return {
    id,
    type: 'local_bash',
    status: 'running',
    description: `desc-${id}`,
    startTime: 0,
    outputFile: `/tmp/out-${id}`,
    outputOffset: 0,
    notified: false,
  }
}

describe('createAppState 缺省/初始面', () => {
  test('缺省快照 = 最小全新 TPC + 空 mcp + effort 预解析 + 空 tasks', () => {
    const s = createAppState().get()
    expect(s.toolPermissionContext).toEqual({
      mode: 'default',
      additionalWorkingDirectories: new Map(),
      alwaysAllowRules: {},
      alwaysDenyRules: {},
      alwaysAskRules: {},
      isBypassPermissionsModeAvailable: false,
    })
    expect(s.mcp).toEqual({ tools: [], clients: [] })
    expect(s.effortValue).toBe('medium') // 预解析形（旧 undefined + 消费时回落 → 终值）
    expect(s.advisorModel).toBeUndefined()
    expect(s.tasks).toEqual({})
  })

  test('自定义 initial = view 语义（get 返回持有引用，不做深拷贝）', () => {
    const initial: SessionSnapshot = {
      toolPermissionContext: createAppState().get().toolPermissionContext,
      mcp: { tools: [], clients: [] },
      effortValue: 'high',
      advisorModel: 'adv-1',
      tasks: {},
    }
    const app = createAppState(initial)
    expect(app.get()).toBe(initial)
  })
})

describe('AppState.set 串行 functional-update（awaitable 形）', () => {
  test('100 次串行 set 零丢失（M3a.3 不变量，f 看最新 committed prev）', async () => {
    const app = createAppState()
    for (let i = 0; i < 100; i++) {
      await app.set(prev => ({
        ...prev,
        tasks: { ...prev.tasks, [String(i)]: taskState(String(i)) },
      }))
    }
    expect(Object.keys(app.get().tasks)).toHaveLength(100)
  })

  test('两 set 排队未 await：后者 f 看前者 committed 结果（不批处理合并）', async () => {
    const app = createAppState()
    const p1 = app.set(prev => ({
      ...prev,
      tasks: { ...prev.tasks, a: taskState('a') },
    }))
    const p2 = app.set(prev => ({
      ...prev,
      tasks: { ...prev.tasks, b: taskState('b') },
    }))
    await p1
    await p2
    // 若 f2 看的是 f1 前 prev（丢更新），'a' 将被 f2 的展开冲掉
    expect(Object.keys(app.get().tasks).sort()).toEqual(['a', 'b'])
  })

  test('updater 抛错：reject 该调用方 + state 不变 + 队列继续 drain', async () => {
    const app = createAppState()
    const committed = app.get()
    const bad = app.set(() => {
      throw new Error('boom')
    })
    await expect(bad).rejects.toThrow('boom')
    expect(app.get()).toBe(committed) // state 未动（引用相等，无半提交）
    // 队列未卡死：后续 set 正常提交
    await app.set(prev => ({
      ...prev,
      tasks: { ...prev.tasks, after: taskState('after') },
    }))
    expect(Object.keys(app.get().tasks)).toEqual(['after'])
  })
})

describe('port 面（SessionContextPort fire-and-forget 形）', () => {
  test('port.set 同步返回 + 同步 get 先于提交（中间态可观测，非假通过）', async () => {
    const app = createAppState()
    const before = app.get()
    app.port.set(prev => ({
      ...prev,
      tasks: { ...prev.tasks, x: taskState('x') },
    }))
    // 同步面：set 入队即返回（未提交）→ get 仍见 committed prev（旧 React
    // setState 等价语义；若此处断言已提交 = 与 ground truth 相悖的假绿）
    expect(app.get()).toBe(before)
    await flushMacrotask()
    expect(Object.keys(app.get().tasks)).toEqual(['x'])
  })

  test('port 面两次 fire-and-forget 排队 → 双提交零丢失', async () => {
    const app = createAppState()
    app.port.set(prev => ({
      ...prev,
      tasks: { ...prev.tasks, p1: taskState('p1') },
    }))
    app.port.set(prev => ({
      ...prev,
      tasks: { ...prev.tasks, p2: taskState('p2') },
    }))
    await flushMacrotask()
    expect(Object.keys(app.get().tasks).sort()).toEqual(['p1', 'p2'])
  })

  test('port.get 与 appState.get 同源（同一 EngineState 持面）', async () => {
    const app: AppState = createAppState()
    await app.set(prev => ({ ...prev, advisorModel: 'adv-2' }))
    expect(app.port.get().advisorModel).toBe('adv-2')
    expect(app.port.get()).toBe(app.get())
  })
})
