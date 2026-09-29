/**
 * W3-3a（§8.74.2/§8.74.14）：engine loop emit 槽（AgentLoopEvent）+ TUI 事件
 * 适配层（src/tui/loopEvents.ts queryEngineLoopStream）判别单测。
 *
 * 非 tautology：scripted LLM 按轮次返不同 completion（tool→tool→text），断言
 * loop 的**事件调度行为**（发射顺序 / 轮粒度载荷 / 压缩边界事件 / 终态引用 /
 * 未注入零行为）+ 适配层的流族重放（request 启动 + assistant/tool result 消息序 /
 * 错误重抛 / 压缩 marker 重放），非 fake 自证。I/O-free → unit 层。
 * harness 面（scriptedProvider/makeEchoTool/firingAutoCompact）=
 * engine-multi-round.test.ts 同形本地拷贝（unit 层文件自足惯例）。
 */
import { describe, test, expect } from 'bun:test'
import {
  compactConversation,
  queryAgentLoop,
  type AgentLoopDeps,
  type AgentLoopEvent,
  type AgentLoopResult,
  type AutoCompactDeps,
  type AutoCompactTrackingState,
} from '../../src/engine'
import { queryEngineLoopStream } from '../../src/tui/loopEvents.js'
import type { ModelProvider, ModelRole } from '../../src/modelprovider'
import type { Tool } from '../../src/shared'

