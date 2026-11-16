/**
 * S0-R5 判据格 1/2/3（0.1.121 候，工单 §3 + 呈批书 §4 @6e772c02，f4 §13
 * 批复 @84c21b34 落码放行）：
 *
 * 格 1（② 重采样兜底，八腿）：同 inode rewrite 更小（回归）/ 更大（修形
 * 目标）/ 订阅窗口内 / 真损坏收窄不误吞 / 正常 append 零触碰 / 瞬态撕裂
 * 自愈零终态 / 重采样分类两腿直证（prefix 同自愈 + prefix 异 reset）/
 * 重采样撞 maxTranscriptBytes → resourceLimit（禁 corruptData 冒名）。
 *
 * 格 2（③ resumeCursor 接线，六腿）：有效 cursor 续接零重放 / unknown /
 * expired / mismatch 三因显式分态各一腿 / 断连窗 append N 条携 cursor
 * 重入 N 条全达 / 非法 cursor 契约形拒（FollowSessionRequestSchema）。
 *
 * 格 3（回归）：replay 零触碰 + follow 既有分态族（notFound）零变化。
 *
 * 真实 fs tmpdir seeded（follow 测试族先例）+ fs adapter；零网络。瞬态
 * 撕裂腿经 adapter 尾读一次性垃圾注入确定性复现（读竞 flush 的生产机制
 * 等价形）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createReadonlySessionRuntime } from '../../src/atlascode/web/readonlyRuntime'
import { atlasWebSessionEngine } from '../../src/atlascode/web/runtimeDefault'
import {
  createNodeFsSessionStoreAdapter,
  type SessionStoreAdapter,
} from '../../src/atlascode/web/sessionStoreAdapter'
import type { WebSessionEvent } from '../../src/kernel/protocol/webSessionV0'
import {
  FollowSessionRequestSchema,
  WebSessionEventSchema,
} from '../../src/kernel/protocol/webSessionV0'

// ── fixture ───────────────────────────────────────────────────────────────────

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-web-follow-rec-'))
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

/** 跨 session 行（mismatch 腿用 sess-2）。 */
const userLine2 = (uuid: string, parentUuid: string | null, text: string) =>
  userLine(uuid, parentUuid, text).replace('"sess-1"', '"sess-2"')

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

/**
 * 尾读一次性垃圾注入（瞬态撕裂读竞 flush 的确定性等价形）：前 count 次
 * readTranscriptTail 返回垃圾字节（sizeBytes/ino 取自真实 stat，账面
 * 一致），之后透传真实尾读。
 */
