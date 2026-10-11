/**
 * C3（0.1.50，工单 §2.1 timeoutlane 活面复实证 → 定因=产品修落码）：
 * openai SDK v7 生成超时错误类族未被 isClientRequestTimeout 识别。
 *
 * 定因（探针实证，openai v7.9.0 + timeout=8000 + 15s 延迟慢端点）：
 *   SDK 超时实例 = APIConnectionTimeoutError 子类实例，但 SDK 的
 *   APIError 构造函数把实例 name 属性置为 'Error'——类名只在
 *   error.constructor.name 上存活：
 *     err.name === 'Error'
 *     err.constructor.name === 'APIConnectionTimeoutError'
 *     err.message === 'Request timed out.'
 *     err.cause = AbortError（code 20）
 *   本仓 isClientRequestTimeout 旧门 = 本仓 APIConnectionTimeoutError
 *   instanceof（SDK 实例非本仓类 → 不中）+ 实例 name 判别（'Error' →
 *   不中）→ 双漏 → 滑入 isRetryableError /timeout/i 正则（message 命中）
 *   误判可重试 → 每 entry 3 次整段重生成（4 refs × 3 = 12-call 吸收
 *   ≈96s，e2e 观察 90021ms）+ llmTimeoutRemediationHint 门控同一漏点
 *   返 null → 超时终态行不现形（#260 fail-fast 语义回归；10-04 PASS
 *   签名 8159ms/1 call = 产品曾现形终态）。
 *
 * 修后契约（本文件判别口径，修前红 → 修后绿）：
 *   isClientRequestTimeout 认 constructor.name 超时类族（SDK 实例形状
 *   下类名的唯一承载位）→ fail-fast 恢复（每 entry 1 次）+ remediation
 *   终态行现形。
 *
 * 零回归（工单 §2.1：FX-36 超时面三态判据（resolver cap）不变；不改
 * resolver cap）：
 *   ⑤ 本仓自有类族识别/fail-fast 不变（修前绿面保留）
 *   ⑥ SDK 形状连接错误（APIConnectionError + cause ECONNRESET）不
 *     误判超时 + cause 链仍判可重试（#271 #4 面保留）
 *   ⑦ SDK 形状非超时 APIError（status 404）不误判超时 + 不重试
 *   ⑧ 用户主动 abort（aborted signal）不重试（signal 门先行）
 *   ⑨ 无类载体 plain object 不误判（ctor-name 判别仅认超时类族名）
 *
 * 分层纪律：纯谓词（零网络 / 零盘 / 零 gateway）；SDK 实例形状经同名
 * 本地影子类复刻（constructor.name 承载 SDK 类名 + 实例 name='Error'
 * 复刻 SDK APIError ctor 行为），不引真 SDK。L3 门面 import。
 */
import { describe, test, expect } from 'bun:test'
import {
  isClientRequestTimeout,
  shouldRetryModelError,
  llmTimeoutRemediationHint,
  APIConnectionTimeoutError as RepoApiConnectionTimeoutError,
} from '../../src/modelprovider'

// ── openai SDK v7 超时实例形状复刻（探针形状，类名必须 = SDK 类名）────
class APIConnectionTimeoutError extends Error {
  declare cause: unknown
  constructor(message = 'Request timed out.') {
    super(message)
    this.name = 'Error' // SDK APIError ctor 行为（类名仅存于 constructor.name）
    this.cause = Object.assign(new Error('The operation was aborted.'), {
      name: 'AbortError',
      code: 20,
    })
  }
}
class APITimeoutError extends Error {
  constructor(message = 'Request timed out.') {
    super(message)
    this.name = 'Error'
  }
}

describe('C3 SDK 生成超时类族：isClientRequestTimeout 识别（0.1.50 §2.1）', () => {
  test('① SDK 形状 APIConnectionTimeoutError（name=Error / ctor=APIConnectionTimeoutError）→ 判客户端超时', () => {
    expect(isClientRequestTimeout(new APIConnectionTimeoutError())).toBe(true)
  })

  test('② SDK 形状 APITimeoutError 命名变体 → 判客户端超时', () => {
    expect(isClientRequestTimeout(new APITimeoutError())).toBe(true)
  })

  test('③ SDK 形状超时 → fail-fast 不重试（修前：/timeout/i 正则误判可重试 → 12-call 吸收）', () => {
    expect(shouldRetryModelError(new APIConnectionTimeoutError(), undefined)).toBe(false)
  })

  test('④ SDK 形状超时 → remediation 提示面现形（修前：门控同一漏点 → null = 超时终态不现形）', () => {
    const h = llmTimeoutRemediationHint(new APIConnectionTimeoutError(), 8_000)
    expect(h).not.toBeNull()
    expect(h).toContain('ATLAS_LLM_TIMEOUT')
    expect(h).toContain('llmTimeoutMs')
  })
})

describe('C3 零回归守卫（FX-36 三态判据不变 / 连接期仍重试 / 类族不误判）', () => {
  test('⑤ 本仓自有 APIConnectionTimeoutError 族：识别 + fail-fast 不变（修前绿面保留）', () => {
    const repo = new RepoApiConnectionTimeoutError('Request timed out.')
    expect(isClientRequestTimeout(repo)).toBe(true)
    expect(shouldRetryModelError(repo, undefined)).toBe(false)
  })

  test('⑥ SDK 形状连接错误（APIConnectionError + cause ECONNRESET）→ 不误判超时 + cause 链仍重试', () => {
    class APIConnectionError extends Error {
      declare cause: unknown
      constructor() {
        super('Connection error.')
        this.name = 'Error'
        this.cause = Object.assign(new Error('read ECONNRESET'), {
          name: 'ECONNRESET',
          code: 'ECONNRESET',
        })
      }
    }
    const e = new APIConnectionError()
    expect(isClientRequestTimeout(e)).toBe(false)
    expect(shouldRetryModelError(e, undefined)).toBe(true)
  })

  test('⑦ SDK 形状非超时 APIError（status 404）→ 不误判超时 + 不重试', () => {
    class APIError extends Error {
      status?: number
      constructor() {
        super('Not Found')
        this.name = 'Error'
        this.status = 404
      }
    }
    expect(isClientRequestTimeout(new APIError())).toBe(false)
    expect(shouldRetryModelError(new APIError(), undefined)).toBe(false)
  })

  test('⑧ 用户主动 abort（aborted signal）→ 不重试（signal 门先行于错误形状）', () => {
    const ac = new AbortController()
    ac.abort()
    expect(shouldRetryModelError(new APIConnectionTimeoutError(), ac.signal)).toBe(false)
  })

  test('⑨ 无类载体 plain object → 不误判（ctor-name 判别仅认超时类族名，非任意构造器）', () => {
    expect(isClientRequestTimeout({ message: 'Request timed out.' })).toBe(false)
  })
})
