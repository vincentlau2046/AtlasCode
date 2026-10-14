/**
 * 0.1.71 块 A（用户主诉①「所有模型额度没有了，但提示有问题」）判别单测。
 *
 * 三件：
 *  - A-1 池轮询全败聚合（modelprovider.ts chat 非流式 / chatWithDelta 流式）：
 *    逐 ref 重试预算耗尽仍全败 → 抛 ModelPoolExhaustedError（模型列表 + 逐模型
 *    失败分类 + 处置建议），替代旧 `if (lastErr) throw lastErr`（只抛末跳）。
 *    混合失败（某 ref 成功）= 成功优先零变更恒等锚；零模型池既有错误零变更。
 *  - A-2 403 配额耗尽子型（modelErrors.classifyAPIError + isQuotaExhaustedMessage
 *    单一事实源）：403 + quota/pre-consume/insufficient 资源族签名 → 'quota_exhausted'，
 *    拆出泛 403 auth_error 之前（泛 403 auth_error 恒等锚；非 403 零扰动）。
 *  - A-3 TUI 提示面（apiErrors resolveAuthErrorMessaging）见 apiErrors-quota-0171.test.ts。
 *
 * 判别锚（零回归设计）：
 *  - ModelPoolExhaustedError 非 APIError（无 .status/.cause）、.message 只含
 *    ref 名 + 分类标签 + 建议（原始文案隔离在 .failures[i].raw）→
 *    shouldRetryModelError 判不可重试（守 403 非重试锚，withTurnRecovery 不放大
 *    13 次重试）。
 *
 * 分层纪律：纯谓词 + fake client（mock.module clients/roles 双身，repo 惯例全
 * 导出面先取再 spread 覆写）——零网络 / 零盘 / 零模型。
 */
import { describe, test, expect, mock } from 'bun:test'

// ---- mock 双身（先取真实全导出面，再 spread 覆写 = mock-module-export-surface 标准对策）----
const realClients = await import('../../src/modelprovider/clients')
const realRoles = await import('../../src/modelprovider/roles')

const createCalls: any[] = []
// 每调用行为（callIndex = 0-based 全局计数）；缺省 = 403 配额耗尽。
type CreateBehavior = (callIndex: number) => unknown
let createBehavior: CreateBehavior = () => {
  throw { status: 403, name: 'APIError', message: 'You have exceeded your quota (pre-consume failed)' }
}

const fakeClient = {
  chat: {
    completions: {
      create: async (params: any) => {
        createCalls.push(params)
        return createBehavior(createCalls.length - 1)
      },
    },
  },
}

const ENTRY_A = {
  provider: 'prov-a',
  modelId: 'm-a',
  modelRef: 'prov-a/m-a',
  baseURL: 'http://127.0.0.1:9',
  apiKey: 'key-a',
  contextWindow: 32_768,
  maxTokens: 4096,
}
const ENTRY_B = { ...ENTRY_A, provider: 'prov-b', modelId: 'm-b', modelRef: 'prov-b/m-b', apiKey: 'key-b' }
const ENTRY_BY_REF: Record<string, typeof ENTRY_A> = { 'prov-a/m-a': ENTRY_A, 'prov-b/m-b': ENTRY_B }

// 双 ref 池（A-1 全败/混合判别的最小池）。
const POOL = ['prov-a/m-a', 'prov-b/m-b']

mock.module('../../src/modelprovider/clients', () => ({
  ...realClients,
  getClientForEntry: (entry: any) => fakeClient,
}))
mock.module('../../src/modelprovider/roles', () => ({
  ...realRoles,
  getRoleModels: () => POOL,
  getRoleModel: () => 'm-a',
  resolveModel: (ref: string) => ENTRY_BY_REF[ref] ?? ENTRY_A,
  getRoleConfig: () => ({
    provider: 'openai',
    model: 'm-a',
    baseURL: ENTRY_A.baseURL,
    apiKey: ENTRY_A.apiKey,
  }),
}))

const {
  OpenAIProvider,
  ModelPoolExhaustedError,
  classifyRefFailure,
  classifyAPIError,
  isQuotaExhaustedMessage,
  shouldRetryModelError,
  APIError,
} = await import('../../src/modelprovider')