function injectTornTail(ad: SessionStoreAdapter, garbage: string, count = 1) {
  let injected = 0
  return {
    start: (...a: Parameters<SessionStoreAdapter['start']>) => ad.start(...a),
    listSessionFiles: (...a: Parameters<SessionStoreAdapter['listSessionFiles']>) =>
      ad.listSessionFiles(...a),
    readTranscript: (
      ...a: Parameters<SessionStoreAdapter['readTranscript']>
    ) => ad.readTranscript(...a),
    statTranscript: (
      ...a: Parameters<SessionStoreAdapter['statTranscript']>
    ) => ad.statTranscript(...a),
    resolveTranscriptPath: (
      ...a: Parameters<SessionStoreAdapter['resolveTranscriptPath']>
    ) => ad.resolveTranscriptPath(...a),
    close: () => ad.close(),
    readTranscriptTail: async (
      scopeId: string,
      sessionId: string,
      offset: number,
      signal?: AbortSignal,
    ) => {
      if (injected < count) {
        const st = await ad.statTranscript(scopeId, sessionId)
        if (st) {
          injected++
          return {
            bytes: new TextEncoder().encode(garbage),
            sizeBytes: st.sizeBytes,
            ino: st.ino,
          }
        }
      }
      return ad.readTranscriptTail(scopeId, sessionId, offset, signal)
    },
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

/** 消费至 closed 终态对（f4 §5.7 形：error → closed 成对）。 */
async function untilTerminal(
  iter: AsyncIterator<WebSessionEvent>,
): Promise<{ events: WebSessionEvent[]; terminal: WebSessionEvent }> {
  const events: WebSessionEvent[] = []
  for (;;) {
    const ev = await nextEvent(iter)
    events.push(ev)
    if (ev.kind === 'closed') return { events, terminal: ev }
  }
}

/** 取 resetRequired 事件（不挂死：有界轮询）。 */
function findReset(events: WebSessionEvent[]) {
  return events.find(e => e.kind === 'resetRequired')
}

// ── 格 1：② 重采样兜底（八腿）───────────────────────────────────────────────

describe('格1 ② 重采样兜底', () => {
  test('腿1 同 inode rewrite 更小（truncate）→ resetRequired（回归腿）', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'hello')}\n${assistantLine('a1', 'u1', 'world')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter = sub[Symbol.asyncIterator]()
    const baseline = await nextEvent(iter)
    if (baseline.kind !== 'baseline') throw new Error('expected baseline')
    const oldGeneration = baseline.generation

    // 同 inode 就地截断（writeFileSync 非 rename，ino 不变；size < offset）
    writeFileSync(path, `${userLine('u1', null, 'short')}\n`)

    const reset = await nextEvent(iter)
    expect(reset.kind).toBe('resetRequired')
    const rebase = await nextEvent(iter)
    expect(rebase.kind).toBe('baseline')
    if (rebase.kind === 'baseline') expect(rebase.generation).not.toBe(oldGeneration)
    await sub.close()
    await rt.close()
  })

  test('腿2 同 inode rewrite 更大（异 uuid）→ resetRequired（修形目标腿——禁 corruptData 硬终流）', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'hello')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter = sub[Symbol.asyncIterator]()
    const baseline = await nextEvent(iter)
    if (baseline.kind !== 'baseline') throw new Error('expected baseline')
    const oldGeneration = baseline.generation

    // 同 inode 就地重写更大（size > offset，旧守卫单向查漏过）：
    // 旧 offset 起尾读落在新行中间 → unparseable → 重采样 → prefix 异
    writeFileSync(path, `${userLine('u9', null, 'x'.repeat(400))}\n`)

    const reset = await nextEvent(iter)
    expect(reset.kind).toBe('resetRequired')
    if (reset.kind === 'resetRequired') expect(reset.reason.length).toBeGreaterThan(0)
    const rebase = await nextEvent(iter)
    expect(rebase.kind).toBe('baseline')
    if (rebase.kind === 'baseline') {
      expect(rebase.generation).not.toBe(oldGeneration)
      expect(JSON.stringify(rebase.projection)).toContain('u9')
      expect(JSON.stringify(rebase.projection)).not.toContain('hello')
    }
    // 订阅仍存活（非 corruptData 硬终流）：closed 不可达，直到显式 close
    await sub.close()
    const { terminal, events } = await untilTerminal(sub[Symbol.asyncIterator]())
    expect(terminal.kind).toBe('closed')
    expect(events.some(e => e.kind === 'error')).toBe(false)
    await rt.close()
  })

  test('腿3 订阅窗口内 rewrite（同 uuid 异内容）→ resetRequired（内容面 prefix 异）', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'hello')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter = sub[Symbol.asyncIterator]()
    await nextEvent(iter) // baseline（旧内容采样，offset 锚定）
    // 窗口内（首个轮询周期前）就地重写：同 uuid u1、内容改写 + 加长
    writeFileSync(path, `${userLine('u1', null, `CHANGED-${'y'.repeat(300)}`)}\n`)

    const reset = await nextEvent(iter)
    expect(reset.kind).toBe('resetRequired')
    const rebase = await nextEvent(iter)
    expect(rebase.kind).toBe('baseline')
    if (rebase.kind === 'baseline') {
      expect(JSON.stringify(rebase.projection)).toContain('CHANGED')
      expect(JSON.stringify(rebase.projection)).not.toContain('"hello"')
    }
    await sub.close()
    await rt.close()
  })

  test('腿4 真损坏 fixture → corruptData（收窄不误吞——重采样确认垃圾仍在盘）', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'hi')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter = sub[Symbol.asyncIterator]()
    await nextEvent(iter) // baseline
    appendFileSync(path, '{definitely-not-json\n')
    const { terminal, events } = await untilTerminal(sub[Symbol.asyncIterator]())
    expect(terminal.kind).toBe('closed')
    const errEv = events.find(e => e.kind === 'error')
    expect(errEv).toBeDefined()
    if (errEv?.kind === 'error') {
      expect(errEv.error.code).toBe('corruptData')
      expect(String(errEv.error.message)).toContain('resample')
    }
    await rt.close()
  })

  test('腿5 正常 append 增量续接零触碰（回归腿）', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'hi')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter = sub[Symbol.asyncIterator]()
    const baseline = await nextEvent(iter)
    if (baseline.kind !== 'baseline') throw new Error('expected baseline')
    appendFileSync(path, `${assistantLine('a1', 'u1', 'world')}\n`)
    const rep = await nextEvent(iter)
    expect(rep.kind).toBe('replacement')
    if (rep.kind === 'replacement') {
      expect(rep.revision).toBe(1)
      expect(rep.projection.messages).toHaveLength(2)
    }
    // 零 resetRequired 零 error
    await sub.close()
    const { events } = await untilTerminal(sub[Symbol.asyncIterator]())
    expect(findReset(events)).toBeUndefined()
    expect(events.some(e => e.kind === 'error')).toBe(false)
    await rt.close()
  })

  test('腿6 瞬态撕裂行自愈零终态（一次性尾读垃圾注入，盘面纯净 → 静默自愈）', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'hi')}\n`)
    const real = createNodeFsSessionStoreAdapter({
      productId: 'atlascode',
      scopes: [{ scopeId: 'proj-a', storageDir: dir }],
    })
    const ad = injectTornTail(real, '{"torn-not-json\n', 1)
    const rt = createReadonlySessionRuntime({
      productId: 'atlascode',
      scopes: [{ scopeId: 'proj-a', storageDir: dir }],
      engine: atlasWebSessionEngine(),
      adapter: ad as unknown as SessionStoreAdapter,
      limits: { pollingIntervalMs: 100 } as never,
    })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter = sub[Symbol.asyncIterator]()
    await nextEvent(iter) // baseline

    // 等两个 poll 周期：撕裂尾读已发生并自愈（盘面无新记录 → 零事件）
    await sleep(300)
    // 自愈后订阅存活且后续增量正常流动（自愈零终态的直接证明）
    appendFileSync(path, `${assistantLine('a1', 'u1', 'after-heal')}\n`)
    const rep = await nextEvent(iter)
    expect(rep.kind).toBe('replacement')
    if (rep.kind === 'replacement') expect(rep.revision).toBe(1)
    await sub.close()
    const { events } = await untilTerminal(sub[Symbol.asyncIterator]())
    expect(events.some(e => e.kind === 'error')).toBe(false)
    expect(findReset(events)).toBeUndefined()
    await rt.close()
  })

  test('腿7a 重采样分类直证·prefix 同自愈腿（盘面含新记录 → 自愈 replacement 全达）', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'hi')}\n`)
    const real = createNodeFsSessionStoreAdapter({
      productId: 'atlascode',
      scopes: [{ scopeId: 'proj-a', storageDir: dir }],
    })
    const ad = injectTornTail(real, '{garbage-tail\n', 1)
    const rt = createReadonlySessionRuntime({
      productId: 'atlascode',
      scopes: [{ scopeId: 'proj-a', storageDir: dir }],
      engine: atlasWebSessionEngine(),
      adapter: ad as unknown as SessionStoreAdapter,
      limits: { pollingIntervalMs: 100 } as never,
    })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter = sub[Symbol.asyncIterator]()
    await nextEvent(iter) // baseline
    appendFileSync(path, `${assistantLine('a1', 'u1', 'recovered-record')}\n`)

    // 撕裂尾读触发重采样；盘面 = prefix + a1（全可解析、prefix 同）
    // → 自愈并交付 gap 记录（零丢段）
    const rep = await nextEvent(iter)
    expect(rep.kind).toBe('replacement')
    if (rep.kind === 'replacement') {
      expect(rep.revision).toBe(1)
      expect(JSON.stringify(rep.projection)).toContain('recovered-record')
    }
    await sub.close()
    const { events } = await untilTerminal(sub[Symbol.asyncIterator]())
    expect(events.some(e => e.kind === 'error')).toBe(false)
    expect(findReset(events)).toBeUndefined()
    await rt.close()
  })

  test('腿7b 重采样分类直证·prefix 异 resetRequired 腿（盘面重写异前缀，禁 corruptData 误判）', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'hello')}\n`)
    const real = createNodeFsSessionStoreAdapter({
      productId: 'atlascode',
      scopes: [{ scopeId: 'proj-a', storageDir: dir }],
    })
    const ad = injectTornTail(real, '{garbage-tail\n', 1)
    const rt = createReadonlySessionRuntime({
      productId: 'atlascode',
      scopes: [{ scopeId: 'proj-a', storageDir: dir }],
      engine: atlasWebSessionEngine(),
      adapter: ad as unknown as SessionStoreAdapter,
      limits: { pollingIntervalMs: 100 } as never,
    })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter = sub[Symbol.asyncIterator]()
    const baseline = await nextEvent(iter)
    if (baseline.kind !== 'baseline') throw new Error('expected baseline')
    const oldGeneration = baseline.generation

    // 尾读垃圾触发重采样；盘面已重写为异前缀（合法 JSONL、identity 不连续）
    writeFileSync(path, `${userLine('u7', null, 'rewritten-world')}\n`)

    const reset = await nextEvent(iter)
    expect(reset.kind).toBe('resetRequired')
    const rebase = await nextEvent(iter)
    expect(rebase.kind).toBe('baseline')
    if (rebase.kind === 'baseline') {
      expect(rebase.generation).not.toBe(oldGeneration)
      expect(JSON.stringify(rebase.projection)).toContain('rewritten-world')
    }
    await sub.close()
    const { events } = await untilTerminal(sub[Symbol.asyncIterator]())
    expect(events.some(e => e.kind === 'error')).toBe(false)
    await rt.close()
  })

  test('腿8 重采样撞 maxTranscriptBytes → resourceLimit（禁 corruptData 冒名）', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'hi')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100, maxTranscriptBytes: 600 })
    await rt.start()
    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter = sub[Symbol.asyncIterator]()
    await nextEvent(iter) // baseline

    // 同 inode 就地重写超界垃圾（size > offset 过旧守卫 → 尾读 unparseable
    // → 重采样 → 尺寸界先行 → resourceLimit，而非 corruptData）
    writeFileSync(path, `${'{"junk-junk-junk\n'.repeat(80)}`)

    const { terminal, events } = await untilTerminal(sub[Symbol.asyncIterator]())
    const errEv = events.find(e => e.kind === 'error')
    expect(errEv).toBeDefined()
    if (errEv?.kind === 'error') expect(errEv.error.code).toBe('resourceLimit')
    expect(terminal.kind).toBe('closed')
    await rt.close()
  })
})

// ── 格 2：③ resumeCursor 接线（六腿）───────────────────────────────────────

describe('格2 ③ resumeCursor 续接', () => {
  test('腿1 有效 cursor 续接零重放（无 baseline 事件、generation/revision 续接）', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'hi')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub1 = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter1 = sub1[Symbol.asyncIterator]()
    const baseline = await nextEvent(iter1)
    if (baseline.kind !== 'baseline') throw new Error('expected baseline')
    appendFileSync(path, `${assistantLine('a1', 'u1', 'world')}\n`)
    const rep = await nextEvent(iter1)
    if (rep.kind !== 'replacement') throw new Error('expected replacement')
    const cursor = rep.cursor
    expect(typeof cursor).toBe('string')
    const gen = rep.generation
    await sub1.close()

    // 携 cursor 重入：不发 baseline（消费侧已持 projection——重发即重放）
    const sub2 = await rt.followSession({
      scopeId: 'proj-a',
      sessionId: 'sess-1',
      resumeCursor: cursor,
    })
    const iter2 = sub2[Symbol.asyncIterator]()
    appendFileSync(path, `${assistantLine('a2', 'a1', 'next')}\n`)
    const first = await nextEvent(iter2)
    expect(first.kind).toBe('replacement')
    if (first.kind === 'replacement') {
      expect(first.revision).toBe(2)
      expect(first.generation).toBe(gen)
      expect(first.projection.messages).toHaveLength(3)
    }
    await sub2.close()
    await rt.close()
  })

  test('腿5 断连窗 append N=3 条携 cursor 重入 → N 条全达零丢段', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'hi')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub1 = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter1 = sub1[Symbol.asyncIterator]()
    await nextEvent(iter1) // baseline
    appendFileSync(path, `${assistantLine('a1', 'u1', 'm1')}\n`)
    const rep = await nextEvent(iter1)
    if (rep.kind !== 'replacement') throw new Error('expected replacement')
    const cursor = rep.cursor
    await sub1.close()

    // 断连窗：追加 3 条
    appendFileSync(
      path,
      [
        assistantLine('a2', 'a1', 'gap-1'),
        assistantLine('a3', 'a2', 'gap-2'),
        assistantLine('a4', 'a3', 'gap-3'),
      ]
        .join('\n') + '\n',
    )

    const sub2 = await rt.followSession({
      scopeId: 'proj-a',
      sessionId: 'sess-1',
      resumeCursor: cursor,
    })
    const iter2 = sub2[Symbol.asyncIterator]()
    const first = await nextEvent(iter2)
    expect(first.kind).toBe('replacement')
    if (first.kind === 'replacement') {
      const text = JSON.stringify(first.projection)
      expect(text).toContain('gap-1')
      expect(text).toContain('gap-2')
      expect(text).toContain('gap-3')
      expect(first.projection.messages).toHaveLength(5)
      expect(first.revision).toBe(2)
    }
    await sub2.close()
    await rt.close()
  })

  test('腿2 unknown token → resetRequired 显式分态（分因 message 可辨）', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'hi')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub = await rt.followSession({
      scopeId: 'proj-a',
      sessionId: 'sess-1',
      resumeCursor: '00000000-0000-4000-8000-000000000000',
    })
    const iter = sub[Symbol.asyncIterator]()
    const reset = await nextEvent(iter)
    expect(reset.kind).toBe('resetRequired')
    if (reset.kind === 'resetRequired') expect(reset.reason).toContain('unknown')
    const rebase = await nextEvent(iter)
    expect(rebase.kind).toBe('baseline')
    await sub.close()
    await rt.close()
  })

  test('腿3 expired token → resetRequired（cursorTtlMs 越期显式分态）', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'hi')}\n`)
    // cursorTtlMs 硬下界 1000ms（limits.ts HARD_MIN_CURSOR_TTL_MS）
    const rt = makeRuntime({ pollingIntervalMs: 100, cursorTtlMs: 1000 })
    await rt.start()
    const sub1 = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter1 = sub1[Symbol.asyncIterator]()
    await nextEvent(iter1) // baseline
    appendFileSync(path, `${assistantLine('a1', 'u1', 'world')}\n`)
    const rep = await nextEvent(iter1)
    if (rep.kind !== 'replacement') throw new Error('expected replacement')
    const cursor = rep.cursor
    await sub1.close()

    await sleep(1100) // 越过 cursorTtlMs（硬下界 1000ms）
    const sub2 = await rt.followSession({
      scopeId: 'proj-a',
      sessionId: 'sess-1',
      resumeCursor: cursor,
    })
    const iter2 = sub2[Symbol.asyncIterator]()
    const reset = await nextEvent(iter2)
    expect(reset.kind).toBe('resetRequired')
    if (reset.kind === 'resetRequired') expect(reset.reason).toContain('expired')
    const rebase = await nextEvent(iter2)
    expect(rebase.kind).toBe('baseline')
    await sub2.close()
    await rt.close()
  })

  test('腿4 mismatch token（跨 session 绑定）→ resetRequired 显式分态', async () => {
    writeFileSync(
      join(dir, 'sess-1.jsonl'),
      `${userLine('u1', null, 'hi')}\n`,
    )
    writeFileSync(
      join(dir, 'sess-2.jsonl'),
      `${userLine2('v1', null, 'other-session')}\n`,
    )
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub1 = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const iter1 = sub1[Symbol.asyncIterator]()
    await nextEvent(iter1) // baseline
    appendFileSync(join(dir, 'sess-1.jsonl'), `${assistantLine('a1', 'u1', 'world')}\n`)
    const rep = await nextEvent(iter1)
    if (rep.kind !== 'replacement') throw new Error('expected replacement')
    const cursor = rep.cursor
    await sub1.close()

    // sess-2 携 sess-1 的 cursor → verify mismatch → resetRequired + sess-2 baseline
    const sub2 = await rt.followSession({
      scopeId: 'proj-a',
      sessionId: 'sess-2',
      resumeCursor: cursor,
    })
    const iter2 = sub2[Symbol.asyncIterator]()
    const reset = await nextEvent(iter2)
    expect(reset.kind).toBe('resetRequired')
    if (reset.kind === 'resetRequired') expect(reset.reason).toContain('mismatch')
    const rebase = await nextEvent(iter2)
    expect(rebase.kind).toBe('baseline')
    if (rebase.kind === 'baseline') {
      expect(JSON.stringify(rebase.projection)).toContain('other-session')
    }
    await sub2.close()
    await rt.close()
  })

  test('腿6 非法 cursor 契约形拒（FollowSessionRequestSchema strict 拒非 string）', () => {
    const base = {
      schemaVersion: 0,
      productId: 'atlascode',
      scopeId: 'proj-a',
      kind: 'followSession',
      sessionId: 'sess-1',
      requestId: '00000000-0000-4000-8000-00000000000b',
    }
    expect(() =>
      FollowSessionRequestSchema.parse({ ...base, resumeCursor: 12345 }),
    ).toThrow()
    expect(() =>
      FollowSessionRequestSchema.parse({ ...base, resumeCursor: '' }),
    ).toThrow()
    // 合法形接受
    const ok = FollowSessionRequestSchema.parse({
      ...base,
      requestId: '00000000-0000-4000-8000-00000000000a',
      resumeCursor: 'cursor-token-1',
    })
    expect(ok.resumeCursor).toBe('cursor-token-1')
    // 缺省臂恒等（optional 既有形零变化）
    const noCursor = FollowSessionRequestSchema.parse(base)
    expect('resumeCursor' in noCursor).toBe(false)
  })
})

