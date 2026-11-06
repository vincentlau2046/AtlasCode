/**
 * wave0190 任务 A 层 1：compaction 切点 tool-pairing 平衡（工单 §1-A）。
 *
 * 缺陷基线（UP-3 同族）：compact.ts 两处 `messages.slice(-keepRecent)`（:549 lean /
 * :795-796 rich）切点无配对安全保证——切点落 tool_use→tool_result 之间时保留段以孤儿
 * tool_result 开头（其 tool_use 的 assistant 被切掉）→ 投影 role:'tool' 直通 wire →
 * OpenAI 兼容端 400 形（085 R-085-1 同族缝）。
 *
 * 修复（锁面批注 §5.4）：`resolvePairedKeepWindow` —— assistant API 回合边界回退
 * （上游 2.1.88 grouping.ts 语义），**扩大语义不收缩**：切点回退扩至所属回合的
 * assistant 消息（整组并入，并行多 tool_call / 多 tool_result 分离消息 / 夹内容消息
 * 随回合整组天然覆盖）；畸形输入（孤儿 tool_use 无处可寻）不硬造合法边 → 原样保留
 * 窗口交层 2 出口防御（wave0190-projection-pairing.test.ts）。
 *
 * 硬约束直证面：keepRecent=0 恒等（无切点即无平衡面）；合法全配对序列零回退
 * （切点零扰动）；摘要 prompt 逐字节零 diff（回退不触摘要面）。
 */
import { describe, expect, test } from 'bun:test'
import type { Message } from '../../src/shared'
import { compactConversation } from '../../src/engine/context/compact'
import { resolvePairedKeepWindow } from '../../src/engine/context/keepWindow'

// ─────────────────────────── 构造器 ───────────────────────────

/** assistant 消息（含 tool_use 块；并行多 call = 多块）。 */
function assistantWithToolUses(ids: string[]): Message {
  return {
    type: 'assistant',
    role: 'assistant',
    message: {
      role: 'assistant',
      content: ids.map((id) => ({ type: 'tool_use', id, name: 'echo', input: {} })),
    },
  }
}

/** assistant 纯文本消息。 */
function assistantText(text: string): Message {
  return { type: 'assistant', role: 'assistant', message: { role: 'assistant', content: text } }
}

/** user 消息：tool_result 块 + 可选夹内容 text 块（多 tool_result 分离消息形）。 */
function userToolResults(ids: string[], withText?: string): Message {
  const blocks: Array<Record<string, unknown>> = ids.map((id) => ({
    type: 'tool_result',
    tool_use_id: id,
    content: `result:${id}`,
  }))
  if (withText !== undefined) blocks.unshift({ type: 'text', text: withText })
  return { type: 'user', role: 'user', message: { role: 'user', content: blocks } }
}

/** user 纯文本消息。 */
function userText(text: string): Message {
  return { type: 'user', role: 'user', message: { role: 'user', content: text } }
}

/** 窗口内孤儿 tool_result 判定（断言用）：tool_use_id 无窗内 assistant 前驱。 */
function orphanToolResultIds(window: Message[]): string[] {
  const toolUseIds = new Set<string>()
  for (const m of window) {
    const content = (m.message as { content?: unknown } | undefined)?.content
    if (m.type !== 'assistant' || !Array.isArray(content)) continue
    for (const b of content as Array<{ type?: string; id?: string }>) {
      if (b.type === 'tool_use' && typeof b.id === 'string') toolUseIds.add(b.id)
    }
  }
  const orphans: string[] = []
  for (const m of window) {
    const content = (m.message as { content?: unknown } | undefined)?.content
    if (m.type !== 'user' || !Array.isArray(content)) continue
    for (const b of content as Array<{ type?: string; tool_use_id?: string }>) {
      if (b.type === 'tool_result' && b.tool_use_id && !toolUseIds.has(b.tool_use_id)) {
        orphans.push(b.tool_use_id)
      }
    }
  }
  return orphans
}

/** 现状基线复刻（修前 slice 语义）：直证孤儿产生面。 */
const baselineSlice = (messages: Message[], keepRecent: number): Message[] =>
  messages.slice(-keepRecent)

// ─────────────────────────── 基线缺陷直证（恒绿，钉缺陷存在）───────────────────────────

describe('wave0190 层1 缺陷基线（修前 slice 语义直证）', () => {
  test('keepRecent=1 切点落 tool_result 上（单 tool_call）→ 孤儿 tool_result', () => {
    const msgs = [
      userText('ask'),
      assistantWithToolUses(['tu1']),
      userToolResults(['tu1']),
      assistantText('done'),
    ]
    const window = baselineSlice(msgs, 1)
    // 切点只保尾 assistant → 无孤儿（此形基线恰好安全，对照下一测）
    expect(orphanToolResultIds(window)).toEqual([])
  })
  test('keepRecent=2 切点落 tool_use→tool_result 之间 → 基线产孤儿（UP-3 400 形源头）', () => {
    const msgs = [
      userText('ask'),
      assistantWithToolUses(['tu1']),
      userToolResults(['tu1']),
      assistantText('done'),
    ]
    const window = baselineSlice(msgs, 2)
    // 保留段 = [U(tool_result tu1), A(text)] —— tu1 的 assistant 被切掉 = 孤儿
    expect(window[0].type).toBe('user')
    expect(orphanToolResultIds(window)).toEqual(['tu1'])
  })
})

