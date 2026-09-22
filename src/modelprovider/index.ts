// P5 (docs/06): module-level singleton ModelProvider.
//
// B1 (docs/06 §十一): lazy initialization — importing this module no longer
// instantiates OpenAIProvider or ProviderLifecycle. Embedders control the
// lifecycle: the shared instance is created on first access via
// getModelProvider()/getProviderLifecycle() (or the compat `modelProvider`
// getter used by existing consumers).
//
// STR-1 门面规则：外域只经此门面 import，不深导入内部文件。

import { OpenAIProvider, ProviderLifecycle, type ModelProvider } from './modelprovider'
import { parseBoundedIntEnv } from '../shared'

export { OpenAIProvider, ProviderLifecycle, type ModelProvider, type ProviderStreamEvent } from './modelprovider'
export type { ProviderLifecycleOptions } from './modelprovider'

let _provider: ModelProvider | undefined

/**
 * The single shared provider instance (lazy). Call sites use this rather than
 * constructing their own OpenAIProvider.
 */
export function getModelProvider(): ModelProvider {
  return (_provider ??= new OpenAIProvider(3, resolveLlmTimeoutMs()))
}

/**
 * F3: LLM request timeout (ms), configurable via ATLAS_LLM_TIMEOUT.
 * Default 120_000 equals the previous hardcoded value, so an unset env var means
 * zero behavior change. Capped at 30 min so a stuck/queued gateway can't silently
 * hang a whole session past any sane bound.
 * C1b：解析切 shared parseBoundedIntEnv（min=1 保留旧仓"0 无效"语义）。
 */
function resolveLlmTimeoutMs(): number {
  return parseBoundedIntEnv(
    'ATLAS_LLM_TIMEOUT',
    process.env.ATLAS_LLM_TIMEOUT,
    120_000,
    1_800_000,
    1,
  ).effective
}

function lazyProxy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const obj = resolve() as any
      const v = obj[prop]
      return typeof v === 'function' ? v.bind(obj) : v
    },
  })
}

/**
 * Backward-compat export: property access resolves the lazy singleton.
 * Existing consumers keep `import { modelProvider }` unchanged.
 */
export const modelProvider: ModelProvider = lazyProxy(getModelProvider)

let _lifecycle: ProviderLifecycle | undefined

/**
 * One shared lifecycle manager for the provider (lazy). It polls provider
 * health (liveness ping) and exposes isAlive() for call sites that need a
 * healthy role-model list before making a call. start() is invoked by the
 * host — never at import time.
 */
export function getProviderLifecycle(): ProviderLifecycle {
  return (_lifecycle ??= new ProviderLifecycle(getModelProvider()))
}

/** Backward-compat export (lazy), mirrors `modelProvider`. */
export const providerLifecycle: ProviderLifecycle = lazyProxy(getProviderLifecycle)

// ── 窄面门面导出（仅被外部域实际 import 的符号）──
export {
  API_ERROR_MESSAGE_PREFIX,
  PROMPT_TOO_LONG_ERROR_MESSAGE,
  startsWithApiErrorPrefix,
  categorizeRetryableAPIError,
  getAssistantMessageFromError,
  getErrorMessageIfRefusal,
} from './modelErrors'
export { buildOpenAIParams } from './params'
export { modelToRole, normalizeModelStringForAPI } from './roles'
export { streamAssistant } from './streamAssistant'
export type { CallModelOptions } from './streamAssistant'

export { extractConnectionErrorDetails, formatAPIError, getSSLErrorHint } from './errorUtils'

export { toResponseFormat } from './params'
export {
  getRoleConfig,
  getRoleModel,
  getRoleModels,
  resolveModel,
  MODEL_ROLES,
  type ModelRole,
} from './roles'
export {
  API_TIMEOUT_ERROR_MESSAGE,
  CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE,
  REPEATED_529_ERROR_MESSAGE,
} from './modelErrors'
export {
  CCR_AUTH_ERROR_MESSAGE,
  INVALID_API_KEY_ERROR_MESSAGE,
  INVALID_API_KEY_ERROR_MESSAGE_EXTERNAL,
  ORG_DISABLED_ERROR_MESSAGE_ENV_KEY,
  ORG_DISABLED_ERROR_MESSAGE_ENV_KEY_WITH_OAUTH,
  TOKEN_REVOKED_ERROR_MESSAGE,
  registerErrorMessagingPorts,
  resetErrorMessagingPorts,
  getImageTooLargeErrorMessage,
  getPdfInvalidErrorMessage,
  getPdfPasswordProtectedErrorMessage,
  getPdfTooLargeErrorMessage,
  getRequestTooLargeErrorMessage,
  getTokenRevokedErrorMessage,
  getOauthOrgNotAllowedErrorMessage,
} from './errorMessaging'
export { getModelMeta, getProviderContextWindow } from './capabilities'
export type { EndpointConfigSource } from './ports/endpointConfig'
export { zodToJsonSchema, type JsonSchema7Type } from './schema'
export { queryWithRoleFallback } from './queryWithRoleFallback'
