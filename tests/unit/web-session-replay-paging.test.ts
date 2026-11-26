/**
 * F6-PAGE S1（工单 docs/2026-11-25-f6-page-ticket.md §B 必改①②③定形，
 * 复判 PASS @c268698b）：carrier replay 面加性分页——RED 先行冻结契约形。
 *
 * 冻结面（S1 契约，随 RED 显性化）：
 *  - `ReplaySessionRequest` += optional `pageToken`/`pageSize`；缺省无参 =
 *    旧全量 replay 逐字节不变（格 2 加性兼容，A 组对表腿）。
 *  - `ReplaySessionResult` += optional `nextPageToken`/`hasMore`；envelope
 *    保留（sessionId/productId/scopeId/semantics/truncated 恒同形），窗口
 *    messages 恰一无重无漏（页序数 = 有效投影链记录序）。
 *  - token = opaque base64url JSON {v:1,scopeId,sessionId,offset,anchor}；
 *    anchor = 链 uuid 前缀 [0..offset) 指纹（SHA-256 截断 16 hex）——
 *    必改②三分态：append 前缀稳定 → 续页合法 / rewrite·compact →
 *    cursorExpired（含界内序数，禁错页静默）/ 域外 → invalidRequest。
 *  - 页双界（必改③）：records ≤ clamp(pageSize, L.pageSize) × bytes ≤
 *    L.maxReplayPageBytes（新 limits 单源 DEFAULT 4MiB / HARD 16MiB）；
 *    超界收页 leg（200×1MiB 级响应不得成立）+ 单记录独超页界 → resourceLimit。
 *  - 装窗读路径（必改①）：零全量驻留——engine 侧 skeleton 扫描（链字段 +
 *    tool_result 检测标记 + compactMetadata，内容剥除）→ 真
 *    buildConversationChain → 页窗口按字节范围随机读。全量路径帽逐项不变；
 *    分页路径扫描界 = HARD_MAX_TRANSCRIPT_BYTES（256MiB 硬天花板复用单源，
 *    L.maxTranscriptBytes 64MiB 默认帽不施加——超旧帽转录可分页可达）。
 *  - maxParseRecords 不施加（勘正②：search 面专用帽）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  createReadonlySessionRuntime,
  type ReplaySessionResult,
} from '../../src/atlascode/web/readonlyRuntime'
import { atlasWebSessionEngine } from '../../src/atlascode/web/runtimeDefault'
import {
  DEFAULT_MAX_REPLAY_PAGE_BYTES,
  HARD_MAX_REPLAY_PAGE_BYTES,
} from '../../src/atlascode/web/limits'
import {
  ReplaySessionRequestSchema,
  ReplaySessionSuccessSchema,
} from '../../src/kernel/protocol/webSessionV0'

const SCOPE = 'proj-a'

// ── fixture 面（tmpdir seeded 真文件，lifecycle 测 D/E 组同形）───────────────

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-web-page-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** user 行（text 内容字符串）。 */
const userLine = (
  uuid: string,
  parentUuid: string | null,
  text: string,
  ts: string,
) =>
  JSON.stringify({
    type: 'user',
    uuid,
    parentUuid,
    sessionId: 'sess-1',
    timestamp: ts,
    cwd: dir,
    userType: 'atlas',
    version: '0.0.0',
    isSidechain: false,
    message: { role: 'user', content: text },
  }) + '\n'

/** assistant 行（text 块数组 + message.id）。 */
const asstLine = (
  uuid: string,
  parentUuid: string | null,
  text: string,
  ts: string,
  msgId: string,
) =>
  JSON.stringify({
    type: 'assistant',
    uuid,
    parentUuid,
    sessionId: 'sess-1',
    timestamp: ts,
    cwd: dir,
    userType: 'atlas',
    version: '0.0.0',
    isSidechain: false,
    message: { role: 'assistant', id: msgId, content: [{ type: 'text', text }] },
  }) + '\n'

/** N 条渲染性消息的线性链（user/assistant 交替），timestamp 递增。 */
function linearTranscript(n: number, textSize = 16): string {
  const parts: string[] = []
  let parent: string | null = null
  for (let i = 0; i < n; i++) {
    const uuid = `m${i + 1}`
    const ts = new Date(Date.UTC(2026, 10, 25, 0, 0, i)).toISOString()
    parts.push(
      i % 2 === 0
        ? userLine(uuid, parent, `hello ${uuid} ${'x'.repeat(textSize)}`, ts)
        : asstLine(uuid, parent, `reply ${uuid} ${'y'.repeat(textSize)}`, ts, `msg_${i}`),
    )
    parent = uuid
  }
  return parts.join('')
}

