/**
 * engine/query 多轮 agent loop（queryAgentLoop）fixture 回放 + engine/context 压缩链 契约测试
 * （§8.23 E-1b T-4a/T-4b/T-4d）。
 *
 * 非 tautology：scripted LLM 按轮次返回**不同** completion（tool_use→tool_use→text），
 * 断言的是 loop 的**调度行为**（轮次计数 / terminal 判定 / maxTurns 截断 / pre-turn 压缩重建
 * 消息序列），非 fake 自证。context 压缩链断言真触发/真重建/真熔断。I/O-free → unit 层。
 */
import { describe, test, expect } from 'bun:test'
import {
  autoCompactIfNeeded,
  buildPostCompactMessages,
  compactConversation,
  getAutoCompactThreshold,
  microcompactMessages,
  queryAgentLoop,
  shouldAutoCompact,
  TIME_BASED_MC_CLEARED_MESSAGE,
  estimateMessageTokens,
  type AutoCompactDeps,
  type AutoCompactTrackingState,
} from '../../src/engine'
import type { ModelProvider, ModelRole } from '../../src/modelprovider'
import type { Message, Tool } from '../../src/shared'

// ── 脚本化 LLM（按轮次返不同 completion，回放真实多轮对话）─────────────────
interface ScriptStep {
  content: unknown[]
  stopReason?: string
}
function scriptedProvider(script: ScriptStep[]): { provider: ModelProvider; calls: () => number } {
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
        timestamp: '2026-09-23T00:00:00Z',
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
  return { provider, calls: () => call }
}

/** echo 工具（真 Tool.call 语义）：回显 input.msg，供多轮回放观察调度。 */
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

/** 永不触发的 autoCompact（大窗口 + 小计数 → shouldAutoCompact 恒 false；compact 若被调即炸）。 */
function noopAutoCompact(): AutoCompactDeps {
  return {
    contextWindow: 1_000_000,
    countTokens: () => 10,
    compact: async () => {
      throw new Error('compaction should not run (noop)')
    },
  }
}
/** 必触发的 autoCompact（小窗口 + 大计数 → 超阈值；compact 绑 compactConversation + fake summarize）。 */
function firingAutoCompact(): AutoCompactDeps {
  return {
    contextWindow: 20_000, // threshold = 20000 - 13000 = 7000
    countTokens: () => 9_000, // >= 7000 → 触发
    compact: (msgs) =>
      compactConversation(msgs, {
        summarize: async () => '<analysis>x</analysis><summary>SUMMARY-BODY</summary>',
        countTokens: () => 100,
      }),
  }
}

const FRESH_TRACKING: AutoCompactTrackingState = {
  compacted: false,
  turnCounter: 0,
  turnId: 'turn-0',
}

