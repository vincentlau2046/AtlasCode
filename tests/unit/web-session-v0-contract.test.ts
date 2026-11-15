/**
 * S0-U U-1 格（0.1.115 候）：web session contract v0 单源判别格。
 * 呈批书 docs/2026-11-15-s0-ur-lockface-brief.md §7.2（f4 批复 2026-11-15 @f1f1099d）。
 * 格 A：schema/codec 面（envelope strict / 边界 / 错误联合 / 事件 / 中立 fixture）；
 * 格 C 源级：import 闭包（zod/v4 唯一）+ Code-neutral 词汇审计（必改 6）。
 * I/O-free → unit 层。
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  WEB_SESSION_PROTOCOL_VERSION,
  WEB_SESSION_SCHEMA_VERSION,
  WebSessionRequestSchema,
  WebSessionSuccessSchema,
  WebSessionErrorResponseSchema,
  WebSessionEventSchema,
  TextBlockSchema,
  ActivityBlockSchema,
} from '../../src/kernel/protocol/webSessionV0.js'

const REPO = join(import.meta.dir, '..', '..')
const readSrc = (p: string) => readFileSync(join(REPO, 'src', p), 'utf8')

const baseReq = {
  schemaVersion: 0,
  requestId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  productId: 'office-suite',
  scopeId: 'workspace-alpha',
}

describe('S0-U U-1 · 格 A contract codec', () => {
  test('协议常量：schemaVersion=0 / protocolVersion=v0（与 manifest 分域的协议面）', () => {
    expect(WEB_SESSION_SCHEMA_VERSION).toBe(0)
    expect(WEB_SESSION_PROTOCOL_VERSION).toBe('v0')
  })

  test('listSessions 请求 codec roundtrip：合法输入全字段保真', () => {
    const req = {
      ...baseReq,
      kind: 'listSessions' as const,
      pageSize: 50,
      pageToken: 'tok-1',
    }
    const parsed = WebSessionRequestSchema.parse(req)
    expect(parsed.kind).toBe('listSessions')
    if (parsed.kind === 'listSessions') {
      expect(parsed.pageSize).toBe(50)
      expect(parsed.pageToken).toBe('tok-1')
      expect(parsed.requestId).toBe(baseReq.requestId)
    }
  })

  test('envelope strict：未知 schemaVersion 拒；未知顶层字段拒（strict）', () => {
    expect(() =>
      WebSessionRequestSchema.parse({ ...baseReq, kind: 'listSessions', schemaVersion: 1 }),
    ).toThrow()
    expect(() =>
      WebSessionRequestSchema.parse({ ...baseReq, kind: 'listSessions', storageRoot: '/tmp/x' }),
    ).toThrow()
  })

  test('ID 域：requestId 须 UUID；productId/scopeId 非空 ≤128；129 字符拒', () => {
    expect(() =>
      WebSessionRequestSchema.parse({ ...baseReq, kind: 'listSessions', requestId: 'not-a-uuid' }),
    ).toThrow()
    const long = 'a'.repeat(129)
    expect(() =>
      WebSessionRequestSchema.parse({ ...baseReq, kind: 'listSessions', scopeId: long }),
    ).toThrow()
    const ok128 = WebSessionRequestSchema.safeParse({
      ...baseReq,
      kind: 'listSessions',
      scopeId: 'b'.repeat(128),
    })
    expect(ok128.success).toBe(true)
  })

  test('searchSessions query 边界：空拒；257 code points 拒；256（含代理对）过', () => {
    const mk = (q: string) => ({ ...baseReq, kind: 'searchSessions' as const, query: q })
    expect(() => WebSessionRequestSchema.parse(mk(''))).toThrow()
    expect(() => WebSessionRequestSchema.parse(mk('x'.repeat(257)))).toThrow()
    // 256 个 code points（128 个 surrogate pair + 0 个余量）
    const emoji = '🌊'.repeat(128)
    expect([...emoji].length).toBe(128)
    expect(() => WebSessionRequestSchema.parse(mk(emoji + 'y'.repeat(128)))).not.toThrow()
  })

  test('分页域：pageSize 0/201 拒，1/200 过；pageToken 非空 opaque', () => {
    const mk = (pageSize: number) => ({ ...baseReq, kind: 'listSessions' as const, pageSize })
    expect(() => WebSessionRequestSchema.parse(mk(0))).toThrow()
    expect(() => WebSessionRequestSchema.parse(mk(201))).toThrow()
    expect(() => WebSessionRequestSchema.parse(mk(1))).not.toThrow()
    expect(() => WebSessionRequestSchema.parse(mk(200))).not.toThrow()
    expect(() =>
      WebSessionRequestSchema.parse({ ...baseReq, kind: 'listSessions', pageToken: '' }),
    ).toThrow()
  })

  test('projection：semantics/truncated 字面钉死（truncated:true 拒）；blocks 判别', () => {
    const proj = {
      sessionId: 's-1',
      productId: 'office-suite',
      scopeId: 'workspace-alpha',
      semantics: 'persisted-effective-conversation' as const,
      messages: [
        {
          id: 'm-1',
          role: 'user' as const,
          createdAt: null,
          blocks: [{ kind: 'text' as const, text: 'hello' }],
        },
      ],
      truncated: false as const,
    }
    expect(() => WebSessionSuccessSchema.parse({ ...baseReq, kind: 'response', of: 'replaySession', projection: proj })).not.toThrow()
    expect(() =>
      WebSessionSuccessSchema.parse({
        ...baseReq,
        kind: 'response',
        of: 'replaySession',
        projection: { ...proj, truncated: true },
      }),
    ).toThrow()
    expect(() =>
      WebSessionSuccessSchema.parse({
        ...baseReq,
        kind: 'response',
        of: 'replaySession',
        projection: {
          ...proj,
          messages: [{ ...proj.messages[0], blocks: [{ kind: 'mystery' }] }],
        },
      }),
    ).toThrow()
    expect(TextBlockSchema.safeParse({ kind: 'text', text: 'x' }).success).toBe(true)
    expect(ActivityBlockSchema.safeParse({ kind: 'activity', label: 'rendered doc' }).success).toBe(true)
  })

  test('错误联合：错误 = 独立顶层 kind "error"；ioUnavailable 必带 retryable 布尔；非 ioUnavailable 带 retryable 拒', () => {
    const err = (code: string, extra: Record<string, unknown> = {}) => ({
      ...baseReq,
      kind: 'error',
      error: { code, message: 'safe message', ...extra },
    })
    const io = WebSessionErrorResponseSchema.safeParse(err('ioUnavailable', { retryable: true }))
    expect(io.success).toBe(true)
    const ioNoRetry = WebSessionErrorResponseSchema.safeParse(err('ioUnavailable'))
    expect(ioNoRetry.success).toBe(false)
    const leak = WebSessionErrorResponseSchema.safeParse(err('notFound', { retryable: true }))
    expect(leak.success).toBe(false)
    expect(WebSessionErrorResponseSchema.safeParse(err('scopeDenied')).success).toBe(true)
  })

  test('事件：baseline/replacement 全域（revision 0..MAX_SAFE）；resetRequired 无 projection 域', () => {
    const ev = (kind: string, extra: Record<string, unknown>) => ({
      schemaVersion: 0,
      productId: 'office-suite',
      scopeId: 'workspace-alpha',
      subscriptionId: 'sub-1',
      kind,
      ...extra,
    })
    const baseline = ev('baseline', {
      generation: '9f2504e0-4f89-11d3-9a0c-0305e82c3302',
      baselineId: '9f2504e0-4f89-11d3-9a0c-0305e82c3303',
      revision: 0,
      cursor: 'cur-1',
      projection: {
        sessionId: 's-1',
        productId: 'office-suite',
        scopeId: 'workspace-alpha',
        semantics: 'persisted-effective-conversation',
        messages: [],
        truncated: false,
      },
    })
    expect(() => WebSessionEventSchema.parse(baseline)).not.toThrow()
    expect(() =>
      WebSessionEventSchema.parse({
        ...baseline,
        kind: 'replacement',
        revision: Number.MAX_SAFE_INTEGER,
      }),
    ).not.toThrow()
    expect(() => WebSessionEventSchema.parse({ ...baseline, revision: -1 })).toThrow()
    expect(() => WebSessionEventSchema.parse({ ...baseline, revision: 9007199254740992 })).toThrow()
    const reset = ev('resetRequired', {
      generation: '9f2504e0-4f89-11d3-9a0c-0305e82c3304',
      reason: 'storage discontinuity',
    })
    expect(() => WebSessionEventSchema.parse(reset)).not.toThrow()
    expect('projection' in reset).toBe(false)
  })

  test('SessionSummary 可空域：title/createdAt/messageCount 显式 null 合法；updatedAt 必填', () => {
    const mk = (summary: Record<string, unknown>) => ({
      ...baseReq,
      kind: 'response',
      of: 'listSessions',
      sessions: [summary],
    })
    const ok = mk({
      sessionId: 's-1',
      title: null,
      createdAt: null,
      updatedAt: '2026-11-15T00:00:00.000Z',
      messageCount: null,
      productId: 'office-suite',
      scopeId: 'workspace-alpha',
    })
    expect(() => WebSessionSuccessSchema.parse(ok)).not.toThrow()
    const noUpdated = mk({
      sessionId: 's-1',
      title: null,
      createdAt: null,
      messageCount: null,
      productId: 'office-suite',
      scopeId: 'workspace-alpha',
    })
    expect(() => WebSessionSuccessSchema.parse(noUpdated)).toThrow()
  })

  test('product-neutral fixture：非 Code 词汇的样例会话全 codec 通过（格 A 中立面）', () => {
    const office = {
      ...baseReq,
      kind: 'response',
      of: 'searchSessions',
      results: [
        {
          sessionId: 'doc-2026-11',
          messageId: 'msg-42',
          snippet: 'Q3 预算表 v2 已由 fin-team 更新，含汇率修订',
        },
      ],
    }
    const parsed = WebSessionSuccessSchema.parse(office)
    expect(parsed.kind).toBe('response')
    if (parsed.kind === 'response' && parsed.of === 'searchSessions') {
      expect(parsed.results[0].snippet.length).toBeLessThanOrEqual(512)
    }
  })
})

describe('S0-U U-1 · 格 C 源级（必改 6）', () => {
  const src = readSrc('kernel/protocol/webSessionV0.ts')

  test('import 闭包：模块 import 面 = zod/v4 唯一（零仓库内/Node/TUI 反向导入）', () => {
    const froms = src.match(/from\s+'([^']+)'/g) ?? []
    expect(froms.length).toBeGreaterThan(0)
    for (const f of froms) {
      expect(f).toContain('zod/v4')
    }
  })

  test('Code-neutral 词汇审计：禁词零命中（BR 轴延伸）', () => {
    const forbidden = [
      'atlascode',
      'AtlasCode',
      'tool_use',
      'toolUseResult',
      'Bash',
      'sidechain',
      'compact_boundary',
      'jsonl',
      'Anthropic',
      'Claude',
    ]
    for (const w of forbidden) {
      expect(src.includes(w)).toBe(false)
    }
  })
})
