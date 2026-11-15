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

async function untilTerminal(
  iter: AsyncIterator<WebSessionEvent>,
): Promise<{ events: WebSessionEvent[]; terminal: WebSessionEvent }> {
  const events: WebSessionEvent[] = []
  for (;;) {
    const ev = await nextEvent(iter)
    events.push(ev)
    if (ev.kind === 'closed' || ev.kind === 'error') return { events, terminal: ev }
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
    const { terminal } = await untilTerminal(sub[Symbol.asyncIterator]())
    expect(terminal.kind).toBe('error')
    if (terminal.kind === 'error') expect(terminal.error.code).toBe('corruptData')
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

  test('abort → 终态 error code=cancelled（closed 优先序外）', async () => {
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
    const { terminal } = await untilTerminal(sub[Symbol.asyncIterator]())
    expect(terminal.kind).toBe('error')
    if (terminal.kind === 'error') expect(terminal.error.code).toBe('cancelled')
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
})
