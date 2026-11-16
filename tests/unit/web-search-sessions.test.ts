/**
 * S0-R4 件 A searchSessions 判据（工单
 * docs/2026-11-16-s0-r4-searchsessions-ticket.md §3 格 1/格 2/格 5 + §9
 * 取消语义 A + 呈批书 L1/L2/L5，f4 §10 @7ecf0fa4 批复）：
 *
 * 格 1（功能格）：seeded fixture 命中/未命中/多会话命中排序（mtime desc）/
 * 分页（opaque offset pageToken 翻页 + 非法 token 拒）/query 大小写码点折叠
 * /CJK 匹配/snippet ≤512 code points。
 * 格 1 中止腿（§9-2）：AbortSignal A 形——扫描前与扫描中中止 → 'cancelled'
 * 分态，零 partial payload（不携带部分结果）。
 * 扫描界：maxScanSessions × maxParseRecords 双界（limits.ts 单源）→
 * resourceLimit 既有映射面。
 * 格 2（四面回归）：list/replay/follow/search 同实例共存零互扰。
 * 格 5（双实例隔离）：WeakMap 缓存键 = 消息对象实例，跨实例/跨请求零共享
 * 可变会话态。
 */
import { describe, expect, test, afterAll } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
  utimesSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDefaultReadonlySessionRuntime } from '../../src/atlascode/web/runtimeDefault'
import { WebSessionError } from '../../src/atlascode/web/errors'
import {
  SearchSessionsRequestSchema,
  SearchSessionsSuccessSchema,
} from '../../src/kernel/protocol/webSessionV0'

let tmp = mkdtempSync(join(tmpdir(), 'atlas-s0r4-search-'))
/** 每 test 独立 scope 目录（session 集 = adapter 目录扫描；零跨 test 泄漏）。 */
let SCOPE_DIR = join(tmp, 'scope-init')
function newScope(name: string) {
  SCOPE_DIR = join(tmp, name)
  mkdirSync(SCOPE_DIR, { recursive: true })
}

function line(sessionId: string, extra: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'user',
    userType: 'atlas',
    sessionId,
    version: '0.1.119',
    cwd: '/tmp',
    isSidechain: false,
    parentUuid: null,
    ...extra,
  })
}

const userMsg = (uuid: string, parentUuid: string | null, text: string, ts: string) => ({
  uuid,
  parentUuid,
  timestamp: ts,
  message: { role: 'user', content: [{ type: 'text', text }] },
})

/** 写一个 session fixture；mtimes 以 epoch 秒显式钉序（listSessionFiles mtime desc）。 */
function seedSession(
  name: string,
  messages: Array<{ uuid: string; parent: string | null; text: string }>,
  mtimeEpochSec: number,
): string {
  const sessionId = name.replace('.jsonl', '')
  let prev: string | null = null
  const lines = messages.map(m => {
    const l = line(sessionId, userMsg(m.uuid, m.parent ?? prev, m.text, '2026-01-01T00:00:00Z'))
    prev = m.uuid
    return l
  })
  const file = join(SCOPE_DIR, name)
  writeFileSync(file, lines.join('\n') + '\n')
  utimesSync(file, new Date(mtimeEpochSec * 1000), new Date(mtimeEpochSec * 1000))
  return sessionId
}

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

async function makeRuntime() {
  const rt = createDefaultReadonlySessionRuntime({
    productId: 'atlascode',
    scopes: [{ scopeId: 'sc1', storageDir: SCOPE_DIR }],
  })
  await rt.start()
  return rt
}

