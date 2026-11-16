/**
 * S0-R3 engine 载体安全硬化判据（工单 docs/2026-11-16-s0-r3-security-hardening-ticket.md
 * §3 格 1-4 + §7/§8 定形；消费侧 docs/upstream-pairing.md 三发现对表）：
 *
 * 格 1（环链）：applySnipRemovals resolve() deletedParent 互环（A/B 互环 +
 * 存活 C.parentUuid=A）→ 有界拒（零 hang）；修复后 resolve 返 null（gap
 * 语义闭合），链重建走根。
 * 格 2（TOCTOU/fd 链）：opts 在场支 = 单 fd 四点读（open 计数 ==1）+ 读毕
 * ino/size 复核；零 opts 默认臂 fs.open 计数 ==0（路径形逐字节恒等）。
 * 格 3（资源界）：maxBytes 加性 opts——fstat 后立即检查点，超界
 * TranscriptTooLargeError（message 安全化：零盘路径零 stack）；undefined =
 * 不设界。web 载体映射腿：replay 超界 → resourceLimit（message 零路径）。
 * 格 4（恒等）：同 fixture 默认臂 vs opts 支输出全等（异常分态面除外）。
 */
import { describe, expect, test, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildConversationChain,
  loadTranscriptFile,
  loadTranscriptFull,
} from '../../src/engine'

let tmp = mkdtempSync(join(tmpdir(), 'atlas-s0r3-'))

function line(sessionId: string, extra: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'user',
    userType: 'atlas',
    sessionId,
    version: '0.1.118',
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

describe('格 1: resolve() deletedParent cycle → bounded gap-null', () => {
  test('A/B mutual cycle in snip region + survivor C.parentUuid=A completes (no hang), relinks to null', async () => {
    const sessionId = 's0r3-cycle'
    const file = join(tmp, 's0r3-cycle.jsonl')
    // 恶意形（段 0 三步链直译）：snip 区 A/B 互环；存活 C.parentUuid=A 触发 resolve
    const lines = [
      line(sessionId, userMsg('r1', null, 'root', '2026-01-01T00:00:00Z')),
      line(sessionId, userMsg('A', 'B', 'cycle-A', '2026-01-01T00:00:01Z')),
      line(sessionId, userMsg('B', 'A', 'cycle-B', '2026-01-01T00:00:02Z')),
      line(sessionId, {
        ...userMsg('C', 'A', 'survivor', '2026-01-01T00:00:03Z'),
      }),
      line(sessionId, {
        type: 'assistant',
        parentUuid: 'C',
        uuid: 'leaf1',
        timestamp: '2026-01-01T00:00:04Z',
        message: {
          role: 'assistant',
          id: 'm1',
          model: 'probe',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'ok' }],
        },
      }),
      // snip 边界重放面：removedUuids=[A,B]（骑在 leaf1 记录上，与既有 fixture 同形）
      line(sessionId, {
        type: 'assistant',
        parentUuid: 'leaf1',
        uuid: 'boundary1',
        timestamp: '2026-01-01T00:00:05Z',
        message: {
          role: 'assistant',
          id: 'm2',
          model: 'probe',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'boundary' }],
        },
        snipMetadata: { removedUuids: ['A', 'B'] },
      }),
    ]
    writeFileSync(file, lines.join('\n') + '\n')
    const loaded = await loadTranscriptFile(file)
    // 有界：A/B 已删，C 悬空 parentUuid=A 触发 resolve——环必须走 null 而非失控
    const c = loaded.messages.get('C')!
    expect(c.parentUuid).toBe(null) // 环 → gap null（链根语义）
    const b = loaded.messages.get('boundary1')!
    const chain = buildConversationChain(loaded.messages, b)
    const uuids = chain.map(m => m.uuid)
    expect(uuids).toContain('C')
    expect(uuids).toContain('boundary1')
    expect(uuids).not.toContain('A')
    expect(uuids).not.toContain('B')
  })
})

