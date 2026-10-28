/**
 * 0.1.82 K3-A1 判别单测：TUI 侧有界并发机件。
 *
 * - runWithConcurrencyLimit（generators.ts 新 helper，executeHooksOutsideREPL
 *   落点）：惰性 thunk 有界工作池，结果保持输入序（Promise.all 结果序语义）。
 *   红基线 = 8404fd0：helper 不存在（导出面红）。
 * - all(generators, concurrencyCap) 既有参数面锁定：cap 生效 + 全量产出
 *   （executeHooks 落点只差传参，本测锁定机件语义不回归）。
 */
import { describe, test, expect } from 'bun:test'
import {
  all,
  fromArray,
  runWithConcurrencyLimit,
  toArray,
} from '../../src/tui/utils/generators'

describe('K3-A1 runWithConcurrencyLimit（executeHooksOutsideREPL 落点机件）', () => {
  test('① 有界池：20 任务峰值并发 ≤ 12 + 结果输入序 + 全量完成', async () => {
    let inFlight = 0
    let peak = 0
    const tasks = Array.from({ length: 20 }, (_, i) => async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return i
    })

    const results = await runWithConcurrencyLimit(tasks, 12)

    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i))
    expect(peak).toBeLessThanOrEqual(12)
    expect(peak).toBeGreaterThan(1) // 确实并行（>1 排除顺序退化为 1 的假绿）
  })

  test('② 惰性：未到槽位的 thunk 不启动（20 任务只前 12 个先动）', async () => {
    const started: number[] = []
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const tasks = Array.from({ length: 20 }, (_, i) => async () => {
      started.push(i)
      await gate
      return i
    })

    const promise = runWithConcurrencyLimit(tasks, 12)
    // 让工作池进入运行态但门不放开
    await new Promise((r) => setTimeout(r, 10))
    expect(started).toHaveLength(12) // 只有前 12 个被拾起（修前无此 helper 红）
    release()
    const results = await promise
    expect(results).toHaveLength(20)
  })

  test('③ 边界：空任务数组 → 空结果；limit ≥ 任务数 → 全并行', async () => {
    expect(await runWithConcurrencyLimit([], 12)).toEqual([])
    const results = await runWithConcurrencyLimit(
      [async () => 'a', async () => 'b', async () => 'c'],
      12,
    )
    expect(results).toEqual(['a', 'b', 'c'])
  })

  test('④ 异常传播：任务 reject 冒泡（不静默吞）', async () => {
    const tasks = [
      async () => 'ok',
      async () => {
        throw new Error('boom')
      },
    ]
    await expect(runWithConcurrencyLimit(tasks, 12)).rejects.toThrow('boom')
  })
})

describe('K3-A1 all(generators, concurrencyCap) 既有机件锁定', () => {
  test('⑤ cap=12：15 个惰性生成器全量产出（executeHooks 落点传参前置锁定）', async () => {
    let started = 0
    const generators = Array.from({ length: 15 }, (_, i) =>
      (async function* () {
        started++
        await new Promise((r) => setTimeout(r, 5))
        yield i
      })(),
    )
    const results = await toArray(all(generators, 12))
    expect(results.sort((a, b) => a - b)).toEqual(Array.from({ length: 15 }, (_, i) => i))
    expect(started).toBe(15)
  })

  test('⑥ fromArray + all 无 cap 恒等（既有面零回归）', async () => {
    const results = await toArray(all([fromArray([1, 2, 3])]))
    expect(results).toEqual([1, 2, 3])
  })
})
