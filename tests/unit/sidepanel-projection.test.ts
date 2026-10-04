/**
 * P1a 侧栏纯投影函数判别单测（无 React/无网络/无盘）：
 * ① sideBySideRows（hunk → 双列行配对，git 行语义）
 * ② resolveSidebarPage（/sidebar 命令参数解析）
 * ③ projectToolActivity（消息流 tool_use/tool_result → Activity 页条目）
 */
import { describe, test, expect } from 'bun:test'
import type { StructuredPatchHunk } from 'diff'
import { hunkToSbsRows } from '../../src/tui/components/SidePanel/pages/sideBySideRows'
import { resolveSidebarPage } from '../../src/tui/components/SidePanel/types'
import { projectToolActivity } from '../../src/tui/components/SidePanel/pages/projectActivity'
import type { Message } from '../../src/tui/types/message'

function fakeHunk(
  oldStart: number,
  newStart: number,
  lines: string[],
): StructuredPatchHunk {
  return {
    oldStart,
    oldLines: 0,
    newStart,
    newLines: 0,
    lines,
  } as StructuredPatchHunk
}

describe('P1a hunkToSbsRows', () => {
  test('-/+ / 行配对 + 行号推进', () => {
    const rows = hunkToSbsRows(
      fakeHunk(10, 10, [' a', '-old1', '-old2', '+new1', ' b']),
    )
    expect(rows).toEqual([
      { left: 'a', right: 'a', leftNum: 10, rightNum: 10, kind: 'ctx' },
      { left: 'old1', right: null, leftNum: 11, rightNum: null, kind: 'del' },
      { left: 'old2', right: null, leftNum: 12, rightNum: null, kind: 'del' },
      { left: null, right: 'new1', leftNum: null, rightNum: 11, kind: 'add' },
      { left: 'b', right: 'b', leftNum: 13, rightNum: 12, kind: 'ctx' },
    ])
  })

  test("'\\ No newline' marker 不成行", () => {
    const rows = hunkToSbsRows(fakeHunk(1, 1, ['+x', '\\ No newline at end of file']))
    expect(rows.length).toBe(1)
    expect(rows[0].right).toBe('x')
  })

  test('空 hunk 空行表', () => {
    expect(hunkToSbsRows(fakeHunk(1, 1, []))).toEqual([])
  })
})

describe('P1a resolveSidebarPage', () => {
  test('5 页名（大小写/空白不敏感）直达', () => {
    expect(resolveSidebarPage('decisions')).toBe('decisions')
    expect(resolveSidebarPage(' Budget ')).toBe('budget')
    expect(resolveSidebarPage('DIFF')).toBe('diff')
  })
  test('空/无效 → 默认 diff 页', () => {
    expect(resolveSidebarPage()).toBe('diff')
    expect(resolveSidebarPage('')).toBe('diff')
    expect(resolveSidebarPage('nope')).toBe('diff')
  })
})

describe('P1a projectToolActivity', () => {
  function assistantMsg(blocks: unknown[]): Message {
    return { type: 'assistant', message: { content: blocks } } as unknown as Message
  }
  function userMsg(blocks: unknown[]): Message {
    return { type: 'user', message: { content: blocks } } as unknown as Message
  }

  test('tool_use + tool_result 配对状态（ok/error/pending）', () => {
    const items = projectToolActivity([
      assistantMsg([{ type: 'tool_use', id: 'a1', name: 'Bash', input: { command: 'ls' } }]),
      userMsg([{ type: 'tool_result', tool_use_id: 'a1', content: 'ok' }]),
      assistantMsg([{ type: 'tool_use', id: 'a2', name: 'Edit', input: { file_path: '/x' } }]),
      userMsg([{ type: 'tool_result', tool_use_id: 'a2', is_error: true, content: 'err' }]),
      assistantMsg([{ type: 'tool_use', id: 'a3', name: 'Read', input: {} }]),
    ])
    expect(items.map(i => [i.name, i.status])).toEqual([
      ['Bash', 'ok'],
      ['Edit', 'error'],
      ['Read', 'pending'],
    ])
  })

  test('摘要：command/file_path 首选字段', () => {
    const items = projectToolActivity([
      assistantMsg([{ type: 'tool_use', id: 'a1', name: 'Bash', input: { command: 'ls -la' } }]),
      assistantMsg([{ type: 'tool_use', id: 'a2', name: 'Edit', input: { file_path: '/tmp/x.ts' } }]),
    ])
    expect(items[0].summary).toBe('ls -la')
    expect(items[1].summary).toBe('/tmp/x.ts')
  })

  test('超 12 条取最近 12（顺序保持时间序）', () => {
    const msgs: Message[] = []
    for (let i = 0; i < 15; i++) {
      msgs.push(
        assistantMsg([{ type: 'tool_use', id: `t${i}`, name: `Tool${i}`, input: {} }]),
      )
    }
    const items = projectToolActivity(msgs)
    expect(items.length).toBe(12)
    expect(items[0].name).toBe('Tool3')
    expect(items[11].name).toBe('Tool14')
  })

  test('空消息 → 空投影', () => {
    expect(projectToolActivity([])).toEqual([])
  })
})