describe('engine/query 多轮 loop（queryAgentLoop）fixture 回放', () => {
  test('① 3 轮回放（tool→tool→text）：terminated=true，轮次=3，消息交错正确', async () => {
    const { provider, calls } = scriptedProvider([
      toolStep('tu-1', 'a'),
      toolStep('tu-2', 'b'),
      textStep('done'),
    ])
    const r = await queryAgentLoop(
      { modelProvider: provider, role: 'small' as ModelRole },
      {
        messages: [{ role: 'user', content: 'go' }],
        tools: [makeEchoTool()],
      },
    )
    expect(r.turns).toBe(3)
    expect(r.terminated).toBe(true)
    expect(calls()).toBe(3)
    // 消息序列：初始 user(1) + (assistant+tool_result)*2 + assistant(text) = 6
    expect(r.messages).toHaveLength(6)
    // 3 轮 assistant（loop 构造均带 type:'assistant'）
    expect(r.messages.filter((m) => m.type === 'assistant')).toHaveLength(3)
    // 2 条 tool_result（loop 构造带 type:'user'）；初始 user 消息仅 role 无 type（入参原样）
    expect(r.messages.filter((m) => m.type === 'user')).toHaveLength(2)
  })

  test('② maxTurns 截断：前 2 轮都 tool_use → terminated=false，轮次=2', async () => {
    const { provider, calls } = scriptedProvider([
      toolStep('t1', 'a'),
      toolStep('t2', 'b'),
      toolStep('t3', 'c'),
    ])
    const r = await queryAgentLoop(
      { modelProvider: provider, role: 'small' as ModelRole },
      {
        messages: [{ role: 'user', content: 'go' }],
        tools: [makeEchoTool()],
        context: { autoCompact: noopAutoCompact(), maxTurns: 2 },
      },
    )
    expect(r.turns).toBe(2)
    expect(r.terminated).toBe(false)
    expect(calls()).toBe(2) // 未耗尽脚本（第 3 步未取）
  })

  test('③ pre-turn 压缩：超阈值 → buildPostCompactMessages 重建序列（边界 marker + 摘要）', async () => {
    const { provider } = scriptedProvider([textStep('hi')])
    const r = await queryAgentLoop(
      { modelProvider: provider, role: 'small' as ModelRole },
      {
        messages: [{ role: 'user', content: 'seed' }],
        tools: [],
        context: { autoCompact: firingAutoCompact() },
        tracking: FRESH_TRACKING,
      },
    )
    expect(r.turns).toBe(1)
    expect(r.terminated).toBe(true)
    // 压缩后序列头 = 边界 marker（system + compactMetadata）
    expect(r.messages[0].type).toBe('system')
    expect((r.messages[0] as { compactMetadata?: unknown }).compactMetadata).toBeDefined()
    // 摘要 user 消息（getCompactUserSummaryMessage 文案）
    const summaryMsg = r.messages[1] as { message: { content: unknown } }
    expect(String(summaryMsg.message.content)).toContain('This session is being continued')
    // tracking 回填 compacted=true
    expect(r.tracking.compacted).toBe(true)
  })

  test('④ 未注入 context = 纯多轮不压缩（noop 语义，compact 不被调）', async () => {
    const { provider } = scriptedProvider([toolStep('tu-1', 'a'), textStep('done')])
    const r = await queryAgentLoop(
      { modelProvider: provider, role: 'small' as ModelRole },
      { messages: [{ role: 'user', content: 'go' }], tools: [makeEchoTool()] },
    )
    expect(r.turns).toBe(2)
    expect(r.terminated).toBe(true)
    // 无压缩边界 marker
    expect(r.messages.every((m) => m.type !== 'system')).toBe(true)
  })
})

