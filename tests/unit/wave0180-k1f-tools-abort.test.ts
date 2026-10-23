/**
 * 0.1.80 V3-1 K1-F①② 判别锁 — 工具 schema 稳定序 + pre-turn 压缩 abort 语义
 *
 * K1-F① (@302)：buildOpenAITools 收尾 stableSortDedupeTools——工具注入序
 * 抖动会让 prompt cache 键漂移；同名重复（注册工具 vs extraToolSchemas）
 * 部分 provider 直接 400。锁面：按 name 排序 / 同名去重保留首现（注册
 * 工具面压过 extra 裸 schema）/ 空列表恒等 / 输入不被变异。
 *
 * K1-F② (@302)：pre-turn 压缩块的 abort 语义——
 *   a) signal 已中止 → 本回合不进压缩（compact 零调用；修前进块必调）
 *   b) 压缩调用进行中被中止（abort 竞态窗）→ 失败不回灌熔断计数、不
 *      report 断路器 store（用户中止 ≠ 压缩故障，3 次中止不该跳闸）
 *
 * 判别锚：修前两测均红（a: compactCalls=1；b: consecutiveFailures=1 +
 * circuit store 被写）。纯 fake LLM + DI 依赖注入，零网络/零磁盘。
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  clearAutoCompactCircuitFailures,
  getAutoCompactCircuitFailures,
  queryAgentLoop,
  type AutoCompactDeps,
  type AutoCompactTrackingState,
} from '../../src/engine'
import { stableSortDedupeTools } from '../../src/modelprovider/params'
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import type { ModelProvider, ModelRole } from '../../src/modelprovider'
import type { Tool } from '../../src/shared'

// ── K1-F① stableSortDedupeTools 直测 ─────────────────────────────────────

const ct = (name: string, description: string): ChatCompletionTool => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties: {} } },
})

describe('K1-F① stableSortDedupeTools（排序 + 同名去重保首现）', () => {
  test('a) 乱序输入 → 按 function.name 升序', () => {
    const out = stableSortDedupeTools([ct('zeta', 'z'), ct('alpha', 'a'), ct('mid', 'm')])
    expect(out.map((t) => t.function.name)).toEqual(['alpha', 'mid', 'zeta'])
  })

  test('b) 同名去重保留首现（注册工具面压过 extra 裸 schema）', () => {
    const registered = ct('echo', 'registered-with-permission-desc')
    const extra = ct('echo', '')
    // 注册面在输入中先声明 → 首现保留；extra 裸 schema 被去重
    const out = stableSortDedupeTools([registered, extra])
    expect(out).toHaveLength(1)
    expect(out[0].function.description).toBe('registered-with-permission-desc')
  })

  test('c) 空列表恒等 / 单元素原样', () => {
    expect(stableSortDedupeTools([])).toEqual([])
    const one = ct('solo', 's')
    expect(stableSortDedupeTools([one])).toEqual([one])
  })

  test('d) 输入不被变异（排序走拷贝，调用方原序保留）', () => {
    const input = [ct('b', 'b'), ct('a', 'a')]
    stableSortDedupeTools(input)
    expect(input.map((t) => t.function.name)).toEqual(['b', 'a'])
  })

  test('e) 同名多次重复 → 只留最早声明者（>2 重复面）', () => {
    const out = stableSortDedupeTools([
      ct('x', 'first'),
      ct('y', 'y'),
      ct('x', 'second'),
      ct('x', 'third'),
    ])
    expect(out.map((t) => t.function.name)).toEqual(['x', 'y'])
    expect(out.find((t) => t.function.name === 'x')?.function.description).toBe('first')
  })
})

// ── K1-F② pre-turn 压缩 abort 语义（queryAgentLoop 级）─────────────────────

/** fake provider：单轮 text 终止（loop 级最小面，chat 计数）。 */
function textProvider(): { provider: ModelProvider; calls: () => number } {
  let call = 0
  const provider: ModelProvider = {
    chat: async () => {
      call++
      return {
        type: 'assistant',
        uuid: `u-${call}`,
        timestamp: '2026-10-24T00:00:00Z',
        message: {
          id: `m-${call}`,
          model: 'fake-model',
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
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

/** 必触发 autoCompact（超阈值 167_000）；compact 体可注入副作用。 */
function firingAutoCompact(compactImpl: () => Promise<unknown>): AutoCompactDeps {
  return {
    contextWindow: 200_000,
    countTokens: () => 170_000,
    compact: compactImpl,
  }
}

const FRESH_TRACKING: AutoCompactTrackingState = {
  compacted: false,
  turnCounter: 0,
  turnId: 'turn-0',
}

describe('K1-F② pre-turn 压缩 abort 语义', () => {
  beforeEach(() => {
    clearAutoCompactCircuitFailures()
  })
  afterEach(() => {
    clearAutoCompactCircuitFailures()
  })

  test('a) signal 已中止 → 本回合不进压缩（compact 零调用；修前进块必调此测红）', async () => {
    const { provider } = textProvider()
    const controller = new AbortController()
    controller.abort()
    let compactCalls = 0
    const r = await queryAgentLoop(
      { modelProvider: provider, role: 'small' as ModelRole, signal: controller.signal },
      {
        messages: [{ role: 'user', content: 'go' }],
        tools: [] as Tool[],
        context: {
          autoCompact: firingAutoCompact(async () => {
            compactCalls++
            throw new Error('compact should not run (aborted entry)')
          }),
        },
      },
    )
    // 修前：pre-turn 块无条件进 → compactCalls=1 + consecutiveFailures=1
    expect(compactCalls).toBe(0)
    expect(r.tracking.consecutiveFailures).toBeUndefined()
    expect(getAutoCompactCircuitFailures()).toBe(0)
  })

  test('b) 压缩进行中被中止 → 失败不回灌不 report（用户中止 ≠ 压缩故障）', async () => {
    const { provider } = textProvider()
    const controller = new AbortController()
    let compactCalls = 0
    const r = await queryAgentLoop(
      { modelProvider: provider, role: 'small' as ModelRole, signal: controller.signal },
      {
        messages: [{ role: 'user', content: 'go' }],
        tools: [] as Tool[],
        tracking: FRESH_TRACKING,
        context: {
          autoCompact: firingAutoCompact(async () => {
            compactCalls++
            // 压缩调用进行中用户中止（abort 竞态窗）→ 摘要以 AbortError 形态失败
            controller.abort()
            throw new Error('Request was aborted')
          }),
        },
      },
    )
    // compact 确实被调过（进块时 signal 未中止）
    expect(compactCalls).toBe(1)
    // 修前：失败支无条件回灌 → consecutiveFailures=1 + circuit store=1（此测红）
    expect(r.tracking.consecutiveFailures).toBeUndefined()
    expect(getAutoCompactCircuitFailures()).toBe(0)
    // 对照锚：非中止的真失败仍走既有回灌面（doomed 三次跳闸语义不回归）
    const doomed = await queryAgentLoop(
      { modelProvider: textProvider().provider, role: 'small' as ModelRole },
      {
        messages: [{ role: 'user', content: 'go' }],
        tools: [] as Tool[],
        context: {
          autoCompact: firingAutoCompact(async () => {
            throw new Error('real compaction failure')
          }),
        },
      },
    )
    expect(doomed.tracking.consecutiveFailures).toBe(1)
    expect(getAutoCompactCircuitFailures()).toBe(1)
  })
})
