/**
 * S0-R R-2 格（0.1.116 候）：web 域资源常量全表（工单 §4.4 冻结值）+
 * validateBoundedInt 判别面（禁 NaN/Infinity/小数/负值；硬上限不可被
 * host 调高；时序类硬下限）。零磁盘/零网络。
 */
import { describe, test, expect } from 'bun:test'

import {
  MIB,
  DEFAULT_MAX_TRANSCRIPT_BYTES,
  HARD_MAX_TRANSCRIPT_BYTES,
  DEFAULT_PAGE_SIZE,
  HARD_MAX_PAGE_SIZE,
  DEFAULT_MAX_RECORD_BYTES,
  HARD_MAX_RECORD_BYTES,
  DEFAULT_MAX_PARSE_RECORDS,
  HARD_MAX_PARSE_RECORDS,
  DEFAULT_MAX_PROJECTION_BYTES,
  HARD_MAX_PROJECTION_BYTES,
  DEFAULT_MAX_SUBSCRIPTIONS,
  HARD_MAX_SUBSCRIPTIONS,
  DEFAULT_MAX_CONCURRENT_READS,
  HARD_MAX_CONCURRENT_READS,
  DEFAULT_MAX_PENDING_EVENTS,
  HARD_MAX_PENDING_EVENTS,
  DEFAULT_MAX_PENDING_BYTES,
  HARD_MAX_PENDING_BYTES,
  DEFAULT_POLLING_INTERVAL_MS,
  HARD_MIN_POLLING_INTERVAL_MS,
  HARD_MAX_POLLING_INTERVAL_MS,
  DEFAULT_REQUEST_DEADLINE_MS,
  DEFAULT_IDLE_LEASE_MS,
  DEFAULT_CURSOR_TTL_MS,
  DEFAULT_CLOSE_DEADLINE_MS,
  HARD_MAX_CLOSE_DEADLINE_MS,
  DEFAULT_LEDGER_CAPACITY,
  HARD_MAX_LEDGER_CAPACITY,
  DEFAULT_LEDGER_PAYLOAD_BYTES,
  HARD_MAX_LEDGER_PAYLOAD_BYTES,
  validateBoundedInt,
} from '../../src/atlascode/web/limits'
import { WebSessionError } from '../../src/atlascode/web/errors'
import { createReadonlySessionRuntime } from '../../src/atlascode/web/readonlyRuntime'
import type { SessionStoreAdapter } from '../../src/atlascode/web/sessionStoreAdapter'

function fakeAdapter(): SessionStoreAdapter {
  return {
    async start() {},
    async listSessionFiles() {
      return []
    },
    async readTranscript() {
      return new Uint8Array()
    },
    async statTranscript() {
      return null
    },
    async readTranscriptTail() {
      return { bytes: new Uint8Array(), sizeBytes: 0, ino: 0 }
    },
    async resolveTranscriptPath() {
      return '/fake/x.jsonl'
    },
    async close() {},
  }
}

// ── A. §4.4 冻结值在案 ────────────────────────────────────────────────────────