// ─────────────────────────── 切点矩阵（锁面批注 §5.5 预注册）───────────────────────────

describe('wave0190 层1 resolvePairedKeepWindow 切点矩阵', () => {
  test('① keepRecent=1 切点落 tool_result 上（A(tu) 在丢弃段）→ 回退扩至该 A 整组并入', () => {
    const msgs = [
      userText('ask'),
      assistantWithToolUses(['tu1']),
      userToolResults(['tu1']), // 尾消息 = tool_result，切点落其上
    ]
    const r = resolvePairedKeepWindow(msgs, 1)
    expect(r.window).toBeDefined()
    expect(r.revertedFrom).toBeDefined() // 回退发生（≠ 原 slice 点）
    // 扩大语义：窗口以回退到的 assistant 起头，整组并入
    expect(r.window?.[0].type).toBe('assistant')
    expect(r.window).toHaveLength(2)
    expect(orphanToolResultIds(r.window!)).toEqual([])
  })

  test('② keepRecent=2/3 并行多 tool_call（A(tu1+tu2) → U(result1) → U(result2)），切点落 U(result1) → 回退至 A', () => {
    const msgs = [
      userText('ask'),
      assistantWithToolUses(['tu1', 'tu2']),
      userToolResults(['tu1']),
      userToolResults(['tu2']),
      assistantText('done'),
    ]
    for (const keep of [2, 3]) {
      const r = resolvePairedKeepWindow(msgs, keep)
      expect(r.window?.[0].type).toBe('assistant')
      expect(r.revertedFrom).toBeDefined()
      expect(orphanToolResultIds(r.window!)).toEqual([])
      // 整组 = 并行两 call 的结果全就位
      const kept = r.window!
      expect(kept.some((m) => JSON.stringify(m).includes('tu1'))).toBe(true)
      expect(kept.some((m) => JSON.stringify(m).includes('tu2'))).toBe(true)
    }
  })

  test('③ 多 tool_result 分离 + 夹内容消息（U(text+result)）：A 在窗内 → 不回退（零扰动）', () => {
    const msgs = [
      userText('ask'),
      assistantWithToolUses(['tu1', 'tu2']),
      userToolResults(['tu1'], '中间说明文本'),
      userToolResults(['tu2']),
    ]
    const r = resolvePairedKeepWindow(msgs, 3)
    expect(r.revertedFrom).toBeUndefined() // 窗内 tool_use 全覆盖 → 零回退
    expect(r.window).toHaveLength(3)
    expect(orphanToolResultIds(r.window!)).toEqual([])
  })

  test('④ keepRecent ≥ 全长 → 全量在窗，恒等零回退', () => {
    const msgs = [
      userText('ask'),
      assistantWithToolUses(['tu1']),
      userToolResults(['tu1']),
      assistantText('done'),
    ]
    const r = resolvePairedKeepWindow(msgs, msgs.length)
    expect(r.revertedFrom).toBeUndefined()
    expect(r.window).toEqual(msgs)
  })

  test('⑤ 合法全配对序列任意 keepRecent → 切点无回退（零扰动直证）', () => {
    // 回合边界全部合法：U → A(tu) → U(result) → A(text) → U(text) …
    const msgs = [
      userText('q1'),
      assistantWithToolUses(['tu1']),
      userToolResults(['tu1']),
      assistantText('a1'),
      userText('q2'),
      assistantText('a2'),
      userText('q3'),
    ]
    for (const keep of [1, 2, 3, 7]) {
      const r = resolvePairedKeepWindow(msgs, keep)
      expect(r.revertedFrom).toBeUndefined()
      expect(r.window).toEqual(msgs.slice(-keep))
    }
  })

  test('⑥ 纯文本序列（无 tool 块）任意 keepRecent → 恒等零回退', () => {
    const msgs = [userText('a'), assistantText('b'), userText('c'), assistantText('d')]
    for (const keep of [1, 2, 4]) {
      const r = resolvePairedKeepWindow(msgs, keep)
      expect(r.revertedFrom).toBeUndefined()
      expect(r.window).toEqual(msgs.slice(-keep))
    }
  })

  test('⑦ keepRecent=0 → window=undefined（全量压缩既有语义，恒等）', () => {
    const msgs = [userText('a'), assistantWithToolUses(['tu1']), userToolResults(['tu1'])]
    const r = resolvePairedKeepWindow(msgs, 0)
    expect(r.window).toBeUndefined()
    expect(r.revertedFrom).toBeUndefined()
  })

  test('⑧ 全畸形：孤儿 tool_result 的 tool_use 无处可寻 → 不硬造合法边，窗口扩至序列头原样保留（交层 2 剥除）', () => {
    // 孤儿在窗口内且其 tool_use 全序列不存在：扩至序列头也无从配对 → break 不硬扩
    const msgs = [userToolResults(['ghost-id']), userText('q'), assistantText('a')]
    const r = resolvePairedKeepWindow(msgs, 3)
    expect(r.window).toEqual(msgs) // 全量保留（序列头即达，不可再扩）
    expect(r.revertedFrom).toBeUndefined() // 原切点已 = 0，无回退位移
    expect(orphanToolResultIds(r.window!)).toEqual(['ghost-id']) // 畸形孤儿交层 2
  })

  test('⑨ 深回退距离（尾部为长单回合 tool 序列）→ 回退跨多消息整组并入（回退距离无上界形）', () => {
    const msgs: Message[] = [userText('ask'), assistantWithToolUses(['t1', 't2', 't3'])]
    msgs.push(userToolResults(['t1']))
    msgs.push(userToolResults(['t2']))
    msgs.push(userToolResults(['t3']))
    msgs.push(assistantText('done'))
    const r = resolvePairedKeepWindow(msgs, 4) // 窗 = [U(t1),U(t2),U(t3),A(done)] → 3 孤儿
    expect(r.window?.[0].type).toBe('assistant')
    expect(r.window).toHaveLength(5) // A(tu×3) + 3×U(result) + A(done) 整组并入
    expect(r.window).toEqual(msgs.slice(1))
    expect(orphanToolResultIds(r.window!)).toEqual([])
  })
})