function makeRuntime(limits?: { maxTranscriptBytes?: number; maxReplayPageBytes?: number }) {
  return createReadonlySessionRuntime({
    productId: 'atlascode',
    scopes: [{ scopeId: SCOPE, storageDir: dir }],
    engine: atlasWebSessionEngine(),
    ...(limits ? { limits } : {}),
  })
}

async function replayFull(
  rt: ReturnType<typeof makeRuntime>,
): Promise<ReplaySessionResult> {
  return rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1' })
}

/** 逐页走完分页链，返回全部窗口拼接 + 页元数据序列。 */
async function pageThrough(
  rt: ReturnType<typeof makeRuntime>,
  pageSize: number,
): Promise<{ windows: ReplaySessionResult['projection']['messages'][]; meta: Array<{ hasMore?: boolean; token?: string }> }> {
  const windows: ReplaySessionResult['projection']['messages'][] = []
  const meta: Array<{ hasMore?: boolean; token?: string }> = []
  let token: string | undefined
  for (let i = 0; i < 100; i++) {
    const res = await rt.replaySession({
      scopeId: SCOPE,
      sessionId: 'sess-1',
      pageSize,
      ...(token !== undefined ? { pageToken: token } : {}),
    })
    windows.push(res.projection.messages)
    meta.push({ hasMore: res.hasMore, token: res.nextPageToken })
    if (!res.hasMore) break
    token = res.nextPageToken
    expect(token).toBeDefined()
  }
  return { windows, meta }
}

const msgIds = (res: ReplaySessionResult) => res.projection.messages.map(m => m.id)

// ── A. 加性兼容 + 对表（格 2；§4-2 判据形 = 显式对表腿）─────────────────────

describe('A. 加性兼容（无分页参 = 旧全量 replay 不变）', () => {
  test('A1 无分页参结果零新键（hasMore/nextPageToken 不在场）', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), linearTranscript(4))
    const rt = makeRuntime()
    await rt.start()
    const res = await replayFull(rt)
    expect(res.of).toBe('replaySession')
    expect(res.projection.semantics).toBe('persisted-effective-conversation')
    expect(res.projection.truncated).toBe(false)
    expect('hasMore' in res).toBe(false)
    expect('nextPageToken' in res).toBe(false)
    await rt.close()
  })

  test('A2 分页全走拼接 ≡ 全量投影 messages（恰一无重无漏）+ envelope 恒同', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), linearTranscript(5))
    const rt = makeRuntime()
    await rt.start()
    const full = await replayFull(rt)
    const { windows } = await pageThrough(rt, 2)
    expect(windows.flat().map(m => m.id)).toEqual(full.projection.messages.map(m => m.id))
    expect(windows.flat()).toEqual(full.projection.messages)
    await rt.close()
  })
})

// ── B. 页大小 clamp（格 1：50/200 已冻值复用，clamp 至 L.pageSize）──────────

describe('B. 页大小 clamp（search 面 :706 同形）', () => {
  test('B1 pageSize 100 → clamp 至 L.pageSize 50（默认 50 下请求 100 → 50）', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), linearTranscript(61))
    const rt = makeRuntime()
    await rt.start()
    const res = await rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageSize: 100 })
    expect(res.projection.messages.length).toBe(50)
    expect(res.hasMore).toBe(true)
    expect(res.nextPageToken).toBeDefined()
    await rt.close()
  })

  test('B2 pageSize 0 / 负值 → 1（Math.max 下界）', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), linearTranscript(4))
    const rt = makeRuntime()
    await rt.start()
    for (const pageSize of [0, -3]) {
      const res = await rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageSize })
      expect(res.projection.messages.length).toBe(1)
      expect(res.hasMore).toBe(true)
    }
    await rt.close()
  })

  test('B3 pageSize 缺省 → L.pageSize 50', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), linearTranscript(52))
    const rt = makeRuntime()
    await rt.start()
    const res = await rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageToken: undefined })
    expect(res.projection.messages.length).toBe(50)
    await rt.close()
  })
})

// ── C. token 三分态（必改②：malformed/域外 → invalidRequest；rewrite → cursorExpired；append → 合法）──

