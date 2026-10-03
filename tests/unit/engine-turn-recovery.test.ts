import { describe, expect, test } from 'bun:test'
import {
  resolveTurnRecoveryConfig,
  sleepSignalAware,
  turnRecoveryBackoffMs,
  withTurnRecovery,
} from 'src/engine/query/turnRecovery'
import { queryOneRound } from 'src/engine/query/loop'

// loop-robustness 缺口②（#262）：loop 回合级有界恢复（E-1b-full 错误恢复纵切）。
// 判别单测（mechanism + wiring 双面）：
//   - mechanism：withTurnRecovery 对「可重试模型错误」（5xx）有界+退避续试穿越
//     风暴窗；非可重试（401）/ abort / 关恢复面 立即穿透不空耗；预算有界（非无限）。
//   - wiring：queryOneRound 的 modelProvider.chat 经 withTurnRecovery（首发撞 13 次
//     5xx 风暴 → 恢复穿越 → 单轮成功，calls=14）。
// mutation-red：删 withTurnRecovery 恢复循环 → ①③ RED；改无限重试 → ② RED；
// 丢 shouldRetryModelError 判别 → ③④ RED；loop 不经 withTurnRecovery → wiring RED。

/** 可重试模型错误（5xx 风格，modelprovider shouldRetryModelError 判可重试）。 */
function retryableError(message: string, status = 500): Error {
  const e = new Error(message)
  ;(e as unknown as { status: number }).status = status
  return e
}
/** 非可重试模型错误（401 鉴权，shouldRetryModelError 判不可重试 → 不重试）。 */
function nonRetryableError(message: string): Error {
  const e = new Error(message)
  ;(e as unknown as { status: number }).status = 401
  return e
}

describe('turnRecovery（loop-robustness 缺口② 回合级有界恢复）', () => {
  // 快速面：退避 0（测试不空耗）+ 小预算。
  const fast = { enabled: true, maxRetries: 3, backoffBaseMs: 0, backoffCapMs: 0 }

  test('① 穿越可重试风暴：连续失败后成功 → 返回成功（非整个任务丢弃）', async () => {
    let calls = 0
    const res = await withTurnRecovery(
      async () => {
        calls++
        if (calls < 3) throw retryableError('5xx storm')
        return 'ok'
      },
      { config: fast },
    )
    expect(res).toBe('ok')
    expect(calls).toBe(3) // 2 失败 + 1 成功
  })

  test('② 有界：恒失败可重试错 → maxRetries+1 次调用后穿透（非无限重试）', async () => {
    let calls = 0
    await expect(
      withTurnRecovery(
        async () => {
          calls++
          throw retryableError('5xx forever')
        },
        { config: fast },
      ),
    ).rejects.toThrow('5xx forever')
    expect(calls).toBe(fast.maxRetries + 1) // 首发 1 + 恢复 3 = 4
  })

  test('③ 非可重试错（401）→ 首发即穿透不重试（不空耗死网）', async () => {
    let calls = 0
    await expect(
      withTurnRecovery(
        async () => {
          calls++
          throw nonRetryableError('401 unauthorized')
        },
        { config: fast },
      ),
    ).rejects.toThrow('401 unauthorized')
    expect(calls).toBe(1)
  })

  test('④ 关恢复面（enabled=false）→ 单发，失败即抛（行为回退 = 无恢复）', async () => {
    let calls = 0
    await expect(
      withTurnRecovery(
        async () => {
          calls++
          throw retryableError('5xx')
        },
        { config: { ...fast, enabled: false } },
      ),
    ).rejects.toThrow('5xx')
    expect(calls).toBe(1)
  })

  test('⑤ aborted signal → 首发仍执行（保旧 loop 语义），但不追加恢复重试（calls=1）', async () => {
    let calls = 0
    const ac = new AbortController()
    ac.abort()
    // 首发（i=0）恒执行（calls=1）→ 抛 5xx → shouldRetryModelError(err, aborted
    // signal)=false → 不追加恢复重试，直接穿透（与 R1 空响应面「abort 仅 1 次调用」
    // 一致）。
    await expect(
      withTurnRecovery(
        async () => {
          calls++
          throw retryableError('5xx')
        },
        { config: fast, signal: ac.signal },
      ),
    ).rejects.toThrow('5xx')
    expect(calls).toBe(1)
  })

  test('⑥ 指数退避单调递增且封顶（无 jitter，测试可复现）', () => {
    expect(turnRecoveryBackoffMs(0, 100, 1000)).toBe(100)
    expect(turnRecoveryBackoffMs(1, 100, 1000)).toBe(200)
    expect(turnRecoveryBackoffMs(2, 100, 1000)).toBe(400)
    expect(turnRecoveryBackoffMs(3, 100, 1000)).toBe(800)
    expect(turnRecoveryBackoffMs(4, 100, 1000)).toBe(1000) // 封顶
    expect(turnRecoveryBackoffMs(10, 100, 1000)).toBe(1000) // 仍封顶
  })

  test('⑦ config env 解析（缺省 = 生产缺省；覆写生效）', () => {
    const def = resolveTurnRecoveryConfig({})
    expect(def.enabled).toBe(true)
    expect(def.maxRetries).toBe(13)
    expect(def.backoffBaseMs).toBe(100)
    expect(def.backoffCapMs).toBe(1000)
    const ov = resolveTurnRecoveryConfig({
      ATLAS_TURN_RECOVER_MAX: '5',
      ATLAS_TURN_RECOVER_ENABLED: '0',
      ATLAS_TURN_RECOVER_BACKOFF_MS: '0',
    })
    expect(ov.maxRetries).toBe(5)
    expect(ov.enabled).toBe(false)
    expect(ov.backoffBaseMs).toBe(0)
  })

  test('⑧ sleepSignalAware：ms<=0 立即 resolve；aborted 立即 resolve（不睡满）', async () => {
    await sleepSignalAware(0)
    await sleepSignalAware(-5)
    const ac = new AbortController()
    ac.abort()
    await sleepSignalAware(60_000, ac.signal) // aborted → 立即（非睡 60s）
  })
})

