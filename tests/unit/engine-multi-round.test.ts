/**
 * engine/query 多轮 agent loop（queryAgentLoop）fixture 回放 + engine/context 压缩链 契约测试
 * （§8.23 E-1b T-4a/T-4b/T-4d + review C-1/M-1 回归）。
 *
 * 非 tautology：scripted LLM 按轮次返回**不同** completion（tool_use→tool_use→text），
 * 断言的是 loop 的**调度行为**（轮次计数 / terminal 判定 / maxTurns 截断 / pre-turn 压缩重建
 * 消息序列），非 fake 自证。context 压缩链断言真触发/真重建/真熔断。I/O-free → unit 层。
 * C-1 回归：失败计数回灌 tracking（熔断跳闸 = doomed 压缩第 4 轮短路，非 fake 短路）。
 * M-1 回归：turnCounter = 距上次 compact 轮数（仅 compacted 会话、仅继续轮自增）。
 */
import { describe, test, expect } from 'bun:test'
import {
  autoCompactIfNeeded,
  buildPostCompactMessages,
  compactConversation,
  getAutoCompactThreshold,
  getCompactPrompt,
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
/** 必触发的 autoCompact（超阈值；compact 绑 compactConversation + fake summarize）。
 * 阈值 = 200_000 − 摘要预留 20_000（未注入 maxOutputTokens 按满额）− 缓冲 13_000 = 167_000。 */
function firingAutoCompact(): AutoCompactDeps {
  return {
    contextWindow: 200_000, // threshold = 200000 - 20000 - 13000 = 167_000
    countTokens: () => 170_000, // >= 167_000 → 触发
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

  test('⑤ 默认 maxTurns = 20（I-2 钉住 DEFAULT_AGENT_LOOP_MAX_TURNS：默认值改成 3 此测红）', async () => {
    const script = Array.from({ length: 21 }, (_, i) => toolStep(`t${i}`, 'x'))
    const { provider, calls } = scriptedProvider(script)
    const r = await queryAgentLoop(
      { modelProvider: provider, role: 'small' as ModelRole },
      { messages: [{ role: 'user', content: 'go' }], tools: [makeEchoTool()] },
    )
    expect(r.turns).toBe(20) // 默认 20 截断（无显式 maxTurns）
    expect(r.terminated).toBe(false)
    expect(calls()).toBe(20) // 第 21 步脚本未取
  })

  test('⑥ signal 透传 loop→runToolBatch→tool.call（I-5：该跳删线此测红）', async () => {
    const seen: unknown[] = []
    const tool = {
      ...makeEchoTool(),
      call: async (args: unknown, ctx: unknown) => {
        seen.push((ctx as { signal?: unknown })?.signal)
        return { data: 'ok' }
      },
    }
    const controller = new AbortController()
    const { provider } = scriptedProvider([toolStep('tu-1', 'a'), textStep('done')])
    await queryAgentLoop(
      { modelProvider: provider, role: 'small' as ModelRole, signal: controller.signal },
      { messages: [{ role: 'user', content: 'go' }], tools: [tool] },
    )
    // tool.call 第 2 参 context.signal 必须是 loop deps 传入的同一 signal 实例
    expect(seen).toHaveLength(1)
    expect(seen[0]).toBe(controller.signal)
  })
})

describe('queryAgentLoop 熔断回灌 + tracking 语义（review C-1/M-1 回归）', () => {
  /** 每轮必失败 + 必触发的 autoCompact：compact 体抛错，计数 compactCalls。 */
  const doomedAutoCompact = (onCompact: () => void): AutoCompactDeps => ({
    contextWindow: 200_000,
    countTokens: () => 170_000, // 超阈值 167_000 → 每轮必试
    compact: () => {
      onCompact()
      throw new Error('doomed compact')
    },
  })

  test('C-1 熔断跳闸：连续失败回灌 tracking → 第 4 轮短路不再调 doomed compact', async () => {
    const { provider } = scriptedProvider([
      toolStep('t1', 'a'),
      toolStep('t2', 'b'),
      toolStep('t3', 'c'),
      toolStep('t4', 'd'),
    ])
    let compactCalls = 0
    const r = await queryAgentLoop(
      { modelProvider: provider, role: 'small' as ModelRole },
      {
        messages: [{ role: 'user', content: 'go' }],
        tools: [makeEchoTool()],
        context: { autoCompact: doomedAutoCompact(() => compactCalls++), maxTurns: 4 },
      },
    )
    // 轮 1/2/3 各失败一次（consecutiveFailures 1→2→3）；轮 4 pre-turn 熔断短路
    // （>= MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES=3 不真压缩）→ 共 3 次调用非 4 次。
    // 未回灌（C-1 修复前）时 loop 每轮都试 → compactCalls 会是 4。
    expect(compactCalls).toBe(3)
    expect(r.tracking.consecutiveFailures).toBe(3) // 熔断轮保持 3（不回增）
    expect(r.turns).toBe(4)
    expect(r.terminated).toBe(false) // maxTurns 截断
  })

  test('C-1 重入：初始 tracking 已带 consecutiveFailures=3 → 首轮即短路，不重建序列', async () => {
    const { provider } = scriptedProvider([textStep('hi')])
    let compactCalls = 0
    const r = await queryAgentLoop(
      { modelProvider: provider, role: 'small' as ModelRole },
      {
        messages: [{ role: 'user', content: 'seed' }],
        tools: [],
        context: { autoCompact: doomedAutoCompact(() => compactCalls++) },
        tracking: {
          compacted: true,
          turnCounter: 2,
          turnId: 'x',
          consecutiveFailures: 3,
        },
      },
    )
    expect(compactCalls).toBe(0) // 短路，零 doomed 调用
    expect(r.tracking.consecutiveFailures).toBe(3) // 计数原样保留（回灌同值）
    expect(r.tracking.turnCounter).toBe(2)
    expect(r.messages[0].type).not.toBe('system') // 未重建（无边界 marker）
    expect(r.turns).toBe(1)
  })

  test('M-1 继续轮末 turnCounter 自增：压缩成功后每续跑一轮 +1（仅 compacted 会话）', async () => {
    const { provider } = scriptedProvider([
      toolStep('t1', 'a'),
      toolStep('t2', 'b'),
      toolStep('t3', 'c'),
    ])
    // 状态化计数：首轮 170_000（超阈值 → 轮 1 pre-turn 压缩成功），之后 100_000（低于
    // 167_000 → 不再压缩），隔离 turnCounter 自增语义不被重复压缩重置干扰。
    let countCalls = 0
    const r = await queryAgentLoop(
      { modelProvider: provider, role: 'small' as ModelRole },
      {
        messages: [{ role: 'user', content: 'go' }],
        tools: [makeEchoTool()],
        context: {
          autoCompact: {
            contextWindow: 200_000,
            countTokens: () => (countCalls++ === 0 ? 170_000 : 100_000),
            compact: (msgs) =>
              compactConversation(msgs, {
                summarize: async () => '<analysis>x</analysis><summary>S</summary>',
              }),
          },
          maxTurns: 3,
        },
      },
    )
    // 轮 1 pre-turn 压缩成功（turnCounter 0）→ 轮 1/2/3 均为继续轮（tool 调用）→ 末 3
    expect(r.tracking.compacted).toBe(true)
    expect(r.tracking.turnCounter).toBe(3)
    expect(r.tracking.turnId).not.toBe('turn-0') // 压缩成功重置为新 UUID
    expect(r.messages[0].type).toBe('system') // 压缩边界重建
    expect(r.terminated).toBe(false)
  })

  test('M-1 非 compacted 会话 turnCounter 不自增（未压缩会话保持初值）', async () => {
    const { provider } = scriptedProvider([
      toolStep('t1', 'a'),
      toolStep('t2', 'b'),
      textStep('done'),
    ])
    const r = await queryAgentLoop(
      { modelProvider: provider, role: 'small' as ModelRole },
      {
        messages: [{ role: 'user', content: 'go' }],
        tools: [makeEchoTool()],
        context: {
          autoCompact: {
            contextWindow: 200_000,
            countTokens: () => 100_000, // 低于阈值 167_000 → 不压缩
            compact: async () => {
              throw new Error('compaction should not run')
            },
          },
        },
      },
    )
    expect(r.tracking.compacted).toBe(false)
    expect(r.tracking.turnCounter).toBe(0)
    expect(r.tracking.turnId).toBe('turn-0') // 初值原样
    expect(r.tracking.consecutiveFailures).toBeUndefined()
    expect(r.terminated).toBe(true)
  })
})

describe('engine/context autoCompact（触发判定 + 熔断）', () => {
  // 阈值 = 200_000 − 摘要预留 20_000（未注入 maxOutputTokens 按满额）− 缓冲 13_000 = 167_000
  const base: AutoCompactDeps = {
    contextWindow: 200_000,
    countTokens: () => 170_000,
    compact: async () => {
      throw new Error('not exercised in should*')
    },
  }
  test('① 超阈值 → 触发', async () => {
    expect(await shouldAutoCompact([], base)).toBe(true)
  })
  test('② 低于阈值 → 不触发', async () => {
    expect(
      await shouldAutoCompact([], { ...base, countTokens: () => 100_000 }),
    ).toBe(false)
  })
  test('③ NaN guard：计数 NaN → 不触发（不误压缩）', async () => {
    expect(
      await shouldAutoCompact([], { ...base, countTokens: () => Number.NaN }),
    ).toBe(false)
  })
  test('④ 递归守卫：querySource=compact / session_memory → 不触发（压缩 fork 自身不递归）', async () => {
    expect(await shouldAutoCompact([], { ...base, querySource: 'compact' })).toBe(false)
    expect(await shouldAutoCompact([], { ...base, querySource: 'session_memory' })).toBe(false)
  })
  test('⑤ 未注入 countTokens → 不触发（fail-safe）', async () => {
    expect(
      await shouldAutoCompact([], { contextWindow: 20_000, compact: base.compact }),
    ).toBe(false)
  })
  test('⑥ enabled=false → 不触发', async () => {
    expect(await shouldAutoCompact([], { ...base, enabled: false })).toBe(false)
  })
  test('⑦ 阈值 = 有效窗口 − 13000（有效窗口 = contextWindow − 摘要预留 min(maxOut, 20k)）', () => {
    // 未注入 maxOutputTokens → 按满额 20k 预留（旧仓大输出模型 min(maxOut, 20k) 等价）
    expect(getAutoCompactThreshold(200_000)).toBe(167_000)
    // 满额注入 20k 与未注入等价
    expect(getAutoCompactThreshold(200_000, 20_000)).toBe(167_000)
    // 大输出模型（64k）仍按 20k 封顶预留（min 语义）
    expect(getAutoCompactThreshold(200_000, 64_000)).toBe(167_000)
    // 小输出模型（4096）按其真实 maxOut 预留 → 阈值更高（更晚触发，旧仓语义）
    expect(getAutoCompactThreshold(200_000, 4_096)).toBe(182_904)
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
  test('③ keepRecent>0 → messagesToKeep 保留尾 N 条（I-1 钉方向：slice(-N) 改 slice(0,N) 此测红）', async () => {
    const msgs: Message[] = Array.from({ length: 5 }, (_, i) => ({
      role: 'user',
      content: `m${i}`,
    }))
    const r = await compactConversation(msgs, { summarize, keepRecent: 2 })
    expect(r.messagesToKeep).toHaveLength(2)
    // 方向断言：留最近（m3/m4），非最旧（m0/m1）
    expect(r.messagesToKeep.map((m) => String(m.content))).toEqual(['m3', 'm4'])
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
      // D-2a S2：CompactionResult 富面必填字段（空 = 本测 3 段 ordering 语义不变）
      attachments: [],
      hookResults: [],
    }
    const ordered = buildPostCompactMessages(result as never)
    expect(ordered[0].type).toBe('system') // 边界
    expect(String(ordered[1].content)).toBe('summary') // 摘要
    expect(String(ordered[2].content)).toBe('kept') // 保留
    expect(ordered).toHaveLength(3)
  })

  test('⑥ getCompactPrompt 全文恢复（I-1 锁定）：preamble 置首 + 段体指令 + <example> + trailer 收尾', () => {
    const p = getCompactPrompt()
    // 各断言在旧简化版（仅 9 段名 + 一句结构提示）下均不成立 → 非 tautology
    expect(p.startsWith('CRITICAL: Respond with TEXT ONLY')).toBe(true) // NO_TOOLS preamble 置首
    expect(p).toContain('Chronologically analyze each message') // DETAILED_ANALYSIS_INSTRUCTION_BASE
    expect(p).toContain('Primary Request and Intent: Capture all') // 段体指令（非仅段名）
    expect(p).toContain('<example>') // 输出结构示例模板
    expect(p.endsWith('Tool calls will be rejected and you will fail the task.')) // NO_TOOLS trailer 收尾
    // customInstructions 插在结构后、trailer 前
    const pc = getCompactPrompt('FOCUS-ON-X')
    expect(pc).toContain('Additional Instructions:\nFOCUS-ON-X')
    expect(pc.indexOf('FOCUS-ON-X')).toBeLessThan(pc.indexOf('REMINDER:'))
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

  test('④ estimateMessageTokens：text 消息按 chars/4 + 4/3 padding 精确估值', () => {
    const msgs: Message[] = [
      {
        type: 'user',
        role: 'user',
        uuid: 'u',
        timestamp: OLD_TS,
        message: { role: 'user', content: [{ type: 'text', text: 'a'.repeat(100) }] },
      },
    ]
    // ceil(100/4)=25 → ceil(25*4/3)=34（旧仓 roughTokenCountEstimation + 4/3 padding 语义）
    expect(estimateMessageTokens(msgs)).toBe(34)
  })

  test('⑤ gap 超阈值但可压缩数 ≤ keepRecent → no-op（原引用 toBe 钉 no-op，零清空）', () => {
    const msgs = [
      assistantWithTools([{ id: 't1', name: 'FileRead' }]),
      userWithResults([{ id: 't1', content: 'x'.repeat(400) }]),
    ]
    // 1 个可压缩结果 < keepRecent 5 → 全保留 → 无 clear
    const out = microcompactMessages(msgs, {
      config: { enabled: true, gapThresholdMinutes: 60, keepRecent: 5 },
      compactableTools: compactable,
      now: NOW,
    })
    expect(out.clearedToolIds).toHaveLength(0)
    expect(out.tokensSaved).toBe(0)
    expect(out.messages).toBe(msgs) // 原引用（no-op 不克隆）
  })

  test('⑥ 入参不可变：clear 后原 messages 的 tool_result 未被 in-place 变异', () => {
    const original = [
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
    microcompactMessages(original, {
      config: { enabled: true, gapThresholdMinutes: 60, keepRecent: 1 },
      compactableTools: compactable,
      now: NOW,
    })
    // 原对象未被变异（实现走 map/克隆；未来 in-place 变异会污染 loop 等共享消费方 → 此测红）
    const results = (original[1].message.content as Array<{ content?: string; tool_use_id: string }>)
    expect(results.find((b) => b.tool_use_id === 't1')?.content).toBe('A'.repeat(400))
    expect(results.find((b) => b.tool_use_id === 't3')?.content).toBe('C'.repeat(400))
  })
})
