/**
 * #271 #4（2026-10-04，e2e loop-robustness「drop 断连穿越」判据）：
 * 连接重置不重试 → 重试门检索面缺 cause 链。
 *
 * 根因 = openai SDK APIConnectionError 顶层 message 是固定文案
 * "Connection error."（无 errno 子串），连接期 errno（ECONNRESET 等）在
 * error.cause.code 上；旧 isRetryableError 只查顶层 message/code → drop
 * 断连判「不可重试」直接穿越给用户（e2e drop 场景 FAIL）。
 *
 * 判别点（修后应全绿，修前 ①②③ 红）：
 * ① SDK 形状（name + 顶层固定文案 + cause.code=ECONNRESET）→ 可重试
 * ② name 面（裸 { name: 'APIConnectionError' }，无 cause）→ 可重试
 * ③ cause.message='fetch failed'（undici FetchError 形状）→ 可重试
 * ④⑤ #260 超时 fail-fast 不回归（APIConnectionTimeoutError/APITimeoutError
 *    族仍 false——连接期扩面不得把生成超时拉回 3× 整段重生成）
 * ⑥ HTTP 状态面语义不变（429/5xx 重试 / 403 不重试）
 *
 * 分层纪律：纯谓词（无网络 / 无盘 / 无 gateway）。L3 门面 import。
 */
import { describe, test, expect } from 'bun:test'
import {
  shouldRetryModelError,
  APIConnectionTimeoutError,
} from '../../src/modelprovider'

describe('#271 #4 连接重置重试门 cause 链检索面', () => {
  test('① SDK 形状：顶层固定文案 + cause.code=ECONNRESET → 可重试（修前红=本缺陷）', () => {
    // openai SDK APIConnectionError 形状：顶层 message 固定 "Connection error."，
    // errno 在 cause（undici Error）.code 上
    const sdkShape = {
      name: 'APIConnectionError',
      message: 'Connection error.',
      cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
    }
    expect(shouldRetryModelError(sdkShape, undefined)).toBe(true)
  })
  test('② name 面：裸 APIConnectionError（无 cause，errno 不可见）→ 连接期 = 可重试', () => {
    expect(
      shouldRetryModelError({ name: 'APIConnectionError', message: 'Connection error.' }, undefined),
    ).toBe(true)
  })
  test('③ undici FetchError 形状：cause.message="fetch failed" → 可重试', () => {
    const fetchShape = Object.assign(new Error('fetch failed'), {
      cause: new Error('fetch failed'),
    })
    expect(shouldRetryModelError(fetchShape, undefined)).toBe(true)
  })
  test('④ #260 超时 fail-fast 不回归：本仓 APIConnectionTimeoutError 仍不重试', () => {
    expect(
      shouldRetryModelError(new APIConnectionTimeoutError('Request timed out.'), undefined),
    ).toBe(false)
  })
  test('⑤ #260 超时 fail-fast 不回归：openai SDK APITimeoutError 命名变体仍不重试', () => {
    expect(
      shouldRetryModelError({ name: 'APITimeoutError', message: 'Request timed out.' }, undefined),
    ).toBe(false)
  })
  test('⑥ HTTP 状态面语义不变（429/5xx 重试 / 403 不重试）', () => {
    expect(shouldRetryModelError({ status: 429 }, undefined)).toBe(true)
    expect(shouldRetryModelError({ status: 503 }, undefined)).toBe(true)
    expect(shouldRetryModelError({ status: 403 }, undefined)).toBe(false)
  })
  test('⑦ 用户主动 abort 不重试（aborted signal 门，#260 旧判别保留；扩面不得绕过）', () => {
    const ac = new AbortController()
    ac.abort()
    expect(
      shouldRetryModelError({ name: 'APIUserAbortError', message: 'Request was aborted.' }, ac.signal),
    ).toBe(false)
  })
})
