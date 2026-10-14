// P5 (docs/06): module-level singleton ModelProvider.
//
// B1 (docs/06 §十一): lazy initialization — importing this module no longer
// instantiates OpenAIProvider. The shared instance is created on first access
// via getModelProvider() (or the compat `modelProvider` getter).
// （ProviderLifecycle / getProviderLifecycle 已裁，§8.74.30 S1。）
//
// STR-1 门面规则：外域只经此门面 import，不深导入内部文件。

import { OpenAIProvider, type ModelProvider, describeEndpointFailure } from './modelprovider'
import { LLM_TIMEOUT_CAP_MS, LLM_TIMEOUT_DEFAULT_MS } from './constants'
import { parseBoundedIntEnv, logForDebugging } from '../shared'
import { resolveModel, getRoleConfig } from './roles'
import { llmTimeoutUnitHint } from './modelprovider'
export { LLM_TIMEOUT_DEFAULT_MS, LLM_TIMEOUT_CAP_MS, LLM_TIMEOUT_UNIT_WARN_THRESHOLD_MS } from './constants'

export {
  OpenAIProvider,
  modelRetryBackoffMs,
  MODEL_RETRY_BACKOFF_BASE_MS,
  MODEL_RETRY_BACKOFF_CAP_MS,
  type ModelProvider,
  type ProviderStreamEvent,
  type StreamDelta,
  type StreamEvent,
  type ModelRetryBackoffOptions,
} from './modelprovider'

let _provider: ModelProvider | undefined
// 0.1.67 A-2：单位误配提示一次性守卫（每进程至多 warn 一次，不阻断）。
let _llmTimeoutUnitHintWarned = false

/**
 * The single shared provider instance (lazy). Call sites use this rather than
 * constructing their own OpenAIProvider.
 */
export function getModelProvider(): ModelProvider {
  _provider ??= new OpenAIProvider(
    3,
    // #262 缺口③：第二参仅兜底（resolver 缺省时用）；第三参 = 活态读器，每次
    // 请求现读 resolveLlmTimeoutMs(env, settings 源缝)——settings 源缝
    // （TUI wireContextHostPorts / headless createCoreDependencies 注）注入或
    // 值变 / env 翻转后即时生效，非构造期一次性快照（修 llmTimeoutMs 死键 +
    // TUI 提示面 getCurrentLlmTimeoutMs 现读 vs provider 快照 两车道分裂）。
    LLM_TIMEOUT_DEFAULT_MS,
    () => resolveLlmTimeoutMs(process.env.ATLAS_LLM_TIMEOUT, llmTimeoutSettingsSource?.()),
  )
  // 0.1.67 A-2：构造期一次性单位误配提示（stderr/debug，不阻断）。构造期
  // settings 源缝可能未注（host 后注）→ 此 warn = best-effort（reactive 面 =
  // A-3 错误行经 getCurrentLlmTimeoutMs 现读恒正确）。
  if (!_llmTimeoutUnitHintWarned) {
    _llmTimeoutUnitHintWarned = true
    const hint = llmTimeoutUnitHint(
      resolveLlmTimeoutMs(process.env.ATLAS_LLM_TIMEOUT, llmTimeoutSettingsSource?.()),
    )
    if (hint) logForDebugging(hint, { level: 'warn' })
  }
  return _provider
}

// #260 P0（2026-10-03 斗兽棋 "Request timed out"）：LLM 请求超时 settings
// 源注入缝（autoCompactWindow settings 源缝先例）：宿主 contextHostWiring
// 注 getInitialSettings().llmTimeoutMs 读侧；未注 = 无 settings 档。
// env ATLAS_LLM_TIMEOUT 恒胜此缝（显式 CLI/env > 持久化 settings）。
type LlmTimeoutSettingsSource = (() => number | undefined) | null
let llmTimeoutSettingsSource: LlmTimeoutSettingsSource = null

export function setLlmTimeoutSettingsSource(next: LlmTimeoutSettingsSource): void {
  llmTimeoutSettingsSource = next
}

/** 当前生效的 LLM 请求超时（ms）：env 胜 settings 源缝 胜 缺省（纯读，不构造单例）。 */
export function getCurrentLlmTimeoutMs(): number {
  return resolveLlmTimeoutMs(process.env.ATLAS_LLM_TIMEOUT, llmTimeoutSettingsSource?.())
}

/**
 * 0.1.64 PR2（去 IFF 硬编码）：当前端点失败描述（复合逻辑）。
 *
 * 读 endpoint config source 取主循环模型 baseURL → describeEndpointFailure 复合分类
 * （本地端口 / 云 provider / 通用 host / 缺省 'LLM 端点'）。仿 getCurrentLlmTimeoutMs()
 * 模式（纯读，不构造单例）。REPL catch 块调本函数传参给 gatewayUnreachableRemediationHint。
 *
 * modelRef 给定且可解析 → resolveModel(ref).baseURL；不可解析或缺失 →
 * getRoleConfig('small').baseURL（主循环缺省 small 角色）；仍无 → 'LLM 端点'。
 */
export function getCurrentEndpointLabel(modelRef?: string): string {
  let baseURL: string | undefined
  if (modelRef) {
    const resolved = resolveModel(modelRef)
    if (resolved?.baseURL) baseURL = resolved.baseURL
  }
  if (!baseURL) {
    baseURL = getRoleConfig('small').baseURL
  }
  return describeEndpointFailure(baseURL)
}