// ── 脚本化 LLM（按轮次返不同 completion；engine-multi-round 同形）────────────
interface ScriptStep {
  content: unknown[]
  stopReason?: string
}
function scriptedProvider(script: ScriptStep[]) {
  let call = 0
  const provider: ModelProvider = {
    chat: async () => {
      if (call >= script.length) {
        throw new Error(`scripted provider exhausted after ${script.length} steps`)
      }
      const step = script[call]
      call++
      return {
        type: 'assistant',
        uuid: `u-${call}`,
        timestamp: '2026-09-30T00:00:00Z',
        message: {
          id: `m-${call}`,
          model: 'fake-model',
          role: 'assistant',
          content: step.content,
          stop_reason: step.stopReason ?? 'end_turn',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      }
    },
    chatStream: (() => {
      throw new Error('not exercised')
    }) as unknown as ModelProvider['chatStream'],
    healthCheck: (async () => true) as ModelProvider['healthCheck'],
    countTokens: (async () => 0) as unknown as ModelProvider['countTokens'],
    listModels: async () => [],
    transcribeAudio: (() => {
      throw new Error('not exercised')
    }) as unknown as ModelProvider['transcribeAudio'],
    synthesizeSpeech: (() => {
      throw new Error('not exercised')
    }) as unknown as ModelProvider['synthesizeSpeech'],
    verifyKey: async () => true,
  }
  return provider
}

/** echo 工具（真 Tool.call 语义）。 */
function makeEchoTool(): Tool {
  return {
    name: 'echo',
    inputSchema: { type: 'object', properties: {} },
    call: async (args: unknown) => ({ data: `echo:${(args as { msg?: string })?.msg}` }),
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
  } as unknown as Tool
}
const toolStep = (id: string, msg: string): ScriptStep => ({
  content: [{ type: 'tool_use', id, name: 'echo', input: { msg } }],
  stopReason: 'tool_calls',
})
const textStep = (text: string): ScriptStep => ({
  content: [{ type: 'text', text }],
  stopReason: 'end_turn',
})

/** 必触发的 autoCompact（超阈值；compact 绑 compactConversation + fake summarize）。 */
function firingAutoCompact(): AutoCompactDeps {
  return {
    contextWindow: 200_000, // threshold = 167_000
    countTokens: () => 170_000, // >= 阈值 → 触发
    compact: (msgs) =>
      compactConversation(msgs, {
        summarize: async () => '<analysis>x</analysis><summary>SUMMARY-BODY</summary>',
        countTokens: () => 100,
      }),
  }
}

describe('W3-3a engine loop emit 槽（AgentLoopEvent）', () => {
  test('① 未注入 emit = 零行为（3 轮回放结果与无 emit 面基线同形）', async () => {
    const provider = scriptedProvider([
      toolStep('tu-1', 'a'),
      toolStep('tu-2', 'b'),
      textStep('done'),
    ])
    const r = await queryAgentLoop(
      { modelProvider: provider, role: 'small' as ModelRole },
      { messages: [{ role: 'user', content: 'go' }], tools: [makeEchoTool()] },
    )
    expect(r.turns).toBe(3)
    expect(r.terminated).toBe(true)
    expect(r.messages).toHaveLength(6)
    expect(r.messages.filter((m) => m.type === 'assistant')).toHaveLength(3)
  })

  test('② 发射顺序（无压缩）：loop_start → [round_start/round_end]×N → loop_end', async () => {
    const provider = scriptedProvider([
      toolStep('tu-1', 'a'),
      toolStep('tu-2', 'b'),
      textStep('done'),
    ])
    const events: AgentLoopEvent[] = []
    const r = await queryAgentLoop(
      {
        modelProvider: provider,
        role: 'small' as ModelRole,
        emit: (e) => {
          events.push(e)
        },
      },
      { messages: [{ role: 'user', content: 'go' }], tools: [makeEchoTool()] },
    )
    expect(events.map((e) => e.type)).toEqual([
      'loop_start',
      'round_start',
      'round_end',
      'round_start',
      'round_end',
      'round_start',
      'round_end',
      'loop_end',
    ])
    // 载荷核验：round_end assistant 消息形 + tool result 族长度 = toolResults 长度
    const re1 = events[2] as Extract<AgentLoopEvent, { type: 'round_end' }>
    expect(re1.assistantMessage.type).toBe('assistant')
    expect(re1.toolResultMessages).toHaveLength(1)
    expect(re1.toolResultMessages[0].type).toBe('user')
    // terminal 轮（无 tool_use）tool result 族 = 空
    const re3 = events[6] as Extract<AgentLoopEvent, { type: 'round_end' }>
    expect(re3.toolResultMessages).toHaveLength(0)
    // loop_end 载荷 = 终态 result 同引用
    const le = events[7] as Extract<AgentLoopEvent, { type: 'loop_end' }>
    expect(le.result).toBe(r)
  })

  test('③ 压缩边界事件：compacted 先于当轮 round_start，载荷 = post-compact 全序列', async () => {
    const provider = scriptedProvider([textStep('hi')])
    const events: AgentLoopEvent[] = []
    const r = await queryAgentLoop(
      {
        modelProvider: provider,
        role: 'small' as ModelRole,
        emit: (e) => {
          events.push(e)
        },
      },
      {
        messages: [{ role: 'user', content: 'seed' }],
        tools: [],
        context: { autoCompact: firingAutoCompact() },
        tracking: { compacted: false, turnCounter: 0, turnId: 'turn-0' } as AutoCompactTrackingState,
      },
    )
    expect(events.map((e) => e.type)).toEqual([
      'loop_start',
      'compacted',
      'round_start',
      'round_end',
      'loop_end',
    ])
    const c = events[1] as Extract<AgentLoopEvent, { type: 'compacted' }>
    expect(c.messages[0].type).toBe('system') // 压缩边界 marker
    expect(r.tracking.compacted).toBe(true)
  })

  test('④ emit 抛 = 传播（同步观察者契约，不 catch 不吞）', async () => {
    const provider = scriptedProvider([textStep('hi')])
    await expect(
      queryAgentLoop(
        {
          modelProvider: provider,
          role: 'small' as ModelRole,
          emit: () => {
            throw new Error('observer bug')
          },
        },
        { messages: [{ role: 'user', content: 'go' }], tools: [] },
      ),
    ).rejects.toThrow('observer bug')
  })
})

describe('W3-3a TUI 事件适配层（queryEngineLoopStream）', () => {
  test('⑤ 流族重放：stream_request_start 首 + assistant/tool result 消息序 + 终态 return', async () => {
    const provider = scriptedProvider([
      toolStep('tu-1', 'a'),
      toolStep('tu-2', 'b'),
      textStep('done'),
    ])
    const gen = queryEngineLoopStream({
      deps: { modelProvider: provider, role: 'small' as ModelRole } as AgentLoopDeps,
      args: { messages: [{ role: 'user', content: 'go' }], tools: [makeEchoTool()] },
    })
    const yielded: unknown[] = []
    for await (const ev of gen) {
      yielded.push(ev)
    }
    // 流族经 for-await 断言；终态 return 经 ⑥ 的 .next() 尾态独立核验
    expect(yielded[0]).toEqual({ type: 'stream_request_start' })
    expect(yielded).toHaveLength(6) // start + (assistant+toolResult)×2 + assistant
    expect((yielded[1] as { type?: string }).type).toBe('assistant')
    expect((yielded[2] as { type?: string }).type).toBe('user')
    expect((yielded[3] as { type?: string }).type).toBe('assistant')
    expect((yielded[4] as { type?: string }).type).toBe('user')
    expect((yielded[5] as { type?: string }).type).toBe('assistant')
    // assistant uuid 序 = 轮次序（u-1..u-3）
    expect((yielded[1] as { uuid?: string }).uuid).toBe('u-1')
    expect((yielded[5] as { uuid?: string }).uuid).toBe('u-3')
  })

  test('⑥ 终态 return = AgentLoopResult（.next() 尾态取）', async () => {
    const provider = scriptedProvider([toolStep('tu-1', 'a'), textStep('done')])
    const gen = queryEngineLoopStream({
      deps: { modelProvider: provider, role: 'small' as ModelRole } as AgentLoopDeps,
      args: { messages: [{ role: 'user', content: 'go' }], tools: [makeEchoTool()] },
    })
    let n = await gen.next()
    while (!n.done) {
      n = await gen.next()
    }
    expect(n.done).toBe(true)
    const r = n.value as AgentLoopResult
    expect(r.turns).toBe(2)
    expect(r.terminated).toBe(true)
  })

  test('⑦ 错误重抛：provider 抛 → 生成器重抛（首 yield 后）', async () => {
    const provider = {
      chat: async () => {
        throw new Error('llm down')
      },
    } as unknown as ModelProvider
    const gen = queryEngineLoopStream({
      deps: { modelProvider: provider, role: 'small' as ModelRole } as AgentLoopDeps,
      args: { messages: [{ role: 'user', content: 'go' }], tools: [] },
    })
    expect((await gen.next()).value).toEqual({ type: 'stream_request_start' })
    await expect(gen.next()).rejects.toThrow('llm down')
  })

  test('⑧ 压缩边界重放：compacted → 仅 messages[0]（system marker）入流', async () => {
    const provider = scriptedProvider([textStep('hi')])
    const gen = queryEngineLoopStream({
      deps: { modelProvider: provider, role: 'small' as ModelRole } as AgentLoopDeps,
      args: {
        messages: [{ role: 'user', content: 'seed' }],
        tools: [],
        context: { autoCompact: firingAutoCompact() },
      },
    })
    const yielded: unknown[] = []
    for await (const ev of gen) {
      yielded.push(ev)
    }
    // start + 边界 system + assistant（terminal 轮无 tool result）
    expect(yielded).toHaveLength(3)
    expect((yielded[1] as { type?: string }).type).toBe('system')
    expect((yielded[2] as { type?: string }).type).toBe('assistant')
  })
})