describe('C. token 域绑定 + 漂移锚三分态', () => {
  test('C1 malformed token → invalidRequest（逐形独立腿）', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), linearTranscript(4))
    const rt = makeRuntime()
    await rt.start()
    const bad = [
      'not-a-token',
      'eyJh', // 截断 base64
      Buffer.from('not json', 'utf8').toString('base64url'),
      Buffer.from(JSON.stringify({ v: 2, scopeId: SCOPE, sessionId: 'sess-1', offset: 1, anchor: 'a'.repeat(16) }), 'utf8').toString('base64url'),
      Buffer.from(JSON.stringify({ v: 1, scopeId: SCOPE, sessionId: 'sess-1', offset: -1, anchor: 'a'.repeat(16) }), 'utf8').toString('base64url'),
      Buffer.from(JSON.stringify({ v: 1, scopeId: SCOPE, sessionId: 'sess-1', offset: 1.5, anchor: 'a'.repeat(16) }), 'utf8').toString('base64url'),
      Buffer.from(JSON.stringify({ v: 1, scopeId: SCOPE, sessionId: 'sess-1', offset: 1 }), 'utf8').toString('base64url'),
    ]
    for (const pageToken of bad) {
      await expect(
        rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageToken }),
      ).rejects.toMatchObject({ code: 'invalidRequest' })
    }
    await rt.close()
  })

  test('C2 域外 token（跨 session / 跨 scope 重放）→ invalidRequest', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), linearTranscript(4))
    writeFileSync(join(dir, 'sess-2.jsonl'), linearTranscript(4))
    const rt = makeRuntime()
    await rt.start()
    const p1 = await rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageSize: 2 })
    const token = p1.nextPageToken!
    // 跨 session
    await expect(
      rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-2', pageToken: token }),
    ).rejects.toMatchObject({ code: 'invalidRequest' })
    // 跨 scope（未授权 scope 在域绑定校验前还有 scopeDenied；授权双 scope 下重放 = invalidRequest）
    const rt2 = createReadonlySessionRuntime({
      productId: 'atlascode',
      scopes: [
        { scopeId: SCOPE, storageDir: dir },
        { scopeId: 'proj-b', storageDir: dir },
      ],
      engine: atlasWebSessionEngine(),
    })
    await rt2.start()
    await expect(
      rt2.replaySession({ scopeId: 'proj-b', sessionId: 'sess-1', pageToken: token }),
    ).rejects.toMatchObject({ code: 'invalidRequest' })
    await rt.close()
    await rt2.close()
  })

  test('C3 rewrite 后旧 token → cursorExpired（含界内序数：新链长 3 > offset 2）', async () => {
    const p = join(dir, 'sess-1.jsonl')
    writeFileSync(p, linearTranscript(4))
    const rt = makeRuntime()
    await rt.start()
    const p1 = await rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageSize: 2 })
    const token = p1.nextPageToken!
    // rewrite：整文件换成新 uuid 的 3 条链（offset 2 仍在界内，但前缀指纹
    // 已漂移——fixture 用 r1..r3 新 uuid，linearTranscript 的 m1..m3 复用
    // 旧 uuid 会与 append 不可区分）
    const parts = [
      userLine('r1', null, 'hello r1 ' + 'x'.repeat(16), new Date(Date.UTC(2026, 10, 25, 0, 0, 0)).toISOString()),
      asstLine('r2', 'r1', 'reply r2 ' + 'y'.repeat(16), new Date(Date.UTC(2026, 10, 25, 0, 0, 1)).toISOString(), 'rm_0'),
      userLine('r3', 'r2', 'hello r3 ' + 'x'.repeat(16), new Date(Date.UTC(2026, 10, 25, 0, 0, 2)).toISOString()),
    ]
    writeFileSync(p, parts.join(''))
    await expect(
      rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageToken: token }),
    ).rejects.toMatchObject({ code: 'cursorExpired' })
    await rt.close()
  })

  test('C4 rewrite 后新链短于 token offset → cursorExpired（禁错页静默）', async () => {
    const p = join(dir, 'sess-1.jsonl')
    writeFileSync(p, linearTranscript(4))
    const rt = makeRuntime()
    await rt.start()
    const p1 = await rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageSize: 2 })
    writeFileSync(p, linearTranscript(1))
    await expect(
      rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageToken: p1.nextPageToken! }),
    ).rejects.toMatchObject({ code: 'cursorExpired' })
    await rt.close()
  })

  test('C5 append 后旧 token 前缀稳定 → 续页合法，append 内容落在后续页', async () => {
    const p = join(dir, 'sess-1.jsonl')
    writeFileSync(p, linearTranscript(4))
    const rt = makeRuntime()
    await rt.start()
    const before = await replayFull(rt)
    const p1 = await rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageSize: 2 })
    const token = p1.nextPageToken!
    // append 两条（前缀 [0..2) 字节序不变）
    const appended =
      userLine('m5', 'm4', 'hello m5 ' + 'x'.repeat(16), new Date(Date.UTC(2026, 10, 25, 0, 0, 10)).toISOString()) +
      asstLine('m6', 'm5', 'reply m6 ' + 'y'.repeat(16), new Date(Date.UTC(2026, 10, 25, 0, 0, 11)).toISOString(), 'msg_5')
    writeFileSync(p, readFileSync(p, 'utf8') + appended)
    const p2 = await rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageSize: 2, pageToken: token })
    // 续页窗口 = 旧记录 m3/m4（前缀语义不被 append 扰动）
    expect(p2.projection.messages.map(m => m.id)).toEqual(
      before.projection.messages.slice(2, 4).map(m => m.id),
    )
    expect(p2.hasMore).toBe(true)
    const p3 = await rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageSize: 2, pageToken: p2.nextPageToken! })
    expect(p3.projection.messages.map(m => m.id)).toEqual(['m5', 'm6'])
    expect(p3.hasMore).toBe(false)
    await rt.close()
  })
})

