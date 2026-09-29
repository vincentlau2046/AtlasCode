/**
 * W3-3d（§8.74.20）：工具 schema 注入面判别单测（H6 防空洞）。
 *
 * 背景：fixture replay 纪律（脚本化 provider 直接发 tool_use 块）使 engine
 * 活链从未向真 LLM 送过工具 schema——queryOneRound 缺 tools 透传（活探针
 * G-α 揭出：模型自述「没有 echo 工具可用」）。本面 = queryOneRound →
 * modelProvider.chat tools 槽 → buildOpenAIParams/buildOpenAITools →
 * OpenAI function schema。
 *
 * 判别点（非 tautology）：
 *   T-1 引擎面：queryOneRound 把入参 tools 原样透传进 chat args
 *       （假 provider 捕获，非接口声明假绿）
 *   T-2 空集缺省：tools = [] → params.tools 键不出现（零行为面）
 *   T-3 转换面：buildOpenAITools shared Tool[] → OpenAI function schema
 *       （name / 异步 description 真执行 / inputJSONSchema 优先 /
 *       缺 schema 回落 {type:'object',properties:{}} / description 抛错
 *       回落 name）
 * 零模型 / 零网络 / 零盘（I/O-free，unit 层）。
 */
import { describe, expect, test } from 'bun:test'
import { queryOneRound, type AgentLoopDeps } from '../../src/engine'
import { buildOpenAIParams } from '../../src/modelprovider'
import type { Tool } from '../../src/shared'

function makeFakeTool(over: Partial<Tool> = {}): Tool {
  return {
    name: 'echo',
    inputSchema: {
      type: 'object',
      properties: { msg: { type: 'string' } },
      required: ['msg'],
    },
    maxResultSizeChars: 10000,
    description: async () => 'echo probe tool',
    isConcurrencySafe: () => true,
    isEnabled: () => true,
    isReadOnly: () => true,
    call: async () => ({ data: '' }),
    ...over,
  } as unknown as Tool
}

function fakeProviderCapture(): {
  provider: AgentLoopDeps['modelProvider']
  captured: Array<Record<string, unknown>>
} {
  const captured: Array<Record<string, unknown>> = []
  const provider = {
    chat: async (args: Record<string, unknown>) => {
      captured.push(args)
      return {
        type: 'assistant',
        uuid: 'u-1',
        timestamp: new Date().toISOString(),
        message: {
          id: 'm-1',
          model: 'fake',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      }
    },
  } as unknown as AgentLoopDeps['modelProvider']
  return { provider, captured }
}

describe('W3-3d 工具 schema 注入面（§8.74.20）', () => {
  test('T-1 queryOneRound 把入参 tools 原样透传进 modelProvider.chat', async () => {
    const { provider, captured } = fakeProviderCapture()
    const tools = [makeFakeTool()]
    await queryOneRound(
      { modelProvider: provider, role: 'premium' },
      tools,
      [{ type: 'user', role: 'user', content: 'hi' } as never],
    )
    expect(captured).toHaveLength(1)
    expect(captured[0].tools).toBe(tools) // 同一引用 = 原样透传（非拷贝/非丢失）
  })

  test('T-2 空 tools 集 = chat args 无 tools 键值（窄 spine 缺省面）', async () => {
    const { provider, captured } = fakeProviderCapture()
    await queryOneRound(
      { modelProvider: provider, role: 'premium' },
      [],
      [{ type: 'user', role: 'user', content: 'hi' } as never],
    )
    expect(captured[0].tools).toBeUndefined()
  })

  test('T-3 buildOpenAIParams 转换面：shared Tool[] → OpenAI function schema', async () => {
    const withJson = makeFakeTool({
      inputJSONSchema: { type: 'object', properties: { a: { type: 'number' } } },
    })
    const noSchema = makeFakeTool({
      name: 'no-schema',
      inputSchema: undefined,
      description: async () => 'no schema tool',
    })
    const params = await buildOpenAIParams(
      {
        messages: [{ type: 'user', role: 'user', content: 'hi' } as never],
        systemPrompt: [] as never,
        options: {},
        tools: [withJson, noSchema],
      },
      'premium',
    )
    expect(params.tools).toHaveLength(2)
    // inputJSONSchema 优先面（非 inputSchema 的 zod 转换支）
    expect(params.tools[0]).toEqual({
      type: 'function',
      function: {
        name: 'echo',
        description: 'echo probe tool',
        parameters: { type: 'object', properties: { a: { type: 'number' } } },
      },
    })
    // 缺 schema 回落面
    expect(params.tools[1].function.parameters).toEqual({
      type: 'object',
      properties: {},
    })
  })

  test('T-3b description 抛错回落 name（不沉全果）', async () => {
    const throwing = makeFakeTool({
      name: 'throwy',
      description: async () => {
        throw new Error('desc 炸了')
      },
    })
    const params = await buildOpenAIParams(
      {
        messages: [],
        systemPrompt: [] as never,
        options: {},
        tools: [throwing],
      },
      'premium',
    )
    expect(params.tools[0].function.description).toBe('throwy')
  })

  test('T-3c 空 tools = params.tools 键不出现（params 层零行为面）', async () => {
    const params = await buildOpenAIParams(
      { messages: [], systemPrompt: [] as never, options: {} },
      'premium',
    )
    expect(params.tools).toBeUndefined()
  })
})
