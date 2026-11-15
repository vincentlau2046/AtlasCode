/**
 * W-RC1（0.1.112）：输出 token 聚合计数链根修判别格（切片 1 = 形 α engine
 * 权威链）。链图 docs/2026-11-14-wrc1-rootcause-chainmap.md b6c33846 + lock-face
 * 批复（f4 2026-11-15，工单 §8 @eee0f324）。
 *
 * 非 tautology：scripted LLM 按轮次返不同 usage，断言**链路行为**——round_end
 * 累计单调 / query() 入口重置单源 / usage 缺失恒等锚 / TUI 转写 / snapshot
 * 不重置（重置点单源）/ gate-off 档面 B 零变基座。I/O-free → unit 层。
 * harness = engine-loop-emit.test.ts 同形本地拷贝（unit 层文件自足惯例）。
 */
import { describe, test, expect } from 'bun:test'
import { queryAgentLoop, type AgentLoopEvent } from '../../src/engine'
import { queryEngineLoopStream } from '../../src/tui/loopEvents.js'
import {
  getTurnOutputTokens,
  setTurnOutputTokens,
  snapshotOutputTokensForTurn,
  getTurnTokenBudgetSnapshot,
  getTurnOutputTokensAtSnapshot,
} from '../../src/tui/bootstrapState.js'
import { feature } from '../../src/shared/feature.js'
import type { ModelProvider, ModelRole } from '../../src/modelprovider'
import type { Tool } from '../../src/shared'

