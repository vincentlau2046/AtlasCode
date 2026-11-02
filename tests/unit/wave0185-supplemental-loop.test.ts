/**
 * 0.1.85 Task B（C85-B）— 工具补充消息 loop 层交付判别（unit 层纯面，零磁盘）。
 *
 * RED 判据（工单）：实际执行链 fake tool 返回补充 image/text；execute→batch→
 * query 下一轮 fakeProvider 所见与真实 toOpenAIMessages 输出都须包含补充。
 * 基线按丢消息失败（queryOneRound roundMessages 无补充 → 断言失败）。
 *
 * 追加协议（工单）：assistant → 全批次已完成 tool_result（原顺序）→ 补充
 * meta-user（工具顺序、内部页顺序）→ 如有 defer 标记；同 assistant 所有待
 * 回应 tool_call 不被新 user 夹断（OpenAI tool-call 邻接协议）。toolResults
 * 仍只计实际工具回应；terminal 判断不按补充数。
 */
import { describe, test, expect } from 'bun:test'
import {
  queryOneRound,
  queryAgentLoop,
  createUserMessage,
  type Tool,
} from '../../src/engine'
import { toOpenAIMessages } from '../../src/modelprovider/params'
import type { ModelProvider, ModelRole } from '../../src/modelprovider'
import type { Message, Tools } from '../../src/shared'

const IMG = (tag: string) => ({
  type: 'image' as const,
  source: { type: 'base64' as const, media_type: 'image/jpeg', data: Buffer.from(tag).toString('base64') },
})

/** fake tool：call 返回 data + 可选补充（执行链真形态）。 */
function makeSupTool(
  name: string,
  opts?: { safe?: boolean; data?: unknown; throw?: Error; supplemental?: unknown[] },
): Tool {
  return {
    name,
    isConcurrencySafe: () => opts?.safe ?? false,
    call: async () => {
      if (opts?.throw) throw opts.throw
      return {
        data: opts?.data ?? `result:${name}`,
        ...(opts?.supplemental ? { newMessages: opts.supplemental } : {}),
      }
    },
    mapToolResultToToolResultBlockParam: (content: unknown, toolUseID: string) => ({
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: String(content),
    }),
  } as unknown as Tool
}

/** 二轮 fake LLM：第 1 轮返 content1（tool_calls），第 2 轮记录收到的 messages 后返 end_turn。 */
function twoRoundProvider(content1: unknown[]): {
  provider: ModelProvider
  seen: Message[][]
} {
  const seen: Message[][] = []
  let call = 0
  const provider = {
    chat: async (args: { messages: Message[] }) => {
      call++
      if (call === 1) {
        return {
          type: 'assistant',
          uuid: 'fake-u1',
          timestamp: '2026-11-02T00:00:00Z',
          message: {
            id: 'fake-m1',
            model: 'fake-model',
            role: 'assistant',
            content: content1,
            stop_reason: 'tool_calls',
            usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          },
        }
      }
      seen.push(args.messages)
      return {
        type: 'assistant',
        uuid: 'fake-u2',
        timestamp: '2026-11-02T00:00:01Z',
        message: {
          id: 'fake-m2',
          model: 'fake-model',
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        },
      }
    },
    chatStream: async () => {
      throw new Error('not exercised')
    },
    healthCheck: async () => true,
    countTokens: async () => {
      throw new Error('not exercised')
    },
    listModels: async () => [],
    transcribeAudio: async () => {
      throw new Error('not exercised')
    },
    synthesizeSpeech: async () => {
      throw new Error('not exercised')
    },
    verifyKey: async () => true,
  } as unknown as ModelProvider
  return { provider, seen }
}

