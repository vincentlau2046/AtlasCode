/**
 * cli/debugLines 判别单测（#240 cli-debug P3：headless 基线 lifecycle
 * debug 行构造——常路径诊断面，修前 --debug 常路径零输出）。
 *
 * 判别点（mutation-red 面）：
 *  - 行格式契约（`[headless] ...` 前缀 + 各字段序）= runHeadless 6 调用点
 *    发射内容的单一事实源
 *  - turnEndLine 工具面 = assistant 消息 tool_use 块名有序去重 + 前 10 +
 *    `+N` 尾标（防行爆）
 *  - emptyTerminated / terminated=false 支各自独立可辨
 */
import { describe, expect, test } from 'bun:test'
import { type AgentLoopResult } from '../../src/engine'
import {
  headlessErrorLine,
  headlessStartLine,
  mcpConnectLine,
  modelLine,
  toolNamesFromMessages,
  turnEndLine,
  turnStartLine,
} from '../../src/cli'

type Msg = AgentLoopResult['messages'][number]

function assistantMsg(content: unknown[]): Msg {
  return {
    role: 'assistant',
    message: { content },
  } as unknown as Msg
}

function toolUse(name: string): { type: string; name: string } {
  return { type: 'tool_use', name }
}

describe('headlessStartLine（#240 基线行 ①）', () => {
  test('仅 id（常路径最小面）', () => {
    expect(headlessStartLine('sid-1', {})).toBe(
      '[headless] session start: id=sid-1',
    )
  })

  test('resume + model 字段在', () => {
    expect(
      headlessStartLine('sid-1', { resume: 'abc.jsonl', model: 'qwen-x' }),
    ).toBe(
      '[headless] session start: id=sid-1 resume=abc.jsonl model=qwen-x',
    )
  })

  test('continue 旗标 = continue=1；全缺不出现', () => {
    expect(headlessStartLine('s', { continue: true })).toBe(
      '[headless] session start: id=s continue=1',
    )
    expect(headlessStartLine('s', { continue: undefined })).toBe(
      '[headless] session start: id=s',
    )
  })
})

describe('modelLine（#240 基线行 ②）', () => {
  test('role + model 解析值', () => {
    expect(modelLine('premium', 'm-1')).toBe(
      '[headless] model resolved: role=premium model=m-1',
    )
  })

  test('模型未解析 → (pool default)', () => {
    expect(modelLine('small', undefined)).toBe(
      '[headless] model resolved: role=small model=(pool default)',
    )
  })
})

describe('mcpConnectLine（#240 基线行 ③）', () => {
  test('连接汇总计数', () => {
    expect(mcpConnectLine(2, 1)).toBe('[headless] mcp: connected=2 failed=1')
  })

  test('零 MCP 面（常路径）', () => {
    expect(mcpConnectLine(0, 0)).toBe('[headless] mcp: connected=0 failed=0')
  })
})

describe('turnStartLine / turnEndLine（#240 基线行 ④a/④b）', () => {
  test('开始行 = 序号 + 入参消息数', () => {
    expect(turnStartLine(3, 17)).toBe('[headless] turn 3 start (messages=17)')
  })

  test('结束行：terminated + 工具面有序', () => {
    const r: Pick<
      AgentLoopResult,
      'turns' | 'terminated' | 'emptyTerminated' | 'messages'
    > = {
      turns: 2,
      terminated: true,
      messages: [
        assistantMsg([
          { type: 'text', text: 'x' },
          toolUse('Bash'),
          toolUse('Write'),
          toolUse('Bash'), // 重复 = 去重
        ]),
      ],
    }
    expect(turnEndLine(1, r)).toBe(
      '[headless] turn 1 end: rounds=2 terminated=true tools=[Bash, Write]',
    )
  })

  test('空终止支 = empty=true 独立可辨', () => {
    const r: Pick<
      AgentLoopResult,
      'turns' | 'terminated' | 'emptyTerminated' | 'messages'
    > = {
      turns: 1,
      terminated: true,
      emptyTerminated: true,
      messages: [assistantMsg([])],
    }
    expect(turnEndLine(2, r)).toBe(
      '[headless] turn 2 end: rounds=1 terminated=true empty=true',
    )
  })

  test('maxTurns 截断支 = terminated=false（无工具面）', () => {
    const r: Pick<
      AgentLoopResult,
      'turns' | 'terminated' | 'emptyTerminated' | 'messages'
    > = {
      turns: 5,
      terminated: false,
      messages: [assistantMsg([toolUse('Read')])],
    }
    expect(turnEndLine(1, r)).toBe(
      '[headless] turn 1 end: rounds=5 terminated=false tools=[Read]',
    )
  })

  test('工具超 10 件 = 前 10 + `+N` 尾标（防行爆）', () => {
    const names = Array.from({ length: 12 }, (_, i) => `t${i}`)
    const r: Pick<
      AgentLoopResult,
      'turns' | 'terminated' | 'emptyTerminated' | 'messages'
    > = {
      turns: 1,
      terminated: true,
      messages: [assistantMsg(names.map(toolUse))],
    }
    expect(turnEndLine(1, r)).toBe(
      '[headless] turn 1 end: rounds=1 terminated=true tools=[' +
        't0, t1, t2, t3, t4, t5, t6, t7, t8, t9, +2]',
    )
  })

  test('非 assistant 消息 / 无 content 消息不入工具面', () => {
    const r: Pick<
      AgentLoopResult,
      'turns' | 'terminated' | 'emptyTerminated' | 'messages'
    > = {
      turns: 1,
      terminated: true,
      messages: [
        { role: 'user' } as unknown as Msg,
        { role: 'assistant' } as unknown as Msg, // 无 message.content
        assistantMsg([toolUse('Bash')]),
      ],
    }
    expect(turnEndLine(1, r)).toBe(
      '[headless] turn 1 end: rounds=1 terminated=true tools=[Bash]',
    )
  })
})

describe('headlessErrorLine（#240 基线行 ⑤）', () => {
  test('Error 实例取 stack（全栈证据）', () => {
    const e = new Error('boom')
    const line = headlessErrorLine(e)
    expect(line.startsWith('[headless] run error: ')).toBe(true)
    expect(line).toContain('boom')
  })

  test('非 Error 值 = String 化', () => {
    expect(headlessErrorLine('plain')).toBe('[headless] run error: plain')
  })
})

describe('toolNamesFromMessages（工具面抽取）', () => {
  test('空序列 = 空面', () => {
    expect(toolNamesFromMessages([] as AgentLoopResult['messages'])).toEqual(
      [],
    )
  })

  test('顺序保留 + 跨消息去重', () => {
    const msgs: AgentLoopResult['messages'] = [
      assistantMsg([toolUse('Bash'), toolUse('Write')]),
      assistantMsg([toolUse('Bash'), toolUse('Read')]),
    ] as unknown as AgentLoopResult['messages']
    expect(toolNamesFromMessages(msgs)).toEqual(['Bash', 'Write', 'Read'])
  })
})
