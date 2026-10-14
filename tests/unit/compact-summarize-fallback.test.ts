/**
 * 0.1.69 D-3（Claude 对齐波）：摘要 LLM 调用 fallback 模型编排判别单测
 *
 * 被测能力（src/tui/contextBodies/summarizeFallback.ts 纯函数面，零 I/O）：
 *  - createSummarizeWithFallback 包装语义：
 *    ① 抛出面 API 级失败 → small 角色重试 1 次（2 调用，第 2 次带 modelOverride）
 *    ② 返回面 API 错误前缀摘要 → 重试 1 次，重试仍错 = 原样返主调用错消息
 *       （调用方熔断计数守卫照旧消费 = 修前语义）
 *    ③ 不触发面（主摘要成功 / 无 fallback 模型 / 错误不可触发）= 恰好 1 次
 *       primary 调用（零额外调用恒等锚）
 *  - isFallbackEligibleError（抛出错误面）：API 级失败（429/5xx/超时/连接/
 *    不完整响应）触发；用户中止（APIUserAbortError name / aborted 标记）与
 *    PTL（prompt-too-long = 调用方截头重试支）不触发；name/message 判别不
 *    依赖跨模块类拷贝同一性（tui/modelprovider 各有一式 APIUserAbortError）。
 *  - isFallbackEligibleResult（返回消息面）：isApiErrorMessage 标记 /
 *    'API Error' 前缀触发；PTL / 中止文本 / 正常摘要不触发。
 *
 * 接线面（本测试不入境）：contextHostWiring CompactPorts.summarize 单口
 * （auto-compact 富 / reactive 413 / 手动 /compact 三处统一受益；headless
 * 裁剪车道无宿主 port 注册 = 不变）。
 * 分层纪律：unit 层——纯函数编排（零网络 / 零真盘 / 零 PTY / 零 LLM）。
 */
import { describe, test, expect } from 'bun:test'
import {
  createSummarizeWithFallback,
  isFallbackEligibleError,
  isFallbackEligibleResult,
} from '../../src/tui/contextBodies/summarizeFallback'
import { PROMPT_TOO_LONG_ERROR_MESSAGE } from '../../src/modelprovider'

const PRIMARY_MODEL = 'premium-model-x'
const FALLBACK_MODEL = 'small-model-y'

type FakeSummary = {
  isApiErrorMessage?: boolean
  text: string
}

/** 脚本化 primary：按序弹出结果（resolve / reject），记录每次调用入参。 */
function scriptedPrimary(
  script: Array<() => FakeSummary | never>,
  calls: Array<Record<string, unknown>>,
) {
  let i = 0
  return async (p: Record<string, unknown>) => {
    calls.push({ ...p })
    const step = script[Math.min(i, script.length - 1)]
    i++
    return step()
  }
}

const HOST_BASE = {
  context: { options: { mainLoopModel: PRIMARY_MODEL } },
} as unknown as Record<string, unknown>

