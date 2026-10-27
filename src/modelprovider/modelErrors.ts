/**
 * Provider 域错误分类 — 从旧仓 modelprovider/modelErrors.ts 迁入
 *
 * import 适配：
 *  - APIError/APIConnectionError/APIConnectionTimeoutError/BetaMessage → 域内 types.ts
 *  - SDKAssistantMessageError → 域内 types.ts（any stub）
 *  - extractConnectionErrorDetails → 域内 errorUtils.ts
 */

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from './types'
import type { BetaMessage } from './types'
import type { SDKAssistantMessageError } from './types'
import { extractConnectionErrorDetails } from './errorUtils'
export { extractConnectionErrorDetails } from './errorUtils'

// ---- 错误消息常量 ----

export const API_ERROR_MESSAGE_PREFIX = 'API Error'
export const PROMPT_TOO_LONG_ERROR_MESSAGE = 'Prompt is too long'
export const CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE = 'Credit balance is too low'
export const REPEATED_529_ERROR_MESSAGE = 'Repeated 529 Overloaded errors'
export const API_TIMEOUT_ERROR_MESSAGE = 'Request timed out'

export function startsWithApiErrorPrefix(text: string): boolean {
  return (
    text.startsWith(API_ERROR_MESSAGE_PREFIX) ||
    text.startsWith(`Please run /login · ${API_ERROR_MESSAGE_PREFIX}`)
  )
}

export function isValidAPIMessage(value: unknown): value is BetaMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'content' in value &&
    'model' in value &&
    'usage' in value &&
    Array.isArray((value as BetaMessage).content) &&
    typeof (value as BetaMessage).model === 'string' &&
    typeof (value as BetaMessage).usage === 'object'
  )
}

/**
 * 0.1.71 A-2：403 body 配额耗尽签名判别（quota / pre-consume / insufficient
 * 资源族）。泛 403 auth_error 的细化子型判定源——classifyAPIError 据此把
 * 403 配额耗尽从泛 auth_error 拆出（'quota_exhausted' 子型）；TUI 提示面
 * （apiErrors resolveAuthErrorMessaging，A-3）与 provider 池轮询聚合面
 * （modelprovider classifyRefFailure，A-1）复用同一签名源（单一事实源，三处
 * 判别同源，避免文案/子型漂移）。
 * 纯函数（无 IO）：非 string / 空串 = false；非配额签名 = false（泛 403
 * auth_error 恒等锚，非 403 零扰动）。
 */
export function isQuotaExhaustedMessage(message: unknown): boolean {
  if (typeof message !== 'string' || message.length === 0) return false
  const m = message.toLowerCase()
  if (m.includes('quota')) return true
  if (m.includes('pre-consume') || m.includes('preconsume')) return true
  // insufficient 限定资源/余额语境，避免 "insufficient permissions" 误命中
  // （权限类 403 仍归泛 auth_error 恒等锚）。
  if (/insufficient/.test(m) && /balance|credit|funds|payment|quota|resource|usage/.test(m)) {
    return true
  }
  return false
}

/**
 * 0.1.81 V3-2 K2 #12：400 工具 input schema 拒绝谓词——APIError 400 +
 * "Invalid schema for tool/function <name>" 显式点名文案 → 被拒工具名；
 * 其余 → null。保守：只认显式点名的 schema 拒绝（tools.N.input_schema 类
 * 无名字面不猜索引，剥错工具比不剥更糟）。
 * 消费面：shouldRetryModelError 收窄（schema 拒绝型 400 不可重试——同工具
 * 同 schema 重试必然同败，纯空耗）+ queryAgentLoop 回合 catch 剥除支
 * （剥该工具参数后重跑本回合，防每回合 400 卡死会话）。
 * 纯函数（无 IO）：非 APIError / 非 400 / 文案不点名 = null。
 */
export function parseToolSchemaRejectionError(err: unknown): string | null {
  if (!(err instanceof APIError) || err.status !== 400) return null
  const m = /invalid schema for (?:tool|function) [`'"]?([A-Za-z0-9_.\-]+)[`'"]?/i.exec(
    err.message,
  )
  return m ? m[1] : null
}

