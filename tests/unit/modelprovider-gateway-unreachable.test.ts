/**
 * P0b③ 网关不可达给方向不给 mood（docs/tui-differentiation-spec.md §4 P0b 门禁③）。
 *
 * 被测：gatewayUnreachableRemediationHint（modelprovider 纯 leaf，llmTimeoutRemediationHint
 * 姊妹）。LLM 端点连接失败 → 精确串「IFF 不可达：已切人工确认 —— /doctor 排查」（S-C
 * 三锚点 gwDown/gwManual/gwDoctor）；超时 / 用户 abort / 拿到 HTTP 状态（网关可达的
 * 业务·鉴权错误）/ 非连接错误 → null（零行为变更）。
 *
 * 判别点：SDK APIConnectionError（"Connection error." 固定文案）+ 网络层 errno
 * （message 或 error.cause.code 上，覆盖 loop-robustness #4 ECONNRESET 链盲区）。
 * 分层纪律：纯函数错误分类（无网络/无盘/无 PTY）。
 */
import { describe, test, expect } from 'bun:test'
import {
  gatewayUnreachableRemediationHint,
  llmTimeoutRemediationHint,
} from '../../src/modelprovider'

const GATEWAY_HINT = 'IFF 不可达：已切人工确认 —— /doctor 排查'

describe('P0b③ gatewayUnreachableRemediationHint 错误分类', () => {
  describe('命中 → 返回精确串（S-C 三锚点）', () => {
    test('SDK APIConnectionError（openai "Connection error." 文案）', () => {
      const hint = gatewayUnreachableRemediationHint({
        name: 'APIConnectionError',
        message: 'Connection error.',
      })
      expect(hint).toBe(GATEWAY_HINT)
    })
    test('仅 message === "Connection error."（无名变体）', () => {
      expect(gatewayUnreachableRemediationHint({ message: 'Connection error.' })).toBe(
        GATEWAY_HINT,
      )
    })
    test('网络 errno 在 message 上（fetch failed）', () => {
      expect(gatewayUnreachableRemediationHint({ message: 'fetch failed' })).toBe(
        GATEWAY_HINT,
      )
    })
    test('网络 errno 在 error.cause.code 上（ECONNRESET 链，loop-robustness #4 盲区）', () => {
      const hint = gatewayUnreachableRemediationHint({
        message: 'request to https://gateway failed',
        cause: { code: 'ECONNRESET' },
      })
      expect(hint).toBe(GATEWAY_HINT)
    })
  })

  describe('不命中 → null（零行为变更）', () => {
    test('生成超时 → 归 llmTimeout 面（不叠加误导）', () => {
      const timeoutErr = { name: 'APITimeoutError', message: 'Request timed out.' }
      expect(gatewayUnreachableRemediationHint(timeoutErr)).toBeNull()
      // 对照：llmTimeout 面确实认这类（两提示分工不重叠）
      expect(llmTimeoutRemediationHint(timeoutErr)).not.toBeNull()
    })
    test('用户主动 abort（AbortError）→ 非网关不可达', () => {
      expect(gatewayUnreachableRemediationHint({ name: 'AbortError', message: 'aborted' })).toBeNull()
      expect(
        gatewayUnreachableRemediationHint({ name: 'APIUserAbortError', message: 'aborted' }),
      ).toBeNull()
    })
    test('HTTP 5xx（拿到状态 = 网关可达，业务错误）', () => {
      expect(
        gatewayUnreachableRemediationHint({ name: 'APIError', message: 'Internal Server Error', status: 500 }),
      ).toBeNull()
    })
    test('HTTP 401 鉴权（网关可达）', () => {
      expect(
        gatewayUnreachableRemediationHint({ message: 'Unauthorized', status: 401 }),
      ).toBeNull()
    })
    test('非连接错误 → null', () => {
      expect(gatewayUnreachableRemediationHint({ message: 'model returned empty' })).toBeNull()
    })
    test('null / 非对象 → null', () => {
      expect(gatewayUnreachableRemediationHint(null)).toBeNull()
      expect(gatewayUnreachableRemediationHint('plain string')).toBeNull()
      expect(gatewayUnreachableRemediationHint(undefined)).toBeNull()
    })
  })
})
