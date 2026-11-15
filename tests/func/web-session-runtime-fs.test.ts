/**
 * S0-R R-3 格（0.1.116 候）：web-session-runtime fs 面判别格（工单 §4.5
 * 测试建议：真实 fs + seeded scope 目录 + 反证实例隔离）。全离线。
 *
 * 判据：双 scope 同 sessionId 不串扰（§4.5 fixture 反证）/ symlink 枚举
 * 面跳过 + 读取面拒 / 未 start 拒 / 并发读上限（resourceLimit，不排队）/
 * close 幂等 + close 后拒。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createReadonlySessionRuntime } from '../../src/atlascode/web/readonlyRuntime'
import { atlasWebSessionEngine } from '../../src/atlascode/web/runtimeDefault'
import {
  createNodeFsSessionStoreAdapter,
  type SessionStoreAdapter,
} from '../../src/atlascode/web/sessionStoreAdapter'

// ── fixture：双 scope 各自 seeded 目录 ────────────────────────────────────────

let root: string
let dirA: string
let dirB: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-web-fs-'))
  dirA = join(root, 'scope-a')
  dirB = join(root, 'scope-b')
  mkdirSync(dirA, { recursive: true })
  mkdirSync(dirB, { recursive: true })
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const line = (
  uuid: string,
  parentUuid: string | null,
  text: string,
  sessionId = 'sess-1',
) =>
  JSON.stringify({
    type: 'user',
    uuid,
    parentUuid,
    sessionId,
    timestamp: '2026-11-15T10:00:00.000Z',
    cwd: root,
    userType: 'atlas',
    version: '0.0.0',
    isSidechain: false,
    message: { role: 'user', content: text },
  })

function makeRuntime(limits?: Record<string, number>) {
  const adapter = createNodeFsSessionStoreAdapter({
    productId: 'atlascode',
    scopes: [
      { scopeId: 'proj-a', storageDir: dirA },
      { scopeId: 'proj-b', storageDir: dirB },
    ],
  })
  return createReadonlySessionRuntime({
    productId: 'atlascode',
    scopes: [
      { scopeId: 'proj-a', storageDir: dirA },
      { scopeId: 'proj-b', storageDir: dirB },
    ],
    engine: atlasWebSessionEngine(),
    adapter,
    ...(limits ? { limits: limits as never } : {}),
  })
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ── 判据 ──────────────────────────────────────────────────────────────────────

describe('web-session-runtime fs 面', () => {
  test('双 scope 同 sessionId：实例与实例互不串扰（各自投影各归各）', async () => {
    writeFileSync(join(dirA, 'sess-1.jsonl'), `${line('u-a1', null, 'from-A')}\n`)
    writeFileSync(join(dirB, 'sess-1.jsonl'), `${line('u-b1', null, 'from-B')}\n`)
    const rt = makeRuntime()
    await rt.start()
    const ra = await rt.replaySession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    const rb = await rt.replaySession({ scopeId: 'proj-b', sessionId: 'sess-1' })
    expect(ra.projection.scopeId).toBe('proj-a')
    expect(rb.projection.scopeId).toBe('proj-b')
    expect(JSON.stringify(ra.projection)).toContain('from-A')
    expect(JSON.stringify(ra.projection)).not.toContain('from-B')
    expect(JSON.stringify(rb.projection)).toContain('from-B')
    expect(JSON.stringify(rb.projection)).not.toContain('from-A')
    // 列表面同样隔离
    const la = await rt.listSessions({ scopeId: 'proj-a' })
    expect(la.sessions.map(s => s.sessionId)).toEqual(['sess-1'])
    await rt.close()
  })

  test('symlink 会话文件：枚举面跳过 + 读取面拒（O_NOFOLLOW 白名单）', async () => {
    writeFileSync(join(dirA, 'real.jsonl'), `${line('u1', null, 'real')}\n`)
    symlinkSync(join(dirA, 'real.jsonl'), join(dirA, 'sess-1.jsonl'))
    const rt = makeRuntime()
    await rt.start()
    const listed = await rt.listSessions({ scopeId: 'proj-a' })
    expect(listed.sessions.map(s => s.sessionId)).not.toContain('sess-1')
    await expect(
      rt.replaySession({ scopeId: 'proj-a', sessionId: 'sess-1' }),
    ).rejects.toMatchObject({ code: 'notFound' })
    await rt.close()
  })

  test('未 start 调用拒 closed（not started）；close 后操作拒 closed', async () => {
    writeFileSync(join(dirA, 'sess-1.jsonl'), `${line('u1', null, 'x')}\n`)
    const rt = makeRuntime()
    await expect(
      rt.replaySession({ scopeId: 'proj-a', sessionId: 'sess-1' }),
    ).rejects.toMatchObject({ code: 'closed' })
    await rt.start()
    await rt.close()
    await expect(
      rt.listSessions({ scopeId: 'proj-a' }),
    ).rejects.toMatchObject({ code: 'closed' })
    await expect(rt.start()).rejects.toMatchObject({ code: 'closed' })
  })

  test('并发读上限：maxConcurrentReads=1 第二路 resourceLimit（不排队），释放后可再读', async () => {
    writeFileSync(join(dirA, 'sess-1.jsonl'), `${line('u1', null, 'gated')}\n`)
    const ad = createNodeFsSessionStoreAdapter({
      productId: 'atlascode',
      scopes: [{ scopeId: 'proj-a', storageDir: dirA }],
    })
    // gate 第一次 statTranscript，令第一路读持有并发槽
    let release: () => void = () => {}
    const gate = new Promise<void>(r => (release = r))
    let first = true
    const gated: SessionStoreAdapter = {
      ...ad,
      statTranscript: async (...args) => {
        if (first) {
          first = false
          await gate
        }
        return ad.statTranscript(...args)
      },
    }
    const rt = createReadonlySessionRuntime({
      productId: 'atlascode',
      scopes: [{ scopeId: 'proj-a', storageDir: dirA }],
      engine: atlasWebSessionEngine(),
      adapter: gated,
      limits: { maxConcurrentReads: 1 } as never,
    })
    await rt.start()
    const p1 = rt.replaySession({ scopeId: 'proj-a', sessionId: 'sess-1' })
    await sleep(50) // 令 p1 进入持槽态
    await expect(
      rt.replaySession({ scopeId: 'proj-a', sessionId: 'sess-1' }),
    ).rejects.toMatchObject({ code: 'resourceLimit' })
    release()
    const res = await p1
    expect(res.of).toBe('replaySession')
    await rt.close()
  })

  test('close 幂等（可 await 两次）；close 后 adapter.close 恰一次', async () => {
    const ad = createNodeFsSessionStoreAdapter({
      productId: 'atlascode',
      scopes: [{ scopeId: 'proj-a', storageDir: dirA }],
    })
    let closes = 0
    const counted: SessionStoreAdapter = {
      ...ad,
      close: async () => {
        closes++
        return ad.close()
      },
    }
    const rt = createReadonlySessionRuntime({
      productId: 'atlascode',
      scopes: [{ scopeId: 'proj-a', storageDir: dirA }],
      engine: atlasWebSessionEngine(),
      adapter: counted,
    })
    await rt.start()
    await rt.close()
    await rt.close()
    expect(closes).toBe(1)
  })
})
