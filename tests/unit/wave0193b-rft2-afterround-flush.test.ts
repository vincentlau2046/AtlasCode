/**
 * 0.1.93b 段 F RF-T2 判别格（工单 @c22716f6 §10-§12；f4 §12 修形批复
 * @98c7e34d）。RED-F RF-T2 定谳：headless drain 站点族全在回合边界
 * （writeTurnOutputs 站点② / 环顶 ③ / idle ④），阻塞 runTurn 整回合内
 * 无 per-round flush → 回合内入队的 SDK 事件（如临时小组 completed 的
 * task_notification bookend）滞留至回合末。
 *
 * 修形 = 站点⑤ afterRound awaited 槽（loop.ts round_end emit 后、下轮
 * round_start 前逐轮 await）+ print.ts 惰性箭头接 drainToOutput。本格
 * 断言引擎侧契约（f4 §12 批复三断言）：
 *   ① afterRound 调用次数 = 回合数；
 *   ② round1 期间 enqueue 的事件在 afterRound#1 时已可 drain，且时序早于
 *      round2 round_start（单序列 log 排序断言）；
 *   ③ 未注入 = 零行为恒等锚（loop 正常跑完）。
 * 附带条件① fail-visible：afterRound 拒绝沿 await 传播禁吞（④ 格）。
 * 修前红：旧码无 afterRound 槽，①②④ 全红。
 */
import { describe, expect, test } from 'bun:test'
import { queryAgentLoop } from '../../src/engine'
import type { ModelProvider, ModelRole } from '../../src/modelprovider'
import type { Message, Tool } from '../../src/shared'
import {
  enqueueSdkEvent,
  drainSdkEvents,
  resetSdkEventQueueForTesting,
} from '../../src/engine/coordinator/tasks/sdkEventQueue'
import { setIsInteractive } from '../../src/bootstrap/state'

// ── 脚本化 LLM（engine-multi-round 同款：按轮次返不同 completion）──────────
interface ScriptStep {
  content: unknown[]
  stopReason?: string
}
function scriptedProvider(script: ScriptStep[]): ModelProvider {
  let call = 0
  return {
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
      } as unknown as Awaited<ReturnType<ModelProvider['chat']>>
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
}

