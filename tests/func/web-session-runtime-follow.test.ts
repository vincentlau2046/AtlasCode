/**
 * S0-R R-2 格（0.1.116 候）：replay/follow 订阅机（工单 §4.3 一致性恢复
 * + 呈批书 §7.5 采样序/cursor/lease/终态优先序）。真实 fs tmpdir seeded
 * （R-1 同族先例）+ fs adapter；零网络。
 *
 * 判据：baseline→replacement 增量链 / 零重解析 O(1) stat 通道（尾读调用
 * 计数）/ 半行不当完整记录 / corruptData 终态 / 不连续 resetRequired+
 * 新 generation / abort→cancelled / lease 超时→closed / 订阅上限。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, writeFileSync, appendFileSync, rmSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createReadonlySessionRuntime } from '../../src/atlascode/web/readonlyRuntime'
import { atlasWebSessionEngine } from '../../src/atlascode/web/runtimeDefault'
import { MIB } from '../../src/atlascode/web/limits'
import {
  createNodeFsSessionStoreAdapter,
  type SessionStoreAdapter,
} from '../../src/atlascode/web/sessionStoreAdapter'
import type { WebSessionEvent } from '../../src/kernel/protocol/webSessionV0'
import {
  ProjectionSchema,
  WebSessionEventSchema,
} from '../../src/kernel/protocol/webSessionV0'

// ── fixture ───────────────────────────────────────────────────────────────────

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-web-follow-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const userLine = (uuid: string, parentUuid: string | null, text: string) =>
  JSON.stringify({
    type: 'user',
    uuid,
    parentUuid,
    sessionId: 'sess-1',
    timestamp: '2026-11-15T10:00:00.000Z',
    cwd: dir,
    userType: 'atlas',
    version: '0.0.0',
    isSidechain: false,
    message: { role: 'user', content: text },
  })

const assistantLine = (uuid: string, parentUuid: string | null, text: string) =>
  JSON.stringify({
    type: 'assistant',
    uuid,
    parentUuid,
    sessionId: 'sess-1',
    timestamp: '2026-11-15T10:00:01.000Z',
    cwd: dir,
    userType: 'atlas',
    version: '0.0.0',
    isSidechain: false,
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  })

function makeRuntime(limits?: Record<string, number>) {
  const adapter = createNodeFsSessionStoreAdapter({
    productId: 'atlascode',
    scopes: [{ scopeId: 'proj-a', storageDir: dir }],
  })
  const rt = createReadonlySessionRuntime({
    productId: 'atlascode',
    scopes: [{ scopeId: 'proj-a', storageDir: dir }],
    engine: atlasWebSessionEngine(),
    adapter,
    ...(limits ? { limits: limits as never } : {}),
  })
  return rt
}

/** 尾读调用计数 spy（零重解析判据的计数面）。 */
function spyAdapter(ad: SessionStoreAdapter): SessionStoreAdapter & {
  tailCalls: () => number
  readCalls: () => number
} {
  let tail = 0
  let reads = 0
  return {
    start: (...a) => ad.start(...a),
    listSessionFiles: (...a) => ad.listSessionFiles(...a),
    readTranscript: (...a) => {
      reads++
      return ad.readTranscript(...a)
    },
    statTranscript: (...a) => ad.statTranscript(...a),
    readTranscriptTail: (...a) => {
      tail++
      return ad.readTranscriptTail(...a)
    },
    resolveTranscriptPath: (...a) => ad.resolveTranscriptPath(...a),
    close: () => ad.close(),
    tailCalls: () => tail,
    readCalls: () => reads,
  }
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

async function nextEvent(
  iter: AsyncIterator<WebSessionEvent>,
): Promise<WebSessionEvent> {
  const r = await iter.next()
  expect(r.done).toBe(false)
  return r.value as WebSessionEvent
}

/**
 * 消费至 closed（f4 §5.7 钉死形：closed 恒为唯一 terminal kind——error
 * 终态路径 = error → closed 成对送达）。断言面：终态对完整 + 终态后零
 * 数据事件（closed 之后 iter 返回 done）。
 */
async function untilTerminal(
  iter: AsyncIterator<WebSessionEvent>,
): Promise<{ events: WebSessionEvent[]; terminal: WebSessionEvent }> {
  const events: WebSessionEvent[] = []
  for (;;) {
    const ev = await nextEvent(iter)
    events.push(ev)
    if (ev.kind === 'closed') {
      // 终态后零数据事件：closed 后 iter 必 done
      const after = await iter.next()
      expect(after.done).toBe(true)
      return { events, terminal: ev }
    }
  }
}

// ── A. replay ─────────────────────────────────────────────────────────────────

describe('replaySession', () => {
  test('全量投影：contract 形（persisted-effective-conversation / text 块）', async () => {
    writeFileSync(
      join(dir, 'sess-1.jsonl'),
      `${userLine('u1', null, 'hello')}\n${assistantLine('a1', 'u1', 'world')}\n`,
    )
    const rt = makeRuntime()
    await rt.start()
    const res = await rt.replaySession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    expect(res.of).toBe('replaySession')
    const projection = ProjectionSchema.parse(res.projection)
    expect(projection.semantics).toBe('persisted-effective-conversation')
    expect(projection.sessionId).toBe('sess-1')
    expect(projection.messages).toHaveLength(2)
    expect(projection.messages[0]?.role).toBe('user')
    expect(projection.messages[1]?.blocks[0]).toEqual({ kind: 'text', text: 'world' })
    await rt.close()
  })

  test('未存在 → notFound；未知 scope → scopeDenied', async () => {
    const rt = makeRuntime()
    await rt.start()
    await expect(
      rt.replaySession({ scopeId: 'proj-a', sessionId: 'missing' }),
    ).rejects.toMatchObject({ code: 'notFound' })
    await expect(
      rt.replaySession({ scopeId: 'nope', sessionId: 'sess-1' }),
    ).rejects.toMatchObject({ code: 'scopeDenied' })
    await rt.close()
  })
})

// ── B. follow 基线与增量 ──────────────────────────────────────────────────────

describe('followSession 增量链', () => {
  test('baseline → append → replacement（revision 1，新消息在投影）', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'hello')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter = sub[Symbol.asyncIterator]()

    const baseline = await nextEvent(iter)
    expect(baseline.kind).toBe('baseline')
    if (baseline.kind === 'baseline') {
      expect(baseline.revision).toBe(0)
      expect(baseline.cursor.length).toBeGreaterThan(0)
      expect(baseline.projection.messages).toHaveLength(1)
    }

    appendFileSync(path, `${assistantLine('a1', 'u1', 'world')}\n`)
    const replacement = await nextEvent(iter)
    expect(replacement.kind).toBe('replacement')
    if (replacement.kind === 'replacement') {
      expect(replacement.revision).toBe(1)
      expect(replacement.projection.messages).toHaveLength(2)
      expect(replacement.projection.messages[1]?.blocks[0]).toEqual({
        kind: 'text',
        text: 'world',
      })
    }

    await sub.close()
    await rt.close()
  })

  test('事件过 contract WebSessionEventSchema（envelope 字段全在）', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), `${userLine('u1', null, 'hi')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub = await rt.followSession({
      scopeId: 'proj-a',
      sessionId: 'sess-1',
      requestId: 'req-42',
    })
    const ev = await nextEvent(sub[Symbol.asyncIterator]())
    const parsed = WebSessionEventSchema.parse(ev)
    expect(parsed.kind).toBe('baseline')
    if (parsed.kind === 'baseline') {
      expect(parsed.requestId).toBe('req-42')
      expect(parsed.productId).toBe('atlascode')
      expect(parsed.scopeId).toBe('proj-a')
      expect(parsed.subscriptionId.length).toBeGreaterThan(0)
    }
    await sub.close()
    await rt.close()
  })

  test('零重解析：稳定文件 poll 走 O(1) stat 通道（尾读调用 0）', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), `${userLine('u1', null, 'hi')}\n`)
    const ad = createNodeFsSessionStoreAdapter({
      productId: 'atlascode',
      scopes: [{ scopeId: 'proj-a', storageDir: dir }],
    })
    const spy = spyAdapter(ad)
    const rt = createReadonlySessionRuntime({
      productId: 'atlascode',
      scopes: [{ scopeId: 'proj-a', storageDir: dir }],
      engine: atlasWebSessionEngine(),
      adapter: spy,
      limits: { pollingIntervalMs: 100 } as never,
    })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter = sub[Symbol.asyncIterator]()
    await nextEvent(iter) // baseline
    await sleep(350) // ~3 个 poll 周期，文件未变
    expect(spy.tailCalls()).toBe(0)
    expect(spy.readCalls()).toBe(0)
    await sub.close()
    await rt.close()
  })

  test('半行不当完整记录：追加半行无事件，补全后 replacement 含全内容', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'hi')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter = sub[Symbol.asyncIterator]()
    await nextEvent(iter) // baseline

    // 半行 = 完整 JSON 行去尾部换行（assistantLine 无尾换行，即全量内容本身）
    appendFileSync(path, assistantLine('a1', 'u1', 'partial-X'))
    // 半行（无换行）：一个 poll 周期内不得产生 replacement
    await sleep(250)
    appendFileSync(path, '\n') // 补全行
    const replacement = await nextEvent(iter)
    expect(replacement.kind).toBe('replacement')
    if (replacement.kind === 'replacement') {
      const text = JSON.stringify(replacement.projection)
      expect(text).toContain('partial-X')
    }
    await sub.close()
    await rt.close()
  })
})

// ── C. 恢复与终态 ─────────────────────────────────────────────────────────────

describe('follow 恢复与终态', () => {
  test('非法完整行 → corruptData 终态（不无限等待）', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), `${userLine('u1', null, 'hi')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    await nextEvent(sub[Symbol.asyncIterator]()) // baseline
    appendFileSync(join(dir, 'sess-1.jsonl'), '{definitely-not-json\n')
    const { terminal, events } = await untilTerminal(sub[Symbol.asyncIterator]())
    // f4 §5.7 终态对：error{corruptData} → closed 成对，closed 唯一 terminal kind
    expect(terminal.kind).toBe('closed')
    const errIdx = events.findIndex(e => e.kind === 'error')
    expect(errIdx).toBeGreaterThanOrEqual(0)
    const errEv = events[errIdx]!
    if (errEv.kind === 'error') expect(errEv.error.code).toBe('corruptData')
    expect(events[events.length - 1]).toBe(terminal)
    expect(events.slice(errIdx + 1, -1).every(e => e.kind !== 'baseline' && e.kind !== 'replacement')).toBe(true)
    await rt.close()
  })

  test('文件替换（ino 变）→ resetRequired + 新 generation baseline', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'old')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter = sub[Symbol.asyncIterator]()
    const baseline = await nextEvent(iter)
    if (baseline.kind !== 'baseline') throw new Error('expected baseline')
    const oldGeneration = baseline.generation

    // atomic replace：新 inode
    const tmp = join(dir, 'sess-1.new.jsonl')
    writeFileSync(tmp, `${userLine('u2', null, 'new-world')}\n`)
    renameSync(tmp, path)

    const reset = await nextEvent(iter)
    expect(reset.kind).toBe('resetRequired')
    const rebase = await nextEvent(iter)
    expect(rebase.kind).toBe('baseline')
    if (rebase.kind === 'baseline') {
      expect(rebase.generation).not.toBe(oldGeneration)
      expect(rebase.projection.messages).toHaveLength(1)
      expect(JSON.stringify(rebase.projection)).toContain('new-world')
    }
    await sub.close()
    await rt.close()
  })

  test('abort → error{cancelled} → closed 成对（f4 §5.7 终态对）', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), `${userLine('u1', null, 'hi')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const ac = new AbortController()
    const sub = await rt.followSession(
      { scopeId: 'proj-a', sessionId: 'sess-1' },
      ac.signal,
    )
    await nextEvent(sub[Symbol.asyncIterator]()) // baseline
    ac.abort()
    const { terminal, events } = await untilTerminal(sub[Symbol.asyncIterator]())
    expect(terminal.kind).toBe('closed')
    const errIdx = events.findIndex(e => e.kind === 'error')
    expect(errIdx).toBeGreaterThanOrEqual(0)
    const errEv = events[errIdx]!
    if (errEv.kind === 'error') expect(errEv.error.code).toBe('cancelled')
    // error → closed 成对且紧邻；终态后零数据事件（untilTerminal 内已断言 done）
    expect(events[errIdx + 1]).toBe(terminal)
    await rt.close()
  })

  test('lease 超时（idle 不消费）→ closed 终态；renewLease 可续', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), `${userLine('u1', null, 'hi')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100, idleLeaseMs: 1000 })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    expect(await sub.renewLease()).toBe(true)
    const { terminal, events } = await untilTerminal(sub[Symbol.asyncIterator]())
    expect(terminal.kind).toBe('closed')
    expect(
      terminal.kind === 'closed' && terminal.reason?.includes('lease'),
    ).toBe(true)
    // 终态前 baseline 数据事件已送达（不丢数据）
    expect(events.some(e => e.kind === 'baseline')).toBe(true)
    // 终态后续租拒
    expect(await sub.renewLease()).toBe(false)
    await rt.close()
  })

  test('订阅上限：maxSubscriptions=2 第 3 路 → resourceLimit；close 释放槽', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), `${userLine('u1', null, 'hi')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100, maxSubscriptions: 2 })
    await rt.start()
    const s1 = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const s2 = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    await expect(
      rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' }),
    ).rejects.toMatchObject({ code: 'resourceLimit' })
    await s1.close()
    const s3 = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    expect(s3).toBeDefined()
    await s2.close()
    await s3.close()
    await rt.close()
  })

  test('close 幂等；runtime.close 关停活跃订阅（closed 终态送达）', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), `${userLine('u1', null, 'hi')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    await nextEvent(sub[Symbol.asyncIterator]()) // baseline
    await sub.close()
    await sub.close() // 幂等
    const { terminal } = await untilTerminal(sub[Symbol.asyncIterator]())
    expect(terminal.kind).toBe('closed')
    await rt.close()
  })

  test('close 于 worker 运行期：join 后订阅槽实放（安全审查 HIGH③ 回归——限额不可绕过）', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), `${userLine('u1', null, 'hi')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100, maxSubscriptions: 1 })
    await rt.start()
    const s1 = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    // close 加盟 worker 实停（finally releaseOnce）；返回后槽必已释放
    await s1.close()
    const s2 = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    expect(s2).toBeDefined()
    await s2.close()
    await rt.close()
  })

  test('worker 逃逸 rejection 翻译终态对：baseline stat 拒绝 → error{ioUnavailable} → closed（安全审查回归——零 unhandled rejection）', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), `${userLine('u1', null, 'hi')}\n`)
    const ad = createNodeFsSessionStoreAdapter({
      productId: 'atlascode',
      scopes: [{ scopeId: 'proj-a', storageDir: dir }],
    })
    const failing: SessionStoreAdapter = {
      ...ad,
      statTranscript: async () => {
        throw new Error('EIO injected')
      },
    }
    const rt = createReadonlySessionRuntime({
      productId: 'atlascode',
      scopes: [{ scopeId: 'proj-a', storageDir: dir }],
      engine: atlasWebSessionEngine(),
      adapter: failing,
      limits: { pollingIntervalMs: 100 } as never,
    })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    // worker 内任何逃逸异常必须翻译为 error → closed 成对（f4 §5.7 终态对），
    // 不得成为 void run() 的 unhandled rejection（否则本断言挂死超时 = RED）
    const { events, terminal } = await untilTerminal(sub[Symbol.asyncIterator]())
    const err = events.find(e => e.kind === 'error')
    expect(err).toBeDefined()
    expect(
      err?.kind === 'error' &&
        (err as { error?: { code?: string } }).error?.code,
    ).toBe('ioUnavailable')
    expect(terminal.kind).toBe('closed')
    await rt.close()
  })

  test('replay 投影超 maxProjectionBytes → resourceLimit（零半投影交付界）', async () => {
    writeFileSync(
      join(dir, 'sess-1.jsonl'),
      `${userLine('u1', null, 'hello')}\n${assistantLine('a1', 'u1', 'world')}\n`,
    )
    const rt = makeRuntime({ maxProjectionBytes: 100 })
    await rt.start()
    await expect(
      rt.replaySession({ scopeId: 'proj-a', sessionId: 'sess-1' }),
    ).rejects.toMatchObject({ code: 'resourceLimit' })
    await rt.close()
  })
})

// ── D. #277 格 1 根修判别单测（呈批书 §2 @92bc4445，双门批复形）───────────────
//
// fixture 数学：bigPair(i) = user 400 KiB + assistant 400 KiB → 投影序列化
// ≈0.8 MiB/对。每行 < DEFAULT_MAX_RECORD_BYTES 1 MiB（大投影必须多行构造，
// 禁单大行——单行先触 record 帽混淆判别）。7 对 ≈5.6 MiB ∈ (4,8] 旧带、
// 14 对 ≈11.2 MiB ∈ (8,16] 带（A2 才解锁的带）。

describe('#277 格 1 根修判别单测', () => {
  const KIB = 400
  const PAIRS_A = 7 // ≈5.6 MiB
  const PAIRS_B = 14 // ≈11.2 MiB

  const bigPair = (i: number) =>
    `${userLine(`u${i}`, i === 1 ? null : `a${i - 1}`, 'x'.repeat(KIB * 1024))}\n${assistantLine(`a${i}`, `u${i}`, 'x'.repeat(KIB * 1024))}\n`
  const writePairs = (path: string, n: number) => {
    let s = ''
    for (let i = 1; i <= n; i++) s += bigPair(i)
    writeFileSync(path, s)
  }
  const appendPair = (path: string, i: number) =>
    appendFileSync(path, bigPair(i))

  /** 事件列中 resourceLimit error→closed 成对，且 error 前零 baseline/replacement（零半投影）。 */
  function expectResourceLimitTerminal(events: {
    events: WebSessionEvent[]
    terminal: WebSessionEvent
  }): void {
    expect(events.terminal.kind).toBe('closed')
    const errIdx = events.events.findIndex(e => e.kind === 'error')
    expect(errIdx).toBeGreaterThanOrEqual(0)
    const errEv = events.events[errIdx]!
    if (errEv.kind === 'error') expect(errEv.error.code).toBe('resourceLimit')
    expect(
      events.events
        .slice(0, errIdx)
        .every(e => e.kind !== 'baseline' && e.kind !== 'replacement'),
    ).toBe(true)
  }

  // §2-1：长会话（> 旧 4 MiB 帽）默认 follow baseline 正常交付
  // （旧码 RED = baseline 支 resourceLimit terminal；A1 落后 GREEN）。
  test('T1: ~5.6 MiB 会话默认 follow baseline 正常交付（A1）', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writePairs(path, PAIRS_A)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const baseline = await nextEvent(sub[Symbol.asyncIterator]())
    expect(baseline.kind).toBe('baseline')
    if (baseline.kind === 'baseline') {
      expect(baseline.revision).toBe(0)
      expect(baseline.cursor.length).toBeGreaterThan(0)
      expect(baseline.projection.messages).toHaveLength(PAIRS_A * 2)
    }
    await sub.close()
    await rt.close()
  })

  // §2-2：双 fixture——A 旧带内 + B ∈ (8,16] 带（A2 解锁正向面），
  // 各 baseline + 增量正常交付（cursor / revision 链完整）。
  test('T2: fixture A（~5.6 MiB）与 B（~11.2 MiB）各 baseline+replacement 链完整（A1+A2）', async () => {
    for (const [n, tag] of [
      [PAIRS_A, 'a'],
      [PAIRS_B, 'b'],
    ] as const) {
      const path = join(dir, `sess-${tag}.jsonl`)
      writePairs(path, n)
      const rt = makeRuntime({ pollingIntervalMs: 100 })
      await rt.start()
      const sub = await rt.followSession({
        scopeId: 'proj-a',
        sessionId: `sess-${tag}`,
      })
      const iter = sub[Symbol.asyncIterator]()
      const baseline = await nextEvent(iter)
      expect(baseline.kind).toBe('baseline')
      appendPair(path, n + 1)
      const rep = await nextEvent(iter)
      expect(rep.kind).toBe('replacement')
      if (rep.kind === 'replacement') {
        expect(rep.revision).toBe(1)
        expect(rep.cursor.length).toBeGreaterThan(0)
        expect(rep.projection.messages).toHaveLength((n + 1) * 2)
      }
      await sub.close()
      await rt.close()
    }
  })

  // §2-3 语义腿（判词侧注记 2 采认）：注入低帽 + 小 fixture → 超帽面
  // terminal 非截断（「零隐式截断」语义承面；值腿 16/16 在 limits 单测）。
  test('T3 语义腿: 注入低帽超界 → error{resourceLimit}→closed 成对，error 前零投影', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'x'.repeat(2000))}\n`)
    const rt = makeRuntime({
      pollingIntervalMs: 100,
      maxProjectionBytes: 1000,
      maxPendingBytes: 1000,
    })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    expectResourceLimitTerminal(await untilTerminal(sub[Symbol.asyncIterator]()))
    await rt.close()
  })

  // §2-4（审计必改 1 修正形）：注入形模拟 A1-单落世界（projection=16 MiB
  // + pending=4 MiB），5.6 MiB fixture 经 follow.ts:254 pending 门触发终流——
  // 断言 resourceLimit terminal 且 baseline 前无半投影（防回归拆落）。
  test('T4: A1-单落世界注入形（projection 16 / pending 4 MiB）→ pending 门终流（A2 耦合）', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writePairs(path, PAIRS_A)
    const rt = makeRuntime({
      pollingIntervalMs: 100,
      maxProjectionBytes: 16 * MIB,
      maxPendingBytes: 4 * MIB,
    })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    expectResourceLimitTerminal(await untilTerminal(sub[Symbol.asyncIterator]()))
    await rt.close()
  })

  // §2-6（审计必改 2）：默认配置双向判别——replay 全量面仍 4 MiB 帽
  // resourceLimit（A1 禁改 DEFAULT 本体，非泄漏锁）∧ 同 fixture follow
  // 面正常交付（16 MiB 帽生效）。
  test('T6: 默认配置 replay 仍 resourceLimit（4 MiB 不泄漏）∧ follow 交付（16 MiB 生效）', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writePairs(path, PAIRS_A)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const baseline = await nextEvent(sub[Symbol.asyncIterator]())
    expect(baseline.kind).toBe('baseline')
    await sub.close()
    await expect(
      rt.replaySession({ scopeId: 'proj-a', sessionId: 'sess-1' }),
    ).rejects.toMatchObject({ code: 'resourceLimit' })
    await rt.close()
  })

  // §2-8（判词侧建议 2 采认，observable 形禁 callback 断言）：注入态
  // A1+A2 落 / A3 缺（ledger 16 MiB）→ 三事件 16.8 > 16 → r2 issue 时
  // pinned baseline cursor 被静默淘 → resume cursor0 → resetRequired('unknown')。
  test('§2-8 A3-缺: ledger 16 MiB 注入态 → r2 后 baseline cursor resume → resetRequired', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writePairs(path, PAIRS_A)
    const rt = makeRuntime({
      pollingIntervalMs: 100,
      ledgerPayloadBytes: 16 * MIB,
    })
    await rt.start()
    const sub1 = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter1 = sub1[Symbol.asyncIterator]()
    const baseline = await nextEvent(iter1)
    if (baseline.kind !== 'baseline') throw new Error('expected baseline')
    const cursor0 = baseline.cursor
    appendPair(path, PAIRS_A + 1)
    expect((await nextEvent(iter1)).kind).toBe('replacement')
    appendPair(path, PAIRS_A + 2)
    expect((await nextEvent(iter1)).kind).toBe('replacement')
    // r2 issue：5.6×3 = 16.8 > 16 → pinned cursor0（及 cursor1）被静默淘
    const sub2 = await rt.followSession({
      scopeId: 'proj-a',
      sessionId: 'sess-1',
      resumeCursor: cursor0,
    })
    const iter2 = sub2[Symbol.asyncIterator]()
    const reset = await nextEvent(iter2)
    expect(reset.kind).toBe('resetRequired')
    if (reset.kind === 'resetRequired') expect(reset.reason).toContain('unknown')
    const rebase = await nextEvent(iter2)
    expect(rebase.kind).toBe('baseline')
    await sub1.close()
    await sub2.close()
    await rt.close()
  })

  // §2-8 对照腿：默认（A3 = 32 MiB）16.8 ≤ 32 → 零淘汰 → resume cursor0
  // 零重放（首事件 replacement，非 resetRequired/baseline）。
  test('§2-8 A3-在对照: 默认 ledger 32 MiB → 同序列 resume cursor0 零重放 replacement', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writePairs(path, PAIRS_A)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub1 = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter1 = sub1[Symbol.asyncIterator]()
    const baseline = await nextEvent(iter1)
    if (baseline.kind !== 'baseline') throw new Error('expected baseline')
    const cursor0 = baseline.cursor
    appendPair(path, PAIRS_A + 1)
    expect((await nextEvent(iter1)).kind).toBe('replacement')
    appendPair(path, PAIRS_A + 2)
    expect((await nextEvent(iter1)).kind).toBe('replacement')
    const sub2 = await rt.followSession({
      scopeId: 'proj-a',
      sessionId: 'sess-1',
      resumeCursor: cursor0,
    })
    const iter2 = sub2[Symbol.asyncIterator]()
    const first = await nextEvent(iter2)
    expect(first.kind).toBe('replacement')
    if (first.kind === 'replacement') {
      expect(first.projection.messages).toHaveLength((PAIRS_A + 2) * 2)
    }
    await sub1.close()
    await sub2.close()
    await rt.close()
  })
})
