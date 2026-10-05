/**
 * Provider 域错误消息层 — 从旧仓 modelprovider/errorMessaging.ts 迁入
 *
 * 端口族注册式：环境文案决策点收敛为注册式端口，宿主注册。
 * core 对 services/* 运行时 import = 0。
 *
 * import 适配：
 *  - APIError 类 → 域内 types.ts
 *  - AssistantMessage/Message/UserMessage → shared
 *  - SDKAssistantMessageError → 域内 types.ts（any stub）
 *  - modelErrors 常量 → 域内 modelErrors.ts
 *  - apiLimits/betas 常量 → 域内 constants.ts
 *  - formatFileSize → shared（C1 下沉）
 *  - formatAPIError → 域内 errorUtils.ts
 *  - 端口类型 → 域内 ports/errorMessaging.ts
 */

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from './types'
import type {
  AssistantMessage,
  Message,
  UserMessage,
} from '../shared'
// BR-1（spec §6.2）：品牌触面单一事实源——错误文案品牌字面改经 PRODUCT_BRAND
// （shared 唯一事实源，模型面文案去字面漂移；与 UA 品牌串同一出处纪律）。
import { PRODUCT_BRAND } from '../shared'
import type { SDKAssistantMessageError } from './types'

import {
  API_ERROR_MESSAGE_PREFIX,
  API_TIMEOUT_ERROR_MESSAGE,
  CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE,
  PROMPT_TOO_LONG_ERROR_MESSAGE,
} from './modelErrors'
import { API_PDF_MAX_PAGES, PDF_TARGET_RAW_SIZE } from './constants'
import { AFK_MODE_BETA_HEADER } from './constants'
import { formatFileSize } from '../shared'
import { formatAPIError } from './errorUtils'
import type { ErrorMessagingPorts } from './ports/errorMessaging'

// ── 注册表 ────────────────────────────────────────────────────────────

let ports: ErrorMessagingPorts | undefined

/** 宿主注册端口族（幂等覆盖）。 */
export function registerErrorMessagingPorts(p: ErrorMessagingPorts): void {
  ports = p
}

/** 测试用：清空端口注册。 */
export function resetErrorMessagingPorts(): void {
  ports = undefined
}

function p(): ErrorMessagingPorts {
  if (!ports) {
    throw new Error(
      'ErrorMessagingPorts 未注册：modelprovider 错误消息层需宿主注册端口',
    )
  }
  return ports
}

function opt<K extends keyof ErrorMessagingPorts>(
  key: K,
): ErrorMessagingPorts[K] | undefined {
  return ports?.[key]
}

// ── 文案常量 ──────────────────────────────────────────────────────────

export const INVALID_API_KEY_ERROR_MESSAGE = 'Not logged in · Please run /login'
export const INVALID_API_KEY_ERROR_MESSAGE_EXTERNAL =
  'Invalid API key · Fix external API key'
export const ORG_DISABLED_ERROR_MESSAGE_ENV_KEY_WITH_OAUTH =
  'Your OPENAI_API_KEY belongs to a disabled organization · Unset the environment variable to use your subscription instead'
export const ORG_DISABLED_ERROR_MESSAGE_ENV_KEY =
  'Your OPENAI_API_KEY belongs to a disabled organization · Update or unset the environment variable'
export const TOKEN_REVOKED_ERROR_MESSAGE =
  'OAuth token revoked · Please run /login'
export const CCR_AUTH_ERROR_MESSAGE =
  'Authentication error · This may be a temporary network issue, please try again'
export const OAUTH_ORG_NOT_ALLOWED_ERROR_MESSAGE =
  `Your account does not have access to ${PRODUCT_BRAND}. Please run /login.`

// ── 文案 getter ───────────────────────────────────────────────────────

function isNonInteractive(): boolean {
  return opt('isNonInteractive')?.() ?? false
}