describe('createSummarizeWithFallback 抛出面', () => {
  test('主摘要 API 级失败（429）→ fallback 成功 = 2 调用，第 2 次带 modelOverride', async () => {
    const calls: Array<Record<string, unknown>> = []
    const primary = scriptedPrimary(
      [
        () => {
          throw new Error('API Error: 429 Rate limit exceeded')
        },
        () => ({ text: 'fallback summary' }),
      ],
      calls,
    )
    const wrapped = createSummarizeWithFallback(primary, {
      resolveFallbackModel: p => FALLBACK_MODEL,
    })
    const result = await wrapped(HOST_BASE)
    expect(calls.length).toBe(2)
    expect(calls[0].modelOverride).toBeUndefined()
    expect(calls[1]).toMatchObject({ modelOverride: FALLBACK_MODEL })
    expect((result as FakeSummary).text).toBe('fallback summary')
  })

  test('双失败 = 传播 fallback 调用的错误（调用方计 1 次熔断 = 修前语义）', async () => {
    const calls: Array<Record<string, unknown>> = []
    const primary = scriptedPrimary(
      [
        () => {
          throw new Error('API Error: 503')
        },
        () => {
          throw new Error('API Error: 504 (fallback)')
        },
      ],
      calls,
    )
    const wrapped = createSummarizeWithFallback(primary, {
      resolveFallbackModel: p => FALLBACK_MODEL,
    })
    await expect(wrapped(HOST_BASE)).rejects.toThrow('API Error: 504 (fallback)')
    expect(calls.length).toBe(2)
  })

  test('用户中止（APIUserAbortError name）不触发 fallback = 1 调用原样重抛', async () => {
    const abortErr = Object.assign(
      new Error('aborted'),
      { name: 'APIUserAbortError' },
    )
    const calls: Array<Record<string, unknown>> = []
    const primary = scriptedPrimary(
      [
        () => {
          throw abortErr
        },
      ],
      calls,
    )
    const wrapped = createSummarizeWithFallback(primary, {
      resolveFallbackModel: p => FALLBACK_MODEL,
    })
    await expect(wrapped(HOST_BASE)).rejects.toBe(abortErr)
    expect(calls.length).toBe(1)
  })

  test('PTL 错误不触发 fallback（截头重试支消费面，小窗模型更糟）= 1 调用', async () => {
    const calls: Array<Record<string, unknown>> = []
    const primary = scriptedPrimary(
      [
        () => {
          throw new Error(PROMPT_TOO_LONG_ERROR_MESSAGE + ' (200001 > 200000)')
        },
      ],
      calls,
    )
    const wrapped = createSummarizeWithFallback(primary, {
      resolveFallbackModel: p => FALLBACK_MODEL,
    })
    await expect(wrapped(HOST_BASE)).rejects.toThrow(PROMPT_TOO_LONG_ERROR_MESSAGE)
    expect(calls.length).toBe(1)
  })

  test('无 fallback 模型（resolveFallbackModel undefined）= 1 调用原样重抛', async () => {
    const calls: Array<Record<string, unknown>> = []
    const primary = scriptedPrimary(
      [
        () => {
          throw new Error('API Error: 429')
        },
      ],
      calls,
    )
    const wrapped = createSummarizeWithFallback(primary, {
      resolveFallbackModel: () => undefined,
    })
    await expect(wrapped(HOST_BASE)).rejects.toThrow('429')
    expect(calls.length).toBe(1)
  })

  test('fallback 模型 = 当前摘要模型（resolveFallbackModel 自判跳过）= 1 调用', async () => {
    const calls: Array<Record<string, unknown>> = []
    const primary = scriptedPrimary(
      [
        () => {
          throw new Error('API Error: 429')
        },
      ],
      calls,
    )
    const wrapped = createSummarizeWithFallback(primary, {
      resolveFallbackModel: p =>
        p.context === HOST_BASE.context ? undefined : FALLBACK_MODEL,
    })
    await expect(wrapped(HOST_BASE)).rejects.toThrow('429')
    expect(calls.length).toBe(1)
  })
})

describe('createSummarizeWithFallback 返回面', () => {
  const hostEligible = (r: FakeSummary) =>
    isFallbackEligibleResult(r as unknown as { isApiErrorMessage?: boolean }, r.text)

  test('主摘要返回 API 错误前缀摘要 → 重试 1 次成功 = 返回重试结果（2 调用）', async () => {
    const calls: Array<Record<string, unknown>> = []
    const primary = scriptedPrimary(
      [
        () => ({ isApiErrorMessage: true, text: 'API Error: 429 Rate limit' }),
        () => ({ text: 'clean fallback summary' }),
      ],
      calls,
    )
    const wrapped = createSummarizeWithFallback(primary, {
      resolveFallbackModel: p => FALLBACK_MODEL,
      isEligibleResult: hostEligible,
    })
    const result = (await wrapped(HOST_BASE)) as FakeSummary
    expect(calls.length).toBe(2)
    expect(calls[1]).toMatchObject({ modelOverride: FALLBACK_MODEL })
    expect(result.text).toBe('clean fallback summary')
    expect(result.isApiErrorMessage).toBeUndefined()
  })

  test('返回面双失败 = 原样返回主调用错消息（调用方 API 错误前缀守卫照旧消费）', async () => {
    const calls: Array<Record<string, unknown>> = []
    const primary = scriptedPrimary(
      [
        () => ({ isApiErrorMessage: true, text: 'API Error: 503 primary' }),
        () => ({ isApiErrorMessage: true, text: 'API Error: 504 fallback' }),
      ],
      calls,
    )
    const wrapped = createSummarizeWithFallback(primary, {
      resolveFallbackModel: p => FALLBACK_MODEL,
      isEligibleResult: hostEligible,
    })
    const result = (await wrapped(HOST_BASE)) as FakeSummary
    expect(calls.length).toBe(2)
    // 修前语义锚：返回的是主调用错消息（非 fallback 的），熔断计数不变
    expect(result.text).toBe('API Error: 503 primary')
  })

  test('主摘要成功（无错误标记）= 不触发 fallback，恰好 1 调用（恒等锚）', async () => {
    const calls: Array<Record<string, unknown>> = []
    const primary = scriptedPrimary(
      [() => ({ text: 'clean primary summary' })],
      calls,
    )
    const wrapped = createSummarizeWithFallback(primary, {
      resolveFallbackModel: p => FALLBACK_MODEL,
      isEligibleResult: hostEligible,
    })
    const result = (await wrapped(HOST_BASE)) as FakeSummary
    expect(calls.length).toBe(1)
    expect(result.text).toBe('clean primary summary')
  })

  test('无 isEligibleResult 注入（未注返回面判定）= 返回面永不触发', async () => {
    const calls: Array<Record<string, unknown>> = []
    const primary = scriptedPrimary(
      [
        () => ({ isApiErrorMessage: true, text: 'API Error: 503' }),
      ],
      calls,
    )
    const wrapped = createSummarizeWithFallback(primary, {
      resolveFallbackModel: p => FALLBACK_MODEL,
    })
    const result = (await wrapped(HOST_BASE)) as FakeSummary
    expect(calls.length).toBe(1)
    expect(result.text).toBe('API Error: 503')
  })
})