// ─────────────────────────── compactConversation 集成（lean 切点接线）───────────────────────────

describe('wave0190 层1 compactConversation 集成（lean :549 切点）', () => {
  const summarize = async () => '<analysis>draft</analysis><summary>REAL-SUMMARY</summary>'

  test('A. keepRecent=2 孤儿切点 → messagesToKeep 以 assistant 起头（整组并入）', async () => {
    const msgs = [
      userText('ask'),
      assistantWithToolUses(['tu1']),
      userToolResults(['tu1']),
      assistantText('done'),
    ]
    const r = await compactConversation(msgs, { summarize, keepRecent: 2 })
    expect(r.messagesToKeep).toBeDefined()
    expect(r.messagesToKeep![0].type).toBe('assistant')
    expect(r.messagesToKeep).toHaveLength(3) // 回退扩大：A + U(result) + A(text)
    expect(orphanToolResultIds(r.messagesToKeep!)).toEqual([])
  })

  test('B. keepRecent=0 → messagesToKeep undefined（全量压缩恒等零变更）', async () => {
    const msgs = [
      userText('ask'),
      assistantWithToolUses(['tu1']),
      userToolResults(['tu1']),
      assistantText('done'),
    ]
    const r = await compactConversation(msgs, { summarize, keepRecent: 0 })
    expect(r.messagesToKeep).toBeUndefined()
  })

  test('C. 合法全配对 + keepRecent=N（切点安全形）→ messagesToKeep 恒等 slice(-N)（零扰动）', async () => {
    const msgs = [
      userText('q1'),
      assistantWithToolUses(['tu1']),
      userToolResults(['tu1']),
      assistantText('a1'),
      userText('q2'),
    ]
    // keep=1/2：窗首非 tool_result（[U(q2)] / [A(a1),U(q2)]）→ 无孤儿，切点恒等
    for (const keep of [1, 2]) {
      const r = await compactConversation(msgs, { summarize, keepRecent: keep })
      expect(r.messagesToKeep).toEqual(msgs.slice(-keep))
    }
    // 对照：keep=3 切点落 U(result) 上（孤儿）→ 回退扩至 A(tu1) 整组并入（预期行为非扰动）
    const r3 = await compactConversation(msgs, { summarize, keepRecent: 3 })
    expect(r3.messagesToKeep).toEqual(msgs.slice(1))
  })

  test('D. 摘要 prompt 逐字节零 diff：回退发生与不发生，summaryMessages 恒同形同文', async () => {
    const orphanMsgs = [
      userText('ask'),
      assistantWithToolUses(['tu1']),
      userToolResults(['tu1']),
      assistantText('done'),
    ]
    const legalMsgs = [
      userText('ask'),
      assistantText('think'),
      userText('more'),
      assistantText('done'),
    ]
    const r1 = await compactConversation(orphanMsgs, { summarize, keepRecent: 2 }) // 回退发生
    const r2 = await compactConversation(legalMsgs, { summarize, keepRecent: 2 }) // 无回退
    const t1 = String(r1.summaryMessages[0].message.content as unknown)
    const t2 = String(r2.summaryMessages[0].message.content as unknown)
    expect(t1).toBe(t2.replace('REAL-SUMMARY', 'REAL-SUMMARY')) // 同文（摘要体同源）
    expect(t1).toContain('REAL-SUMMARY')
    expect(t1).toContain('This session is being continued')
    expect(t1).not.toContain('draft')
  })
})