export function getPdfTooLargeErrorMessage(): string {
  const limits = `max ${API_PDF_MAX_PAGES} pages, ${formatFileSize(PDF_TARGET_RAW_SIZE)}`
  return isNonInteractive()
    ? `PDF too large (${limits}). Try reading the file a different way (e.g., extract text with pdftotext).`
    : `PDF too large (${limits}). Double press esc to go back and try again, or use pdftotext to convert to text first.`
}
export function getPdfPasswordProtectedErrorMessage(): string {
  return isNonInteractive()
    ? 'PDF is password protected. Try using a CLI tool to extract or convert the PDF.'
    : 'PDF is password protected. Please double press esc to edit your message and try again.'
}
export function getPdfInvalidErrorMessage(): string {
  return isNonInteractive()
    ? 'The PDF file was not valid. Try converting it to text first (e.g., pdftotext).'
    : 'The PDF file was not valid. Double press esc to go back and try again with a different file.'
}
export function getImageTooLargeErrorMessage(): string {
  return isNonInteractive()
    ? 'Image was too large. Try resizing the image or using a different approach.'
    : 'Image was too large. Double press esc to go back and try again with a smaller image.'
}
export function getRequestTooLargeErrorMessage(): string {
  const limits = `max ${formatFileSize(PDF_TARGET_RAW_SIZE)}`
  return isNonInteractive()
    ? `Request too large (${limits}). Try with a smaller file.`
    : `Request too large (${limits}). Double press esc to go back and try with a smaller file.`
}

export function getTokenRevokedErrorMessage(): string {
  return isNonInteractive()
    ? `Your account does not have access to ${PRODUCT_BRAND}. Please login again or contact your administrator.`
    : TOKEN_REVOKED_ERROR_MESSAGE
}

export function getOauthOrgNotAllowedErrorMessage(): string {
  return isNonInteractive()
    ? `Your organization does not have access to ${PRODUCT_BRAND}. Please login again or contact your administrator.`
    : OAUTH_ORG_NOT_ALLOWED_ERROR_MESSAGE
}

// ── 主解析器 ──────────────────────────────────────────────────────────

type ErrorContext = {
  messages?: Message[]
  messagesForAPI?: (UserMessage | AssistantMessage)[]
}

