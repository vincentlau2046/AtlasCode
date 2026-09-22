/**
 * role-based 模型配置层 — 从旧仓 modelprovider/roles.ts 迁入
 *
 * 三角色（premium/fast/small），每角色可指向不同 OpenAI-protocol provider。
 * 依赖倒置：只通过 EndpointConfigSource 端口读配置（settings-adapter 在域外）。
 * 组合根经 setEndpointConfigSource() 覆盖（注入窗口）。
 *
 * 斩断：旧仓 `from '../../config/settings-adapter.js'` → 域内默认 stub
 * （返回空配置，组合根注入真实 adapter）。
 */

import type { EndpointConfigSource } from './ports/endpointConfig'

// ── EndpointConfigSource 注入窗口（旧仓 roles.ts:24-37）──────────────
let activeSource: EndpointConfigSource | undefined
let sourceOverridden = false

/** 组合根注入真实 EndpointConfigSource（settings-adapter）。 */
export function setEndpointConfigSource(source: EndpointConfigSource): void {
  activeSource = source
  sourceOverridden = true
}

/** 供 capabilities.ts 读取当前 EndpointConfigSource。 */
export function getEndpointConfigSource(): EndpointConfigSource {
  if (!sourceOverridden) {
    // 未注入时用空 stub（组合根注入前 / 测试场景）
    activeSource ??= emptyEndpointConfigSource
  }
  return activeSource!
}

/** 空适配器（未注入时兜底，所有查询返回空/undefined）。 */
const emptyEndpointConfigSource: EndpointConfigSource = {
  getRoleSetting: () => ({}),
  getProviders: () => ({}),
  getGlobalApiKey: () => undefined,
}

// ── 角色定义 ──────────────────────────────────────────────────────────

export type ModelRole = 'premium' | 'fast' | 'small'
export const MODEL_ROLES: readonly ModelRole[] = ['premium', 'fast', 'small'] as const

export type RoleProvider = 'openai' | 'iff'

export interface RoleModelConfig {
  provider: RoleProvider
  model?: string
  baseURL?: string
  apiKey?: string
}

/**
 * Get the fully-resolved configuration for a model role.
 * THREE SOURCES for the API key: env (per-role) → settings (per-role) → on-disk global.
 */
export function getRoleConfig(role: ModelRole): RoleModelConfig {
  const roleKey = role.toUpperCase()
  const envModel = process.env['ATLAS_' + roleKey + '_MODEL']
  const envProvider = process.env['ATLAS_' + roleKey + '_PROVIDER'] as RoleProvider | undefined
  const envBaseUrl = process.env['ATLAS_' + roleKey + '_BASE_URL']
  const envApiKey = process.env['ATLAS_' + roleKey + '_API_KEY']

  const roleSetting: any = getEndpointConfigSource().getRoleSetting(role)

  const provider: RoleProvider = envProvider ?? roleSetting.provider ?? 'openai'
  const model: string | undefined = envModel ?? roleSetting.model
  const baseURL: string | undefined = envBaseUrl ?? roleSetting.baseURL

  let apiKey: string | undefined = envApiKey ?? roleSetting.apiKey
  if (apiKey === undefined) {
    apiKey = getEndpointConfigSource().getGlobalApiKey()
  }

  return { provider, model, baseURL, apiKey }
}

/** Convenience: the model ID a role currently resolves to. */
export function getRoleModel(role: ModelRole): string | undefined {
  const direct = getRoleConfig(role).model
  if (direct !== undefined) return direct
  const refs = getRoleModels(role)
  if (refs.length > 0) {
    return resolveModel(refs[0])?.modelId
  }
  return undefined
}

// ── P4 Provider 解耦 ─────────────────────────────────────────────────

export interface ResolvedModel {
  provider: string
  modelId: string
  modelRef: string
  name?: string
  baseURL?: string
  apiKey?: string
  api?: string
  contextWindow: number
  maxTokens: number
}

const HARD_DEFAULT_CONTEXT_WINDOW = 262144
const HARD_DEFAULT_MAX_TOKENS = 32768

/**
 * The ordered list of "provider/model-id" references for a role, in
 * horizontal-fallback order. Reads settings.providers + settings.modelRoles.<role>.models.
 */
export function getRoleModels(role: ModelRole, sessionModel?: string): string[] {
  const roleKey = role.toUpperCase()
  const envModel = process.env['ATLAS_' + roleKey + '_MODEL']
  const providers: any = getEndpointConfigSource().getProviders()
  const roleSetting: any = getEndpointConfigSource().getRoleSetting(role)
  const rolePool: string[] = (Array.isArray(roleSetting.models) ? roleSetting.models : []).map((m: any): string => {
    if (typeof m === 'string') return m
    return (m && typeof m === 'object' && m.model) ? String(m.model) : ''
  }).filter((r: string) => r.length > 0)

  const normalizeRef = (ref: string): string => {
    if (ref.includes('/')) return ref
    for (const [pName, pCfg] of Object.entries(providers)) {
      const models: any[] = (pCfg as any).models || []
      if (models.some((m: any) => m?.id === ref)) return pName + '/' + ref
    }
    return ref
  }

  if (sessionModel) {
    return [normalizeRef(sessionModel), ...rolePool]
  }

  if (envModel) {
    return [normalizeRef(envModel)]
  }
  return rolePool
}

/** Resolve a "provider/model-id" reference to a fully-resolved model. */
export function resolveModel(ref: string): ResolvedModel | undefined {
  const providers: any = getEndpointConfigSource().getProviders()
  const slash = ref.indexOf('/')
  const providerName = slash > 0 ? ref.slice(0, slash) : ref
  const modelId = slash > 0 ? ref.slice(slash + 1) : ref
  const provider: any = providers[providerName]
  if (!provider) return undefined
  const models: any[] = provider.models || []
  const entry: any = models.find((m: any) => m?.id === modelId) || null
  return {
    provider: providerName,
    modelId,
    modelRef: ref,
    name: entry?.name,
    baseURL: provider.baseURL,
    apiKey: provider.apiKey,
    api: provider.api,
    contextWindow: entry?.contextWindow ?? provider.defaultContextWindow ?? HARD_DEFAULT_CONTEXT_WINDOW,
    maxTokens: entry?.maxTokens ?? provider.defaultMaxTokens ?? HARD_DEFAULT_MAX_TOKENS,
  }
}

/** 归一化 model id（旧仓 model.ts:649，纯函数随迁）。 */
export function normalizeModelStringForAPI(model: string): string {
  return model.replace(/\[(1|2)m\]/gi, '')
}

/** Map a model id to its owning role. Falls back to 'small'. */
export function modelToRole(model: string): 'premium' | 'fast' | 'small' {
  const m = normalizeModelStringForAPI(model)
  if (getRoleModel('fast') === m) return 'fast'
  if (getRoleModel('premium') === m) return 'premium'
  return 'small'
}