describe('格 3: maxBytes additive opt — pre-parse checkpoint', () => {
  test('oversized transcript (opts-in) → TranscriptTooLargeError with sanitized message', async () => {
    const file = join(tmp, 's0r3-big.jsonl')
    const big = Array.from({ length: 60 }, (_, i) =>
      line('s0r3-big', userMsg(`u${i}`, i === 0 ? null : `u${i - 1}`, 'x'.repeat(200), `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`)),
    ).join('\n')
    writeFileSync(file, big + '\n')
    let threw: unknown
    try {
      await loadTranscriptFile(file, { precompactSkip: 'force-full', maxBytes: 1024 })
    } catch (e) {
      threw = e
    }
    expect(threw).toBeInstanceOf(Error)
    const err = threw as Error & { name?: string }
    expect(err.name).toBe('TranscriptTooLargeError')
    expect(err.message).not.toContain(file) // message 安全化：零盘路径
    expect(err.message).not.toContain(tmp)
    expect(err.message).toMatch(/exceeds/)
    // undefined = 不设界：同文件无界可读
    const ok = await loadTranscriptFile(file, { precompactSkip: 'force-full' })
    expect(ok.messages.size).toBeGreaterThan(0)
  })

  test('web replay maps oversize → resourceLimit with sanitized message', async () => {
    const { createReadonlySessionRuntime } = await import('../../src/atlascode/web/readonlyRuntime')
    const { WebSessionError } = await import('../../src/atlascode/web/errors')
    const file = join(tmp, 's0r3-big.jsonl')
    const fakeAdapter = {
      start: async () => {},
      close: async () => {},
      listSessionFiles: async () => [{ sessionId: 's0r3-big', filePath: file, sizeBytes: 4096, updatedAt: '2026-01-01T00:00:00Z', createdAt: null }],
      readTranscript: async () => new Uint8Array(4096),
      statTranscript: async () => ({ sizeBytes: 4096, mtimeMs: 1, ino: 1 }), // 交接窗守卫报告小尺寸——界由 loader maxBytes 闭合
      readTranscriptTail: async () => ({ bytes: new Uint8Array(0), sizeBytes: 4096, ino: 1 }),
      resolveTranscriptPath: async () => file,
    }
    const runtime = createReadonlySessionRuntime({
      productId: 'atlascode',
      scopes: [{ scopeId: 's', storageDir: tmp }],
      engine: {
        loadTranscriptFull: (filePath, opts) =>
          loadTranscriptFull(filePath, opts) as unknown as Promise<{ messages: Map<string, never>; leafUuids: Set<string> }>,
        buildConversationChain: (messages, leaf) => buildConversationChain(messages as never, leaf as never) as never,
      },
      adapter: fakeAdapter as never,
      limits: { maxTranscriptBytes: 1024 },
    })
    await runtime.start()
    try {
      let threw: unknown
      try {
        await runtime.replaySession({ scopeId: 's', sessionId: 's0r3-big' })
      } catch (e) {
        threw = e
      }
      expect(threw).toBeInstanceOf(WebSessionError)
      const werr = threw as InstanceType<typeof WebSessionError>
      expect(werr.code).toBe('resourceLimit')
      expect(werr.message).not.toContain(file) // 映射层 message 安全化
    } finally {
      await runtime.close()
    }
  })
})

describe('格 4: default-arm identity + fd-chain equivalence', () => {
  test('same fixture: zero-opts default arm and opts arm produce identical output', async () => {
    const file = join(tmp, 's0r3-ident.jsonl')
    const lines = [
      line('s0r3-ident', userMsg('r1', null, 'root', '2026-01-01T00:00:00Z')),
      line('s0r3-ident', {
        type: 'assistant',
        parentUuid: 'r1',
        uuid: 'a1',
        timestamp: '2026-01-01T00:00:01Z',
        message: { role: 'assistant', id: 'm1', model: 'probe', stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] },
      }),
    ]
    writeFileSync(file, lines.join('\n') + '\n')
    const def = await loadTranscriptFile(file)
    const opt = await loadTranscriptFile(file, { precompactSkip: 'force-full' })
    expect([...def.messages.keys()].sort()).toEqual([...opt.messages.keys()].sort())
    expect([...def.leafUuids].sort()).toEqual([...opt.leafUuids].sort())
    const chainDef = buildConversationChain(def.messages, def.messages.get('a1')!)
    const chainOpt = buildConversationChain(opt.messages, opt.messages.get('a1')!)
    expect(chainDef.map(m => m.uuid)).toEqual(chainOpt.map(m => m.uuid))
  })
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})