describe('engine/context autoCompact（触发判定 + 熔断）', () => {
  const base: AutoCompactDeps = {
    contextWindow: 20_000,
    countTokens: () => 9_000,
    compact: async () => {
      throw new Error('not exercised in should*')
    },
  }
  test('① 超阈值 → 触发', async () => {
    expect(await shouldAutoCompact([], base)).toBe(true)
  })
  test('② 低于阈值 → 不触发', async () => {
    expect(
      await shouldAutoCompact([], { ...base, countTokens: () => 5_000 }),
    ).toBe(false)
  })
  test('③ NaN guard：计数 NaN → 不触发（不误压缩）', async () => {
    expect(
      await shouldAutoCompact([], { ...base, countTokens: () => Number.NaN }),
    ).toBe(false)
  })
  test('④ 递归守卫：querySource=compact → 不触发', async () => {
    expect(await shouldAutoCompact([], { ...base, querySource: 'compact' })).toBe(false)
  })
  test('⑤ 未注入 countTokens → 不触发（fail-safe）', async () => {
    expect(
      await shouldAutoCompact([], { contextWindow: 20_000, compact: base.compact }),
    ).toBe(false)
  })
  test('⑥ enabled=false → 不触发', async () => {
    expect(await shouldAutoCompact([], { ...base, enabled: false })).toBe(false)
  })
  test('⑦ 阈值 = contextWindow − 13000', () => {
    expect(getAutoCompactThreshold(20_000)).toBe(7_000)
  })

  test('⑧ 熔断：连续 3 次失败态 → 短路不压缩', async () => {
    let compactCalls = 0
    const outcome = await autoCompactIfNeeded(
      [],
      { ...FRESH_TRACKING, consecutiveFailures: 3 },
      { ...base, compact: async () => (compactCalls++, { boundaryMarker: {}, summaryMessages: [] }) },
    )
    expect(outcome.wasCompacted).toBe(false)
    expect(compactCalls).toBe(0) // 熔断短路，不真压缩
  })
  test('⑨ 压缩成功 → wasCompacted + tracking.compacted + 失败计数清零', async () => {
    const msgs: Message[] = [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]
    const outcome = await autoCompactIfNeeded(msgs, FRESH_TRACKING, {
      ...base,
      compact: async (m) =>
        compactConversation(m, { summarize: async () => '<summary>s</summary>' }),
    })
    expect(outcome.wasCompacted).toBe(true)
    expect(outcome.tracking?.compacted).toBe(true)
    expect(outcome.tracking?.consecutiveFailures).toBe(0)
  })
  test('⑩ 压缩失败 → 失败计数 +1（不崩，供下轮熔断）', async () => {
    const outcome = await autoCompactIfNeeded([], { ...FRESH_TRACKING, consecutiveFailures: 1 }, {
      ...base,
      compact: async () => {
        throw new Error('summary blew up')
      },
    })
    expect(outcome.wasCompacted).toBe(false)
    expect(outcome.consecutiveFailures).toBe(2)
    expect(outcome.error).toContain('summary blew up')
  })
})

describe('engine/context compactConversation（摘要体 + post-compact 拼接）', () => {
  const summarize = async () => '<analysis>draft</analysis><summary>REAL-SUMMARY</summary>'
  test('① 空序列 → 抛 Not enough messages', async () => {
    await expect(
      compactConversation([], { summarize }),
    ).rejects.toThrow('Not enough messages')
  })
  test('② 摘要成功 → CompactionResult（边界 + 摘要消息）', async () => {
    const msgs: Message[] = [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]
    const r = await compactConversation(msgs, { summarize })
    expect(r.boundaryMarker.type).toBe('system')
    expect(r.summaryMessages).toHaveLength(1)
    // 摘要回注文案含摘要体 + 「本会话延续」头
    const text = String(r.summaryMessages[0].message.content as unknown)
    expect(text).toContain('REAL-SUMMARY')
    expect(text).toContain('This session is being continued')
    expect(text).not.toContain('draft') // <analysis> 草稿段被 formatCompactSummary 剥掉
  })
  test('③ keepRecent>0 → messagesToKeep 保留尾 N 条', async () => {
    const msgs: Message[] = Array.from({ length: 5 }, (_, i) => ({
      role: 'user',
      content: `m${i}`,
    }))
    const r = await compactConversation(msgs, { summarize, keepRecent: 2 })
    expect(r.messagesToKeep).toHaveLength(2)
  })
  test('④ summarize 返空 → 抛错（摘要未产出）', async () => {
    await expect(
      compactConversation([{ role: 'user', content: 'a' }], { summarize: async () => '' }),
    ).rejects.toThrow('Failed to generate conversation summary')
  })
  test('⑤ buildPostCompactMessages 拼接顺序：边界→摘要→保留', () => {
    const result = {
      boundaryMarker: { type: 'system' } as Message,
      summaryMessages: [{ role: 'user', content: 'summary' } as Message],
      messagesToKeep: [{ role: 'user', content: 'kept' } as Message],
    }
    const ordered = buildPostCompactMessages(result as never)
    expect(ordered[0].type).toBe('system') // 边界
    expect(String(ordered[1].content)).toBe('summary') // 摘要
    expect(String(ordered[2].content)).toBe('kept') // 保留
    expect(ordered).toHaveLength(3)
  })
})

