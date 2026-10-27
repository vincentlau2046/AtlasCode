/**
 * 0.1.81 V3-2 K2 MCP 面 — #13 判别单测：压缩后/loop 中段迟连 server 的
 * 工具/指令即时注入（工单 `docs/2026-10-25-p0-wave-0181-ticket.md` item 13）。
 *
 * 工单缺口：loop 入口捕获 args.tools 数组引用（assembleToolPool 每次产新
 * 数组）+ system prompt 静态 → 压缩后才连完（或任意 loop 中段连完）的 MCP
 * server 工具与指令滞留下一条 user message 才进上下文。
 * 核验结论（落码裁定登记）：压缩时刻已连 server 无缺口——三触发面（手动
 * /compact、pre-turn auto-compact、reactive 413）同构走富路径
 * composePostCompactAttachments，deferredTools/agentListing/mcpInstructions
 * 三 delta 重宣告（0.1.68 F-1 已落）；残余缝 = 中段迟连 → 补
 * AgentLoopDeps.refreshRoundContext 回合前刷新缝（宿主每回合注入新工具池 +
 * delta 附件消息；fail-safe；刷新后重套 #12 degradedTools 剥除面）。
 *
 * 判别（修前红 → 修后绿）：
 *  - slot 缺席 = 零行为恒等锚（修前即绿）
 *  - per-round 刷新：round 2 见刷新工具池 + 注入附件消息（修前红：slot 缺席）
 *  - 刷新重套 #12 剥除面：已剥工具不因刷新回池（修前红）
 *  - fail-safe：刷新异常 → logForDebugging + 以当前态继续（修前红：断言
 *    刷新确被调用且 loop 存活——修前 slot 缺席调用数 0 即红）
 */
import { describe, expect, test } from 'bun:test'
import { queryAgentLoop } from '../../src/engine'
import type { AgentLoopDeps } from '../../src/engine'
import { APIError, type ModelProvider, type ModelRole } from '../../src/modelprovider'
import type { Message, Tool } from '../../src/shared'

const NOT_EXERCISED = async () => {
  throw new Error('fake ModelProvider: 方法未被 loop 消费')
}

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}
const USAGE: Usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

/** fake echo tool：真 Tool.call 语义（engine-query-loop.test.ts 同款）。 */
function makeEchoTool(): Tool {
  return {
    name: 'echo',
    call: async (args: unknown) => ({ data: `echo:${(args as { msg?: string })?.msg}` }),
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
  } as unknown as Tool
}

function mkTool(name: string): Tool {
  return { name, inputSchema: { type: 'object', properties: {} } } as unknown as Tool
}

const ECHO_TOOL_USE = [
  { type: 'text', text: 'let me echo' },
  { type: 'tool_use', id: 'tu-1', name: 'echo', input: { msg: 'hi' } },
]
const DONE_TEXT = [{ type: 'text', text: 'done' }]

/** 附件消息 marker（宿主注入面替身：mcp_instructions_delta 等的极简形）。 */
function markerMsg(): Message {
  return { role: 'user', content: 'mcp-delta-marker' } as Message
}

