/**
 * #277 格 1 根修切片 §2-5（呈批书 @92bc4445，判词侧 §6-1 让位终裁）：
 * CursorLedger oversized single payload **characterization 锁现行为**——
 * 零行为变更。行为修（issue 前置拒绝 oversized single payload）独立立项
 * 挂账（呈批书 §8-1），不在本切片。零磁盘/零网络。
 */
import { describe, test, expect } from 'bun:test'

import {
  CursorLedger,
  type CursorBinding,
} from '../../src/atlascode/web/cursorLedger'

const binding = (sessionId: string): CursorBinding => ({
  v: 1,
  productId: 'p',
  scopeId: 's',
  sessionId,
  baselineId: 'b',
  generation: 'g',
  revision: 0,
  byteOffset: 0,
  ino: 1,
})

const who = (sessionId: string) => ({ productId: 'p', scopeId: 's', sessionId })

describe('CursorLedger oversized payload characterization（§2-5 现行为锁）', () => {
  test('单 payload > maxPayloadBytes：全淘含 pinned → 静默 overshoot 插账（无回调）', () => {
    // 三参构造不传 onActiveEvict —— 活码 readonlyRuntime.ts 三参构造同形
    const led = new CursorLedger(8, 600_000, 100)
    const t0 = led.issue(binding('a'), 50)
    led.pin(t0)
    const t1 = led.issue(binding('b'), 200) // 50 + 200 > 100：淘 pinned t0 → 仍超 → 空账 break
    // pinned 被淘 = 静默（onActiveEvict 未接线，§8-2 悬空承诺）：verify → unknown
    expect(led.verify(t0, who('a'))).toMatchObject({ ok: false, why: 'unknown' })
    expect(led.size()).toBe(1)
    // overshoot 本体静默：超帽 200 仍插账（无前置拒绝 —— §8-1 行为修挂账面）
    expect(led.totalPayloadBytes()).toBe(200)
    expect(led.verify(t1, who('b')).ok).toBe(true)
  })

  test('对照腿：四参构造 onActiveEvict 定义面 → pinned 淘汰回调可达（接线另案 §8-2）', () => {
    const evicted: string[] = []
    const led = new CursorLedger(8, 600_000, 100, token => {
      evicted.push(token)
    })
    const t0 = led.issue(binding('a'), 50)
    led.pin(t0)
    led.issue(binding('b'), 200)
    expect(evicted).toEqual([t0])
  })
})