// 活链路接线：queryOneRound 的 modelProvider.chat 经 withTurnRecovery（回路②）。
describe('queryOneRound 经回合级恢复（活链路接线）', () => {
  test('首发撞 13 次 5xx 风暴（缺省 maxRetries=13）→ 恢复穿越 → 单轮成功（calls=14）', async () => {
    const calls = { n: 0 }
    const modelProvider = {
      getTimeoutMs: () => 600_000,
      chatStream: async function* () {},
      chat: async () => {
        calls.n++
        if (calls.n <= 13) {
          const e = new Error('5xx storm')
          ;(e as unknown as { status: number }).status = 500
          throw e
        }
        return {
          type: 'assistant',
          uuid: 'u1',
          timestamp: new Date().toISOString(),
          message: {
            id: 'm1',
            model: 'fake',
            role: 'assistant',
            stop_sequence: '',
            type: 'message',
            content: [{ type: 'text', text: 'done after storm' }],
            stop_reason: 'end_turn',
            usage: {},
          },
        }
      },
    }
    const deps = {
      modelProvider,
      role: 'main',
      // 无 tools / 无 hooks / 无 transcript = 窄 spine（本轮 0 tool_use）。
      signal: undefined,
    }
    // 退避置 0（缺省 100ms 基 × 13 段 ≈ 10s，测试不空耗）；restore 防污染。
    const prevBackoff = process.env.ATLAS_TURN_RECOVER_BACKOFF_MS
    process.env.ATLAS_TURN_RECOVER_BACKOFF_MS = '0'
    try {
      const res = await queryOneRound(
        deps as never,
        [],
        [
          {
            type: 'user',
            role: 'user',
            uuid: 'usr-1',
            timestamp: new Date().toISOString(),
            message: { role: 'user', content: [{ type: 'text', text: 'hi' }] },
          } as never,
        ],
      )
      expect(
        res.assistantContent.some(
          (b: { type?: string; text?: unknown }) =>
            b?.type === 'text' && b.text === 'done after storm',
        ),
      ).toBe(true)
      expect(calls.n).toBe(14) // 首发 1 + 恢复 13 = 14（穿越 13 次 5xx 风暴窗）
    } finally {
      if (prevBackoff === undefined) delete process.env.ATLAS_TURN_RECOVER_BACKOFF_MS
      else process.env.ATLAS_TURN_RECOVER_BACKOFF_MS = prevBackoff
    }
  })

  test('wiring 反向：关恢复面（ATLAS_TURN_RECOVER_ENABLED=0）→ 首发 5xx 即抛（不经恢复）', async () => {
    const calls = { n: 0 }
    const modelProvider = {
      getTimeoutMs: () => 600_000,
      chatStream: async function* () {},
      chat: async () => {
        calls.n++
        const e = new Error('5xx forever')
        ;(e as unknown as { status: number }).status = 500
        throw e
      },
    }
    const deps = { modelProvider, role: 'main', signal: undefined }
    const prevEnabled = process.env.ATLAS_TURN_RECOVER_ENABLED
    process.env.ATLAS_TURN_RECOVER_ENABLED = '0'
    try {
      await expect(
        queryOneRound(
          deps as never,
          [],
          [
            {
              type: 'user',
              role: 'user',
              uuid: 'usr-1',
              timestamp: new Date().toISOString(),
              message: { role: 'user', content: [{ type: 'text', text: 'hi' }] },
            } as never,
          ],
        ),
      ).rejects.toThrow('5xx forever')
      expect(calls.n).toBe(1) // 关恢复面 = 单发（非 14）
    } finally {
      if (prevEnabled === undefined) delete process.env.ATLAS_TURN_RECOVER_ENABLED
      else process.env.ATLAS_TURN_RECOVER_ENABLED = prevEnabled
    }
  })
})