// ── D. 页边界 ±1（格 1 边界腿）───────────────────────────────────────────────

describe('D. 页边界 ±1', () => {
  test('D1 恰尽：末页窗口数恰 = pageSize 余量，hasMore false 无 nextPageToken', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), linearTranscript(4))
    const rt = makeRuntime()
    await rt.start()
    const p1 = await rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageSize: 2 })
    expect(p1.projection.messages.length).toBe(2)
    expect(p1.hasMore).toBe(true)
    const p2 = await rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageSize: 2, pageToken: p1.nextPageToken! })
    expect(p2.projection.messages.length).toBe(2)
    expect(p2.hasMore).toBe(false)
    expect('nextPageToken' in p2).toBe(false)
    await rt.close()
  })

  test('D2 末页不满：越界请求返回余量窗口', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), linearTranscript(5))
    const rt = makeRuntime()
    await rt.start()
    const { windows } = await pageThrough(rt, 3)
    expect(windows.map(w => w.length)).toEqual([3, 2])
    await rt.close()
  })

  test('D3 零渲染性消息（仅 metadata 行）→ 空窗口 + hasMore false', async () => {
    writeFileSync(
      join(dir, 'sess-1.jsonl'),
      JSON.stringify({ type: 'summary', leafUuid: 'x', summary: 's' }) + '\n',
    )
    const rt = makeRuntime()
    await rt.start()
    const res = await rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageSize: 10 })
    expect(res.projection.messages).toEqual([])
    expect(res.hasMore).toBe(false)
    await rt.close()
  })

  test('D4 分页路径 notFound 与全量同形', async () => {
    const rt = makeRuntime()
    await rt.start()
    await expect(
      rt.replaySession({ scopeId: SCOPE, sessionId: 'missing', pageSize: 2 }),
    ).rejects.toMatchObject({ code: 'notFound' })
    await rt.close()
  })
})

// ── E. 帽语义分态 + 超旧帽样本（必改①：全量帽逐项不变 / 分页路径页界为界）────

