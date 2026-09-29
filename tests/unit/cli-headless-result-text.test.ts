/**
 * W3-3d G-α 修波：headless 终态 result 文本提取（extractFinalAssistantText）
 * 判别测试。
 *
 * 被测能力 = headless -p 终态 result.result 文本面（非 tautology——引擎
 * AssistantMessage 嵌套形（content 在 m.message.content，queryOneRound 构造
 * 序）与扁平形（顶层 content）双形状提取 + 末位 assistant 优先语义）：
 *   H-1 嵌套形（引擎 queryOneRound 实产形：message.content = text 块数组，
 *       无顶层 content）→ 提取 text。
 *   H-2 扁平形（顶层 content 字符串）→ 原样提取。
 *   H-3 末位 assistant 优先（多回合会话：中间回合有文本、末回合才是
 *       终态 result 源）。
 *   H-4 无文本（仅 tool_use 块 / 空 content）→ 空串（fail-soft 旧语义）。
 *
 * G-α 真跑发现源：引擎 loop 产物消息经 finalAssistantText 顶层 m.content
 * 读取恒 undefined → result.result 恒 ""（-p text 面 stdout 空 / stream-json
 * result.result 空）；本测锁双形状提取。
 */
import { describe, test, expect } from 'bun:test'
import { extractFinalAssistantText } from '../../src/cli/print'
import type { AgentLoopResult } from '../../src/engine'

function makeResult(
  messages: Array<{ role?: string; content?: unknown; message?: unknown }>,
): AgentLoopResult {
  return {
    messages: messages as AgentLoopResult['messages'],
    turns: 1,
    terminated: true,
    tracking: { compacted: false, turnCounter: 0, turnId: 'turn-0' },
  } as AgentLoopResult
}

describe('extractFinalAssistantText（W3-3d G-α headless result 文本面）', () => {
  test('H-1 嵌套形：m.message.content 块数组 → 提取 text（引擎实产形）', () => {
    const r = makeResult([
      { role: 'user', content: 'Say exactly: OK' },
      {
        role: 'assistant',
        message: {
          id: 'm1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'OK' }],
          stop_reason: 'end_turn',
        },
      },
    ])
    expect(extractFinalAssistantText(r)).toBe('OK')
  })

  test('H-2 扁平形：顶层 content 字符串 → 原样提取', () => {
    const r = makeResult([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
    expect(extractFinalAssistantText(r)).toBe('hello')
  })

  test('H-3 末位 assistant 优先：中间回合文本不覆盖终态', () => {
    const r = makeResult([
      { role: 'assistant', content: 'interim' },
      { role: 'user', content: 'more' },
      {
        role: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'first-final' },
            { type: 'text', text: '-end' },
          ],
        },
      },
    ])
    // 末位 assistant 多 text 块拼接；「interim」不胜出
    expect(extractFinalAssistantText(r)).toBe('first-final-end')
  })

  test('H-4 无文本：仅 tool_use 块 / 空 content → 空串', () => {
    const onlyTools = makeResult([
      {
        role: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 't1', name: 'Bash', input: {} },
          ],
        },
      },
    ])
    expect(extractFinalAssistantText(onlyTools)).toBe('')
    const empty = makeResult([{ role: 'assistant', content: '' }])
    expect(extractFinalAssistantText(empty)).toBe('')
  })
})
