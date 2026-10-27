/**
 * 0.1.81 V3-2 K2 MCP 面 — #12 判别单测：每回合 400（API 拒某工具 input
 * schema）→ 后续回合剥该工具参数（工单 `docs/2026-10-25-p0-wave-0181-ticket.md`
 * item 12）。
 *
 * 工单缺口：网关拒某工具 input schema 时每回合 400，无降级面 → 会话永久
 * 卡死在该 400（turnRecovery 400 fail-fast 穿透，用户只能弃会话）。补 =
 * schema 被拒工具后续回合剥参数（不进 chat tools 槽），会话继续。
 *
 * 落码面：
 *  - 谓词 `parseToolSchemaRejectionError(err)`（modelprovider/modelErrors.ts，
 *    400 谓词族同文件）：APIError 400 + "Invalid schema for tool/function
 *    <name>" 文案 → 工具名；其余 → null（保守：只认显式点名的 schema 拒绝，
 *    tools.N.input_schema 类无名字面不猜索引）。
 *  - `shouldRetryModelError` 收窄：schema 拒绝型 400 判不可重试（重试永不
 *    成功 = 纯空耗；既有 isRetryableError 的泛 400 可重试面不变——同工具同
 *    schema 重试必然同败，剥工具才是有效恢复）。
 *  - queryAgentLoop 回合 catch 支：解析命中 + 工具在当前 tools + 未剥过 →
 *    剥除后重跑本回合（不占新轮次，每工具一次性防死循环）；未命中/工具不在
 *    池内 = 原穿透语义零变更（400 fail-fast 恒等锚）。
 *
 * 判别（修前红 → 修后绿）：
 *  谓词导出缺席红 / shouldRetryModelError 收窄红（修前泛 400 可重试含 schema 型）
 *  / loop 剥参数后恢复红（修前 400 穿透 throw）/ 泛 400 可重试 + 穿透恒等。
 */
import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { queryAgentLoop } from '../../src/engine'
import type { AgentLoopDeps } from '../../src/engine'
import { APIError, shouldRetryModelError, type ModelProvider, type ModelRole } from '../../src/modelprovider'
import type { Message, Tool } from '../../src/shared'

const ERRORS_SPEC = '../../src/modelprovider/modelErrors.js'

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

function mkTool(name: string): Tool {
  return { name, inputSchema: { type: 'object', properties: {} } } as unknown as Tool
}

describe('K2 #12：400 工具 schema 拒绝谓词 parseToolSchemaRejectionError', () => {
  test('显式点名 schema 拒绝 → 工具名（tool/function 两措辞）', async () => {
    const { parseToolSchemaRejectionError } = (await import(ERRORS_SPEC)) as {
      parseToolSchemaRejectionError?: (err: unknown) => string | null
    }
    expect(
      parseToolSchemaRejectionError,
      'parseToolSchemaRejectionError 导出缺席（修前红）',
    ).toBeTypeOf('function')

    expect(
      parseToolSchemaRejectionError!(
        new APIError("Invalid schema for tool 'mcp__srv__tool': extra properties not allowed", 400),
      ),
    ).toBe('mcp__srv__tool')
    expect(
      parseToolSchemaRejectionError!(
        new APIError('Invalid schema for function `bad_func`: nested property missing', 400),
      ),
    ).toBe('bad_func')
  })

  test('非匹配面 → null（其他 400 / 非 400 同文案 / 非 APIError）', async () => {
    const { parseToolSchemaRejectionError } = (await import(ERRORS_SPEC)) as {
      parseToolSchemaRejectionError: (err: unknown) => string | null
    }
    expect(
      parseToolSchemaRejectionError(new APIError('some other bad request', 400)),
    ).toBeNull()
    // 非 400 同文案不剥（500 = 服务端故障，剥工具不解决）
    expect(
      parseToolSchemaRejectionError(
        new APIError("Invalid schema for tool 'X': boom", 500),
      ),
    ).toBeNull()
    expect(parseToolSchemaRejectionError(new Error('Invalid schema for tool X'))).toBeNull()
    expect(parseToolSchemaRejectionError(null)).toBeNull()
  })
})

describe('K2 #12：shouldRetryModelError 收窄（schema 拒绝型 400 不可重试）', () => {
  test('schema 拒绝型 400 → 不可重试（修前红：泛 400 可重试）', () => {
    expect(
      shouldRetryModelError(
        new APIError("Invalid schema for tool 'BadTool': extra properties not allowed", 400),
      ),
    ).toBe(false)
  })

  test('泛 400 可重试恒等锚（既有 isRetryableError 面零回归）', () => {
    expect(shouldRetryModelError(new APIError('some other bad request', 400))).toBe(true)
  })
})

describe('K2 #12：queryAgentLoop 400 剥工具参数后续回合恢复', () => {
  // 泛 400 仍走 withTurnRecovery 有界重试（缺省 13 次 × 退避 ≈10s）——测试面
  // 调小恢复预算到单发（env 官方测试面，生产可同调快速失败），保时序确定。
  let _savedMax: string | undefined
  beforeAll(() => {
    _savedMax = process.env.ATLAS_TURN_RECOVER_MAX
    process.env.ATLAS_TURN_RECOVER_MAX = '0'
  })
  afterAll(() => {
    if (_savedMax === undefined) delete process.env.ATLAS_TURN_RECOVER_MAX
    else process.env.ATLAS_TURN_RECOVER_MAX = _savedMax
  })

  /** fake provider：call 1 见 BadTool 在 tools → 抛 400 schema 拒绝；call 2 起回文本。记录每次 chat 的 tools 名单。 */
  function makeProvider(): {
    provider: ModelProvider
    seenTools: () => string[][]
    calls: () => number
  } {
    let n = 0
    const seen: string[][] = []
    const provider: ModelProvider = {
      chat: async (args: { tools?: { name: string }[] }) => {
        n++
        const names = (args.tools ?? []).map(t => t.name)
        seen.push(names)
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
            content: [{ type: 'text', text: 'done' }],
            stop_reason: 'end_turn',
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
    return { provider, seenTools: () => seen, calls: () => n }
  }

  test('400 剥 BadTool 后本回合重跑恢复：call 2 tools 不含 BadTool、会话完成（修前红：穿透 throw）', async () => {
    const { provider, seenTools, calls } = makeProvider()
    const deps: AgentLoopDeps = { modelProvider: provider, role: 'small' as ModelRole }
    const r = await queryAgentLoop(deps, {
      messages: [{ role: 'user', content: 'go' }] as Message[],
      tools: [mkTool('BadTool'), mkTool('GoodTool')],
    })
    expect(r.terminated).toBe(true)
    expect(calls()).toBe(2)
    expect(seenTools()[0]).toEqual(['BadTool', 'GoodTool'])
    expect(seenTools()[1]).toEqual(['GoodTool']) // BadTool 已剥
  })

  test('非匹配 400 仍穿透（fail-fast 恒等零回归）', async () => {
    const provider: ModelProvider = {
      chat: async () => {
        throw new APIError('some other bad request', 400)
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
    await expect(
      queryAgentLoop(deps, {
        messages: [{ role: 'user', content: 'go' }] as Message[],
        tools: [mkTool('GoodTool')],
      }),
    ).rejects.toThrow('some other bad request')
  })
})
