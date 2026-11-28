/**
 * W-FC-1（工单 docs/2026-11-28-wfc1-ledger-evict-ticket.md §2 判据格
 * ledger 直测腿；T4 接线 runtime observable / T6 载体账归 e2e lane）：
 * 修形 1 issue 前置拒绝（T1 零副作用 + T2 守恒不变量）+ 修形 2
 * onActiveEvict 回调合同（T3 三断言）。取代 #277 切片 §2-5 旧
 * characterization（其头注明言「行为修独立立项挂账（呈批书 §8-1）」——
 * 本波即该行为修，旧静默 overshoot 行为随之销项）。零磁盘/零网络。
 */
import { describe, test, expect } from 'bun:test'

import {
  CursorLedger,
  type CursorBinding,
} from '../../src/atlascode/web/cursorLedger'
import { WebSessionError } from '../../src/atlascode/web/errors'

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

// ── 修形 1 · T1 oversized 前置拒绝（零副作用锁 throw-before-evict 放置）──────

describe('CursorLedger oversized payload 前置拒绝（W-FC-1 修形 1 / T1）', () => {
  test('T1 oversized 显性拒绝：resourceLimit throw + 判前判后恒等 + 零回调', () => {
    const evicted: string[] = []
    const led = new CursorLedger(8, 600_000, 100, (token, b) => {
      evicted.push(`${token}:${b.sessionId}`)
    })
    const t0 = led.issue(binding('a'), 50)
    led.pin(t0)
    const sizeBefore = led.size()
    const bytesBefore = led.totalPayloadBytes()
    let err: unknown
    try {
      led.issue(binding('b'), 200) // 200 > 100：evictForInsert 之前拒绝
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(WebSessionError)
    expect((err as WebSessionError).code).toBe('resourceLimit')
    expect((err as Error).message).toContain('ledger payload exceeds cap')
    // 零副作用：pinned t0 未被误淘（pinned victim 零误触发回调）、
    // entries/payloadBytes 账面恒等
    expect(led.verify(t0, who('a')).ok).toBe(true)
    expect(led.size()).toBe(sizeBefore)
    expect(led.totalPayloadBytes()).toBe(bytesBefore)
    expect(evicted).toEqual([])
  })

  test('边界：payload == max 恰在界内（不拒绝，> 才拒）', () => {
    const led = new CursorLedger(4, 600_000, 100)
    const t = led.issue(binding('a'), 100)
    expect(led.verify(t, who('a')).ok).toBe(true)
    expect(led.totalPayloadBytes()).toBe(100)
  })
})

// ── 修形 1 · T2 守恒不变量（属性化）─────────────────────────────────────────

describe('CursorLedger 守恒不变量（W-FC-1 修形 1 / T2）', () => {
  test('T2 成功 issue 后 totalPayloadBytes ≤ max 且 size ≤ capacity（capacity≥1/max≥0）', () => {
    for (const [capacity, max] of [
      [1, 0],
      [3, 100],
      [8, 250],
    ] as const) {
      // 前置（工单 §2-T2 判据）：capacity ≥ 1 / max ≥ 0
      expect(capacity).toBeGreaterThanOrEqual(1)
      expect(max).toBeGreaterThanOrEqual(0)
      const led = new CursorLedger(capacity, 600_000, max)
      for (let i = 0; i < 40; i++) {
        // ∈ [0, max] → 不触前置拒绝，纯走淘汰路径
        const b = Math.floor(Math.random() * (max + 1))
        led.issue(binding(`s${i}`), b)
        expect(led.totalPayloadBytes()).toBeLessThanOrEqual(max)
        expect(led.size()).toBeLessThanOrEqual(capacity)
      }
    }
  })
})

// ── 修形 2 · T3 pinned 淘汰回调合同 ─────────────────────────────────────────

describe('CursorLedger pinned 淘汰回调（W-FC-1 修形 2 / T3）', () => {
  test('T3a pinned 淘汰回调恰一 + 形参逐字（token + binding）', () => {
    const calls: Array<{ token: string; binding: CursorBinding }> = []
    const led = new CursorLedger(1, 600_000, 1000, (token, b) => {
      calls.push({ token, binding: b })
    })
    const b0 = binding('a')
    const t0 = led.issue(b0, 10)
    led.pin(t0)
    led.issue(binding('b'), 10) // capacity 1 → 淘 pinned t0
    expect(calls).toHaveLength(1)
    expect(calls[0]!.token).toBe(t0)
    expect(calls[0]!.binding).toEqual(b0)
  })

  test('T3b unpinned 淘汰零回调（LRU 淘序不变）', () => {
    const evicted: string[] = []
    const led = new CursorLedger(1, 600_000, 1000, token => evicted.push(token))
    const t0 = led.issue(binding('a'), 10) // 不 pin
    led.issue(binding('b'), 10)
    expect(evicted).toEqual([])
    expect(led.verify(t0, who('a'))).toMatchObject({ ok: false, why: 'unknown' })
  })

  test('T3c 多 pinned 连淘 = 连淘数回调（逐次，淘序 = 最旧先）', () => {
    const evicted: string[] = []
    const led = new CursorLedger(3, 600_000, 10_000, token => evicted.push(token))
    const ts = (['a', 'b', 'c'] as const).map(s => {
      const t = led.issue(binding(s), 10)
      led.pin(t)
      return t
    })
    const td = led.issue(binding('d'), 10)
    led.pin(td) // 全 pinned → 淘最旧 pinned a（d 不 pin 则 LRU 先吃 d）
    const te = led.issue(binding('e'), 10)
    led.pin(te) // 连淘次旧 pinned b
    expect(evicted).toEqual([ts[0], ts[1]])
  })

  test('对照腿：三参构造（无回调）pinned 淘汰仍发生（接线缺省臂）', () => {
    // 活码 readonlyRuntime 构造传第 4 参后，三参形仅直测/缺省臂可达
    const led = new CursorLedger(1, 600_000, 1000)
    const t0 = led.issue(binding('a'), 10)
    led.pin(t0)
    led.issue(binding('b'), 10)
    expect(led.verify(t0, who('a'))).toMatchObject({ ok: false, why: 'unknown' })
  })
})
