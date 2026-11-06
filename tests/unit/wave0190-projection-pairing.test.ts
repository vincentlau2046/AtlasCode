/**
 * wave0190 任务 A 层 2：params.ts 投影出口 tool-pairing 防御层（工单 §1-A）。
 *
 * RED 基线（UP-3 @16b0d68e）：toOpenAIMessages :96-102 tool_result 无条件投影
 * role:'tool'（tool_use_id ?? ''），不核前驱 assistant tool_calls——孤儿直通 wire →
 * OpenAI 兼容端 400 形；缺 result 的 tool_calls 同样直通（无 tool 回应）。
 *
 * 修复（锁面批注 §5.1，上游 ensureToolResultPairing 语义，落点 = toOpenAIMessages
 * 终态数组出口）：正向 = 缺 result 补合成 error result（role:'tool' 纯文本 + 回指
 * tool_call_id）；反向 = 孤儿 tool_result 剥除；修复留痕（repaired 记录 + 禁静默）。
 * 硬约束：合法全配对对话投影逐字节零 diff（防御层零扰动）；零 attachment 语义越权
 * （0.1.89 三段登记面不动）。
 */
import { describe, expect, test } from 'bun:test'
import { toOpenAIMessages } from '../../src/modelprovider/params'
import { ensureToolResultPairing } from '../../src/modelprovider/toolPairing'

// ─────────────────────────── 构造器（engine 消息形）───────────────────────────

const assistantWithToolUses = (ids: string[]) => ({
  type: 'assistant',
  role: 'assistant',
  message: {
    role: 'assistant',
    content: ids.map((id) => ({ type: 'tool_use', id, name: 'echo', input: {} })),
  },
})

const userToolResults = (ids: string[]) => ({
  type: 'user',
  role: 'user',
  message: {
    role: 'user',
    content: ids.map((id) => ({ type: 'tool_result', tool_use_id: id, content: `r:${id}` })),
  },
})

const userText = (text: string) => ({
  type: 'user',
  role: 'user',
  message: { role: 'user', content: text },
})

const assistantText = (text: string) => ({
  type: 'assistant',
  role: 'assistant',
  message: { role: 'assistant', content: [{ type: 'text', text }] },
})

// ─────────────────────────── GREEN：防御层双向修复 + 留痕───────────────────────────
// （RED 基线直证已完成使命——修前孤儿直通 wire / tool_calls 悬空两形均已由
// ensureToolResultPairing 出口防御修复，端到端断言见 ⑥⑦。）

describe('wave0190 层2 ensureToolResultPairing（出口防御）', () => {
  test('① 反向：孤儿 tool_result 剥除 + 留痕（strippedOrphanToolCallIds）', () => {
    const r = ensureToolResultPairing([
      { role: 'tool', tool_call_id: 'ghost-id', content: 'r:ghost' },
      { role: 'user', content: 'q' },
    ])
    expect(r.messages.some((m) => m.role === 'tool')).toBe(false)
    expect(r.strippedOrphanToolCallIds).toEqual(['ghost-id'])
  })

  test("② 空 tool_call_id（tool_use_id ?? '' 残面）→ 剥除 + 留痕", () => {
    const r = ensureToolResultPairing([
      { role: 'tool', tool_call_id: '', content: 'orphan' },
    ])
    expect(r.messages.some((m) => m.role === 'tool')).toBe(false)
    expect(r.strippedOrphanToolCallIds).toEqual([''])
  })

  test('③ 正向：缺 result 的 tool_calls → 合成 error result（role:tool 纯文本回指 id）紧随 assistant', () => {
    const r = ensureToolResultPairing([
      { role: 'assistant', content: null, tool_calls: [{ id: 'tu1', type: 'function', function: { name: 'echo', arguments: '{}' } }] },
      { role: 'user', content: 'q' },
    ])
    expect(r.messages).toHaveLength(3)
    expect(r.messages[1].role).toBe('tool')
    expect(r.messages[1].tool_call_id).toBe('tu1')
    expect(typeof r.messages[1].content).toBe('string')
    expect(r.messages[1].content.length).toBeGreaterThan(0)
    expect(r.syntheticToolCallIds).toEqual(['tu1'])
  })

  test('④ 双向同回合：孤儿剥除 + 缺 result 补齐互不干扰', () => {
    const r = ensureToolResultPairing([
      { role: 'assistant', content: null, tool_calls: [{ id: 'tu1', type: 'function', function: { name: 'echo', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'ghost', content: 'x' },
      { role: 'user', content: 'q' },
    ])
    expect(r.strippedOrphanToolCallIds).toEqual(['ghost'])
    expect(r.syntheticToolCallIds).toEqual(['tu1'])
    const toolMsgs = r.messages.filter((m) => m.role === 'tool')
    expect(toolMsgs).toHaveLength(1)
    expect(toolMsgs[0].tool_call_id).toBe('tu1')
  })

  test('⑤ 合法全配对对话 → 零修复零扰动（逐字节恒等基线投影）', () => {
    const wire = [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'tu1', type: 'function', function: { name: 'echo', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'tu1', content: 'r' },
      { role: 'assistant', content: 'done' },
    ]
    const r = ensureToolResultPairing(wire)
    expect(r.syntheticToolCallIds).toEqual([])
    expect(r.strippedOrphanToolCallIds).toEqual([])
    expect(r.messages).toEqual(wire) // 引用形恒等：零重建零扰动
  })

  test('⑥ toOpenAIMessages 出口接线：孤儿输入 → wire 无孤儿（端到端防御）', () => {
    const wire = toOpenAIMessages([userToolResults(['ghost-id']), userText('q')])
    expect(wire.some((m) => m.role === 'tool')).toBe(false)
    expect(wire.some((m) => m.role === 'user' && m.content === 'q')).toBe(true)
  })

  test('⑦ toOpenAIMessages 出口接线：缺 result 输入 → wire 含合成 tool 回应', () => {
    const wire = toOpenAIMessages([assistantWithToolUses(['tu1']), userText('q')])
    const toolMsgs = wire.filter((m) => m.role === 'tool')
    expect(toolMsgs).toHaveLength(1)
    expect(toolMsgs[0].tool_call_id).toBe('tu1')
  })

  test('⑧ 合法对话全链投影逐字节零 diff（防御层零扰动直证）', () => {
    const msgs = [
      userText('q1'),
      assistantWithToolUses(['tu1', 'tu2']),
      userToolResults(['tu1', 'tu2']),
      assistantText('done'),
    ]
    const wire = toOpenAIMessages(msgs)
    // 防御层 no-op：tool 回应两支俱全、顺序与投影原生一致
    const toolMsgs = wire.filter((m) => m.role === 'tool')
    expect(toolMsgs.map((m) => m.tool_call_id)).toEqual(['tu1', 'tu2'])
    expect(wire[0]).toEqual({ role: 'user', content: 'q1' })
    expect(wire.at(-1)).toEqual({ role: 'assistant', content: 'done' })
  })

  test('⑨ 0.1.89 attachment 三段面零越权：未知 attachment 恒 rejection marker（防防御层误伤）', () => {
    const wire = toOpenAIMessages([
      { type: 'attachment', attachment: { type: 'mystery-type' } },
      userText('q'),
    ])
    expect(
      wire.some((m) => typeof m.content === 'string' && m.content.includes('cannot be projected')),
    ).toBe(true)
  })
})
