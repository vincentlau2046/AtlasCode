/**
 * 0.1.59 C 簇（CC 2.1.166）：回合级跨回合有序 fallback 表（≤3 ref）判别单测。
 *
 * 被测能力 = queryAgentLoop 轮内 catch 的跨回合有序重试支：主模型可重试模型错误
 * （shouldRetryModelError 判可重试，5xx 风）→ 钉下一 ref 为本回合 sessionModel 重跑
 * （不占新轮次，每 ref 一次性）；区别于 in-request 单串 fallbackModel（池末位）。
 *
 * 判别面（RED→GREEN，修前）：
 *   - 修前 AgentLoopDeps 无 fallbackModels 槽 + queryAgentLoop catch 无 fallback 支
 *     → ①（ref1 全败→ref2 命中）修前 reject（不恢复）RED；②（全败）修前仅主模型 1 次
 *     调用即 reject（calls=1 非 3）RED。
 *   - ③ 未配置面恒等（fallbackModels 缺省 = 零 fallback 尝试，主模型错误原样穿透）
 *     修前即成立（calls=1），是本项零回归守卫（修后须仍 calls=1）。
 *
 * 隔离面：关回合级恢复（ATLAS_TURN_RECOVER_ENABLED=0，withTurnRecovery 单发）——
 * 否则每个可重试错误会被 withTurnRecovery 内部重试 13 次（退避空耗 + 调用计数
 * 爆炸），无法干净隔离「回合级 catch 逐 ref 一次性」语义。fake provider 仅 LLM 替身
 * （按 sessionModel 分派成功/5xx），零网络 / 零磁盘 / 零 PTY → unit 层。
 */
import { describe, test, expect } from 'bun:test'
import { queryAgentLoop } from 'src/engine/query/loop'
import type { AgentLoopResult } from 'src/engine/query/loop'
import type { ModelProvider, ModelRole } from 'src/modelprovider'

type CallLog = { sessionModel?: string }[]

const USER_MSG = {
  type: 'user',
  role: 'user',
  uuid: 'usr-1',
  timestamp: new Date().toISOString(),
  message: { role: 'user', content: [{ type: 'text', text: 'hi' }] },
} as never

/** 可重试模型错误（5xx 风，modelprovider shouldRetryModelError 判可重试）。 */
function retryable5xx(label: string): Error {
  const e = new Error(`5xx ${label}`)
  ;(e as unknown as { status: number }).status = 500
  return e
}

/** LLM 成功响应（非空 text，terminal end_turn）。 */
function successResponse(text: string) {
  return {
    type: 'assistant' as const,
    uuid: 'u1',
    timestamp: new Date().toISOString(),
    message: {
      id: 'm1',
      model: 'fake',
      role: 'assistant' as const,
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      usage: {},
    },
  }
}

/**
 * fake LLM：successRefs 内的 sessionModel 命中 = 成功；其余 = 5xx 可重试错。
 * 记录每次调用的 sessionModel（主模型 = undefined，fallback ref = 表内串）。
 */
function selectiveProvider(calls: CallLog, successRefs: ReadonlySet<string>) {
  return {
    getTimeoutMs: () => 600_000,
    chatStream: async function* () {},
    chat: async (args: { sessionModel?: string }) => {
      calls.push({ sessionModel: args.sessionModel })
      const sm = args.sessionModel ?? '__primary__'
      if (successRefs.has(sm)) return successResponse(`ok via ${sm}`)
      throw retryable5xx(sm)
    },
  } as unknown as ModelProvider
}

/** 关回合级恢复（withTurnRecovery 单发）执行 fn，随后还原 env（防污染）。 */
async function withRecoveryDisabled<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.ATLAS_TURN_RECOVER_ENABLED
  process.env.ATLAS_TURN_RECOVER_ENABLED = '0'
  try {
    return await fn()
  } finally {
    if (prev === undefined) delete process.env.ATLAS_TURN_RECOVER_ENABLED
    else process.env.ATLAS_TURN_RECOVER_ENABLED = prev
  }
}

describe('0.1.59 C 簇 · 回合级跨回合有序 fallback 表（queryAgentLoop 轮内 catch）', () => {
  test('① ref1 全败 → ref2 命中（有序表逐 ref 一次性，回合级恢复不占新轮次）', async () => {
    const calls: CallLog = []
    const deps = {
      modelProvider: selectiveProvider(calls, new Set(['ref2'])),
      role: 'main' as ModelRole,
      fallbackModels: ['ref1', 'ref2'],
      signal: undefined,
    }
    const res: AgentLoopResult = await withRecoveryDisabled(
      () =>
        queryAgentLoop(deps as never, { messages: [USER_MSG], tools: [] }) as Promise<AgentLoopResult>,
    )
    // 回合经 ref2 完成（正常 terminal）
    expect(res.terminated).toBe(true)
    // 调用序 = 主模型(undefined) → ref1 → ref2（有序、每 ref 一次性）
    expect(calls.map(c => c.sessionModel)).toEqual([undefined, 'ref1', 'ref2'])
  })

  test('② 全败（主模型 + 全 ref）→ 抛末次错误（表耗尽，非死循环）', async () => {
    const calls: CallLog = []
    const deps = {
      modelProvider: selectiveProvider(calls, new Set<string>()), // 全 5xx
      role: 'main' as ModelRole,
      fallbackModels: ['ref1', 'ref2'],
      signal: undefined,
    }
    let caught: unknown
    await withRecoveryDisabled(async () => {
      try {
        await queryAgentLoop(deps as never, { messages: [USER_MSG], tools: [] })
      } catch (e) {
        caught = e
      }
    })
    expect(caught).toBeDefined()
    // 末次错误 = 表末位 ref2 的 5xx（穿透原错误，非吞错/新错）
    expect(String((caught as Error).message)).toContain('ref2')
    // 主模型 1 + ref1 1 + ref2 1 = 3 次（每 ref 一次性，无死循环）
    expect(calls).toHaveLength(3)
  })

  test('③ 未配置面恒等（fallbackModels 缺省 → 零 fallback 尝试，主模型错误原样穿透）', async () => {
    const calls: CallLog = []
    const deps = {
      modelProvider: selectiveProvider(calls, new Set<string>()), // 全 5xx
      role: 'main' as ModelRole,
      // 无 fallbackModels = 未配置面
      signal: undefined,
    }
    let caught: unknown
    await withRecoveryDisabled(async () => {
      try {
        await queryAgentLoop(deps as never, { messages: [USER_MSG], tools: [] })
      } catch (e) {
        caught = e
      }
    })
    expect(caught).toBeDefined()
    // 仅主模型 1 次调用，零 fallback 尝试（catch 原语义零变更 = 零回归守卫）
    expect(calls).toHaveLength(1)
  })
})
