/**
 * messaging 域入轮命令队列 unit 测试（E-7 S-7e d2，§8.50）：纯内存模块级
 * 队列全 30 值导出面（订阅族 / 读面 / 优先级 + FIFO 出队族 / remove 族 /
 * clear·reset / editable-visible 守卫 / popAllEditable 双源 + 图片提取 /
 * pending-notifications 别名面 8 / getCommandsByMaxPriority / isSlashCommand
 *）。
 *
 * 分层纪律：unit 零磁盘（队列纯内存 + signal，无 fs / 无网络）。模块级
 * commandQueue 态隔离 = beforeEach resetCommandQueue（reset 不清 signal
 * 监听器——各测自持订阅并在测内退订，无跨测泄漏）。
 *
 * 探针锚点（§8.50 d2 详案 + 执行前分析 bb570f4，突变须恰好 1 红）：
 *   P-M4 getCommandsByMaxPriority 过滤支（删 `PRIORITY_ORDER[cmd.priority
 *    ?? 'next'] <= threshold` 条件 → 退化全队列拷贝）→ 'P-M4
 *    getCommandsByMaxPriority 优先级过滤' 恰 1 红。
 *   P-M5 enqueue 默认优先级支（删 `priority: command.priority ?? 'next'`
 *    spread → 原样 push）→ 'P-M5 enqueue 默认优先级 next' 恰 1 红（本文件
 *    其余测试的排序/优先级断言全部显式传 priority，不依赖缺省支）。
 *
 * 类型面导出（SetAppState / PopAllEditableResult / queueTypes 9 型）= 纯
 * 类型，零运行时面——测试经编译期 import 消费（QueuedCommand /
 * PromptInputMode / QueuePriority / PastedContent 构造字面量即类型断言），
 * 无运行时断言可写（登记，非遗漏）。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  subscribeToCommandQueue,
  getCommandQueueSnapshot,
  getCommandQueue,
  getCommandQueueLength,
  hasCommandsInQueue,
  recheckCommandQueue,
  enqueue,
  enqueuePendingNotification,
  dequeue,
  dequeueAll,
  peek,
  dequeueAllMatching,
  remove,
  removeByFilter,
  clearCommandQueue,
  resetCommandQueue,
  isPromptInputModeEditable,
  isQueuedCommandEditable,
  isQueuedCommandVisible,
  popAllEditable,
  subscribeToPendingNotifications,
  getPendingNotificationsSnapshot,
  hasPendingNotifications,
  getPendingNotificationsCount,
  recheckPendingNotifications,
  dequeuePendingNotification,
  resetPendingNotifications,
  clearPendingNotifications,
  getCommandsByMaxPriority,
  isSlashCommand,
  type QueuedCommand,
  type PromptInputMode,
  type QueuePriority,
  type PastedContent,
} from '../../src/engine'
import type { ContentBlockParam } from '../../src/shared'

const cmd = (
  value: QueuedCommand['value'],
  extra: Partial<QueuedCommand> = {},
): QueuedCommand => ({
  value,
  mode: 'prompt' as PromptInputMode,
  ...extra,
})

beforeEach(() => {
  resetCommandQueue()
})

// ── 订阅族（useSyncExternalStore 兼容面）─────────────────────────────────
describe('订阅族', () => {
  test('snapshot 冻结 + 引用稳定（变更时换引用）', () => {
    const s1 = getCommandQueueSnapshot()
    expect(Object.isFrozen(s1)).toBe(true)
    expect(s1).toHaveLength(0)
    enqueue(cmd('a', { priority: 'now' }))
    const s2 = getCommandQueueSnapshot()
    expect(s2).not.toBe(s1)
    expect(s2).toHaveLength(1)
    expect(getCommandQueueSnapshot()).toBe(s2)
  })

  test('recheckCommandQueue 非空才通知 + 退订', () => {
    let calls = 0
    const unsub = subscribeToCommandQueue(() => {
      calls++
    })
    recheckCommandQueue() // 空队列 → 不通知
    expect(calls).toBe(0)
    enqueue(cmd('a', { priority: 'now' })) // enqueue 自身通知
    expect(calls).toBe(1)
    recheckCommandQueue()
    expect(calls).toBe(2)
    unsub()
    recheckCommandQueue()
    expect(calls).toBe(2)
  })
})

// ── 读面 ────────────────────────────────────────────────────────────────
describe('读面', () => {
  test('getCommandQueue 返回拷贝（改拷贝不动队列）', () => {
    enqueue(cmd('a', { priority: 'now' }))
    const copy = getCommandQueue()
    copy.length = 0
    expect(hasCommandsInQueue()).toBe(true)
    expect(getCommandQueueLength()).toBe(1)
  })

  test('getCommandQueueLength / hasCommandsInQueue', () => {
    expect(getCommandQueueLength()).toBe(0)
    expect(hasCommandsInQueue()).toBe(false)
    enqueue(cmd('a', { priority: 'now' }))
    enqueue(cmd('b', { priority: 'now' }))
    expect(getCommandQueueLength()).toBe(2)
    expect(hasCommandsInQueue()).toBe(true)
  })
})

// ── 入队族 ──────────────────────────────────────────────────────────────
describe('入队族', () => {
  test('P-M5 enqueue 默认优先级 next', () => {
    // P-M5 探针锚点（删 priority 默认支 → 恰 1 红）
    enqueue(cmd('a'))
    expect(getCommandQueue()[0]!.priority).toBe('next')
    enqueue(cmd('b', { priority: 'later' }))
    expect(getCommandQueue()[1]!.priority).toBe('later')
  })

  test('enqueuePendingNotification 默认优先级 later', () => {
    enqueuePendingNotification(cmd('n'))
    expect(getCommandQueue()[0]!.priority).toBe('later')
    enqueuePendingNotification(cmd('m', { priority: 'now' }))
    expect(getCommandQueue()[1]!.priority).toBe('now')
  })
})

// ── 出队族 ──────────────────────────────────────────────────────────────
describe('出队族', () => {
  test('dequeue 优先级 now > next > later', () => {
    enqueue(cmd('L', { priority: 'later' }))
    enqueue(cmd('N', { priority: 'next' }))
    enqueue(cmd('NOW', { priority: 'now' }))
    expect(dequeue()!.value).toBe('NOW')
    expect(dequeue()!.value).toBe('N')
    expect(dequeue()!.value).toBe('L')
    expect(dequeue()).toBeUndefined()
  })

  test('dequeue 同优先级 FIFO', () => {
    enqueue(cmd('a', { priority: 'next' }))
    enqueue(cmd('b', { priority: 'next' }))
    enqueue(cmd('c', { priority: 'next' }))
    expect(dequeue()!.value).toBe('a')
    expect(dequeue()!.value).toBe('b')
    expect(dequeue()!.value).toBe('c')
  })

  test('dequeue filter 收窄（非匹配滞留）', () => {
    enqueue(cmd('main', { priority: 'now' }))
    enqueue(cmd('agent', { priority: 'now', agentId: 'a1@t' }))
    const d = dequeue(c => c.agentId === undefined)
    expect(d!.value).toBe('main')
    expect(getCommandQueueLength()).toBe(1)
    expect(getCommandQueue()[0]!.value).toBe('agent')
  })

  test('dequeue filter 全排除 → undefined（队列不动）', () => {
    enqueue(cmd('a', { priority: 'now' }))
    expect(dequeue(c => c.value === 'zzz')).toBeUndefined()
    expect(hasCommandsInQueue()).toBe(true)
  })

  test('dequeueAll 全出（队列序）+ 空队列 []', () => {
    expect(dequeueAll()).toEqual([])
    enqueue(cmd('a', { priority: 'now' }))
    enqueue(cmd('b', { priority: 'now' }))
    const all = dequeueAll()
    expect(all.map(c => c.value)).toEqual(['a', 'b'])
    expect(hasCommandsInQueue()).toBe(false)
  })

  test('peek 不取出 + filter + 空队列 undefined', () => {
    enqueue(cmd('L', { priority: 'later' }))
    enqueue(cmd('NOW', { priority: 'now' }))
    expect(peek()!.value).toBe('NOW')
    expect(getCommandQueueLength()).toBe(2)
    expect(peek(c => c.value === 'L')!.value).toBe('L')
    resetCommandQueue()
    expect(peek()).toBeUndefined()
  })

  test('dequeueAllMatching 匹配移除 + 非匹配滞留 + 全不匹配 []', () => {
    enqueue(cmd('a', { priority: 'now', agentId: 'x' }))
    enqueue(cmd('b', { priority: 'next', agentId: 'x' }))
    enqueue(cmd('c', { priority: 'later' }))
    const matched = dequeueAllMatching(c => c.agentId === 'x')
    expect(matched.map(c => c.value)).toEqual(['a', 'b'])
    expect(getCommandQueue().map(c => c.value)).toEqual(['c'])
    expect(dequeueAllMatching(c => c.value === 'zzz')).toEqual([])
    expect(getCommandQueueLength()).toBe(1)
  })
})

// ── remove 族 ───────────────────────────────────────────────────────────
describe('remove 族', () => {
  test('remove 引用恒等 + 空数组 no-op', () => {
    enqueue(cmd('a', { priority: 'now' }))
    enqueue(cmd('b', { priority: 'now' }))
    const [aRef] = getCommandQueue()
    let notified = 0
    const unsub = subscribeToCommandQueue(() => notified++)
    remove([aRef!])
    expect(notified).toBe(1)
    expect(getCommandQueue().map(c => c.value)).toEqual(['b'])
    remove([]) // 空 → 早退（不通知）
    expect(notified).toBe(1)
    unsub()
  })

  test('removeByFilter 队序返回 + 非匹配滞留', () => {
    enqueue(cmd('a', { priority: 'now' }))
    enqueue(cmd('b', { priority: 'now' }))
    enqueue(cmd('c', { priority: 'now' }))
    const removed = removeByFilter(c => c.value !== 'b')
    expect(removed.map(c => c.value)).toEqual(['a', 'c'])
    expect(getCommandQueue().map(c => c.value)).toEqual(['b'])
    expect(removeByFilter(() => false)).toEqual([])
  })
})

// ── clear / reset ───────────────────────────────────────────────────────
describe('clear / reset', () => {
  test('clearCommandQueue 清空 + 通知 + 空队列早退', () => {
    enqueue(cmd('a', { priority: 'now' }))
    let notified = 0
    const unsub = subscribeToCommandQueue(() => notified++)
    clearCommandQueue()
    expect(notified).toBe(1)
    expect(hasCommandsInQueue()).toBe(false)
    clearCommandQueue() // 空 → 早退不通知
    expect(notified).toBe(1)
    unsub()
  })

  test('resetCommandQueue 清队列 + 重置快照', () => {
    enqueue(cmd('a', { priority: 'now' }))
    resetCommandQueue()
    expect(hasCommandsInQueue()).toBe(false)
    const s = getCommandQueueSnapshot()
    expect(s).toHaveLength(0)
    expect(Object.isFrozen(s)).toBe(true)
  })
})

// ── editable-visible 守卫 ───────────────────────────────────────────────
describe('editable-visible 守卫', () => {
  test('isPromptInputModeEditable 4 模式', () => {
    expect(isPromptInputModeEditable('bash')).toBe(true)
    expect(isPromptInputModeEditable('prompt')).toBe(true)
    expect(isPromptInputModeEditable('orphaned-permission')).toBe(true)
    expect(isPromptInputModeEditable('task-notification')).toBe(false)
  })

  test('isQueuedCommandEditable / isQueuedCommandVisible（isMeta 抑制）', () => {
    expect(isQueuedCommandEditable(cmd('x'))).toBe(true)
    expect(isQueuedCommandVisible(cmd('x'))).toBe(true)
    expect(isQueuedCommandEditable(cmd('x', { isMeta: true }))).toBe(false)
    expect(
      isQueuedCommandVisible(cmd('x', { mode: 'task-notification' })),
    ).toBe(false)
  })
})

// ── popAllEditable ──────────────────────────────────────────────────────
describe('popAllEditable', () => {
  test('字符串拼接 + cursorOffset + task-notification 滞留', () => {
    enqueue(cmd('second', { priority: 'next' }))
    enqueue(cmd('first', { priority: 'now' }))
    enqueue(cmd('notify', { mode: 'task-notification' }))
    const r = popAllEditable('current', 3)
    expect(r!.text).toBe('second\nfirst\ncurrent')
    // cursorOffset = queuedTexts.join('\n').length + 1 + currentCursorOffset
    expect(r!.cursorOffset).toBe('second\nfirst'.length + 1 + 3)
    expect(r!.images).toEqual([])
    const rest = getCommandQueue()
    expect(rest).toHaveLength(1)
    expect(rest[0]!.value).toBe('notify')
  })

  test('空 currentInput 被 filter(Boolean) 滤除', () => {
    enqueue(cmd('only', { priority: 'now' }))
    const r = popAllEditable('', 0)
    expect(r!.text).toBe('only')
    expect(r!.cursorOffset).toBe('only'.length + 1)
  })

  test('ContentBlockParam[] 值文本提取（块间 \\n 分隔）', () => {
    enqueue(
      cmd(
        [
          { type: 'text', text: 'block1' },
          { type: 'text', text: 'block2' },
        ] as ContentBlockParam[],
        { priority: 'now' },
      ),
    )
    const r = popAllEditable('cur', 0)
    expect(r!.text).toBe('block1\nblock2\ncur')
  })

  test('pastedContents 图片 id 保留（text 项跳过）', () => {
    const pasted: Record<number, PastedContent> = {
      7: { id: 7, type: 'image', content: 'AAA' },
      8: { id: 8, type: 'text', content: 'hello' },
    }
    enqueue(cmd('pasted', { priority: 'now', pastedContents: pasted }))
    const r = popAllEditable('', 0)
    expect(r!.images).toEqual([{ id: 7, type: 'image', content: 'AAA' }])
  })

  test('内嵌 base64 图片块提取（content/mediaType/filename 映射）', () => {
    enqueue(
      cmd(
        [
          { type: 'text', text: 'hi' },
          {
            type: 'image',
            source: { type: 'base64', data: 'DATA', media_type: 'image/png' },
          },
        ] as ContentBlockParam[],
        { priority: 'now' },
      ),
    )
    const r = popAllEditable('', 0)
    expect(r!.images).toHaveLength(1)
    const img = r!.images[0]!
    expect(img.type).toBe('image')
    expect(img.content).toBe('DATA')
    expect(img.mediaType).toBe('image/png')
    expect(img.filename).toBe('image1')
    // id 基 = Date.now()（非确定）→ 仅断言整数 + 非负
    expect(Number.isInteger(img.id)).toBe(true)
  })

  test('空队列 / 全不可编辑 → undefined', () => {
    expect(popAllEditable('x', 0)).toBeUndefined()
    enqueue(cmd('n', { mode: 'task-notification' }))
    expect(popAllEditable('x', 0)).toBeUndefined()
    // 队列内容不动（无可编辑项 → 早退，不清队列）
    expect(getCommandQueueLength()).toBe(1)
  })
})

// ── pending-notifications 别名面（8 个 deprecated）─────────────────────
describe('pending-notifications 别名面', () => {
  test('const 别名引用恒等 + 包装别名行为委托', () => {
    expect(hasPendingNotifications).toBe(hasCommandsInQueue)
    expect(getPendingNotificationsCount).toBe(getCommandQueueLength)
    expect(recheckPendingNotifications).toBe(recheckCommandQueue)
    expect(resetPendingNotifications).toBe(resetCommandQueue)
    expect(clearPendingNotifications).toBe(clearCommandQueue)
    expect(subscribeToPendingNotifications).toBe(subscribeToCommandQueue)
    enqueue(cmd('a', { priority: 'now' }))
    expect(getPendingNotificationsSnapshot()).toHaveLength(1)
    expect(dequeuePendingNotification()!.value).toBe('a')
  })
})

// ── getCommandsByMaxPriority / isSlashCommand ───────────────────────────
describe('getCommandsByMaxPriority / isSlashCommand', () => {
  test('P-M4 getCommandsByMaxPriority 优先级过滤', () => {
    // P-M4 探针锚点（删过滤支 → 退化全队列拷贝 → 恰 1 红）
    enqueue(cmd('a', { priority: 'later' }))
    enqueue(cmd('b', { priority: 'now' }))
    enqueue(cmd('c', { priority: 'next' }))
    const q = getCommandQueue()
    // 队序返回（filter 保序）
    expect(getCommandsByMaxPriority('now').map(c => c.value)).toEqual(['b'])
    expect(getCommandsByMaxPriority('next').map(c => c.value)).toEqual([
      'b',
      'c',
    ])
    expect(getCommandsByMaxPriority('later').map(c => c.value)).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(getCommandsByMaxPriority('later')).toHaveLength(q.length)
  })

  test('isSlashCommand 3 支 + skipSlashCommands 抑制', () => {
    expect(isSlashCommand(cmd('/commit'))).toBe(true)
    expect(isSlashCommand(cmd('  /commit'))).toBe(true)
    expect(isSlashCommand(cmd('commit'))).toBe(false)
    expect(
      isSlashCommand(cmd([{ type: 'text', text: '/x' }] as ContentBlockParam[])),
    ).toBe(false)
    expect(isSlashCommand(cmd('/commit', { skipSlashCommands: true }))).toBe(
      false,
    )
  })
})

// ── 类型面消费（编译期断言，零运行时面）────────────────────────────────
describe('类型面（编译期）', () => {
  test('QueuedCommand 全字段可构造（含类型面 9 型引用）', () => {
    const c: QueuedCommand = {
      value: '/x',
      mode: 'bash',
      priority: 'now',
      uuid: 'u-1',
      orphanedPermission: { permissionResult: null, assistantMessage: {} },
      pastedContents: { 1: { id: 1, type: 'text', content: 't' } },
      preExpansionValue: 'raw',
      skipSlashCommands: true,
      bridgeOrigin: true,
      isMeta: true,
      origin: 'bridge',
      workload: 'w1',
      agentId: 'a@t',
    }
    const p: QueuePriority = 'next'
    expect(p).toBe('next')
    expect(c.agentId).toBe('a@t')
  })
})