describe('E. 帽语义分态（超旧帽样本）', () => {
  test('E1 limits 数值冻结在案（DEFAULT 4MiB / HARD 16MiB，单源 limits.ts）', () => {
    expect(DEFAULT_MAX_REPLAY_PAGE_BYTES).toBe(4 * 1024 * 1024)
    expect(HARD_MAX_REPLAY_PAGE_BYTES).toBe(16 * 1024 * 1024)
  })

  test('E2 全量路径 L.maxTranscriptBytes 帽不变；分页路径绕行可达（帽分态）', async () => {
    // ~3KB transcript，runtime 帽压到 2KB：全量 resourceLimit，分页 pageSize 1 可达
    writeFileSync(join(dir, 'sess-1.jsonl'), linearTranscript(6, 200))
    const rt = makeRuntime({ maxTranscriptBytes: 2048 })
    await rt.start()
    await expect(replayFull(rt)).rejects.toMatchObject({ code: 'resourceLimit' })
    const res = await rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageSize: 1 })
    expect(res.projection.messages.length).toBe(1)
    expect(res.hasMore).toBe(true)
    await rt.close()
  })

  test('E3 投影 >4MiB 样本：全量 resourceLimit，分页窗口逐一可达且拼接 ≡ 链序', async () => {
    // 6 × ~1MiB text → 全投影 ~6MiB > 4MiB 投影帽（E2 组样本形态，投影帽优先）
    writeFileSync(join(dir, 'sess-1.jsonl'), linearTranscript(6, 1024 * 1024))
    const rt = makeRuntime()
    await rt.start()
    await expect(replayFull(rt)).rejects.toMatchObject({ code: 'resourceLimit' })
    const { windows } = await pageThrough(rt, 2)
    expect(windows.map(w => w.length)).toEqual([2, 2, 2])
    expect(windows.flat().map(m => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6'])
    await rt.close()
  })
})

// ── F. 页双界（必改③：records × bytes 收页；超界收页 leg）──────────────────

describe('F. 页级资源双界', () => {
  test('F1 字节界收页：窗口序列化 ≤ maxReplayPageBytes，records 未满即收', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), linearTranscript(8, 100))
    const rt = makeRuntime({ maxReplayPageBytes: 300 })
    await rt.start()
    const res = await rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageSize: 10 })
    expect(res.projection.messages.length).toBeLessThan(8)
    const bytes = Buffer.byteLength(JSON.stringify(res.projection.messages))
    expect(bytes).toBeLessThanOrEqual(300)
    expect(res.hasMore).toBe(true)
    await rt.close()
  })

  test('F2 单记录独超页界 → resourceLimit（页无法交付，零隐式截断）', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), linearTranscript(1, 1024 * 1024))
    const rt = makeRuntime({ maxReplayPageBytes: 1024 })
    await rt.start()
    await expect(
      rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageSize: 5 }),
    ).rejects.toMatchObject({ code: 'resourceLimit' })
    await rt.close()
  })

  test('F3 records 界独立生效：pageSize 2 于 8 条消息 → 恰 2 条（字节界未触）', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), linearTranscript(8, 16))
    const rt = makeRuntime({ maxReplayPageBytes: 1024 * 1024 })
    await rt.start()
    const res = await rt.replaySession({ scopeId: SCOPE, sessionId: 'sess-1', pageSize: 2 })
    expect(res.projection.messages.length).toBe(2)
    await rt.close()
  })
})

// ── G. wire 契约加性（R2：optional 字段不破 schemaVersion；strictObject 保留）──

describe('G. wire 契约加性面', () => {
  const envelope = {
    schemaVersion: 0,
    requestId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    productId: 'atlascode',
    scopeId: 'proj-a',
    kind: 'replaySession',
    sessionId: 'sess-1',
  }

  test('G1 ReplaySessionRequestSchema 接受 pageSize/pageToken；未知字段仍拒', () => {
    expect(() =>
      ReplaySessionRequestSchema.parse({ ...envelope, pageSize: 50, pageToken: 'tok' }),
    ).not.toThrow()
    expect(() => ReplaySessionRequestSchema.parse({ ...envelope, pageSize: 0 })).toThrow()
    expect(() => ReplaySessionRequestSchema.parse({ ...envelope, pageSize: 201 })).toThrow()
    expect(() =>
      ReplaySessionRequestSchema.parse({ ...envelope, unknownKey: 1 }),
    ).toThrow()
  })

  test('G2 ReplaySessionSuccessSchema 接受 hasMore/nextPageToken optional', () => {
    const base = {
      schemaVersion: 0,
      requestId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      productId: 'atlascode',
      scopeId: 'proj-a',
      kind: 'response',
      of: 'replaySession',
      projection: {
        sessionId: 'sess-1',
        productId: 'atlascode',
        scopeId: 'proj-a',
        semantics: 'persisted-effective-conversation',
        messages: [],
        truncated: false,
      },
    }
    expect(() => ReplaySessionSuccessSchema.parse(base)).not.toThrow()
    expect(() =>
      ReplaySessionSuccessSchema.parse({ ...base, hasMore: true, nextPageToken: 'tok' }),
    ).not.toThrow()
    expect(() => ReplaySessionSuccessSchema.parse({ ...base, hasMore: 'yes' })).toThrow()
  })
})
