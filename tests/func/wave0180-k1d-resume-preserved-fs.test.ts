/**
 * 0.1.80 V3-1 K1-D 判别锁 — resume 后 preservedSegment splice 面（@300 两件）
 *
 * 问题面（上游 300/301 bug 修复语义）：resume 后压缩摘要丢失 / 保留段
 * （recent history）完整性破。本仓写侧 = TUI reactive compact
 * （sessionMemoryCompact → annotateBoundaryWithPreservedSegment 落
 * compactMetadata.preservedSegment 三段 uuid；engine query/loop 侧 =
 * E-1b-full 裁面不写）；读侧 = load.ts applyPreservedSegmentRelinks
 * （tail→head 走链验证 → head.parentUuid→anchor 重接 → anchor 其他子→tail
 * 尾接 → 保留段 assistant stale usage 四字段清零（防 resume→autocompact
 * 螺旋，301「反复压缩」读侧）→ 绝对末边界前非保留全剪）。
 *
 * 判别结论（本测试 = 覆盖证明）：splice 面已完整覆盖 300 两件语义 →
 * test-only，零码收口。fixture 手写 JSONL（保留段物理 pre-boundary +
 * 原 parentUuid 链，对齐 recordTranscript dedup-skip 磁盘形态）。
 *
 * 分层 ruling：工单「tests/unit/wave0180-*」模式按层规则修正 —— 真盘 I/O
 * （writeFileSync + loadTranscriptFile 读真文件）落 tests/func（先例
 * engine-session-fs.test.ts）；unit 层禁真盘。
 *
 * 探针锚点（实测）：去掉 load.ts applyPreservedSegmentRelinks 调用 →
 * 恰好 ②③④ 红（⑤⑥ 断言 splice 缺席时同样成立的 no-op/无 seg 语义，按设计
 * 绿；①写侧面不依赖读侧）。
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  loadTranscriptFile,
  buildConversationChain,
} from '../../src/engine'
import { annotateBoundaryWithPreservedSegment } from '../../src/tui/contextBodies/compact'
import { readFileSync } from 'node:fs'

let tmp: string

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'wave0180-k1d-'))
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

/** 基础消息行（对齐 engine-session-fs.test.ts P-S3 磁盘形态）。 */
function msgRow(o: {
  type: 'user' | 'assistant'
  uuid: string
  parentUuid: string | null
  content?: unknown
  usage?: Record<string, number>
  isCompactSummary?: boolean
}): string {
  return JSON.stringify({
    type: o.type,
    uuid: o.uuid,
    parentUuid: o.parentUuid,
    isSidechain: false,
    timestamp: '2026-01-01T00:00:00Z',
    cwd: '/tmp',
    userType: 'atlas',
    sessionId: 'k1d-session',
    version: '1',
    ...(o.isCompactSummary && { isCompactSummary: true }),
    message: {
      content: o.content ?? `content-${o.uuid}`,
      ...(o.type === 'assistant' && { id: `msg-${o.uuid}` }),
      ...(o.usage && { usage: o.usage }),
    },
  })
}

/** compact_boundary 行（携/不携 preservedSegment 三段 uuid）。 */
function boundaryRow(
  uuid: string,
  logicalParent: string,
  seg?: { headUuid: string; tailUuid: string; anchorUuid: string },
): string {
  return JSON.stringify({
    type: 'system',
    subtype: 'compact_boundary',
    uuid,
    parentUuid: null,
    logicalParentUuid: logicalParent,
    isSidechain: false,
    timestamp: '2026-01-01T00:00:02Z',
    cwd: '/tmp',
    userType: 'atlas',
    sessionId: 'k1d-session',
    version: '1',
    ...(seg && { compactMetadata: { preservedSegment: seg } }),
  })
}

const USAGE_STALE = {
  input_tokens: 190_000,
  output_tokens: 120,
  cache_creation_input_tokens: 5_000,
  cache_read_input_tokens: 100_000,
}