describe('isFallbackEligibleError 触发判定矩阵（抛出错误面）', () => {
  test('API 级失败 = 可 fallback（429 / 5xx / 超时 / 连接 / 不完整响应）', () => {
    expect(isFallbackEligibleError(new Error('API Error: 429 Too Many Requests'))).toBe(true)
    expect(isFallbackEligibleError(new Error('API Error: 503 Service Unavailable'))).toBe(true)
    expect(isFallbackEligibleError(new Error('Request timed out after 600000ms'))).toBe(true)
    expect(isFallbackEligibleError(new Error('socket hang up'))).toBe(true)
    expect(isFallbackEligibleError('API Error: 429 (string form)')).toBe(true)
  })

  test('用户中止 = 不触发（APIUserAbortError name / aborted 标记 / 字符串形）', () => {
    expect(
      isFallbackEligibleError(
        Object.assign(new Error('aborted'), { name: 'APIUserAbortError' }),
      ),
    ).toBe(false)
    expect(isFallbackEligibleError(new Error('Request was aborted.'))).toBe(false)
    expect(isFallbackEligibleError('Request was aborted.')).toBe(false)
  })

  test('PTL = 不触发（调用方截头重试支消费面）', () => {
    expect(
      isFallbackEligibleError(new Error(PROMPT_TOO_LONG_ERROR_MESSAGE)),
    ).toBe(false)
    expect(isFallbackEligibleError(PROMPT_TOO_LONG_ERROR_MESSAGE + ' details')).toBe(false)
  })

  test('非 Error 非 string（undefined / number / object）= 不触发（保守向）', () => {
    expect(isFallbackEligibleError(undefined)).toBe(false)
    expect(isFallbackEligibleError(42)).toBe(false)
    expect(isFallbackEligibleError({ code: 'ECONNRESET' })).toBe(false)
  })
})

describe('isFallbackEligibleResult 触发判定矩阵（返回消息面）', () => {
  test('空文本 = 不触发', () => {
    expect(isFallbackEligibleResult({ isApiErrorMessage: true }, null)).toBe(false)
    expect(isFallbackEligibleResult({ isApiErrorMessage: true }, '')).toBe(false)
    expect(isFallbackEligibleResult({}, undefined)).toBe(false)
  })

  test('API 错误标记 / 前缀 = 触发', () => {
    expect(
      isFallbackEligibleResult(
        { isApiErrorMessage: true },
        'whatever text',
      ),
    ).toBe(true)
    expect(isFallbackEligibleResult({}, 'API Error: 429 Rate limit')).toBe(true)
  })

  test('PTL / 中止文本 / 正常摘要 = 不触发（前缀天然排除）', () => {
    expect(isFallbackEligibleResult({}, PROMPT_TOO_LONG_ERROR_MESSAGE)).toBe(false)
    expect(isFallbackEligibleResult({}, 'Request was aborted.')).toBe(false)
    expect(isFallbackEligibleResult({}, 'clean summary of the conversation')).toBe(false)
  })
})

describe('宿主 resolveFallbackModel 自判（fallback = small 角色且 ≠ 主模型）', () => {
  test('fallback 模型 = 当前摘要模型 → 宿主自判跳过（无意义重试 = 1 调用）', async () => {
    const calls: Array<Record<string, unknown>> = []
    const primary = scriptedPrimary(
      [
        () => {
          throw new Error('API Error: 429')
        },
      ],
      calls,
    )
    const SMALL_ROLE_MODEL = FALLBACK_MODEL
    const wrapped = createSummarizeWithFallback(
      primary as (p: Record<string, unknown>) => Promise<FakeSummary>,
      {
        // 宿主面语义（contextHostWiring）：getRoleModel('small') 解析 +
        // 与当前摘要模型同值 = 无 fallback
        resolveFallbackModel: p => {
          const main = (
            p.context as { options: { mainLoopModel: string } }
          ).options.mainLoopModel
          return main === SMALL_ROLE_MODEL ? undefined : SMALL_ROLE_MODEL
        },
      },
    )
    const p = {
      context: { options: { mainLoopModel: FALLBACK_MODEL } },
    } as unknown as Record<string, unknown>
    await expect(wrapped(p)).rejects.toThrow('429')
    expect(calls.length).toBe(1)
  })
})