export function getAssistantMessageFromError(
  error: unknown,
  model: string,
  _options?: ErrorContext,
): AssistantMessage {
  if (isTimeoutError(error)) {
    return createApiErrorMessage({
      content: API_TIMEOUT_ERROR_MESSAGE,
      error: 'unknown',
    })
  }

  const imageResult = opt('resolveImageError')?.(error)
  if (imageResult) {
    return createApiErrorMessage(imageResult)
  }

  if (error instanceof APIError && error.status === 429) {
    const rateLimitResult = opt('resolveRateLimitMessage')?.(error, model)
    if (rateLimitResult) {
      return rateLimitResult
    }
  }

  if (
    error instanceof Error &&
    error.message.toLowerCase().includes('prompt is too long')
  ) {
    return createApiErrorMessage({
      content: PROMPT_TOO_LONG_ERROR_MESSAGE,
      error: 'invalid_request',
      errorDetails: error.message,
    })
  }

  if (
    error instanceof Error &&
    /maximum of \d+ PDF pages/.test(error.message)
  ) {
    return createApiErrorMessage({
      content: getPdfTooLargeErrorMessage(),
      error: 'invalid_request',
      errorDetails: error.message,
    })
  }

  if (
    error instanceof Error &&
    error.message.includes('The PDF specified is password protected')
  ) {
    return createApiErrorMessage({
      content: getPdfPasswordProtectedErrorMessage(),
      error: 'invalid_request',
    })
  }

  if (
    error instanceof Error &&
    error.message.includes('The PDF specified was not valid')
  ) {
    return createApiErrorMessage({
      content: getPdfInvalidErrorMessage(),
      error: 'invalid_request',
    })
  }

  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes('image exceeds') &&
    error.message.includes('maximum')
  ) {
    return createApiErrorMessage({
      content: getImageTooLargeErrorMessage(),
      errorDetails: error.message,
    })
  }

  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes('image dimensions exceed') &&
    error.message.includes('many-image')
  ) {
    return createApiErrorMessage({
      content: isNonInteractive()
        ? 'An image in the conversation exceeds the dimension limit for many-image requests (2000px). Start a new session with fewer images.'
        : 'An image in the conversation exceeds the dimension limit for many-image requests (2000px). Run /compact to remove old images from context, or start a new session.',
      error: 'invalid_request',
      errorDetails: error.message,
    })
  }

  if (
    AFK_MODE_BETA_HEADER &&
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes(AFK_MODE_BETA_HEADER)
  ) {
    return createApiErrorMessage({
      content: 'Auto mode is unavailable for your plan',
      error: 'invalid_request',
    })
  }

  if (error instanceof APIError && error.status === 413) {
    return createApiErrorMessage({
      content: getRequestTooLargeErrorMessage(),
      error: 'invalid_request',
    })
  }

  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes(
      '`tool_use` ids were found without `tool_result` blocks immediately after',
    )
  ) {
    const baseMessage = 'API Error: 400 due to tool use concurrency issues.'
    const rewindInstruction = isNonInteractive()
      ? ''
      : ' Run /rewind to recover the conversation.'
    return createApiErrorMessage({
      content: baseMessage + rewindInstruction,
      error: 'invalid_request',
    })
  }

  if (
    error instanceof APIError &&
    error.status === 400 &&
    error.message.includes('`tool_use` ids must be unique')
  ) {
    const rewindInstruction = isNonInteractive()
      ? ''
      : ' Run /rewind to recover the conversation.'
    return createApiErrorMessage({
      content: `API Error: 400 duplicate tool_use ID in conversation history.${rewindInstruction}`,
      error: 'invalid_request',
      errorDetails: error.message,
    })
  }

  if (
    error instanceof Error &&
    error.message.toLowerCase().includes('invalid model name')
  ) {
    const antOnly = opt('resolveAntOnlyMessage')?.(error, model)
    if (antOnly) {
      return createApiErrorMessage({
        content: antOnly,
        error: 'invalid_request',
      })
    }
  }

  if (
    error instanceof Error &&
    error.message.includes('Your credit balance is too low')
  ) {
    return createApiErrorMessage({
      content: CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE,
      error: 'billing_error',
    })
  }

  if (error instanceof APIError || error instanceof Error) {
    const authResult = opt('resolveAuthErrorMessaging')?.(error, model)
    if (authResult) {
      return authResult
    }
  }

  if (
    error instanceof Error &&
    error.message.toLowerCase().includes('model id')
  ) {
    const switchCmd = isNonInteractive() ? '--model' : '/model'
    return createApiErrorMessage({
      content: `${API_ERROR_MESSAGE_PREFIX} (${model}): ${error.message}. Run ${switchCmd} to pick a different model.`,
      error: 'invalid_request',
    })
  }

  if (error instanceof APIError && error.status === 404) {
    const switchCmd = isNonInteractive() ? '--model' : '/model'
    return createApiErrorMessage({
      content: `There's an issue with the selected model (${model}). It may not exist or you may not have access to it. Run ${switchCmd} to pick a different model.`,
      error: 'invalid_request',
    })
  }

  if (error instanceof APIConnectionError) {
    return createApiErrorMessage({
      content: `${API_ERROR_MESSAGE_PREFIX}: ${formatAPIError(error)}`,
      error: 'unknown',
    })
  }

  if (error instanceof Error) {
    return createApiErrorMessage({
      content: `${API_ERROR_MESSAGE_PREFIX}: ${error.message}`,
      error: 'unknown',
    })
  }
  return createApiErrorMessage({
    content: API_ERROR_MESSAGE_PREFIX,
    error: 'unknown',
  })
}

function isTimeoutError(
  error: unknown,
): error is APIConnectionTimeoutError | APIConnectionError {
  return (
    error instanceof APIConnectionTimeoutError ||
    (error instanceof APIConnectionError &&
      error.message.toLowerCase().includes('timeout'))
  )
}

function createApiErrorMessage(input: {
  content: string
  error?: SDKAssistantMessageError
  errorDetails?: string
}): AssistantMessage {
  return p().createApiErrorMessage(input)
}

export function getErrorMessageIfRefusal(
  stopReason: string | null,
  model: string,
): AssistantMessage | undefined {
  if (stopReason !== 'refusal') {
    return
  }

  const baseMessage =
    opt('resolveRefusalMessage')?.(model) ??
    `${API_ERROR_MESSAGE_PREFIX}: ${PRODUCT_BRAND} is unable to respond to this request, which appears to violate our Usage Policy. Please double press esc to edit your last message or start a new session for Atlas to assist with a different task.`

  return createApiErrorMessage({
    content: baseMessage,
    error: 'invalid_request',
  })
}
