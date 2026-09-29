// Atlas — API 错误处理宿主（P6-1 自 services/api/errors.ts 迁入）。
// 职责（与旧 errors.ts 一致，仅删除已清零的兼容 re-export 块）：
//   1. 端口注册：模块加载时把环境文案决策实现注册进 core（消费方 import 本文件
//      → 模块体先于解析器调用执行）
//   2. PTL/media 谓词（isPromptTooLongMessage 族）：实现留宿主（纯函数，B2b 范围外）
//   3. 薄转发：主解析器走 core 版（签名不变）
// 不迁入 utils/messages.ts 的原因：r3/r4-errors 等 coverage-attack 测试以本模块为
// 测试目标并 mock 掉 messages.js——若迁入 messages.ts，测试目标会被自身 mock 吞掉。

import { APIError } from '../types/atlas.js'
import type { BetaStopReason } from '../types/atlas.js'
import type {
  AssistantMessage,
  Message,
  UserMessage,
} from 'src/tui/types/message.js'
import {
  getAtlasApiKeyWithSource,
  getOAuthTokens,
} from './auth.js'
import {
  createAssistantAPIErrorMessage,
  NO_RESPONSE_REQUESTED,
} from './messages.js'
import { getIsNonInteractiveSession } from 'src/bootstrap'
import { isEnvTruthy } from './envUtils.js'
import { ImageResizeError } from './imageResizer.js'
import { ImageSizeError } from './imageValidation.js'
import {
  API_ERROR_MESSAGE_PREFIX,
  PROMPT_TOO_LONG_ERROR_MESSAGE,
} from 'src/modelprovider'
import {
  INVALID_API_KEY_ERROR_MESSAGE,
  INVALID_API_KEY_ERROR_MESSAGE_EXTERNAL,
  ORG_DISABLED_ERROR_MESSAGE_ENV_KEY,
  ORG_DISABLED_ERROR_MESSAGE_ENV_KEY_WITH_OAUTH,
  CCR_AUTH_ERROR_MESSAGE,
  registerErrorMessagingPorts,
  getImageTooLargeErrorMessage,
  getPdfInvalidErrorMessage,
  getPdfPasswordProtectedErrorMessage,
  getPdfTooLargeErrorMessage,
  getRequestTooLargeErrorMessage,
  getTokenRevokedErrorMessage,
  getOauthOrgNotAllowedErrorMessage,
  getAssistantMessageFromError as coreGetAssistantMessageFromError,
  getErrorMessageIfRefusal as coreGetErrorMessageIfRefusal,
} from 'src/modelprovider'

// ── PTL / media 谓词（实现留宿主：纯函数，消费 messages 类型，B2b 范围外）────

export function isPromptTooLongMessage(msg: AssistantMessage): boolean {
  if (!msg.isApiErrorMessage) {
    return false
  }
  const content = msg.message.content
  if (!Array.isArray(content)) {
    return false
  }
  return content.some(
    block =>
      block.type === 'text' &&
      block.text.startsWith(PROMPT_TOO_LONG_ERROR_MESSAGE),
  )
}

export function parsePromptTooLongTokenCounts(rawMessage: string): {
  actualTokens: number | undefined
  limitTokens: number | undefined
} {
  const match = rawMessage.match(
    /prompt is too long[^0-9]*(\d+)\s*tokens?\s*>\s*(\d+)/i,
  )
  return {
    actualTokens: match ? parseInt(match[1]!, 10) : undefined,
    limitTokens: match ? parseInt(match[2]!, 10) : undefined,
  }
}

export function getPromptTooLongTokenGap(
  msg: AssistantMessage,
): number | undefined {
  if (!isPromptTooLongMessage(msg) || !msg.errorDetails) {
    return undefined
  }
  const { actualTokens, limitTokens } = parsePromptTooLongTokenCounts(
    msg.errorDetails,
  )
  if (actualTokens === undefined || limitTokens === undefined) {
    return undefined
  }
  const gap = actualTokens - limitTokens
  return gap > 0 ? gap : undefined
}

export function isMediaSizeError(raw: string): boolean {
  return (
    (raw.includes('image exceeds') && raw.includes('maximum')) ||
    (raw.includes('image dimensions exceed') && raw.includes('many-image')) ||
    /maximum of \d+ PDF pages/.test(raw)
  )
}

export function isMediaSizeErrorMessage(msg: AssistantMessage): boolean {
  return (
    msg.isApiErrorMessage === true &&
    msg.errorDetails !== undefined &&
    isMediaSizeError(msg.errorDetails)
  )
}

// ── 端口注册（core 解析器的环境文案决策实现，模块加载时自注册）─────────────
// 时序保证：消费方 import 本文件 → 本文件模块体先于任何解析器调用执行。