export function classifyAPIError(error: unknown): string {
  if (error instanceof Error && error.message === 'Request was aborted.') {
    return 'aborted'
  }

  if (
    error instanceof APIConnectionTimeoutError ||
    (error instanceof APIConnectionError &&
      error.message.toLowerCase().includes('timeout'))
  ) {
    return 'api_timeout'
  }

  if (
    error instanceof Error &&
    error.message.includes(REPEATED_529_ERROR_MESSAGE)
  ) {
    return 'repeated_529'
  }

  if (error instanceof APIError && error.status === 429) {
    return 'rate_limit'
  }

  if (
    error instanceof APIError &&
    (error.status === 529 ||
      error.message?.includes('"type":"overloaded_error"'))
  ) {
    return 'server_overload'
  }

  if (
    error instanceof Error &&
    error.message
      .toLowerCase()
      .includes(PROMPT_TOO_LONG_ERROR_MESSAGE.toLowerCase())
  ) {
    return 'prompt_too_long'
  }

  if (
    error instanceof Error &&
    /maximum of \d+ PDF pages/.test(error.message)
  ) {
    return 'pdf_too_large'
  }

  if (
    error instanceof Error &&
    error.message.includes('The PDF specified is password protected')
  ) {
    return 'pdf_password_protected'
  }

  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes('image exceeds') &&
    error.message.includes('maximum')
  ) {
    return 'image_too_large'
  }

  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes('image dimensions exceed') &&
    error.message.includes('many-image')
  ) {
    return 'image_too_large'
  }

  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes(
      '`tool_use` ids were found without `tool_result` blocks immediately after',
    )
  ) {
    return 'tool_use_mismatch'
  }

  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes('unexpected `tool_use_id` found in `tool_result`')
  ) {
    return 'unexpected_tool_result'
  }

  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes('`tool_use` ids must be unique')
  ) {
    return 'duplicate_tool_use_id'
  }

  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.toLowerCase().includes('invalid model name')
  ) {
    return 'invalid_model'
  }

  if (
    error instanceof Error &&
    error.message
      .toLowerCase()
      .includes(CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE.toLowerCase())
  ) {
    return 'credit_balance_low'
  }

  if (
    error instanceof Error &&
    error.message.toLowerCase().includes('x-api-key')
  ) {
    return 'invalid_api_key'
  }

  if (
    error instanceof APIError &&
    error.status === 403 &&
    error.message.includes('OAuth token has been revoked')
  ) {
    return 'token_revoked'
  }

  if (
    error instanceof APIError &&
    (error.status === 401 || error.status === 403) &&
    error.message.includes(
      'OAuth authentication is currently not allowed for this organization',
    )
  ) {
    return 'oauth_org_not_allowed'
  }

  // 0.1.71 A-2：403 配额耗尽子型（quota / pre-consume / insufficient 资源族，
  // isQuotaExhaustedMessage 单一事实源）——拆出泛 403 auth_error 之前（泛 403
  // auth_error 恒等锚保留；非 403 零扰动；非配额签名 403 仍落下方 auth_error）。
  if (
    error instanceof APIError &&
    error.status === 403 &&
    isQuotaExhaustedMessage(error.message)
  ) {
    return 'quota_exhausted'
  }

  if (
    error instanceof APIError &&
    (error.status === 401 || error.status === 403)
  ) {
    return 'auth_error'
  }

  if (error instanceof APIError) {
    const status = error.status
    if (status >= 500) return 'server_error'
    if (status >= 400) return 'client_error'
  }

  if (error instanceof APIConnectionError) {
    const connectionDetails = extractConnectionErrorDetails(error)
    if (connectionDetails?.isSSLError) {
      return 'ssl_cert_error'
    }
    return 'connection_error'
  }

  return 'unknown'
}

export function categorizeRetryableAPIError(
  error: APIError,
): SDKAssistantMessageError {
  if (
    error.status === 529 ||
    error.message?.includes('"type":"overloaded_error"')
  ) {
    return 'rate_limit'
  }
  if (error.status === 429) {
    return 'rate_limit'
  }
  if (error.status === 401 || error.status === 403) {
    return 'authentication_failed'
  }
  if (error.status !== undefined && error.status >= 408) {
    return 'server_error'
  }
  return 'unknown'
}

export {
  getAssistantMessageFromError,
  getErrorMessageIfRefusal,
} from './errorMessaging'
