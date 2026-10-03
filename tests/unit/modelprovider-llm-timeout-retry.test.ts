/**
 * #260 P0（斗兽棋主循环 "Request timed out" 回合终止，2026-10-03）：
 * 生成超时 fail-fast 重试门 + remediation 提示面判别单测（修波第 2 切片）。
 *
 * 判别点 = 旧 isRetryableError /timeout/ 正则命中生成超时 → 3× 整段长生成
 * 重做（≈4m5s 观察值）；新门 shouldRetryModelError 对 APITimeoutError 族
 * fail-fast（连接期 ECONN/429/5xx 仍重试）。提示面 llmTimeoutRemediationHint
 * 供 REPL 错误行消费（非超时 → null）。
 *
 * 分层纪律：纯谓词（无网络 / 无盘 / 无 gateway）。L3 门面 import。
 */
import { describe, test, expect } from 'bun:test'
import {
  isClientRequestTimeout,
  shouldRetryModelError,
  llmTimeoutRemediationHint,
  APIConnectionTimeoutError,
} from '../../src/modelprovider'

describe('#260 生成超时 fail-fast 重试门（判别点 = 旧 /timeout/ 正则命中）', () => {
  test('⑬ isClientRequestTimeout 判别面', () => {
    expect(isClientRequestTimeout(new APIConnectionTimeoutError('Request timed out.'))).toBe(true)
    // openai SDK APITimeoutError 实例面（name 判别兜底）
    expect(isClientRequestTimeout({ name: 'APITimeoutError', message: 'Request timed out.' })).toBe(true)
    expect(isClientRequestTimeout(new Error('fetch failed'))).toBe(false)
    expect(isClientRequestTimeout({ name: 'APIConnectionError', message: 'Connection error.' })).toBe(false)
    expect(isClientRequestTimeout({})).toBe(false)
    expect(isClientRequestTimeout(null)).toBe(false)
  })
  test('⑭ 生成超时不重试（fail-fast；旧门 isRetryableError 会命中 /timeout/ → 3× 整段重生成）', () => {
    const timeoutErr = new APIConnectionTimeoutError('Request timed out.')
    expect(shouldRetryModelError(timeoutErr, undefined)).toBe(false)
  })
  test('⑮ 连接期错误（ECONN / fetch failed / 429 / 5xx）仍重试（判别保留）', () => {
    expect(shouldRetryModelError({ message: 'fetch failed' }, undefined)).toBe(true)
    expect(shouldRetryModelError({ message: 'socket hang up' }, undefined)).toBe(true)
    expect(shouldRetryModelError({ status: 429 }, undefined)).toBe(true)
    expect(shouldRetryModelError({ status: 503 }, undefined)).toBe(true)
    // 旧 isRetryableError 语义保留：400 可重试（既有行为，#260 不改）；
    // 判别非重试 = 403（无权限，重发无意义）
    expect(shouldRetryModelError({ status: 400 }, undefined)).toBe(true)
    expect(shouldRetryModelError({ status: 403 }, undefined)).toBe(false)
  })
  test('⑯ aborted signal 不重试（旧判别保留）', () => {
    const ac = new AbortController()
    ac.abort()
    expect(shouldRetryModelError({ message: 'fetch failed' }, ac.signal)).toBe(false)
  })
})

describe('#260 llmTimeoutRemediationHint 提示面（REPL 错误行消费）', () => {
  test('⑰ 非超时错误 → null（不打扰非超时错误行）', () => {
    expect(llmTimeoutRemediationHint(new Error('fetch failed'), 600_000)).toBeNull()
    expect(llmTimeoutRemediationHint(undefined)).toBeNull()
  })
  test('⑱ 超时错误 → 提示含修复旋钮（当前值 + env / settings 双旋钮）', () => {
    const h = llmTimeoutRemediationHint(new APIConnectionTimeoutError('Request timed out.'), 600_000)
    expect(h).not.toBeNull()
    expect(h).toContain('ATLAS_LLM_TIMEOUT')
    expect(h).toContain('llmTimeoutMs')
    expect(h).toContain('600s')
  })
  test('⑲ 未给当前值 → 提示不造数字（不假绿）', () => {
    const h = llmTimeoutRemediationHint({ name: 'APITimeoutError', message: 'Request timed out.' })
    expect(h).not.toBeNull()
    expect(h).not.toContain('600s')
  })
})