// ── 格 3：回归 ────────────────────────────────────────────────────────────────

describe('格3 回归（既有分态族零变化）', () => {
  test('replay 零触碰：contract 形投影恒等；followSession 缺文件 notFound 分态族零变化', async () => {
    writeFileSync(
      join(dir, 'sess-1.jsonl'),
      `${userLine('u1', null, 'hello')}\n${assistantLine('a1', 'u1', 'world')}\n`,
    )
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const res = await rt.replaySession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    expect(res.of).toBe('replaySession')
    expect(res.projection.messages).toHaveLength(2)

    const sub = await rt.followSession({ scopeId: 'proj-a', sessionId: 'missing' })
    const { terminal, events } = await untilTerminal(sub[Symbol.asyncIterator]())
    const errEv = events.find(e => e.kind === 'error')
    expect(errEv?.kind === 'error' && errEv.error.code).toBe('notFound')
    expect(terminal.kind).toBe('closed')
    await rt.close()
  })

  test('事件过 contract WebSessionEventSchema（envelope 全在；resetRequired/cursor 形不破契约）', async () => {
    const path = join(dir, 'sess-1.jsonl')
    writeFileSync(path, `${userLine('u1', null, 'hi')}\n`)
    const rt = makeRuntime({ pollingIntervalMs: 100 })
    await rt.start()
    const sub1 = await rt.followSession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const ev = await nextEvent(sub1[Symbol.asyncIterator]())
    expect(WebSessionEventSchema.parse(ev).kind).toBe('baseline')
    appendFileSync(path, `${assistantLine('a1', 'u1', 'world')}\n`)
    const rep = await nextEvent(sub1[Symbol.asyncIterator]())
    const parsed = WebSessionEventSchema.parse(rep)
    expect(parsed.kind).toBe('replacement')
    await sub1.close()

    // unknown cursor → resetRequired 亦过契约
    const sub2 = await rt.followSession({
      scopeId: 'proj-a',
      sessionId: 'sess-1',
      resumeCursor: '00000000-0000-4000-8000-000000000000',
    })
    const reset = await nextEvent(sub2[Symbol.asyncIterator]())
    expect(WebSessionEventSchema.parse(reset).kind).toBe('resetRequired')
    await sub2.close()
    await rt.close()
  })
})
