/**
 * engine/query 单轮 agent loop 契约测试（§8.21 E-1 窄 spine T-1/T-4）。
 *
 * 被测能力 = loop 的 find-by-name / Tool.call / mapResult / tool_result 追加行为
 * （port 之下全真：LLM 经 modelprovider 门面、工具经 shared Tool.call 契约）。
 * fake 仅 LLM（ModelProvider 接口测试替身，返固定 completion）+ fake echo tool
 * —— 非 tautology：断言的是 loop 的调度/解析/追加，非 fake 自证。
 * I/O-free（无盘 / 无网络 / 无 PTY）→ unit 层。
 */
import { describe, test, expect } from 'bun:test'
import { ask, queryOneRound } from '../../src/engine'
import type { ModelProvider, ModelRole } from '../../src/modelprovider'
import type { Message, Tool, Tools } from '../../src/shared'

/** fake LLM：固定返 content（ModelProvider 接口替身，非 mock openai transport）。 */
function fakeProvider(content: unknown[], stopReason = 'end_turn'): ModelProvider {
  const notExercised = async () => {
    throw new Error('fake ModelProvider: 方法未被 engine loop 单轮消费')
  }
  return {
    chat: async () => ({
      type: 'assistant',
      uuid: 'fake-uuid',
      timestamp: '2026-09-23T00:00:00Z',
      message: {
        id: 'fake-msg',
        model: 'fake-model',
        role: 'assistant',
        content,
        stop_reason: stopReason,
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }),
    chatStream: notExercised as unknown as ModelProvider['chatStream'],
    healthCheck: notExercised as unknown as ModelProvider['healthCheck'],
    countTokens: notExercised as unknown as ModelProvider['countTokens'],
    listModels: async () => [],
    transcribeAudio: notExercised as unknown as ModelProvider['transcribeAudio'],
    synthesizeSpeech: notExercised as unknown as ModelProvider['synthesizeSpeech'],
    verifyKey: async () => true,
  }
}

/** fake echo tool：真实 Tool.call 语义（回显 input.msg），loop 只消费 name/call/mapResult。 */
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

const ECHO_CONTENT = [
  { type: 'text', text: 'let me echo' },
  { type: 'tool_use', id: 'tu-1', name: 'echo', input: { msg: 'hi' } },
]

describe('engine/query 单轮 agent loop（LLM→tool→result）', () => {
  test('① 有 tool_use：真调 echo tool + tool_result 追加到消息尾', async () => {
    const tools: Tools = [makeEchoTool()]
    const r = await ask(fakeProvider(ECHO_CONTENT, 'tool_calls'), {
      messages: [{ role: 'user', content: 'hello' }],
      tools,
      role: 'small' as ModelRole,
    })
    // tool 真被调用（call 回显 input.msg），非 tautology
    expect(r.toolResults).toHaveLength(1)
    expect(r.toolResults[0].name).toBe('echo')
    expect(r.toolResults[0].block.content).toBe('echo:hi')
    expect(r.toolResults[0].block.tool_use_id).toBe('tu-1')
    // 消息序列 = 入参 1 + assistant 1 + tool_result 1
    expect(r.messages).toHaveLength(3)
    expect(r.stopReason).toBe('tool_calls')
    // 末条 = tool_result user 消息
    const last = r.messages[r.messages.length - 1] as { role: string; message: { content: unknown[] } }
    expect(last.role).toBe('user')
    expect((last.message.content[0] as { type: string }).type).toBe('tool_result')
  })

  test('② 未知 tool：is_error tool_result 兜底（不静默丢弃，LLM 仍收到回应）', async () => {
    const ghostContent = [{ type: 'tool_use', id: 'tu-x', name: 'ghost', input: {} }]
    const r = await ask(fakeProvider(ghostContent, 'tool_calls'), {
      messages: [],
      tools: [makeEchoTool()], // echo 在册，但 LLM 调的是 ghost
      role: 'small' as ModelRole,
    })
    expect(r.toolResults).toHaveLength(1)
    expect(r.toolResults[0].block.is_error).toBe(true)
    expect(String(r.toolResults[0].block.content)).toContain('unknown tool: ghost')
  })

  test('③ 纯文本（无 tool_use）：toolResults 空，消息 = 入参 + assistant', async () => {
    const r = await ask(fakeProvider([{ type: 'text', text: 'done' }]), {
      messages: [{ role: 'user', content: 'q' }],
      tools: [makeEchoTool()],
      role: 'small' as ModelRole,
    })
    expect(r.toolResults).toHaveLength(0)
    expect(r.messages).toHaveLength(2)
    expect(r.stopReason).toBe('end_turn')
  })

  test('④ queryOneRound 直接调用（deps 形态）与 ask 等价', async () => {
    const deps = { modelProvider: fakeProvider(ECHO_CONTENT, 'tool_calls'), role: 'small' as ModelRole }
    const r = await queryOneRound(deps, [makeEchoTool()], [] as Message[])
    expect(r.toolResults[0].block.content).toBe('echo:hi')
    expect(r.assistantContent).toEqual(ECHO_CONTENT)
  })
})
