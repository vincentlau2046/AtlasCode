/**
 * §8.69 analytics 波 unit 层：SDK 事件队列（sdkEventQueue.ts 135L 逐字
 * 移植）+ 生产端 5 站点 rewire 的队列语义（零模型零盘；bootstrap 域门面
 * 控门/会话，STR-1 经 engine 根门面导入队列 4 面 + reset 面）。
 *
 * 覆盖：
 *   Q-P1 enqueueSdkEvent 门控：headless（非交互）入队 / TUI（交互）假早退
 *       （drain 空）
 *   Q-P2 队列 cap 1000 溢出 shift（最旧被挤出，长度恒 1000）
 *   Q-P3 drainSdkEvents：逐条附 uuid + session_id + 清空队列（二次 drain 空）
 *   Q-P4 emitTaskTerminatedSdk task_notification 形状（3 态 + 字段缺省）
 *   Q-P5 resetSdkEventQueueForTesting 对称复位（复位后 drain 空）
 *
 * 型面注：drain 返 `SdkEvent & { uuid; session_id }` 联合，task_id 仅 4 子型
 * 中 3 个持有（session_state_changed 无）→ `'task_id' in ev` 窄化取；
 * task_notification 字段经 subtype 守卫窄化访问。
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'
import {
  drainSdkEvents,
  emitTaskTerminatedSdk,
  enqueueSdkEvent,
  resetSdkEventQueueForTesting,
  type SdkEvent,
} from '../../src/engine'
import { setIsInteractive, switchSession } from '../../src/bootstrap'

const TEST_SESSION = 'test-sess-1'

function taskStartedEvent(id: string): SdkEvent {
  return {
    type: 'system',
    subtype: 'task_started',
    task_id: id,
    description: `task ${id}`,
  }
}

/** 窄化取 task_id（session_state_changed 子型无此字段 → in 守卫）。 */
function taskIdOf(ev: SdkEvent): string | undefined {
  return 'task_id' in ev ? ev.task_id : undefined
}

describe('SDK 事件队列（§8.69 analytics 波）', () => {
  beforeAll(() => {
    // headless（非交互）+ 固定 session id（门 / 会话经 bootstrap 域控）
    setIsInteractive(false)
    switchSession(TEST_SESSION)
  })

  beforeEach(() => {
    resetSdkEventQueueForTesting()
  })

  afterAll(() => {
    // 复位 TUI 默认（交互），避免门态残留（--isolate 单进程独立，防御性）
    setIsInteractive(true)
  })

  test('Q-P1 headless 入队；TUI 假早退', () => {
    // headless（beforeAll 置非交互）：入队成功
    enqueueSdkEvent(taskStartedEvent('a'))
    expect(drainSdkEvents()).toHaveLength(1)

    // TUI（交互）：假早退 → 不入队
    setIsInteractive(true)
    enqueueSdkEvent(taskStartedEvent('b'))
    expect(drainSdkEvents()).toEqual([])

    // 复原 headless（保证后续测独立）
    setIsInteractive(false)
  })

  test('Q-P2 队列 cap 1000 溢出 shift（最旧被挤出）', () => {
    for (let i = 0; i < 1001; i++) {
      enqueueSdkEvent(taskStartedEvent(`t${i}`))
    }
    const drained = drainSdkEvents()
    expect(drained).toHaveLength(1000)
    // 最旧 t0 被挤出，头 = t1；尾仍 t1000
    expect(taskIdOf(drained[0])).toBe('t1')
    expect(taskIdOf(drained[999])).toBe('t1000')
  })

  test('Q-P3 drain 逐条附 uuid + session_id 且清空', () => {
    enqueueSdkEvent(taskStartedEvent('x'))
    const drained = drainSdkEvents()
    expect(drained).toHaveLength(1)
    const [ev] = drained
    expect(ev.session_id).toBe(TEST_SESSION)
    expect(typeof ev.uuid).toBe('string')
    expect(ev.uuid.length).toBe(36) // randomUUID v4
    // 二次 drain 空（已清空）
    expect(drainSdkEvents()).toEqual([])
  })

  test('Q-P4 emitTaskTerminatedSdk task_notification 形状（3 态 + 缺省）', () => {
    emitTaskTerminatedSdk('task-1', 'completed', {
      toolUseId: 'tu-1',
      summary: 'done',
    })
    emitTaskTerminatedSdk('task-2', 'failed')
    emitTaskTerminatedSdk('task-3', 'stopped', {
      outputFile: '/tmp/out',
      usage: { total_tokens: 10, tool_uses: 2, duration_ms: 100 },
    })

    const [c, f, s] = drainSdkEvents()
    // 三事件均 task_notification 子型
    expect([c, f, s].map(e => e.subtype)).toEqual([
      'task_notification',
      'task_notification',
      'task_notification',
    ])

    if (c.subtype === 'task_notification') {
      expect(c.status).toBe('completed')
      expect(c.task_id).toBe('task-1')
      expect(c.tool_use_id).toBe('tu-1')
      expect(c.summary).toBe('done')
      expect(c.output_file).toBe('') // 缺省
    }
    if (f.subtype === 'task_notification') {
      expect(f.status).toBe('failed')
      expect(f.tool_use_id).toBeUndefined()
      expect(f.output_file).toBe('')
      expect(f.summary).toBe('')
      expect(f.usage).toBeUndefined()
    }
    if (s.subtype === 'task_notification') {
      expect(s.status).toBe('stopped')
      expect(s.task_id).toBe('task-3')
      expect(s.output_file).toBe('/tmp/out')
      expect(s.usage).toEqual({ total_tokens: 10, tool_uses: 2, duration_ms: 100 })
    }
  })

  test('Q-P5 resetSdkEventQueueForTesting 对称复位', () => {
    enqueueSdkEvent(taskStartedEvent('r1'))
    enqueueSdkEvent(taskStartedEvent('r2'))
    expect(drainSdkEvents()).toHaveLength(2) // 消费清
    // 再入队 → 复位 → drain 空
    enqueueSdkEvent(taskStartedEvent('r3'))
    resetSdkEventQueueForTesting()
    expect(drainSdkEvents()).toEqual([])
  })
})