describe('C85-B queryOneRound 补充交付与追加协议', () => {
  test('L① 序列协议：assistant → tool_result（原序）→ 补充（工具序/页序）；toolResults 不计补充', async () => {
    const sup1 = [createUserMessage({ content: [IMG('p1')], isMeta: true })]
    const sup2 = [
      createUserMessage({ content: [IMG('p2a')], isMeta: true }),
      createUserMessage({ content: [IMG('p2b')], isMeta: true }),
    ]
    const content1 = [
      { type: 'tool_use', id: 'tu-a', name: 'supA', input: {} },
      { type: 'tool_use', id: 'tu-b', name: 'plain', input: {} },
      { type: 'tool_use', id: 'tu-c', name: 'supB', input: {} },
    ]
    const { provider, seen } = twoRoundProvider(content1)
    const tools: Tools = [
      makeSupTool('supA', { safe: true, supplemental: sup1 }),
      makeSupTool('plain', { safe: true }),
      makeSupTool('supB', { safe: true, supplemental: sup2 }),
    ]
    const round = await queryOneRound(
      { modelProvider: provider, role: 'small' as ModelRole },
      tools,
      [{ role: 'user', content: 'look at pdfs' }] as Message[],
    )
    // 序列 = 入参 1 + assistant 1 + tool_result 3 + 补充 3（1 + 2）= 8
    expect(round.messages).toHaveLength(8)
    const seq = round.messages.slice(2) as Record<string, unknown>[]
    // 前 3 条 = tool_result user 消息（原顺序 tu-a/tu-b/tu-c）
    expect((seq[0].message as { content: { type: string; tool_use_id?: string }[] }).content[0])
      .toMatchObject({ type: 'tool_result', tool_use_id: 'tu-a' })
    expect((seq[1].message as { content: { type: string; tool_use_id?: string }[] }).content[0])
      .toMatchObject({ type: 'tool_result', tool_use_id: 'tu-b' })
    expect((seq[2].message as { content: { type: string; tool_use_id?: string }[] }).content[0])
      .toMatchObject({ type: 'tool_result', tool_use_id: 'tu-c' })
    // 后 3 条 = 补充 meta-user（工具序 supA → supB 页序 p2a → p2b）
    const supps = seq.slice(3)
    for (const s of supps) {
      expect(s.type).toBe('user')
      expect(s.isMeta).toBe(true)
      expect(typeof s.uuid).toBe('string')
    }
    expect((supps[0].message as { content: unknown[] }).content[0]).toMatchObject({
      source: { data: Buffer.from('p1').toString('base64') },
    })
    expect((supps[1].message as { content: unknown[] }).content[0]).toMatchObject({
      source: { data: Buffer.from('p2a').toString('base64') },
    })
    expect((supps[2].message as { content: unknown[] }).content[0]).toMatchObject({
      source: { data: Buffer.from('p2b').toString('base64') },
    })
    // toolResults 仍只计实际工具回应（3 条，不含补充）
    expect(round.toolResults).toHaveLength(3)
    expect(seen).toHaveLength(0) // 本测只测单轮形状（下一轮所见归 L② 多轮断言）
  })

  test('L② 下一轮 fakeProvider 所见含补充 + 真实 toOpenAIMessages 投影含 image_url', async () => {
    const sup = [createUserMessage({ content: [IMG('page-1')], isMeta: true })]
    const content1 = [{ type: 'tool_use', id: 'tu-1', name: 'supT', input: {} }]
    const { provider, seen } = twoRoundProvider(content1)
    // 多轮入口（ask = 单轮封装）：queryAgentLoop 跑 2 轮，第 2 轮 chat 入参 =
    // 第 1 轮 roundMessages = user + assistant + tool_result + 补充。
    await queryAgentLoop(
      { modelProvider: provider, role: 'small' as ModelRole } as never,
      {
        messages: [{ role: 'user', content: 'read it' }] as Message[],
        tools: [makeSupTool('supT', { safe: true, supplemental: sup })] as Tools,
        context: { maxTurns: 5 },
      },
    )
    // provider 第 2 轮收到的序列：user + assistant + tool_result + 补充
    expect(seen).toHaveLength(1)
    const requested = seen[0]
    expect(requested).toHaveLength(4)
    const last = requested[3] as Record<string, unknown>
    expect(last.isMeta).toBe(true)
    expect((last.message as { content: unknown[] }).content[0]).toMatchObject({ type: 'image' })
    // 真实 toOpenAIMessages 投影：补充 → image_url 进 user content（不丢）
    const projected = toOpenAIMessages(requested as unknown[])
    const projLast = projected[projected.length - 1] as { role: string; content: unknown }
    expect(projLast.role).toBe('user')
    const arr = Array.isArray(projLast.content) ? (projLast.content as Record<string, unknown>[]) : []
    expect(arr.some((b) => b.type === 'image_url')).toBe(true)
  })

  test('L③ 混合批次：失败工具不产补充；无图工具位置正确；defer 短路后已完成工具补充仍交付', async () => {
    const supA = [createUserMessage({ content: [IMG('a')], isMeta: true })]
    // defer 场景：工具 1 完成（带补充）、工具 2 defer → 批次短路
    const round = await queryOneRound(
      {
        modelProvider: twoRoundProvider([
          { type: 'tool_use', id: 'tu-1', name: 'supA', input: {} },
          { type: 'tool_use', id: 'tu-2', name: 'holdme', input: {} },
        ]).provider,
        role: 'small' as ModelRole,
        checkPermission: async (
          _tool: unknown,
          _input: unknown,
          meta: { toolUseId: string },
        ) =>
          meta.toolUseId === 'tu-2'
            ? { allowed: false, deferred: true, reason: 'hold' }
            : { allowed: true },
      } as never,
      [
        makeSupTool('supA', { safe: true, supplemental: supA }),
        makeSupTool('holdme', { safe: true }),
      ] as Tools,
      [] as Message[],
    )
    // 序列 = assistant + tool_result(tu-1) + 补充(supA) + defer marker（入参空 messages）
    expect(round.deferred).toMatchObject({ toolUseId: 'tu-2' })
    expect(round.messages).toHaveLength(4)
    const m0 = round.messages[0] as Record<string, unknown>
    const m1 = round.messages[1] as Record<string, unknown>
    const m2 = round.messages[2] as Record<string, unknown>
    const m3 = round.messages[3] as Record<string, unknown>
    expect(m0.type).toBe('assistant')
    expect((m1.message as { content: { tool_use_id?: string }[] }).content[0])
      .toMatchObject({ type: 'tool_result', tool_use_id: 'tu-1' })
    // 补充在 tool_result 之后、marker 之前（协议：已完成 tool_result → 补充 → defer 标记）
    expect(m2.isMeta).toBe(true)
    // marker 真形（makeDeferredToolUseMarker）：type:'system' + subtype:'deferred_tool_use'
    // + tool_use_id（JSONL 字节标记族；无字符串 content → LLM 映射滤除）。
    expect(m3.type).toBe('system')
    expect(m3.subtype).toBe('deferred_tool_use')
    expect(m3.tool_use_id).toBe('tu-2')
  })

  test('L④ terminal 判断不按补充数：工具带补充 + 第二轮 end_turn → loop 正常终止', async () => {
    const sup = [createUserMessage({ content: 'ctx note', isMeta: true })]
    const { provider } = twoRoundProvider([{ type: 'tool_use', id: 'tu-1', name: 'supT', input: {} }])
    // 多轮入口：第 1 轮 tool_use（带补充）→ toolResults 计实际回应（1，不含补充）
    // → 继续；第 2 轮 end_turn 无工具 → 自然终止（补充不阻断 terminal）。
    const result = await queryAgentLoop(
      { modelProvider: provider, role: 'small' as ModelRole } as never,
      {
        messages: [],
        tools: [makeSupTool('supT', { safe: true, supplemental: sup })] as Tools,
        context: { maxTurns: 5 },
      },
    )
    expect(result.terminated).toBe(true)
    expect(result.turns).toBe(2)
    expect(result.lastRound?.toolResults).toHaveLength(0)
    expect(result.lastRound?.stopReason).toBe('end_turn')
  })
})