/**
 * 测试 seam：注入 fake ModelProvider 替代 lazy `new OpenAIProvider(...)`
 * （B6-func 非流式/流式 completion 双腿断言用，§8.13 L-2）。fake 实现
 * ModelProvider 接口返固定 completion（非 fake transport，不 mock openai 客户端）。
 * getModelProvider()/modelProvider lazy proxy 均读此 seam。
 */
export function setModelProviderForTesting(provider: ModelProvider): void {
  _provider = provider
}

/** 测试复位（teardown 用）：清掉注入，恢复 lazy 构造语义。 */
export function resetModelProviderForTesting(): void {
  _provider = undefined
}

/**
 * F3 → #260 P0（2026-10-03）：LLM 请求超时（ms）纯 resolver。
 * 优先级：env ATLAS_LLM_TIMEOUT（有效值恒胜）> settings llmTimeoutMs
 * （源缝注入值，int ≥ 1，越上限 cap）> 缺省 LLM_TIMEOUT_DEFAULT_MS（600s，
 * 120s→600s = 国产慢模型基线裁定，用户复核定 600s；上限 30min 防挂死网关
 * 拖挂 session）。env 显式无效（非数字 / < 1）落 settings 档——显式打错的
 * env 不应把 settings 档也一并废掉。纯函数（测试 seam 直传，无 process.env
 * 依赖）。
 */
export function resolveLlmTimeoutMs(
  envRaw: string | undefined = process.env.ATLAS_LLM_TIMEOUT,
  settingsMs?: number,
): number {
  // settings 档：int ≥ 1 越上限 cap（与 env 同纪律；形状无效 = 无档）。
  const fromSettings = (): number =>
    typeof settingsMs === 'number' && Number.isInteger(settingsMs) && settingsMs >= 1
      ? Math.min(settingsMs, LLM_TIMEOUT_CAP_MS)
      : LLM_TIMEOUT_DEFAULT_MS
  // env 未设（undefined/空串）= 该档缺位 → 直落 settings 档。
  if (envRaw === undefined || envRaw === '') return fromSettings()
  const env = parseBoundedIntEnv(
    'ATLAS_LLM_TIMEOUT',
    envRaw,
    LLM_TIMEOUT_DEFAULT_MS,
    LLM_TIMEOUT_CAP_MS,
    1,
  )
  // env 显式设了但无效（非数字 / < 1）→ 落 settings 档（不打掉的显式错值
  // 不应废掉 settings 档）。
  if (env.status !== 'invalid') return env.effective
  return fromSettings()
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

// 前向缝登记（§8.74.30 S1 遗留清理，#201）：getProviderLifecycle / providerLifecycle
// 懒单例已裁（0 consumer；ProviderLifecycle 类同步裁）。回流 = 若未来需 provider
// 健康轮询门控。lazyProxy 仍供上方 modelProvider compat 导出。

// ── 窄面门面导出（仅被外部域实际 import 的符号）──
// types: APIError 类族（modelErrors/errorUtils 基类 + 错误分类测试构造）
// APIUserAbortError = 工具本体波 S-T2b 恢复（§8.53）：bashPermissions
// 分类器 API 拒绝面（error instanceof APIUserAbortError || AbortError 并判，
// 旧仓 types/atlas.js → 新仓本门面，窄面扩 1 符号）
export {
  APIError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
} from './types'
export {
  API_ERROR_MESSAGE_PREFIX,
  PROMPT_TOO_LONG_ERROR_MESSAGE,
  startsWithApiErrorPrefix,
  categorizeRetryableAPIError,
  classifyAPIError,
  isValidAPIMessage,
  getAssistantMessageFromError,
  getErrorMessageIfRefusal,
  // 0.1.71 A-2：403 配额耗尽签名判别（单一事实源，TUI 提示面 / 池轮询聚合面复用）
  isQuotaExhaustedMessage,
} from './modelErrors'
export { isClientRequestTimeout, shouldRetryModelError, llmTimeoutRemediationHint, llmTimeoutUnitHint, gatewayUnreachableRemediationHint, describeEndpointFailure, PROVIDER_EMPTY_CONTENT_PLACEHOLDER } from './modelprovider'
// 0.1.71 A-1：池轮询全败聚合可行动错误 + 单 ref 失败记账/分类（TUI 提示面 A-3 消费）
export { ModelPoolExhaustedError, classifyRefFailure, type ModelPoolRefFailure } from './modelprovider'
export { buildOpenAIParams } from './params'
export { modelToRole, normalizeModelStringForAPI } from './roles'

export { extractConnectionErrorDetails, formatAPIError, getSSLErrorHint, sanitizeAPIError } from './errorUtils'
export {
  EFFORT_LEVELS,
  isEffortLevel,
  parseEffortValue,
  convertEffortValueToLevel,
  modelSupportsEffort,
  getEffortEnvOverride,
  getDefaultEffortForModel,
  resolveAppliedEffort,
  // 0.1.67 E-2：per-model effort 记忆源注入缝（宿主注 settings.effortByModel 读侧）
  setEffortByModelSource,
} from './effort'

export { toResponseFormat } from './params'
export {
  getRoleConfig,
  getRoleModel,
  getRoleModels,
  resolveModel,
  MODEL_ROLES,
  HARD_DEFAULT_CONTEXT_WINDOW,
  setEndpointConfigSource,
  resetEndpointConfigSource,
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
export {
  queryWithRoleFallback,
  type QueryWithRoleFallbackResult,
  type RoleQueryOptions,
} from './queryWithRoleFallback'
// P0b① 信任线「已从 X 回退到 Y」信号源（水平回退最近一次记录，只读消费）
export {
  clearRoleFallback,
  recordRoleFallback,
  getLastRoleFallback,
  type RoleFallbackRecord,
} from './roleFallbackStore'