/** 写盘 + 加载（真盘 I/O）。 */
async function writeAndLoad(name: string, rows: string[]) {
  const file = join(tmp, name)
  writeFileSync(file, rows.join('\n') + '\n')
  return loadTranscriptFile(file)
}

describe('K1-D resume preservedSegment splice 面（@300 两件判别）', () => {
  test('② 活跃 seg：摘要/boundary 保留 + 保留段在链 + head 重接 + anchor 其他子尾接', async () => {
    // 磁盘形态：u1→a1（被压缩历史）→ kp1→kp2（保留段，物理 pre-boundary、
    // 原 parentUuid 链）→ cb1（携 seg）→ s1（摘要，anchor）→ n1（post-compact
    // 新消息，parent=anchor → 应尾接到 kp2）。
    const seg = { headUuid: 'kp1', tailUuid: 'kp2', anchorUuid: 's1' }
    const loaded = await writeAndLoad('live-seg.jsonl', [
      msgRow({ type: 'user', uuid: 'u1', parentUuid: null }),
      msgRow({
        type: 'assistant',
        uuid: 'a1',
        parentUuid: 'u1',
        usage: USAGE_STALE,
      }),
      msgRow({ type: 'user', uuid: 'kp1', parentUuid: 'a1' }),
      msgRow({
        type: 'assistant',
        uuid: 'kp2',
        parentUuid: 'kp1',
        usage: USAGE_STALE,
      }),
      boundaryRow('cb1', 'kp2', seg),
      msgRow({
        type: 'user',
        uuid: 's1',
        parentUuid: 'cb1',
        isCompactSummary: true,
        content: 'summary text',
      }),
      msgRow({ type: 'user', uuid: 'n1', parentUuid: 's1' }),
    ])

    // 压缩摘要 + boundary 保留（300 件①：resume 后摘要不丢）
    expect(loaded.messages.has('cb1')).toBe(true)
    expect(loaded.messages.has('s1')).toBe(true)

    // 保留段消息在链（300 件②：近期历史不丢）
    expect(loaded.messages.has('kp1')).toBe(true)
    expect(loaded.messages.has('kp2')).toBe(true)

    // head 重接：kp1.parentUuid a1→s1（重接进 post-compact 链）
    expect(loaded.messages.get('kp1')!.parentUuid).toBe('s1')
    // anchor 其他子尾接：n1.parentUuid s1→kp2
    expect(loaded.messages.get('n1')!.parentUuid).toBe('kp2')

    // 链完整性：从叶子 n1 走链 = boundary→摘要→保留段→新消息
    const chain = buildConversationChain(
      loaded.messages,
      loaded.messages.get('n1')!,
    )
    expect(chain.map((m) => m.uuid)).toEqual(['cb1', 's1', 'kp1', 'kp2', 'n1'])
    expect(loaded.leafUuids.has('n1')).toBe(true)
  })

  test('③ 活跃 seg：非保留 pre-compact 全剪 + 保留段 assistant stale usage 清零', async () => {
    const seg = { headUuid: 'kp1', tailUuid: 'kp2', anchorUuid: 's1' }
    const loaded = await writeAndLoad('prune-usage.jsonl', [
      msgRow({ type: 'user', uuid: 'u1', parentUuid: null }),
      msgRow({
        type: 'assistant',
        uuid: 'a1',
        parentUuid: 'u1',
        usage: USAGE_STALE,
      }),
      msgRow({ type: 'user', uuid: 'kp1', parentUuid: 'a1' }),
      msgRow({
        type: 'assistant',
        uuid: 'kp2',
        parentUuid: 'kp1',
        usage: USAGE_STALE,
      }),
      boundaryRow('cb1', 'kp2', seg),
      msgRow({
        type: 'user',
        uuid: 's1',
        parentUuid: 'cb1',
        isCompactSummary: true,
      }),
      msgRow({ type: 'user', uuid: 'n1', parentUuid: 'kp2' }),
    ])

    // 非保留 pre-compact 剪除（不带出压缩前历史）
    expect(loaded.messages.has('u1')).toBe(false)
    expect(loaded.messages.has('a1')).toBe(false)

    // 保留段 assistant usage 四字段清零（防 resume→autocompact 螺旋；
    // 磁盘 input_tokens ~190K 反映 pre-compact 上下文，不清零即触发）
    const kp2Usage = (loaded.messages.get('kp2') as any).message.usage
    expect(kp2Usage.input_tokens).toBe(0)
    expect(kp2Usage.output_tokens).toBe(0)
    expect(kp2Usage.cache_creation_input_tokens).toBe(0)
    expect(kp2Usage.cache_read_input_tokens).toBe(0)
  })

  test('④ stale seg（manual /compact 后）：跳 relink 仍全剪（无 phantom leaf）', async () => {
    const seg = { headUuid: 'kp1', tailUuid: 'kp2', anchorUuid: 's1' }
    const loaded = await writeAndLoad('stale-seg.jsonl', [
      msgRow({ type: 'user', uuid: 'u1', parentUuid: null }),
      msgRow({ type: 'assistant', uuid: 'a1', parentUuid: 'u1' }),
      msgRow({ type: 'user', uuid: 'kp1', parentUuid: 'a1' }),
      msgRow({ type: 'assistant', uuid: 'kp2', parentUuid: 'kp1' }),
      boundaryRow('cb1', 'kp2', seg),
      msgRow({
        type: 'user',
        uuid: 's1',
        parentUuid: 'cb1',
        isCompactSummary: true,
      }),
      msgRow({ type: 'user', uuid: 'n1', parentUuid: 'kp2' }),
      // manual /compact：no-seg 边界在 seg 边界之后 → seg 陈旧
      boundaryRow('cb2', 'n1'),
      msgRow({
        type: 'user',
        uuid: 's2',
        parentUuid: 'cb2',
        isCompactSummary: true,
      }),
    ])

    // 末边界及其摘要保留
    expect(loaded.messages.has('cb2')).toBe(true)
    expect(loaded.messages.has('s2')).toBe(true)
    // 陈旧 preserved 链全剪（不重接；不剪则成 phantom leaf）
    expect(loaded.messages.has('kp1')).toBe(false)
    expect(loaded.messages.has('kp2')).toBe(false)
    // cb2 前一切全剪（preservedUuids 空 = 全剪）
    expect(loaded.messages.has('u1')).toBe(false)
    expect(loaded.messages.has('cb1')).toBe(false)
    expect(loaded.messages.has('s1')).toBe(false)
    expect(loaded.messages.has('n1')).toBe(false)
  })

  test('⑤ malformed walk（tail→head 断链）：no-op 全量加载（不半剪）', async () => {
    // kp2.parentUuid 指向不在盘的 uuid → 走链断 → 真no-op：
    // 不重接、不清零、不 prune（resume 全量加载 pre-compact 历史）。
    const seg = { headUuid: 'kp1', tailUuid: 'missing-uuid', anchorUuid: 's1' }
    const loaded = await writeAndLoad('malformed-walk.jsonl', [
      msgRow({ type: 'user', uuid: 'u1', parentUuid: null }),
      msgRow({ type: 'assistant', uuid: 'a1', parentUuid: 'u1' }),
      msgRow({ type: 'user', uuid: 'kp1', parentUuid: 'a1' }),
      msgRow({
        type: 'assistant',
        uuid: 'kp2',
        parentUuid: 'missing-uuid',
        usage: USAGE_STALE,
      }),
      boundaryRow('cb1', 'kp2', seg),
      msgRow({
        type: 'user',
        uuid: 's1',
        parentUuid: 'cb1',
        isCompactSummary: true,
      }),
      msgRow({ type: 'user', uuid: 'n1', parentUuid: 's1' }),
    ])

    // no-op：全量加载（prune 未执行）
    expect(loaded.messages.has('u1')).toBe(true)
    expect(loaded.messages.has('a1')).toBe(true)
    expect(loaded.messages.has('kp1')).toBe(true)
    // 不重接：kp1 保持原 parentUuid
    expect(loaded.messages.get('kp1')!.parentUuid).toBe('a1')
    // 不清零：kp2 usage 保持磁盘原值
    const kp2Usage = (loaded.messages.get('kp2') as any).message.usage
    expect(kp2Usage.input_tokens).toBe(USAGE_STALE.input_tokens)
  })

  test('⑥ 无 seg boundary：零行为（常规截断路径不受 splice 面影响）', async () => {
    const loaded = await writeAndLoad('no-seg.jsonl', [
      msgRow({ type: 'user', uuid: 'u1', parentUuid: null }),
      msgRow({ type: 'assistant', uuid: 'a1', parentUuid: 'u1' }),
      boundaryRow('cb1', 'a1'),
      msgRow({
        type: 'user',
        uuid: 's1',
        parentUuid: 'cb1',
        isCompactSummary: true,
      }),
      msgRow({ type: 'user', uuid: 'n1', parentUuid: 's1' }),
    ])
    // splice 面 no-op；boundary/摘要/post 链按常规形态加载
    expect(loaded.messages.has('cb1')).toBe(true)
    expect(loaded.messages.has('s1')).toBe(true)
    expect(loaded.messages.has('n1')).toBe(true)
    expect(loaded.leafUuids.has('n1')).toBe(true)
  })
})

