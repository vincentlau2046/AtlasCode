/**
 * modelprovider 消息序列化 toOpenAIMessages 回归测试（§8.25 E-2 T-5c F-1）。
 *
 * 锁定 F-1 修复：user / system 消息的「顶层 content」与「嵌套 message.content」双形态
 * 均须序列化（旧版仅读嵌套形态，顶层 user 消息——即子代理任务 prompt——被静默丢弃，
 * 假 provider 从不序列化故不可见）。断言的是「prompt 是否真的进了 out 序列」，非 tautology。
 */
import { describe, test, expect } from 'bun:test'
import { toOpenAIMessages } from '../../src/modelprovider/params'

describe('toOpenAIMessages（F-1 双形态消息）', () => {
  test('① 顶层 content 的 user 消息（runAgent 任务 prompt）不被丢弃', () => {
    const out = toOpenAIMessages([
      { type: 'user', role: 'user', content: 'do the task' },
    ])
    expect(out).toEqual([{ role: 'user', content: 'do the task' }])
  })

  test('② 顶层 content 的 system 消息降级为 user role（既有行为，不被丢）', () => {
    const out = toOpenAIMessages([{ type: 'system', role: 'system', content: 'sys-prompt' }])
    expect(out).toEqual([{ role: 'user', content: 'sys-prompt' }])
  })

  test('③ 嵌套 message.content 的 user 消息（fork / loop tool_result 形态）', () => {
    const out = toOpenAIMessages([
      { type: 'user', role: 'user', message: { role: 'user', content: 'nested' } },
    ])
    expect(out).toEqual([{ role: 'user', content: 'nested' }])
  })

  test('④ 全链：system(顶层) + user prompt(顶层) → 两条都进序列，prompt 在列', () => {
    const out = toOpenAIMessages([
      { type: 'system', role: 'system', content: 'You are a subagent.' },
      { type: 'user', role: 'user', content: 'fix the bug' },
    ])
    const contents = out.map((m) => m.content)
    expect(contents).toContain('fix the bug') // F-1 回归核心断言
    expect(contents).toContain('You are a subagent.')
    expect(out).toHaveLength(2)
  })

  test('⑤ user 块数组（text + tool_result）→ text 合并 + tool role 分离', () => {
    const out = toOpenAIMessages([
      {
        type: 'user',
        role: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'saw it' },
            { type: 'tool_result', tool_use_id: 't1', content: 'file-contents' },
          ],
        },
      },
    ])
    expect(out).toEqual([
      { role: 'user', content: 'saw it' },
      { role: 'tool', tool_call_id: 't1', content: 'file-contents' },
    ])
  })

  test('⑥ assistant（text + tool_use）→ text + tool_calls', () => {
    const out = toOpenAIMessages([
      {
        type: 'assistant',
        role: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'reading' },
            { type: 'tool_use', id: 't1', name: 'Read', input: { path: 'a' } },
          ],
        },
      },
    ])
    expect(out).toEqual([
      {
        role: 'assistant',
        content: 'reading',
        tool_calls: [
          { id: 't1', type: 'function', function: { name: 'Read', arguments: '{"path":"a"}' } },
        ],
      },
    ])
  })
})