describe('engine/context microCompact（时间触发 content-clear + token 估算）', () => {
  const OLD_TS = '2026-01-01T00:00:00Z'
  const NOW = new Date('2026-01-01T02:00:00Z').getTime() // 2h 后（120min gap）
  const assistantWithTools = (toolUses: { id: string; name: string }[]): Message => ({
    type: 'assistant',
    role: 'assistant',
    uuid: 'a1',
    timestamp: OLD_TS,
    message: {
      role: 'assistant',
      content: toolUses.map((t) => ({ type: 'tool_use', id: t.id, name: t.name, input: {} })),
    },
  })
  const userWithResults = (results: { id: string; content: string }[]): Message => ({
    type: 'user',
    role: 'user',
    uuid: 'u1',
    timestamp: OLD_TS,
    message: {
      role: 'user',
      content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content })),
    },
  })
  const compactable = new Set(['FileRead'])

  test('① 未启用 → 原样返回（不 clear）', () => {
    const msgs = [
      assistantWithTools([{ id: 't1', name: 'FileRead' }]),
      userWithResults([{ id: 't1', content: 'x'.repeat(400) }]),
    ]
    const out = microcompactMessages(msgs, {
      config: { enabled: false, gapThresholdMinutes: 60, keepRecent: 5 },
      compactableTools: compactable,
      now: NOW,
    })
    expect(out.clearedToolIds).toHaveLength(0)
    expect(out.tokensSaved).toBe(0)
  })

  test('② gap 超阈值 + 可压缩工具 → 清最旧、保最近 keepRecent', () => {
    const msgs = [
      assistantWithTools([
        { id: 't1', name: 'FileRead' },
        { id: 't2', name: 'FileRead' },
        { id: 't3', name: 'FileRead' },
      ]),
      userWithResults([
        { id: 't1', content: 'A'.repeat(400) },
        { id: 't2', content: 'B'.repeat(400) },
        { id: 't3', content: 'C'.repeat(400) },
      ]),
    ]
    const out = microcompactMessages(msgs, {
      config: { enabled: true, gapThresholdMinutes: 60, keepRecent: 1 },
      compactableTools: compactable,
      now: NOW,
    })
    // 保留最近 1（t3），清 t1/t2
    expect(out.clearedToolIds).toEqual(['t1', 't2'])
    expect(out.tokensSaved).toBeGreaterThan(0)
    const results = (out.messages[1].message.content as Array<{ content?: string; tool_use_id: string }>)
    expect(results.find((b) => b.tool_use_id === 't1')?.content).toBe(
      TIME_BASED_MC_CLEARED_MESSAGE,
    )
    expect(results.find((b) => b.tool_use_id === 't3')?.content).toBe('C'.repeat(400)) // 保留
  })

  test('③ gap 未超阈值 → 不 clear', () => {
    const msgs = [
      assistantWithTools([{ id: 't1', name: 'FileRead' }]),
      userWithResults([{ id: 't1', content: 'x'.repeat(400) }]),
    ]
    const out = microcompactMessages(msgs, {
      config: { enabled: true, gapThresholdMinutes: 240, keepRecent: 1 }, // 240min 阈值 > 120min gap
      compactableTools: compactable,
      now: NOW,
    })
    expect(out.clearedToolIds).toHaveLength(0)
  })

  test('④ estimateMessageTokens：text 消息给出正估值', () => {
    const msgs: Message[] = [
      {
        type: 'user',
        role: 'user',
        uuid: 'u',
        timestamp: OLD_TS,
        message: { role: 'user', content: [{ type: 'text', text: 'a'.repeat(100) }] },
      },
    ]
    expect(estimateMessageTokens(msgs)).toBeGreaterThan(0)
  })
})