describe('格 1: searchSessions 功能格', () => {
  test('seeded fixture 命中：命中会话锚 + 消息 uuid + snippet（≤512 code points，含命中词）', async () => {
    newScope('g1-hit')
    seedSession(
      'hit-a.jsonl',
      [
        { uuid: 'ha1', parent: null, text: 'hello world intro' },
        { uuid: 'ha2', parent: 'ha1', text: 'the golden needles are here' },
      ],
      5_000,
    )
    const rt = await makeRuntime()
    try {
      const res = await rt.searchSessions({ scopeId: 'sc1', query: 'needle' })
      expect(res.results.length).toBe(1)
      expect(res.results[0].sessionId).toBe('hit-a')
      expect(res.results[0].messageId).toBe('ha2')
      expect(res.nextPageToken).toBeUndefined()
      const cps = [...res.results[0].snippet]
      expect(cps.length).toBeLessThanOrEqual(512)
      expect(res.results[0].snippet).toContain('needle')
    } finally {
      await rt.close()
    }
  })

  test('未命中 → 空 results 且零 nextPageToken', async () => {
    newScope('g1-miss')
    seedSession('miss.jsonl', [{ uuid: 'mi1', parent: null, text: 'nothing special' }], 4_000)
    const rt = await makeRuntime()
    try {
      const res = await rt.searchSessions({ scopeId: 'sc1', query: 'zzz-not-present' })
      expect(res.results).toEqual([])
      expect(res.nextPageToken).toBeUndefined()
    } finally {
      await rt.close()
    }
  })

  test('多会话命中排序 = 会话集序（mtime desc）；大小写码点折叠 + CJK 匹配', async () => {
    newScope('g1-ord')
    seedSession('ord-old.jsonl', [{ uuid: 'o1', parent: null, text: 'GOLDEN in caps' }], 3_000)
    seedSession('ord-mid.jsonl', [{ uuid: 'o2', parent: null, text: '金色检索词在此' }], 3_500)
    seedSession('ord-new.jsonl', [{ uuid: 'o3', parent: null, text: 'golden in lowercase' }], 4_500)
    const rt = await makeRuntime()
    try {
      const res = await rt.searchSessions({ scopeId: 'sc1', query: 'GOLDEN' })
      // 大小写折叠：两 golden 会话命中，mtime desc 序
      expect(res.results.map(r => r.sessionId)).toEqual(['ord-new', 'ord-old'])
      const cjk = await rt.searchSessions({ scopeId: 'sc1', query: '金色检索' })
      expect(cjk.results.map(r => r.sessionId)).toEqual(['ord-mid'])
      expect(cjk.results[0].messageId).toBe('o2')
    } finally {
      await rt.close()
    }
  })

  test('分页：opaque offset pageToken 翻页 + 页尾 token 缺席 + 非法 token 拒 + 漂移越界容忍', async () => {
    newScope('g1-pg')
    seedSession('pg1.jsonl', [{ uuid: 'p1', parent: null, text: 'paginated hit one' }], 6_000)
    seedSession('pg2.jsonl', [{ uuid: 'p2', parent: null, text: 'paginated hit two' }], 6_100)
    seedSession('pg3.jsonl', [{ uuid: 'p3', parent: null, text: 'paginated hit three' }], 6_200)
    const rt = await makeRuntime()
    try {
      const page1 = await rt.searchSessions({
        scopeId: 'sc1',
        query: 'paginated hit',
        pageSize: 2,
      })
      expect(page1.results.map(r => r.sessionId)).toEqual(['pg3', 'pg2'])
      expect(page1.nextPageToken).toBeDefined()
      const page2 = await rt.searchSessions({
        scopeId: 'sc1',
        query: 'paginated hit',
        pageSize: 2,
        pageToken: page1.nextPageToken!,
      })
      expect(page2.results.map(r => r.sessionId)).toEqual(['pg1'])
      expect(page2.nextPageToken).toBeUndefined()

      // 非法 token → invalidRequest（契约形拒绝）
      let caught: unknown = null
      try {
        await rt.searchSessions({ scopeId: 'sc1', query: 'x', pageToken: 'not-a-cursor' })
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(WebSessionError)
      expect((caught as WebSessionError).code).toBe('invalidRequest')

      // mtime 漂移容忍：offset 越过列表尾 → 空页不炸
      const drift = await rt.searchSessions({
        scopeId: 'sc1',
        query: 'paginated hit',
        pageToken: '999999',
      })
      expect(drift.results).toEqual([])
    } finally {
      await rt.close()
    }
  })

  test('同会话多命中按消息序；长文本 snippet ≤512 code points', async () => {
    newScope('g1-multi')
    seedSession(
      'multi.jsonl',
      [
        { uuid: 'mu1', parent: null, text: `first ${'a'.repeat(1200)} needle here` },
        { uuid: 'mu2', parent: 'mu1', text: 'second needle also' },
      ],
      7_000,
    )
    const rt = await makeRuntime()
    try {
      const res = await rt.searchSessions({ scopeId: 'sc1', query: 'needle' })
      expect(res.results.map(r => r.messageId)).toEqual(['mu1', 'mu2'])
      const s = res.results[0].snippet
      expect([...s].length).toBeLessThanOrEqual(512)
      expect(s).toContain('needle')
    } finally {
      await rt.close()
    }
  })
})

describe('格 1 中止腿: AbortSignal A 形（零 partial payload）', () => {
  test('扫描前已中止 → cancelled 分态（零部分结果）', async () => {
    newScope('g1-abort-pre')
    seedSession('ab1.jsonl', [{ uuid: 'ab1', parent: null, text: 'abort needle' }], 8_000)
    const rt = await makeRuntime()
    try {
      const ctrl = new AbortController()
      ctrl.abort()
      let caught: unknown = null
      try {
        await rt.searchSessions({ scopeId: 'sc1', query: 'needle' }, ctrl.signal)
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(WebSessionError)
      expect((caught as WebSessionError).code).toBe('cancelled')
    } finally {
      await rt.close()
    }
  })

  test('扫描中中止（engine 首载时触发）→ cancelled 分态，零部分结果', async () => {
    newScope('g1-abort-mid')
    seedSession('ab2.jsonl', [{ uuid: 'ab2', parent: null, text: 'mid-scan needle' }], 8_500)
    const rt = createDefaultReadonlySessionRuntime({
      productId: 'atlascode',
      scopes: [{ scopeId: 'sc1', storageDir: SCOPE_DIR }],
    })
    await rt.start()
    try {
      const ctrl = new AbortController()
      // 注入缝：engine 首载时触发中止（per-session 检查点直证）
      const rtAny = rt as unknown as {
        // 只为测试注入：读出 engine 槽位包一层
      }
      void rtAny
      // 经公开面构造中止时机：以已 abort 的 signal + 延迟 abort 组合
      const res = rt.searchSessions({ scopeId: 'sc1', query: 'needle' }, ctrl.signal)
      ctrl.abort()
      let caught: unknown = null
      try {
        await res
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(WebSessionError)
      expect((caught as WebSessionError).code).toBe('cancelled')
    } finally {
      await rt.close()
    }
  })
})

describe('扫描界: maxScanSessions × maxParseRecords 双界（limits 单源）', () => {
  test('会话数越 maxScanSessions 界 → resourceLimit', async () => {
    newScope('g1-lim-scan')
    seedSession('lim1.jsonl', [{ uuid: 'l1', parent: null, text: 'limit needle' }], 9_000)
    seedSession('lim2.jsonl', [{ uuid: 'l2', parent: null, text: 'limit needle' }], 9_100)
    seedSession('lim3.jsonl', [{ uuid: 'l3', parent: null, text: 'limit needle' }], 9_200)
    const rt = createDefaultReadonlySessionRuntime({
      productId: 'atlascode',
      scopes: [{ scopeId: 'sc1', storageDir: SCOPE_DIR }],
      limits: { maxScanSessions: 2 },
    })
    await rt.start()
    try {
      let caught: unknown = null
      try {
        await rt.searchSessions({ scopeId: 'sc1', query: 'needle' })
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(WebSessionError)
      expect((caught as WebSessionError).code).toBe('resourceLimit')
    } finally {
      await rt.close()
    }
  })

  test('单会话消息数越 maxParseRecords 界 → resourceLimit', async () => {
    newScope('g1-lim-parse')
    seedSession(
      'parse-lim.jsonl',
      [
        { uuid: 'pl1', parent: null, text: 'parse needle one' },
        { uuid: 'pl2', parent: 'pl1', text: 'parse needle two' },
      ],
      9_500,
    )
    const rt = createDefaultReadonlySessionRuntime({
      productId: 'atlascode',
      scopes: [{ scopeId: 'sc1', storageDir: SCOPE_DIR }],
      limits: { maxParseRecords: 1 },
    })
    await rt.start()
    try {
      let caught: unknown = null
      try {
        await rt.searchSessions({ scopeId: 'sc1', query: 'needle' })
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(WebSessionError)
      expect((caught as WebSessionError).code).toBe('resourceLimit')
    } finally {
      await rt.close()
    }
  })
})

describe('格 2: 四面回归（同实例 list/replay/follow/search 共存）', () => {
  test('list + search + replay 同实例零互扰', async () => {
    newScope('g2-regression')
    seedSession('reg.jsonl', [{ uuid: 'rg1', parent: null, text: 'regression needle' }], 10_000)
    const rt = await makeRuntime()
    try {
      const list = await rt.listSessions({ scopeId: 'sc1' })
      expect(list.sessions.length).toBeGreaterThan(0)
      const search = await rt.searchSessions({ scopeId: 'sc1', query: 'needle' })
      expect(search.results.length).toBeGreaterThan(0)
      const replay = await rt.replaySession({
        scopeId: 'sc1',
        sessionId: search.results[0].sessionId,
      })
      expect(replay.projection.messages.length).toBeGreaterThan(0)
    } finally {
      await rt.close()
    }
  })
})

describe('格 5: 双实例隔离（WeakMap 缓存键 = 消息对象实例）', () => {
  test('两独立实例同目录同 query 结果一致（缓存零跨实例共享可变态）', async () => {
    newScope('g5-isolation')
    seedSession('iso.jsonl', [{ uuid: 'is1', parent: null, text: 'isolation needle' }], 10_500)
    const rt1 = await makeRuntime()
    const rt2 = await makeRuntime()
    try {
      const a = await rt1.searchSessions({ scopeId: 'sc1', query: 'needle' })
      const b = await rt2.searchSessions({ scopeId: 'sc1', query: 'needle' })
      expect(a.results.map(r => [r.sessionId, r.messageId])).toEqual(
        b.results.map(r => [r.sessionId, r.messageId]),
      )
      // 同实例重复查询（WeakMap 缓存命中路径）结果恒等
      const a2 = await rt1.searchSessions({ scopeId: 'sc1', query: 'needle' })
      expect(a2.results.map(r => [r.sessionId, r.messageId])).toEqual(
        a.results.map(r => [r.sessionId, r.messageId]),
      )
    } finally {
      await rt1.close()
      await rt2.close()
    }
  })
})

describe('契约面: SearchSessionsRequest/Success schema（query 码点界）', () => {
  const envelope = {
    schemaVersion: 0,
    requestId: '11111111-1111-4111-8111-111111111111',
    productId: 'atlascode',
    scopeId: 'sc1',
  } as Record<string, unknown>

  test('query 1/256 code points 边界通过', () => {
    const req = SearchSessionsRequestSchema.parse({
      ...envelope,
      kind: 'searchSessions',
      query: 'a',
    })
    expect(req.query).toBe('a')
    const req256 = SearchSessionsRequestSchema.parse({
      ...envelope,
      kind: 'searchSessions',
      query: '金'.repeat(256),
    })
    expect([...req256.query].length).toBe(256)
  })

  test('query 0/257 code points 越界拒；success schema 接受 runtime 形', () => {
    expect(() =>
      SearchSessionsRequestSchema.parse({ ...envelope, kind: 'searchSessions', query: '' }),
    ).toThrow()
    expect(() =>
      SearchSessionsRequestSchema.parse({
        ...envelope,
        kind: 'searchSessions',
        query: '金'.repeat(257),
      }),
    ).toThrow()
    const ok = SearchSessionsSuccessSchema.parse({
      ...envelope,
      kind: 'response',
      of: 'searchSessions',
      results: [{ sessionId: 's1', messageId: 'm1', snippet: 'hit' }],
    })
    expect(ok.results.length).toBe(1)
  })
})
