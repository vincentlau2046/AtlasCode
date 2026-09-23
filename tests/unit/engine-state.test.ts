/**
 * engine/state EngineState set(f) 串行 apply 队列 并发正确性测试（§8.21 E-1 T-3）。
 *
 * 被测能力 = R3a 并发模型（set(f) 队列是 setAppState 串行性的同构迁移）：
 * 并发 set 零丢失 / f 看最新 prev / 不同键可交换 / 不批处理合并 / rewind 串行化。
 * 非 tautology：断言的是 store 的并发调度语义，非 fake 自证。
 * I/O-free（无盘 / 无网络 / 无 PTY）→ unit 层。
 *
 * 来源：M3a.3 原型 9/9 绿（/tmp/m3a3-prototype.ts，throwaway）转正为 co-located 单测。
 */
import { describe, test, expect } from 'bun:test'
import { EngineState } from '../../src/engine'

describe('engine/state EngineState set(f) 串行 apply 队列', () => {
  test('① 100 并发 set(prev => prev.count + 1) → count=100（零丢失）', async () => {
    const es = new EngineState<{ count: number }>({ count: 0 })
    await Promise.all(
      Array.from({ length: 100 }, () => es.set((prev) => ({ count: prev.count + 1 }))),
    )
    expect(es.get().count).toBe(100)
  })

  test('② 并发 append 3 → 全在场（f 看最新 committed prev，非陈旧快照覆盖）', async () => {
    const es = new EngineState<{ log: string[] }>({ log: [] })
    await Promise.all([
      es.set((prev) => ({ log: [...prev.log, 'A'] })),
      es.set((prev) => ({ log: [...prev.log, 'B'] })),
      es.set((prev) => ({ log: [...prev.log, 'C'] })),
    ])
    const log = es.get().log
    expect(log).toHaveLength(3)
    expect(new Set(log).size).toBe(3)
  })

  test('③ 并行 Edit 不同键 → 全在场（可交换）', async () => {
    type FH = Record<string, { edits: number }>
    const es = new EngineState<FH>({})
    await Promise.all([
      es.set((prev) => ({ ...prev, 'fileA.ts': { edits: (prev['fileA.ts']?.edits ?? 0) + 1 } })),
      es.set((prev) => ({ ...prev, 'fileB.ts': { edits: (prev['fileB.ts']?.edits ?? 0) + 1 } })),
      es.set((prev) => ({ ...prev, 'fileC.ts': { edits: (prev['fileC.ts']?.edits ?? 0) + 1 } })),
    ])
    const fh = es.get()
    expect(Object.keys(fh)).toHaveLength(3)
    expect(fh['fileA.ts'].edits).toBe(1)
    expect(fh['fileB.ts'].edits).toBe(1)
    expect(fh['fileC.ts'].edits).toBe(1)
  })

  test('④ 不批处理合并：每次 set 独立提交，中间态可观测（与 React 差异），最终态正确', async () => {
    const es = new EngineState<{ count: number }>({ count: 0 })
    await es.set((prev) => ({ count: prev.count + 1 }))
    const observedAfterF1 = es.get().count // 中间态可观测（React 批处理下不可观测）
    await es.set((prev) => ({ count: prev.count + 1 }))
    expect(observedAfterF1).toBe(1)
    expect(es.get().count).toBe(2)
  })

  test('⑤ 反例守卫：朴素 read-compute-write（非函数式/无队列）并发丢更新 → 证明队列+函数式是安全来源', async () => {
    let naiveCount = 0
    async function naiveInc(): Promise<void> {
      const snapshot = naiveCount // 读快照
      await Promise.resolve() // 异步边界 → 其他 op 插队
      naiveCount = snapshot + 1 // 写回基于快照（非最新）→ 丢更新
    }
    await Promise.all(Array.from({ length: 100 }, () => naiveInc()))
    // 守卫：朴素模式 < 100（若非 <100 说明并发模型已失效，队列不再是安全来源）
    expect(naiveCount).toBeLessThan(100)
  })

  test('⑤b updater 抛错：reject 调用方（不挂起）+ state 不变 + 后续 set 照常 drain（队列不卡死）', async () => {
    const es = new EngineState<{ count: number }>({ count: 0 })
    const rejected: unknown[] = []
    const throwing = es.set(() => {
      throw new Error('boom')
    })
    const guard = throwing.then(
      () => {
        throw new Error('throwing updater should reject')
      },
      (e: unknown) => {
        rejected.push(e)
      },
    )
    // 抛错 updater 之后入队的 set 照常提交（串行 drain 不被卡死）
    await es.set((prev) => ({ count: prev.count + 1 }))
    await guard
    expect(rejected[0]).toBeInstanceOf(Error)
    expect((rejected[0] as Error).message).toBe('boom')
    expect(es.get().count).toBe(1) // 抛错未改 state，后续 +1 已 apply
  })

  test('⑥ rewind(undo) 与 Edit 并发 → 串行化，两顺序均合法（非数据损坏）', async () => {
    type State = { log: string[] }
    const es = new EngineState<State>({ log: ['init'] })
    const editOp = es.set((prev) => ({ log: [...prev.log, 'edit'] }))
    const rewindOp = es.set((prev) => {
      if (prev.log.length <= 1) return prev // rewind 无可撤时不崩
      return { log: prev.log.slice(0, -1) }
    })
    await Promise.all([editOp, rewindOp])
    const log = es.get().log
    // edit-then-rewind → ["init"]；rewind-then-edit → ["init","edit"]，两顺序均合法
    const serialized = JSON.stringify(log)
    expect(serialized === JSON.stringify(['init']) || serialized === JSON.stringify(['init', 'edit'])).toBe(true)
  })
})