registerErrorMessagingPorts({
  createApiErrorMessage: createAssistantAPIErrorMessage,

  // image/document 错误类（API 调用前校验阶段抛出）
  resolveImageError: error => {
    if (error instanceof ImageSizeError || error instanceof ImageResizeError) {
      return { content: getImageTooLargeErrorMessage() }
    }
    return undefined
  },

  // 429 限流：非 quota 文案决策（quota 头解析随商务簇删除）
  resolveRateLimitMessage: (error, model) => {
    // No quota headers — NOT a quota limit. Surface what the API actually said.
    if (error.message.includes('Extra usage is required for long context')) {
      const hint = getIsNonInteractiveSession()
        ? 'use --model to switch to standard context'
        : 'run /model to switch to standard context'
      return createAssistantAPIErrorMessage({
        content: `${API_ERROR_MESSAGE_PREFIX}: Extra usage is required for 1M context · ${hint}`,
        error: 'rate_limit',
      })
    }
    const stripped = error.message.replace(/^429\s+/, '')
    const innerMessage = stripped.match(/"message"\s*:\s*"([^"]*)"/)?.[1]
    const detail = innerMessage || stripped
    return createAssistantAPIErrorMessage({
      content: `${API_ERROR_MESSAGE_PREFIX}: Request rejected (429) · ${detail || 'this may be a temporary capacity issue — check the provider status page'}`,
      error: 'rate_limit',
    })
  },

  // （invalid model name → ANT-ONLY/订阅者 premium 文案端口已随 D1/P6 删除；
  //  端口可选，core getAssistantMessageFromError 内 invalid-model 判定落回通用分支）

  // auth/CCR/org-disabled/x-api-key/token-revoked/oauth-org-not-allowed/通用 401/403
  resolveAuthErrorMessaging: (error, _model) => {
    // Organization has been disabled — stale OPENAI_API_KEY case
    if (
      error instanceof APIError &&
      error.status === 400 &&
      error.message.toLowerCase().includes('organization has been disabled')
    ) {
      const { source } = getAtlasApiKeyWithSource()
      if (
        source === 'OPENAI_API_KEY' &&
        process.env.OPENAI_API_KEY
      ) {
        const hasStoredOAuth = getOAuthTokens()?.accessToken != null
        return createAssistantAPIErrorMessage({
          error: 'invalid_request',
          content: hasStoredOAuth
            ? ORG_DISABLED_ERROR_MESSAGE_ENV_KEY_WITH_OAUTH
            : ORG_DISABLED_ERROR_MESSAGE_ENV_KEY,
        })
      }
      return undefined
    }

    // x-api-key → CCR 或外部 key 提示
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes('x-api-key')
    ) {
      if (isCCRMode()) {
        return createAssistantAPIErrorMessage({
          error: 'authentication_failed',
          content: CCR_AUTH_ERROR_MESSAGE,
        })
      }
      const { source } = getAtlasApiKeyWithSource()
      const isExternalSource =
        source === 'OPENAI_API_KEY' || source === 'apiKeyHelper'
      return createAssistantAPIErrorMessage({
        error: 'authentication_failed',
        content: isExternalSource
          ? INVALID_API_KEY_ERROR_MESSAGE_EXTERNAL
          : INVALID_API_KEY_ERROR_MESSAGE,
      })
    }

    // OAuth token revoked
    if (
      error instanceof APIError &&
      error.status === 403 &&
      error.message.includes('OAuth token has been revoked')
    ) {
      return createAssistantAPIErrorMessage({
        error: 'authentication_failed',
        content: getTokenRevokedErrorMessage(),
      })
    }

    // OAuth org not allowed
    if (
      error instanceof APIError &&
      (error.status === 401 || error.status === 403) &&
      error.message.includes(
        'OAuth authentication is currently not allowed for this organization',
      )
    ) {
      return createAssistantAPIErrorMessage({
        error: 'authentication_failed',
        content: getOauthOrgNotAllowedErrorMessage(),
      })
    }

    // Generic 401/403
    if (
      error instanceof APIError &&
      (error.status === 401 || error.status === 403)
    ) {
      if (isCCRMode()) {
        return createAssistantAPIErrorMessage({
          error: 'authentication_failed',
          content: CCR_AUTH_ERROR_MESSAGE,
        })
      }
      return createAssistantAPIErrorMessage({
        error: 'authentication_failed',
        content: getIsNonInteractiveSession()
          ? `Failed to authenticate. ${API_ERROR_MESSAGE_PREFIX}: ${error.message}`
          : `Please run /login · ${API_ERROR_MESSAGE_PREFIX}: ${error.message}`,
      })
    }

    return undefined
  },

  // 交互/SDK 文案变体开关
  isNonInteractive: getIsNonInteractiveSession,

  // refusal 文案（交互/SDK 双变体，原 getErrorMessageIfRefusal 文案部分）
  resolveRefusalMessage: model => {
    void model
    return getIsNonInteractiveSession()
      ? `${API_ERROR_MESSAGE_PREFIX}: AtlasHarness is unable to respond to this request, which appears to violate our Usage Policy. Try rephrasing the request or attempting a different approach.`
      : `${API_ERROR_MESSAGE_PREFIX}: AtlasHarness is unable to respond to this request, which appears to violate our Usage Policy. Please double press esc to edit your last message or start a new session for Atlas to assist with a different task.`
  },
})

function isCCRMode(): boolean {
  return isEnvTruthy(process.env.ATLAS_REMOTE)
}

// ── 薄转发：主解析器走 core 版（签名不变，消费方零改动）────────────────────

export function getAssistantMessageFromError(
  error: unknown,
  model: string,
  options?: {
    messages?: Message[]
    messagesForAPI?: (UserMessage | AssistantMessage)[]
  },
): AssistantMessage {
  return coreGetAssistantMessageFromError(error, model, options)
}

export function getErrorMessageIfRefusal(
  stopReason: BetaStopReason | null,
  model: string,
): AssistantMessage | undefined {
  return coreGetErrorMessageIfRefusal(stopReason, model)
}

// media/PDF/请求体过大等固定文案生成器（core 实现的薄转发，r4-errors 测试目标）
export {
  getImageTooLargeErrorMessage,
  getOauthOrgNotAllowedErrorMessage,
  getPdfInvalidErrorMessage,
  getPdfPasswordProtectedErrorMessage,
  getPdfTooLargeErrorMessage,
  getRequestTooLargeErrorMessage,
  getTokenRevokedErrorMessage,
} from 'src/modelprovider'