// ── 脚本化 LLM（逐轮异 usage；engine-loop-emit 同形）────────────────────────
interface ScriptStep {
  content: unknown[]
  stopReason?: string
  /** 本轮 assistant message.usage（缺省 = usage 字段缺位——interrupted 恒等锚腿）。 */
  outputTokens?: number
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
        timestamp: '2026-11-15T00:00:00Z',
        message: {
          id: `m-${call}`,
          model: 'fake-model',
          role: 'assistant',
          content: step.content,
          stop_reason: step.stopReason ?? 'end_turn',
          // modelprovider 实 yield 形：usage 嵌套 message.usage（:1125/:1075），
          // usage 缺位 = 字段整体缺省（?? 0 恒等锚消费面）。
          ...(step.outputTokens === undefined
            ? {}
            : {
                usage: {
                  input_tokens: 1,
                  output_tokens: step.outputTokens,
                  cache_read_input_tokens: 0,
                  cache_creation_input_tokens: 0,
                },
              }),
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
const toolStep = (id: string, msg: string, outputTokens?: number): ScriptStep => ({
  content: [{ type: 'tool_use', id, name: 'echo', input: { msg } }],
  stopReason: 'tool_calls',
  outputTokens,
})
const textStep = (text: string, outputTokens?: number): ScriptStep => ({
  content: [{ type: 'text', text }],
  stopReason: 'end_turn',
  outputTokens,
})

function roundEnds(events: AgentLoopEvent[]) {
  return events.filter((e): e is Extract<AgentLoopEvent, { type: 'round_end' }> => e.type === 'round_end')
}

describe('W-RC1 形 α engine 权威链（round_end 累计 + 重置单源）', () => {
  test('① round_end turnOutputTokens 逐轮累计单调（3 轮异 usage：12/34/56）', async () => {
    const provider = scriptedProvider([
      toolStep('tu-1', 'a', 12),
      toolStep('tu-2', 'b', 34),
      textStep('done', 56),
    ])
    const events: AgentLoopEvent[] = []
    await queryAgentLoop(
      {
        modelProvider: provider,
        role: 'small' as ModelRole,
        emit: (e) => {
          events.push(e)
        },
      },
      { messages: [{ role: 'user', content: 'go' }], tools: [makeEchoTool()] },
    )
    const res = roundEnds(events)
    expect(res).toHaveLength(3)
    // 累计单调：12 → 46 → 102（usage 终值逐轮累加，非 chunk 累加非终值覆盖）
    expect(res[0].turnOutputTokens).toBe(12)
    expect(res[1].turnOutputTokens).toBe(46)
    expect(res[2].turnOutputTokens).toBe(102)
    // 嵌套 message.usage 取用形（modelprovider 实 yield 形直证）
    expect((res[0].assistantMessage as { message?: { usage?: { output_tokens?: number } } }).message?.usage?.output_tokens).toBe(12)
  })

  test('② 重置点 = query() 入口单源：第二次 query 首个 round_end 不跨 query 累加', async () => {
    const provider = scriptedProvider([
      textStep('one', 100),
      textStep('two', 7),
    ])
    const runs: number[][] = []
    for (let i = 0; i < 2; i++) {
      const events: AgentLoopEvent[] = []
      await queryAgentLoop(
        {
          modelProvider: provider,
          role: 'small' as ModelRole,
          emit: (e) => {
            events.push(e)
          },
        },
        { messages: [{ role: 'user', content: 'go' }], tools: [] },
      )
      runs.push(roundEnds(events).map((r) => r.turnOutputTokens))
    }
    // 第一次 query：[100]；第二次：[107]（本轮累计 7，非 100+7=107 跨 query 叠加错位）
    expect(runs[0]).toEqual([100])
    expect(runs[1]).toEqual([7])
  })

  test('③ usage 缺位（interrupted 形）= ?? 0 恒等锚：计数链不炸、不 NaN、同 query 后续轮照常累加', async () => {
    const provider = scriptedProvider([
      toolStep('tu-1', 'a'), // usage 缺位轮（tool_calls 续跑）
      textStep('with-usage', 42),
    ])
    const events: AgentLoopEvent[] = []
    await queryAgentLoop(
      {
        modelProvider: provider,
        role: 'small' as ModelRole,
        emit: (e) => {
          events.push(e)
        },
      },
      { messages: [{ role: 'user', content: 'go' }], tools: [] },
    )
    const res = roundEnds(events)
    expect(res).toHaveLength(2)
    expect(res[0].turnOutputTokens).toBe(0)
    expect(res[1].turnOutputTokens).toBe(42)
    expect(Number.isNaN(res[1].turnOutputTokens)).toBe(false)
  })
})

describe('W-RC1 TUI 转写 + bootstrapState 读出面', () => {
  test('④a 转写守卫缺省 fail-closed：queryEngineLoopStream 不带 opt-in 不转写（GATE-RED 修形项 A）', async () => {
    setTurnOutputTokens(0)
    const provider = scriptedProvider([
      toolStep('tu-1', 'a', 31),
      textStep('done', 15),
    ])
    const gen = queryEngineLoopStream({
      deps: { modelProvider: provider, role: 'small' as ModelRole },
      args: { messages: [{ role: 'user', content: 'go' }], tools: [makeEchoTool()] },
    })
    for await (const _ev of gen) {
      // 排空流族（fork/后台任务/hook 车道缺省形：round_end 不入 bootstrapState）
    }
    expect(getTurnOutputTokens()).toBe(0)
  })

  test('④b 主车道 opt-in 转写：transcribeTurnTokens=true 消费后 getTurnOutputTokens = 累计值', async () => {
    setTurnOutputTokens(0)
    const provider = scriptedProvider([
      toolStep('tu-1', 'a', 31),
      textStep('done', 15),
    ])
    const gen = queryEngineLoopStream({
      deps: { modelProvider: provider, role: 'small' as ModelRole },
      args: { messages: [{ role: 'user', content: 'go' }], tools: [makeEchoTool()] },
      transcribeTurnTokens: true,
    })
    for await (const _ev of gen) {
      // 排空流族（REPL.tsx 主链置真形：转写在 emit 回调侧发生）
    }
    expect(getTurnOutputTokens()).toBe(46)
  })

  test('⑤ snapshot 不重置计数器（重置点单源 = engine query 入口）+ 快照读数', () => {
    setTurnOutputTokens(123)
    snapshotOutputTokensForTurn(null)
    expect(getTurnOutputTokens()).toBe(123)
    expect(getTurnTokenBudgetSnapshot()).toBeNull()
    expect(getTurnOutputTokensAtSnapshot()).toBe(123)
    snapshotOutputTokensForTurn(500)
    expect(getTurnTokenBudgetSnapshot()).toBe(500)
    expect(getTurnOutputTokensAtSnapshot()).toBe(123)
    // 计数器不被 snapshot 改写（引擎单源续跑语义）
    expect(getTurnOutputTokens()).toBe(123)
  })

  test('⑥ gate-off 档基座：TOKEN_BUDGET 缺省 off（面 B 6 消费点行为零变前提）', () => {
    // 门语义（src/shared/feature.ts）：TOKEN_BUDGET ∉ ON_BY_DEFAULT 且 env 未设
    // → 恒 false。本测试环境不设 env 即断言 gate-off 档成立。
    expect(feature('TOKEN_BUDGET')).toBe(false)
  })
})