describe('K2 #13：refreshRoundContext 回合前上下文刷新缝', () => {
  test('slot 缺席 = 零行为恒等锚：tools 恒定 + 无注入（修前即绿）', async () => {
    const seenTools: string[][] = []
    const seenMarkers: number[] = []
    let n = 0
    const provider: ModelProvider = {
      chat: async (args: { tools?: { name: string }[]; messages: Message[] }) => {
        n++
        seenTools.push((args.tools ?? []).map(t => t.name))
        seenMarkers.push(
          args.messages.filter(m => (m as { content?: unknown }).content === 'mcp-delta-marker').length,
        )
        return {
          type: 'assistant',
          uuid: `fake-${n}`,
          timestamp: '2026-10-27T00:00:00Z',
          message: {
            id: `m-${n}`,
            model: 'fake-model',
            role: 'assistant',
            content: n === 1 ? ECHO_TOOL_USE : DONE_TEXT,
            stop_reason: n === 1 ? 'tool_calls' : 'end_turn',
            usage: USAGE,
          },
        }
      },
      chatStream: NOT_EXERCISED as unknown as ModelProvider['chatStream'],
      healthCheck: NOT_EXERCISED as unknown as ModelProvider['healthCheck'],
      countTokens: NOT_EXERCISED as unknown as ModelProvider['countTokens'],
      listModels: async () => [],
      transcribeAudio: NOT_EXERCISED as unknown as ModelProvider['transcribeAudio'],
      synthesizeSpeech: NOT_EXERCISED as unknown as ModelProvider['synthesizeSpeech'],
      verifyKey: async () => true,
    }
    const deps: AgentLoopDeps = { modelProvider: provider, role: 'small' as ModelRole }
    const r = await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'go' }] as Message[],
      tools: [makeEchoTool(), mkTool('OldTool')],
    })
    expect(r.terminated).toBe(true)
    expect(seenTools).toEqual([
      ['echo', 'OldTool'],
      ['echo', 'OldTool'],
    ])
    expect(seenMarkers).toEqual([0, 0])
  })

  test('per-round 刷新：round 2 见刷新工具池 + 注入附件消息（修前红：slot 缺席）', async () => {
    let refreshCalls = 0
    const seenTools: string[][] = []
    const seenMarkers: number[] = []
    let n = 0
    const provider: ModelProvider = {
      chat: async (args: { tools?: { name: string }[]; messages: Message[] }) => {
        n++
        seenTools.push((args.tools ?? []).map(t => t.name))
        seenMarkers.push(
          args.messages.filter(m => (m as { content?: unknown }).content === 'mcp-delta-marker').length,
        )
        return {
          type: 'assistant',
          uuid: `fake-${n}`,
          timestamp: '2026-10-27T00:00:00Z',
          message: {
            id: `m-${n}`,
            model: 'fake-model',
            role: 'assistant',
            content: n === 1 ? ECHO_TOOL_USE : DONE_TEXT,
            stop_reason: n === 1 ? 'tool_calls' : 'end_turn',
            usage: USAGE,
          },
        }
      },
      chatStream: NOT_EXERCISED as unknown as ModelProvider['chatStream'],
      healthCheck: NOT_EXERCISED as unknown as ModelProvider['healthCheck'],
      countTokens: NOT_EXERCISED as unknown as ModelProvider['countTokens'],
      listModels: async () => [],
      transcribeAudio: NOT_EXERCISED as unknown as ModelProvider['transcribeAudio'],
      synthesizeSpeech: NOT_EXERCISED as unknown as ModelProvider['synthesizeSpeech'],
      verifyKey: async () => true,
    }
    const deps: AgentLoopDeps = {
      modelProvider: provider,
      role: 'small' as ModelRole,
      refreshRoundContext: () => {
        refreshCalls++
        // 回合 1 无刷新；回合 2 = 迟连 server 工具入池 + 指令附件注入
        if (refreshCalls === 1) return null
        return {
          tools: [makeEchoTool(), mkTool('LateMcpTool')],
          appendedMessages: [markerMsg()],
        }
      },
    }
    const r = await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'go' }] as Message[],
      tools: [makeEchoTool(), mkTool('OldTool')],
    })
    expect(r.terminated).toBe(true)
    expect(refreshCalls).toBe(2)
    // round 1 = 修前池；round 2 = 刷新池（LateMcpTool 入、OldTool 出）
    expect(seenTools[0]).toEqual(['echo', 'OldTool'])
    expect(seenTools[1].sort()).toEqual(['LateMcpTool', 'echo'])
    // round 2 消息含注入附件；round 1 无
    expect(seenMarkers).toEqual([0, 1])
  })

  test('刷新重套 #12 剥除面：已剥工具不因刷新回池（修前红）', async () => {
    let refreshCalls = 0
    const seenTools: string[][] = []
    let n = 0
    const provider: ModelProvider = {
      chat: async (args: { tools?: { name: string }[] }) => {
        n++
        const names = (args.tools ?? []).map(t => t.name)
        seenTools.push(names)
        if (names.includes('BadTool')) {
          throw new APIError(
            "Invalid schema for tool 'BadTool': extra properties not allowed",
            400,
          )
        }
        return {
          type: 'assistant',
          uuid: `fake-${n}`,
          timestamp: '2026-10-27T00:00:00Z',
          message: {
            id: `m-${n}`,
            model: 'fake-model',
            role: 'assistant',
            content: n === 2 ? ECHO_TOOL_USE : DONE_TEXT,
            stop_reason: n === 2 ? 'tool_calls' : 'end_turn',
            usage: USAGE,
          },
        }
      },
      chatStream: NOT_EXERCISED as unknown as ModelProvider['chatStream'],
      healthCheck: NOT_EXERCISED as unknown as ModelProvider['healthCheck'],
      countTokens: NOT_EXERCISED as unknown as ModelProvider['countTokens'],
      listModels: async () => [],
      transcribeAudio: NOT_EXERCISED as unknown as ModelProvider['transcribeAudio'],
      synthesizeSpeech: NOT_EXERCISED as unknown as ModelProvider['synthesizeSpeech'],
      verifyKey: async () => true,
    }
    const deps: AgentLoopDeps = {
      modelProvider: provider,
      role: 'small' as ModelRole,
      refreshRoundContext: () => {
        refreshCalls++
        if (refreshCalls === 1) return null
        // 回合 2 宿主重装池把 BadTool 带回（活态重装配天然会带上被 400 拒的
        // 工具）——loop 须重套 degradedTools 剥除面，不让其回池再触发 400
        return { tools: [mkTool('BadTool'), makeEchoTool(), mkTool('LateMcpTool')] }
      },
    }
    const r = await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'go' }] as Message[],
      tools: [mkTool('BadTool'), makeEchoTool()],
    })
    expect(r.terminated).toBe(true)
    // call 1 见 BadTool 400 → 剥除重跑；call 2（同回合重试）无 BadTool；
    // call 3（回合 2）刷新带回 BadTool 但被重套剥除面剔除
    expect(seenTools.map(t => t.includes('BadTool'))).toEqual([true, false, false])
    expect(seenTools[2].sort()).toEqual(['LateMcpTool', 'echo'])
  })

  test('fail-safe：刷新异常 → 以当前态继续不穿透（修前红：断言刷新确被调用）', async () => {
    let refreshCalls = 0
    const seenTools: string[][] = []
    let n = 0
    const provider: ModelProvider = {
      chat: async (args: { tools?: { name: string }[] }) => {
        n++
        seenTools.push((args.tools ?? []).map(t => t.name))
        return {
          type: 'assistant',
          uuid: `fake-${n}`,
          timestamp: '2026-10-27T00:00:00Z',
          message: {
            id: `m-${n}`,
            model: 'fake-model',
            role: 'assistant',
            content: n === 1 ? ECHO_TOOL_USE : DONE_TEXT,
            stop_reason: n === 1 ? 'tool_calls' : 'end_turn',
            usage: USAGE,
          },
        }
      },
      chatStream: NOT_EXERCISED as unknown as ModelProvider['chatStream'],
      healthCheck: NOT_EXERCISED as unknown as ModelProvider['healthCheck'],
      countTokens: NOT_EXERCISED as unknown as ModelProvider['countTokens'],
      listModels: async () => [],
      transcribeAudio: NOT_EXERCISED as unknown as ModelProvider['transcribeAudio'],
      synthesizeSpeech: NOT_EXERCISED as unknown as ModelProvider['synthesizeSpeech'],
      verifyKey: async () => true,
    }
    const deps: AgentLoopDeps = {
      modelProvider: provider,
      role: 'small' as ModelRole,
      refreshRoundContext: () => {
        refreshCalls++
        if (refreshCalls >= 2) throw new Error('refresh exploded')
        return null
      },
    }
    const r = await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'go' }] as Message[],
      tools: [makeEchoTool()],
    })
    // 刷新被调用两次（修前 slot 缺席 = 0 红）且异常未穿透：loop 存活、
    // 工具保持当前态（异常回合无换池）
    expect(refreshCalls).toBe(2)
    expect(r.terminated).toBe(true)
    expect(seenTools).toEqual([['echo'], ['echo']])
  })
})
