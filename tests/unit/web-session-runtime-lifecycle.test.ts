/**
 * S0-R R-1 格（0.1.116 候）：readonly session runtime 生命周期 + 双实例
 * 隔离反例（先红，工单 §4.1 先红后绿）+ adapter 安全读（呈批书 §7.4）+
 * load.ts precompactSkip 'force-full' 加性修形（呈批书 §7.3，缺省恒等）。
 *
 * 隔离反例用内存 fake adapter（零磁盘）；adapter 安全读 + precompactSkip
 * 用 tmpdir seeded fixture（本仓 unit 层既有 tmpdir 先例：
 * atlas-host-state-access / atlasweb-kernel-boundary）。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import {
  createReadonlySessionRuntime,
  type ReadonlySessionRuntime,
} from '../../src/atlascode/web/readonlyRuntime'
import {
  createNodeFsSessionStoreAdapter,
  type SessionFileEntry,
  type SessionStoreAdapter,
} from '../../src/atlascode/web/sessionStoreAdapter'
import { WebSessionError } from '../../src/atlascode/web/errors'
import {
  DEFAULT_MAX_SCAN_SESSIONS,
  DEFAULT_MAX_TRANSCRIPT_BYTES,
} from '../../src/atlascode/web/limits'
import { SessionSummarySchema } from '../../src/kernel/protocol/webSessionV0'
import { loadTranscriptFull } from '../../src/engine'
import { loadTranscriptFile } from '../../src/engine'

// ── fake adapter（隔离反例 / 生命周期，零磁盘）────────────────────────────────

function fakeEntry(
  sessionId: string,
  updatedAt: string,
  scopeHint = '',
): SessionFileEntry {
  return {
    sessionId,
    filePath: `/fake/${scopeHint}${sessionId}.jsonl`,
    sizeBytes: 128,
    updatedAt,
    createdAt: null,
  }
}

function fakeAdapter(
  seed: Record<string, SessionFileEntry[]>,
  calls: { start: number; close: number; list: number } = {
    start: 0,
    close: 0,
    list: 0,
  },
): SessionStoreAdapter {
  return {
    async start() {
      calls.start++
    },
    async listSessionFiles(scopeId: string) {
      calls.list++
      return seed[scopeId] ?? []
    },
    async readTranscript() {
      throw new WebSessionError('notFound', 'fake adapter: no bytes')
    },
    async close() {
      calls.close++
    },
  }
}

function makeRuntime(
  scopes: string[],
  adapter?: SessionStoreAdapter,
): ReadonlySessionRuntime {
  return createReadonlySessionRuntime({
    productId: 'atlascode',
    scopes: scopes.map(scopeId => ({ scopeId, storageDir: `/fake/${scopeId}` })),
    ...(adapter ? { adapter } : {}),
  })
}

// ── A. 双实例隔离反例（工单 §4.1 先红后绿）──────────────────────────────────

describe('双实例隔离反例', () => {
  test('同 sessionId 不同 scope：两实例列表互不串扰，close A 不影响 B', async () => {
    const callsA = { start: 0, close: 0, list: 0 }
    const callsB = { start: 0, close: 0, list: 0 }
    const a = makeRuntime(
      ['proj-a'],
      fakeAdapter(
        { 'proj-a': [fakeEntry('shared-id', '2026-11-15T10:00:00.000Z', 'a/')] },
        callsA,
      ),
    )
    const b = makeRuntime(
      ['proj-b'],
      fakeAdapter(
        { 'proj-b': [fakeEntry('shared-id', '2026-11-15T11:00:00.000Z', 'b/')] },
        callsB,
      ),
    )
    await a.start()
    await b.start()

    const la = await a.listSessions({ scopeId: 'proj-a' })
    const lb = await b.listSessions({ scopeId: 'proj-b' })
    expect(la.sessions).toHaveLength(1)
    expect(lb.sessions).toHaveLength(1)
    expect(la.sessions[0]!.scopeId).toBe('proj-a')
    expect(lb.sessions[0]!.scopeId).toBe('proj-b')
    expect(la.sessions[0]!.updatedAt).toBe('2026-11-15T10:00:00.000Z')
    expect(lb.sessions[0]!.updatedAt).toBe('2026-11-15T11:00:00.000Z')

    // 实例状态隔离：close A 后 B 照常工作，A 反转 closed
    await a.close()
    const lb2 = await b.listSessions({ scopeId: 'proj-b' })
    expect(lb2.sessions).toHaveLength(1)
    expect(callsB.list).toBe(2)
    await expect(a.listSessions({ scopeId: 'proj-a' })).rejects.toThrow(
      WebSessionError,
    )
    await b.close()
  })

  test('forked global env 污染反例：env 设置前后 runtime 行为逐字节恒等', async () => {
    const seed = {
      'proj-a': [
        fakeEntry('s1', '2026-11-15T10:00:00.000Z'),
        fakeEntry('s2', '2026-11-15T09:00:00.000Z'),
      ],
    }
    const withEnv = makeRuntime(['proj-a'], fakeAdapter(seed))
    const withoutEnv = makeRuntime(['proj-a'], fakeAdapter(seed))
    await withEnv.start()
    await withoutEnv.start()

    const baseline = await withoutEnv.listSessions({ scopeId: 'proj-a' })
    const saved = process.env.ATLAS_DISABLE_PRECOMPACT_SKIP
    const savedMock = process.env.ATLAS_ASCEND_MOCK
    try {
      process.env.ATLAS_DISABLE_PRECOMPACT_SKIP = '1'
      process.env.ATLAS_ASCEND_MOCK = '1'
      const polluted = await withEnv.listSessions({ scopeId: 'proj-a' })
      expect(JSON.stringify(polluted)).toBe(JSON.stringify(baseline))
    } finally {
      if (saved === undefined) delete process.env.ATLAS_DISABLE_PRECOMPACT_SKIP
      else process.env.ATLAS_DISABLE_PRECOMPACT_SKIP = saved
      if (savedMock === undefined) delete process.env.ATLAS_ASCEND_MOCK
      else process.env.ATLAS_ASCEND_MOCK = savedMock
    }
    await withEnv.close()
    await withoutEnv.close()
  })
})

// ── B. 生命周期（工单 §4.2）──────────────────────────────────────────────────

describe('生命周期', () => {
  test('未 start：listSessions 拒 closed（message=not started），adapter 零调用', async () => {
    const calls = { start: 0, close: 0, list: 0 }
    const rt = makeRuntime(['proj-a'], fakeAdapter({}, calls))
    let err: unknown
    try {
      await rt.listSessions({ scopeId: 'proj-a' })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(WebSessionError)
    expect((err as WebSessionError).code).toBe('closed')
    expect((err as Error).message).toBe('not started')
    expect(calls.list).toBe(0)
  })

  test('start：授权配置到位才放行；adapter.start 恰一次', async () => {
    const calls = { start: 0, close: 0, list: 0 }
    const rt = makeRuntime(['proj-a'], fakeAdapter({}, calls))
    await rt.start()
    await rt.start() // 幂等
    expect(calls.start).toBe(1)
    const res = await rt.listSessions({ scopeId: 'proj-a' })
    expect(res.sessions).toEqual([])
    await rt.close()
  })

  test('productId 非 atlascode：start 拒 invalidRequest，adapter.start 未触', async () => {
    const calls = { start: 0, close: 0, list: 0 }
    const rt = createReadonlySessionRuntime({
      productId: 'other-product',
      scopes: [{ scopeId: 'proj-a', storageDir: '/fake/a' }],
      adapter: fakeAdapter({}, calls),
    })
    await expect(rt.start()).rejects.toMatchObject({
      code: 'invalidRequest',
    })
    expect(calls.start).toBe(0)
  })

  test('scopes 不合法：空 / 重复 scopeId / 超硬上限 → start 拒 invalidRequest', async () => {
    const mk = (scopes: ReadonlyArray<{ scopeId: string; storageDir: string }>) =>
      createReadonlySessionRuntime({
        productId: 'atlascode',
        scopes,
        adapter: fakeAdapter({}),
      })
    await expect(mk([]).start()).rejects.toMatchObject({ code: 'invalidRequest' })
    await expect(
      mk([
        { scopeId: 'dup', storageDir: '/x' },
        { scopeId: 'dup', storageDir: '/y' },
      ]).start(),
    ).rejects.toMatchObject({ code: 'invalidRequest' })
    await expect(
      mk(
        Array.from({ length: 129 }, (_, i) => ({
          scopeId: `s${i}`,
          storageDir: `/x/${i}`,
        })),
      ).start(),
    ).rejects.toMatchObject({ code: 'invalidRequest' })
  })

  test('close 幂等可 await；close 后 listSessions 拒 closed 且不可 restart', async () => {
    const calls = { start: 0, close: 0, list: 0 }
    const rt = makeRuntime(['proj-a'], fakeAdapter({}, calls))
    await rt.start()
    await rt.close()
    await rt.close() // 幂等
    let err: unknown
    try {
      await rt.listSessions({ scopeId: 'proj-a' })
    } catch (e) {
      err = e
    }
    expect((err as WebSessionError).code).toBe('closed')
    // close 后 start 不可重启（重建新实例换 epoch）
    await expect(rt.start()).rejects.toMatchObject({ code: 'closed' })
    // 新实例 = 新 epoch
    const rt2 = makeRuntime(['proj-a'], fakeAdapter({}))
    expect(rt2.epoch).not.toBe(rt.epoch)
    await rt2.close()
  })
})

// ── C. scope 授权 + 资源界（runtime 层）──────────────────────────────────────

describe('scope 授权与扫描上限', () => {
  test('未知 scope → scopeDenied', async () => {
    const rt = makeRuntime(['proj-a'], fakeAdapter({}))
    await rt.start()
    await expect(
      rt.listSessions({ scopeId: 'not-authorized' }),
    ).rejects.toMatchObject({ code: 'scopeDenied' })
    await rt.close()
  })

  test('listSessions 形状过 contract SessionSummarySchema（可空域如约）', async () => {
    const rt = makeRuntime(
      ['proj-a'],
      fakeAdapter({
        'proj-a': [fakeEntry('sess-1', '2026-11-15T10:00:00.000Z')],
      }),
    )
    await rt.start()
    const { sessions } = await rt.listSessions({ scopeId: 'proj-a' })
    const parsed = SessionSummarySchema.parse(sessions[0])
    expect(parsed.sessionId).toBe('sess-1')
    expect(parsed.productId).toBe('atlascode')
    expect(parsed.title).toBeNull()
    expect(parsed.messageCount).toBeNull()
    await rt.close()
  })

  test('扫描到上限+1 即 resourceLimit，不伪完整', async () => {
    const n = DEFAULT_MAX_SCAN_SESSIONS + 1
    const seed: SessionFileEntry[] = Array.from({ length: n }, (_, i) =>
      fakeEntry(`s-${i}`, '2026-11-15T10:00:00.000Z'),
    )
    const rt = makeRuntime(['proj-a'], fakeAdapter({ 'proj-a': seed }))
    await rt.start()
    await expect(rt.listSessions({ scopeId: 'proj-a' })).rejects.toMatchObject({
      code: 'resourceLimit',
    })
    await rt.close()
  })
})

// ── D. adapter 安全读（真实 fs，tmpdir；呈批书 §7.4）─────────────────────────

describe('fs adapter 安全读', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'atlas-web-adapter-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function makeFsAdapter(over?: {
    maxTranscriptBytes?: number
    scopes?: Array<{ scopeId: string; storageDir: string }>
  }) {
    return createNodeFsSessionStoreAdapter({
      productId: 'atlascode',
      scopes: over?.scopes ?? [{ scopeId: 'proj-a', storageDir: dir }],
      ...(over?.maxTranscriptBytes !== undefined
        ? { limits: { maxTranscriptBytes: over.maxTranscriptBytes } }
        : {}),
    })
  }

  const line = (uuid: string, parentUuid: string | null) =>
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
      message: { role: 'user', content: `hello ${uuid}` },
    })

  test('正常读：同 fd 全量读 + 公开面在（seeded 真文件）', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), `${line('u1', null)}\n`)
    const ad = makeFsAdapter()
    await ad.start()
    const bytes = await ad.readTranscript('proj-a', 'sess-1')
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('"u1"')
    await ad.close()
  })

  test('symlink 末段拒：ioUnavailable retryable=false（未验证文件不读）', async () => {
    writeFileSync(join(dir, 'real-target.jsonl'), 'data')
    symlinkSync(join(dir, 'real-target.jsonl'), join(dir, 'sess-1.jsonl'))
    const ad = makeFsAdapter()
    await ad.start()
    const err = await ad
      .readTranscript('proj-a', 'sess-1')
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(WebSessionError)
    expect((err as WebSessionError).code).toBe('ioUnavailable')
    expect((err as WebSessionError).retryable).toBe(false)
    await ad.close()
  })

  test('非法 sessionId（路径形 / ..）→ invalidRequest；未存在 → notFound', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), 'x\n')
    const ad = makeFsAdapter()
    await ad.start()
    await expect(
      ad.readTranscript('proj-a', '../escape'),
    ).rejects.toMatchObject({ code: 'invalidRequest' })
    await expect(
      ad.readTranscript('proj-a', 'a/b'),
    ).rejects.toMatchObject({ code: 'invalidRequest' })
    await expect(
      ad.readTranscript('proj-a', 'missing-session'),
    ).rejects.toMatchObject({ code: 'notFound' })
    await ad.close()
  })

  test('超单 transcript 资源界（可配上限）→ resourceLimit，零隐式截断', async () => {
    writeFileSync(join(dir, 'sess-1.jsonl'), `${line('u1', null)}\n`)
    const ad = makeFsAdapter({ maxTranscriptBytes: 8 })
    await ad.start()
    await expect(ad.readTranscript('proj-a', 'sess-1')).rejects.toMatchObject({
      code: 'resourceLimit',
    })
    await ad.close()
  })

  test('资源界缺省值在案且不可越过硬上限（配置越硬上限 → invalidRequest）', () => {
    expect(DEFAULT_MAX_TRANSCRIPT_BYTES).toBe(64 * 1024 * 1024)
    expect(DEFAULT_MAX_SCAN_SESSIONS).toBe(4096)
    expect(() =>
      createNodeFsSessionStoreAdapter({
        productId: 'atlascode',
        scopes: [{ scopeId: 'proj-a', storageDir: dir }],
        limits: { maxTranscriptBytes: 300 * 1024 * 1024 },
      }),
    ).toThrow(WebSessionError)
  })
})

// ── E. load.ts precompactSkip 加性修形（呈批书 §7.3）─────────────────────────

describe('loadTranscriptFile precompactSkip 修形', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'atlas-web-load-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const userLine = (uuid: string, parentUuid: string | null, pad = '') =>
    JSON.stringify({
      type: 'user',
      uuid,
      parentUuid,
      sessionId: 'sess-big',
      timestamp: '2026-11-15T10:00:00.000Z',
      cwd: dir,
      userType: 'atlas',
      version: '0.0.0',
      isSidechain: false,
      message: { role: 'user', content: `msg ${uuid}${pad}` },
    }) + '\n'

  test('>5MB 域：缺省（auto）截断读 pre-boundary，force-full 全量读', async () => {
    // pre-boundary 大消息垫过 5MB 门 → 缺省路径 post-boundary 截断丢 u1
    const pad = 'x'.repeat(5 * 1024 * 1024)
    const body =
      userLine('u1', null, pad) +
      JSON.stringify({
        type: 'system',
        subtype: 'compact_boundary',
        uuid: 'cb-1',
        parentUuid: 'u1',
        sessionId: 'sess-big',
        timestamp: '2026-11-15T10:00:01.000Z',
        cwd: dir,
        userType: 'atlas',
        version: '0.0.0',
        isSidechain: false,
        compactMetadata: {},
      }) +
      '\n' +
      userLine('u2', 'u1') +
      userLine('u3', 'u2')
    const p = join(dir, 'sess-big.jsonl')
    writeFileSync(p, body)

    const def = await loadTranscriptFile(p)
    const full = await loadTranscriptFile(p, { precompactSkip: 'force-full' })
    const auto = await loadTranscriptFile(p, { precompactSkip: 'auto' })

    // 缺省与显式 'auto' 恒等（缺省臂逐字节不变）
    expect([...auto.messages.keys()].sort()).toEqual(
      [...def.messages.keys()].sort(),
    )
    // 缺省臂：pre-boundary u1 被截断，post-boundary u2/u3 在
    expect(def.messages.has('u1')).toBe(false)
    expect(def.messages.has('u2')).toBe(true)
    expect(def.messages.has('u3')).toBe(true)
    // force-full：全量读，u1/u2/u3 全在（persisted-effective-conversation）
    for (const u of ['u1', 'u2', 'u3']) {
      expect(full.messages.has(u)).toBe(true)
    }
  })

  test('<5MB 域：force-full 与缺省恒等（对表零差）', async () => {
    const p = join(dir, 'sess-small.jsonl')
    writeFileSync(p, userLine('u1', null) + userLine('u2', 'u1'))
    const def = await loadTranscriptFile(p)
    const full = await loadTranscriptFile(p, { precompactSkip: 'force-full' })
    expect([...full.messages.keys()].sort()).toEqual(
      [...def.messages.keys()].sort(),
    )
  })

  test('force-full 不 mutate env（ATLAS_DISABLE_PRECOMPACT_SKIP 进出同值）', async () => {
    const p = join(dir, 'sess-small.jsonl')
    writeFileSync(p, userLine('u1', null))
    const before = process.env.ATLAS_DISABLE_PRECOMPACT_SKIP
    await loadTranscriptFull(p)
    expect(process.env.ATLAS_DISABLE_PRECOMPACT_SKIP).toBe(before)
  })
})

void randomUUID