describe('§4.4 资源常量冻结值', () => {
  test('DEFAULT/HARD 对全表（数值面抽查）', () => {
    expect(MIB).toBe(1024 * 1024)
    expect(DEFAULT_MAX_TRANSCRIPT_BYTES).toBe(64 * MIB)
    expect(HARD_MAX_TRANSCRIPT_BYTES).toBe(256 * MIB)
    expect(DEFAULT_PAGE_SIZE).toBe(50)
    expect(HARD_MAX_PAGE_SIZE).toBe(200)
    expect(DEFAULT_MAX_RECORD_BYTES).toBe(MIB)
    expect(HARD_MAX_RECORD_BYTES).toBe(8 * MIB)
    expect(DEFAULT_MAX_PARSE_RECORDS).toBe(100_000)
    expect(HARD_MAX_PARSE_RECORDS).toBe(500_000)
    expect(DEFAULT_MAX_PROJECTION_BYTES).toBe(4 * MIB)
    expect(HARD_MAX_PROJECTION_BYTES).toBe(16 * MIB)
    expect(DEFAULT_MAX_SUBSCRIPTIONS).toBe(16)
    expect(HARD_MAX_SUBSCRIPTIONS).toBe(64)
    expect(DEFAULT_MAX_CONCURRENT_READS).toBe(4)
    expect(HARD_MAX_CONCURRENT_READS).toBe(16)
    expect(DEFAULT_MAX_PENDING_EVENTS).toBe(8)
    expect(HARD_MAX_PENDING_EVENTS).toBe(32)
    expect(DEFAULT_MAX_PENDING_BYTES).toBe(8 * MIB)
    expect(HARD_MAX_PENDING_BYTES).toBe(32 * MIB)
    expect(DEFAULT_POLLING_INTERVAL_MS).toBe(1000)
    expect(HARD_MIN_POLLING_INTERVAL_MS).toBe(100)
    expect(HARD_MAX_POLLING_INTERVAL_MS).toBe(60_000)
    expect(DEFAULT_REQUEST_DEADLINE_MS).toBe(10_000)
    expect(DEFAULT_IDLE_LEASE_MS).toBe(120_000)
    expect(DEFAULT_CURSOR_TTL_MS).toBe(600_000)
    expect(DEFAULT_CLOSE_DEADLINE_MS).toBe(2000)
    expect(HARD_MAX_CLOSE_DEADLINE_MS).toBe(10_000)
    expect(DEFAULT_LEDGER_CAPACITY).toBe(128)
    expect(HARD_MAX_LEDGER_CAPACITY).toBe(1024)
    expect(DEFAULT_LEDGER_PAYLOAD_BYTES).toBe(16 * MIB)
    expect(HARD_MAX_LEDGER_PAYLOAD_BYTES).toBe(64 * MIB)
  })

  test('runtime.limits 缺省全表解析（start 后可见）', async () => {
    const rt = createReadonlySessionRuntime({
      productId: 'atlascode',
      scopes: [{ scopeId: 'p', storageDir: '/fake/p' }],
      adapter: fakeAdapter(),
    })
    await rt.start()
    expect(rt.limits.pageSize).toBe(50)
    expect(rt.limits.maxSubscriptions).toBe(16)
    expect(rt.limits.maxConcurrentReads).toBe(4)
    expect(rt.limits.pollingIntervalMs).toBe(1000)
    expect(rt.limits.idleLeaseMs).toBe(120_000)
    expect(rt.limits.cursorTtlMs).toBe(600_000)
    expect(rt.limits.closeDeadlineMs).toBe(2000)
    expect(rt.limits.ledgerCapacity).toBe(128)
    await rt.close()
  })
})

// ── B. validateBoundedInt 判别面 ──────────────────────────────────────────────

describe('validateBoundedInt 判别面', () => {
  test('NaN / Infinity / 小数 / 负值 / 非数值 → invalidRequest', () => {
    for (const bad of [NaN, Infinity, -Infinity, 1.5, -1, '8' as unknown]) {
      expect(() =>
        validateBoundedInt('x', bad as number | undefined, 8, 16),
      ).toThrow(WebSessionError)
    }
  })

  test('缺省 undefined → defaultValue；边界值 [hardMin, hardMax] 闭区间可取', () => {
    expect(validateBoundedInt('x', undefined, 8, 16)).toBe(8)
    expect(validateBoundedInt('x', 1, 8, 16)).toBe(1)
    expect(validateBoundedInt('x', 16, 8, 16)).toBe(16)
  })

  test('越硬上限拒（host 不可调高）；时序类越硬下限拒', () => {
    expect(() => validateBoundedInt('x', 17, 8, 16)).toThrow(WebSessionError)
    expect(() =>
      validateBoundedInt('t', 99, 1000, 60_000, 100),
    ).toThrow(WebSessionError)
    expect(validateBoundedInt('t', 100, 1000, 60_000, 100)).toBe(100)
  })
})

// ── C. host 配置面（界内可配 / 越界 start 拒）────────────────────────────────

describe('runtime limits 配置面', () => {
  function makeWithLimits(
    limits: Record<string, number>,
  ): ReturnType<typeof createReadonlySessionRuntime> {
    return createReadonlySessionRuntime({
      productId: 'atlascode',
      scopes: [{ scopeId: 'p', storageDir: '/fake/p' }],
      adapter: fakeAdapter(),
      limits: limits as never,
    })
  }

  test('界内可配：pageSize=200 / pollingIntervalMs=100 恰取硬边界', async () => {
    const rt = makeWithLimits({ pageSize: 200, pollingIntervalMs: 100 })
    await rt.start()
    expect(rt.limits.pageSize).toBe(200)
    expect(rt.limits.pollingIntervalMs).toBe(100)
    await rt.close()
  })

  test('越硬上限 → invalidRequest（factory 拒）：pageSize=201 / subscriptions=65', () => {
    expect(() => makeWithLimits({ pageSize: 201 })).toThrow(WebSessionError)
    expect(() =>
      makeWithLimits({ maxSubscriptions: HARD_MAX_SUBSCRIPTIONS + 1 }),
    ).toThrow(WebSessionError)
  })

  test('时序类越硬下限 → invalidRequest：pollingIntervalMs=99', () => {
    expect(() => makeWithLimits({ pollingIntervalMs: 99 })).toThrow(
      WebSessionError,
    )
  })

  test('非合法数值穿透配置面 → invalidRequest：maxPendingEvents=NaN', () => {
    expect(() => makeWithLimits({ maxPendingEvents: NaN })).toThrow(
      WebSessionError,
    )
  })
})