/** echo 工具：首次 call 时向 SDK 事件队列 enqueue（模拟回合内 teammate 收尾通知）。 */
function makeEnqueueEchoTool(): Tool {
  let enqueued = false
  return {
    name: 'echo',
    inputSchema: { type: 'object', properties: {} },
    call: async () => {
      if (!enqueued) {
        enqueued = true
        enqueueSdkEvent({
          type: 'system',
          subtype: 'task_notification',
          task_id: 'task-1',
          status: 'completed',
          output_file: '/fake/out',
          summary: 'RF-T2 判别事件（回合内入队）',
        })
      }
      return { data: 'echo:ok' }
    },
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

/** noop autoCompact（engine-multi-round 同款：大窗口 + 小计数 → 恒不触发）。 */
const noopAutoCompact = {
  contextWindow: 1_000_000,
  countTokens: () => 10,
  compact: async () => {
    throw new Error('compaction should not run (noop)')
  },
}

describe('0.1.93b RF-T2：afterRound 站点⑤ per-round flush 契约', () => {
  test('① 次数 = 回合数 + ② round1 事件在 afterRound#1 可 drain 且早于 round2 round_start', async () => {
    resetSdkEventQueueForTesting()
    const prevInteractive = true
    setIsInteractive(false) // headless 态：enqueueSdkEvent 放行（TUI 态早退）
    try {
      const seq: string[] = []
      const drainedSnapshots: Array<Array<{ subtype?: string }>> = []
      const r = await queryAgentLoop(
        {
          modelProvider: scriptedProvider([
            toolStep('t1', 'a'),
            toolStep('t2', 'b'),
            textStep('done'),
          ]),
          role: 'small' as ModelRole,
          emit: event => {
            if (event.type === 'round_start') seq.push(`round_start:${event.turn}`)
            if (event.type === 'round_end') seq.push(`round_end:${event.turn}`)
          },
          afterRound: async () => {
            seq.push(`afterRound:${seq.filter(s => s.startsWith('afterRound')).length + 1}`)
            drainedSnapshots.push(
              drainSdkEvents() as unknown as Array<{ subtype?: string }>,
            )
          },
        },
        {
          messages: [{ role: 'user', content: 'go' }] as unknown as Message[],
          tools: [makeEnqueueEchoTool()],
          context: { autoCompact: noopAutoCompact, maxTurns: 5 },
        },
      )
      // ① afterRound 调用次数 = 回合数（3 轮：tool/tool/text）
      expect(r.turns).toBe(3)
      expect(drainedSnapshots).toHaveLength(3)
      // ② round1 工具执行期入队的事件在 afterRound#1 时已可 drain
      // （旧码无 per-round flush 点 → afterRound 不被调 → snapshots 空 → 红）
      expect(drainedSnapshots[0]).toHaveLength(1)
      expect(drainedSnapshots[0][0]?.subtype).toBe('task_notification')
      // ② 时序：round_end:1 < afterRound:1 < round_start:2（awaited 同点保序）
      const iEnd1 = seq.indexOf('round_end:1')
      const iAfter1 = seq.indexOf('afterRound:1')
      const iStart2 = seq.indexOf('round_start:2')
      expect(iEnd1).toBeGreaterThanOrEqual(0)
      expect(iAfter1).toBeGreaterThan(iEnd1)
      expect(iStart2).toBeGreaterThan(iAfter1)
      // drain 幂等全清：后续 afterRound 快照为空（splice 语义）
      expect(drainedSnapshots[1]).toHaveLength(0)
      expect(drainedSnapshots[2]).toHaveLength(0)
    } finally {
      setIsInteractive(prevInteractive)
      resetSdkEventQueueForTesting()
    }
  })

  test('③ 未注入 = 零行为恒等锚（loop 正常跑完 3 轮）', async () => {
    resetSdkEventQueueForTesting()
    setIsInteractive(false) // 与①同态：enqueue 放行（本格锚未注入面行为）
    try {
      const r = await queryAgentLoop(
        {
          modelProvider: scriptedProvider([
            toolStep('t1', 'a'),
            toolStep('t2', 'b'),
            textStep('done'),
          ]),
          role: 'small' as ModelRole,
        },
        {
          messages: [{ role: 'user', content: 'go' }] as unknown as Message[],
          tools: [makeEnqueueEchoTool()],
          context: { autoCompact: noopAutoCompact, maxTurns: 5 },
        },
      )
      expect(r.turns).toBe(3)
      expect(r.terminated).toBe(true)
      // 未注入 → 队列无人 drain → 事件滞留（headless 站点②回合末语义面，
      // 既有行为不变——零行为锚的镜像断言）
      expect(drainSdkEvents()).toHaveLength(1)
    } finally {
      setIsInteractive(true)
      resetSdkEventQueueForTesting()
    }
  })

  test('④ fail-visible（f4 §12 附带条件①）：afterRound 拒绝沿 await 传播禁吞', async () => {
    resetSdkEventQueueForTesting()
    let boom: unknown
    try {
      await queryAgentLoop(
        {
          modelProvider: scriptedProvider([textStep('hi')]),
          role: 'small' as ModelRole,
          afterRound: async () => {
            throw new Error('afterRound-boom')
          },
        },
        {
          messages: [{ role: 'user', content: 'go' }] as unknown as Message[],
          tools: [],
          context: { autoCompact: noopAutoCompact, maxTurns: 5 },
        },
      )
      boom = null
    } catch (err) {
      boom = err
    }
    expect(boom).toBeInstanceOf(Error)
    expect((boom as Error).message).toBe('afterRound-boom')
  })
})