function makeProvider() {
  // 403 非可重试 = 每 ref 1 调用（maxRetries 值不影响 403 路径调用数）；假 sleep 免实睡。
  return new OpenAIProvider(1, 600_000, undefined, { baseMs: 1, capMs: 2, sleep: async () => {} })
}
const chatArgs = () => ({ role: 'fast' as const, messages: [{ role: 'user', content: 'hi' }] as any })

function resetFakeState() {
  createCalls.length = 0
  createBehavior = () => {
    throw { status: 403, name: 'APIError', message: 'You have exceeded your quota (pre-consume failed)' }
  }
}

// ── A-1 池轮询全败聚合（fake client 驱动 OpenAIProvider.chat）─────────────
describe('0.1.71 A-1 池轮询全败 → ModelPoolExhaustedError 聚合', () => {
  test('全败（双 ref 403 配额）→ 聚合错误：模型列表 + 逐模型分类 + 处置建议', async () => {
    resetFakeState()
    const provider = makeProvider()
    let caught: unknown
    try {
      await provider.chat(chatArgs())
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ModelPoolExhaustedError)
    const agg = caught as ModelPoolExhaustedError
    // 双 ref 各 1 调用（403 非重试）
    expect(createCalls.length).toBe(2)
    // 逐模型分类 = 配额耗尽
    expect(agg.failures).toHaveLength(2)
    expect(agg.failures.map(f => f.ref)).toEqual(['prov-a/m-a', 'prov-b/m-b'])
    expect(agg.failures.every(f => f.code === 'quota_exhausted')).toBe(true)
    // .message 含模型列表 + 配额处置建议（原始文案隔离在 .raw）
    expect(agg.message).toContain('prov-a/m-a')
    expect(agg.message).toContain('prov-b/m-b')
    expect(agg.message).toContain('quota_exhausted')
    expect(agg.message).toContain('Top up your provider quota')
    // 原始文案不进 .message（避免 /timeout|ECONN|.../ 正则误判可重试）
    expect(agg.message).not.toContain('pre-consume failed')
    expect(agg.failures[0].raw).toContain('quota')
    // 403 非重试锚：聚合错误判不可重试（withTurnRecovery 不放大重试）
    expect(shouldRetryModelError(agg, undefined)).toBe(false)
    expect(agg instanceof APIError).toBe(false)
  })

  test('全败（非配额 403）→ 聚合错误：分类 auth_error + 凭据处置建议（非配额文案）', async () => {
    resetFakeState()
    createBehavior = () => {
      throw { status: 403, name: 'APIError', message: 'Forbidden' }
    }
    const provider = makeProvider()
    const agg = await provider.chat(chatArgs()).catch((e: unknown) => e)
    expect(agg).toBeInstanceOf(ModelPoolExhaustedError)
    expect((agg as ModelPoolExhaustedError).failures.every(f => f.code === 'auth_error')).toBe(true)
    expect((agg as ModelPoolExhaustedError).message).toContain('Check provider credentials')
    expect((agg as ModelPoolExhaustedError).message).not.toContain('Top up your provider quota')
  })

  test('混合失败（ref-a 403 / ref-b 成功）→ 成功优先返回，不触发聚合（既有行为恒等锚）', async () => {
    resetFakeState()
    createBehavior = callIndex => {
      if (callIndex === 0) throw { status: 403, name: 'APIError', message: 'quota exhausted' }
      return {
        choices: [{ message: { content: 'ok-from-b' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }
    }
    const provider = makeProvider()
    const res = await provider.chat(chatArgs())
    expect(res.message.content).toEqual([{ type: 'text', text: 'ok-from-b' }])
    expect(createCalls.length).toBe(2) // ref-a 1 次（403 非重试）+ ref-b 1 次（成功）
  })
})

// ── A-1 纯面：classifyRefFailure 分类矩阵 + ModelPoolExhaustedError 形状 ──
describe('0.1.71 A-1 classifyRefFailure 分类矩阵', () => {
  test('403 + 配额签名 → quota_exhausted', () => {
    expect(classifyRefFailure({ status: 403, message: 'quota exceeded' })).toBe('quota_exhausted')
    expect(classifyRefFailure({ status: 403, message: 'pre-consume failed' })).toBe('quota_exhausted')
    expect(classifyRefFailure({ status: 403, message: 'insufficient balance' })).toBe('quota_exhausted')
  })
  test('403 非配额 → auth_error', () => {
    expect(classifyRefFailure({ status: 403, message: 'Forbidden' })).toBe('auth_error')
  })
  test('401 → auth_error', () => {
    expect(classifyRefFailure({ status: 401, message: 'unauthorized' })).toBe('auth_error')
  })
  test('未知 ref → unknown_reference', () => {
    expect(classifyRefFailure(new Error('unknown provider/model reference: x/y'))).toBe('unknown_reference')
  })
  test('有 status 非 401/403 → api_error_<status>', () => {
    expect(classifyRefFailure({ status: 500, message: 'internal' })).toBe('api_error_500')
    expect(classifyRefFailure({ response: { status: 429 }, message: 'rate limited' })).toBe('api_error_429')
  })
  test('其余 → error', () => {
    expect(classifyRefFailure(new Error('boom'))).toBe('error')
  })
})

describe('0.1.71 A-1 ModelPoolExhaustedError 形状 + 非重试锚', () => {
  test('name/role/failures 字段 + 配额文案', () => {
    const agg = new ModelPoolExhaustedError('premium', [
      { ref: 'p/m1', code: 'quota_exhausted', raw: 'quota' },
      { ref: 'p/m2', code: 'auth_error', raw: 'forbidden' },
    ])
    expect(agg.name).toBe('ModelPoolExhaustedError')
    expect(agg.role).toBe('premium')
    expect(agg.failures).toHaveLength(2)
    expect(agg.message).toContain("role 'premium'")
    expect(agg.message).toContain('p/m1')
    expect(agg.message).toContain('p/m2')
    // 混合分类（含 quota）→ 配额处置建议
    expect(agg.message).toContain('Top up your provider quota')
    // 非 APIError + 无 status/cause（isRetryableError 三判据全 miss）
    expect(agg instanceof APIError).toBe(false)
    expect((agg as any).status).toBeUndefined()
    expect((agg as any).cause).toBeUndefined()
    expect(shouldRetryModelError(agg, undefined)).toBe(false)
  })
  test('纯非配额（无 quota 分类）→ 凭据处置文案', () => {
    const agg = new ModelPoolExhaustedError('small', [{ ref: 'p/m1', code: 'auth_error', raw: 'x' }])
    expect(agg.message).toContain('Check provider credentials')
    expect(agg.message).not.toContain('Top up your provider quota')
  })
})

// ── A-2 403 配额耗尽子型（classifyAPIError + isQuotaExhaustedMessage）─────
describe('0.1.71 A-2 isQuotaExhaustedMessage 签名判别', () => {
  test('quota / pre-consume / insufficient 资源族 → true', () => {
    expect(isQuotaExhaustedMessage('You have exceeded your quota')).toBe(true)
    expect(isQuotaExhaustedMessage('quota limit reached')).toBe(true)
    expect(isQuotaExhaustedMessage('pre-consume failed')).toBe(true)
    expect(isQuotaExhaustedMessage('preconsume rejected')).toBe(true)
    expect(isQuotaExhaustedMessage('insufficient balance')).toBe(true)
    expect(isQuotaExhaustedMessage('insufficient credits')).toBe(true)
  })
  test('非配额签名 / 空 / 非 string → false（泛 403 auth_error 恒等锚）', () => {
    expect(isQuotaExhaustedMessage('forbidden')).toBe(false)
    expect(isQuotaExhaustedMessage('insufficient permissions')).toBe(false) // 权限语境不误命中
    expect(isQuotaExhaustedMessage('')).toBe(false)
    expect(isQuotaExhaustedMessage(null)).toBe(false)
    expect(isQuotaExhaustedMessage(undefined)).toBe(false)
  })
})

describe('0.1.71 A-2 classifyAPIError 403 配额子型', () => {
  test('403 + 配额签名 → quota_exhausted（拆出泛 auth_error 之前）', () => {
    expect(classifyAPIError(new APIError('You have exceeded your quota', 403))).toBe('quota_exhausted')
    expect(classifyAPIError(new APIError('insufficient balance', 403))).toBe('quota_exhausted')
  })
  test('403 非配额 → auth_error（恒等锚保留）', () => {
    expect(classifyAPIError(new APIError('Forbidden', 403))).toBe('auth_error')
  })
  test('401 → auth_error（恒等锚保留）', () => {
    expect(classifyAPIError(new APIError('unauthorized', 401))).toBe('auth_error')
  })
  test('非 403 零扰动：429 配额措辞仍 rate_limit（429 判定先于 403 配额子型）', () => {
    expect(classifyAPIError(new APIError('quota rate limit', 429))).toBe('rate_limit')
  })
})