describe('K1-D 写侧面契约（annotateBoundaryWithPreservedSegment）', () => {
  test('① keep 段 → head/tail/anchor 三段 uuid（读侧面字段名契约锁）', () => {
    const boundary = {
      type: 'system',
      subtype: 'compact_boundary',
      uuid: 'cb1',
      parentUuid: null,
    } as any
    const keep = [
      { type: 'user', uuid: 'kp1', parentUuid: 'a1' } as any,
      { type: 'user', uuid: 'kp2', parentUuid: 'kp1' } as any,
    ]
    const annotated = annotateBoundaryWithPreservedSegment(
      boundary,
      's1',
      keep,
    )
    // 三段 uuid = keep 首尾 + anchor；字段名与读侧面 splice 面一致
    expect(annotated.compactMetadata.preservedSegment).toEqual({
      headUuid: 'kp1',
      tailUuid: 'kp2',
      anchorUuid: 's1',
    })
    // keep 空 → 原样返回（不加空 seg）
    const untouched = annotateBoundaryWithPreservedSegment(boundary, 's1', [])
    expect(untouched).toBe(boundary)
    expect((untouched as any).compactMetadata).toBeUndefined()
  })
})

describe('K1-D 压缩行 UI 三件（ctrl+o 可达 + 存储位置说明 + 全屏显示）', () => {
  // 编译态 .tsx（React Compiler 产物）源码锚：断言在场不渲染（渲染断言需
  // PTY，unit/func 层禁）；两支（summarize metadata 支 + 默认 auto-compact
  // 支）各锁三件。还原插行后此锚红。
  const src = readFileSync(
    new URL('../../src/tui/components/CompactSummary.tsx', import.meta.url),
    'utf8',
  )

  test('⑦ ctrl+o 可达（两支 ConfigurableShortcutHint fallback=ctrl+o）', () => {
    expect(src).toContain('action="app:toggleTranscript"')
    // 两支各一（metadata 支 description="expand history" / 默认支 "expand"）
    expect(src.match(/fallback="ctrl\+o"/g)?.length).toBe(2)
  })

  test('⑧ 存储位置说明（两支 dim 行在场）', () => {
    expect(src.match(/Summary is saved to the session transcript and restored on resume/g)?.length).toBe(2)
  })

  test('⑨ 全屏显示（transcript 模式全文 = ctrl+o 后两支均渲染全文）', () => {
    // 两支 isTranscriptMode && <MessageResponse><Text>{textContent}</Text>
    expect(src.match(/isTranscriptMode && <MessageResponse><Text>\{textContent\}<\/Text>/g)?.length).toBe(2)
  })
})
