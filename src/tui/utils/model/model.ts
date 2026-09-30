import { getMainLoopModelOverride } from 'src/tui/bootstrapState.js'
import { getSettings_DEPRECATED } from '../settings/settings.js'
import type { PermissionMode } from '../permissions/PermissionMode.js'
// M2 (docs/06): 角色注册表已迁入 core/modelprovider/roles.js
// P4 (C3): resolveModel 与 getRoleModel 同源（roles.js），一并引入做能力元数据收口。
import { getRoleModel, resolveModel, type ModelRole } from 'src/modelprovider'
import { isModelAllowed } from './modelAllowlist.js'
import { type ModelAlias, isModelAlias } from './aliases.js'
import { capitalize } from '../stringUtils.js'

export type ModelShortName = string
export type ModelName = string
export type ModelSetting = ModelName | ModelAlias | null

export function getDefaultFastModel(): ModelName {
  // P3 role layer: settings.modelRoles.fast (when present) wins over the
  // ATLAS_FAST_MODEL env var; falls back to the role default.
  const settings = getSettings_DEPRECATED() || {}
  const roleModel = (settings as any).modelRoles?.fast?.model
  if (roleModel) {
    return roleModel
  }
  return (
    process.env.ATLAS_FAST_MODEL || getRoleModel('fast')
  )
}

/**
 * P2 (unified model settings): ASR model name for the IFF gateway.
 * Precedence: env var > settings file value > built-in default.
 * Default follows the vault service FunASR.
 * （getTtsModel 已裁：0 consumer，#201 S1 遗留清理。）
 */
export function getAsrModel(): string {
  return (
    process.env.ATLAS_ASR_MODEL ||
    getSettings_DEPRECATED()?.asrModel ||
    'funasr'
  )
}

export function isNonCustomPremiumModel(model: ModelName): boolean {
  return model === getRoleModel('premium')
}

/**
 * Helper to get the model from /model (including via /config), the --model flag, environment variable,
 * or the saved settings. The returned value can be a model alias if that's what the user specified.
 * Undefined if the user didn't configure anything, in which case we fall back to
 * the default (null).
 *
 * Priority order within this function:
 * 1. Model override during session (from /model command) - highest priority
 * 2. Model override at startup (from --model flag)
  * 3. ATLAS_MODEL environment variable
 * 4. Settings (from user's saved settings)
 */
export function getUserSpecifiedModelSetting(): ModelSetting | undefined {
  let specifiedModel: ModelSetting | undefined

  const modelOverride = getMainLoopModelOverride()
  if (modelOverride !== undefined) {
    specifiedModel = modelOverride
  } else {
    const settings = getSettings_DEPRECATED() || {}
    specifiedModel =
      (process.env.ATLAS_MODEL) ||
      settings.model ||
      undefined
  }

  // Ignore the user-specified model if it's not in the availableModels allowlist.
  if (specifiedModel && !isModelAllowed(specifiedModel)) {
    return undefined
  }

  return specifiedModel
}

/**
 * Get the main loop model to use for the current session.
 *
 * Model Selection Priority Order:
 * 1. Model override during session (from /model command) - highest priority
 * 2. Model override at startup (from --model flag)
  * 3. ATLAS_MODEL environment variable
 * 4. Settings (from user's saved settings)
 * 5. Built-in default
 *
 * @returns The resolved model name to use
 */
export function getMainLoopModel(): ModelName {
  const model = getUserSpecifiedModelSetting()
  // P3 role layer: when settings.modelRoles.small is configured it wins over
  // the ATLAS_MODEL env var and settings.model. The session/startup model
  // override (from /model or --model) still has the highest priority.
  const settings = getSettings_DEPRECATED() || {}
  const roleModel = (settings as any).modelRoles?.small?.model
  if (roleModel && getMainLoopModelOverride() === undefined) {
    return parseUserSpecifiedModel(roleModel)
  }
  if (model !== undefined && model !== null) {
    return parseUserSpecifiedModel(model)
  }
  return getDefaultMainLoopModel()
}

// @[MODEL LAUNCH]: defaults are role-driven (premium/small/fast) via the
// role layer; each role resolves env > settings.modelRoles.<role> > IFF default.
export function getDefaultPremiumModel(): ModelName {
  return getRoleModel('premium')
}

export function getDefaultSmallModel(): ModelName {
  return getRoleModel('small')
}

// getDefaultFastModel is defined above (was getSmallFastModel)

// P6-2：modelToRole/normalizeModelStringForAPI re-export 已删（引用清零，
// 消费方直连 core/modelprovider/roles.js）。

/**
 * Get the model to use for runtime, depending on the runtime context.
 * @param params Subset of the runtime context to determine the model to use.
 * @returns The model to use
 */
export function getRuntimeMainLoopModel(params: {
  permissionMode: PermissionMode
  mainLoopModel: string
  exceeds200kTokens?: boolean
}): ModelName {
  const { permissionMode, mainLoopModel, exceeds200kTokens = false } = params

  // Plan mode：优先 premium，未配置时降级 small → fast
  // （premiumPlan 特例已随 P6-3 B-8 删除——plan mode 本就优先 premium，特例冗余）
  if (permissionMode === 'plan' && !exceeds200kTokens) {
    const premiumModel = getDefaultPremiumModel()
    if (premiumModel) return premiumModel
    const smallModel = getDefaultSmallModel()
    if (smallModel) return smallModel
  }

  return mainLoopModel
}

// 前向缝登记（§8.74.30 S1 遗留清理，#201）：resolveRoleForQuery（plan 模式
// premium→small→fast 角色回退）已裁——0 consumer（gateway 面 modelToRole 才是
// 角色路由活路径）。回流 = 若未来 gateway 需按 permissionMode 精细选角色池。

/**
 * Get the default main loop model setting.
 *
 * 内置默认（D1 后订阅判定全删，claude Opus/Sonnet 版本分档已删）：
 * 统一回退到 small 角色默认模型。
 *
 * @returns The default model setting to use
 */
export function getDefaultMainLoopModelSetting(): ModelName | ModelAlias {
  // Default to Small model
  return getDefaultSmallModel()
}

/**
 * Synchronous operation to get the default main loop model to use
 * (bypassing any user-specified values).
 */
export function getDefaultMainLoopModel(): ModelName {
  return parseUserSpecifiedModel(getDefaultMainLoopModelSetting())
}

/**
 * Canonical (short) name for a model string.
 *
 * P6-3 B-1: canonical 名一律取 provider 元数据 `resolveModel().modelId`；provider
 * 未配置或未收录该模型时回退到 `name.toLowerCase()` 直通（Anthropic 时代的
 * MODEL_VERSION_PREFIXES 前缀表 + firstPartyNameToCanonical 正则映射已删除，
 * 现网模型名由 3-role + provider 元数据驱动，不再有 claude-* 版本前缀）。
 */
export function getCanonicalName(fullModelName: ModelName): ModelShortName {
  const resolved = resolveModel(fullModelName)
  if (resolved) {
    return resolved.modelId as ModelShortName
  }
  return fullModelName.toLowerCase() as ModelShortName
}

// @[MODEL LAUNCH]: Update the default model description strings shown to users.
export function getAiUserDefaultModelDescription(): string {
  // Premium / 订阅分支已随 D1 删除；默认档恒为 Small 模型。
  const smallModel = getDefaultSmallModel()
  const smallLabel = smallModel ?? 'Small'
  return `${smallLabel} · Best for everyday tasks`
}

export function renderDefaultModelSetting(
  setting: ModelName | ModelAlias,
): string {
  return renderModelName(parseUserSpecifiedModel(setting))
}

export function renderModelSetting(setting: ModelName | ModelAlias): string {
  // （premiumPlan 特例已随 P6-3 B-8 删除；旧配置里的 premiumPlan 走下方原样回退）
  if (isModelAlias(setting)) {
    return capitalize(setting)
  }
  return renderModelName(setting)
}

// @[MODEL LAUNCH]: Add a display name case for the new model role below.
/**
 * Returns a human-readable display name for known public models, or null
 * if the model is not recognized as a public model.
 */
// De-Claude: the display names now key off the 3 model roles (premium/small/fast).
// Each role's display name is its model ID (the config-file-sourced model string),
// so the UI banner shows the actual model (e.g. qwen38-27b-abliterated).
export function getPublicModelDisplayName(model: ModelName): string | null {
  const premium = getRoleModel('premium')
  const small = getRoleModel('small')
  const fast = getRoleModel('fast')
  switch (model) {
    case premium:
      return premium
    case small:
      return small
    case fast:
      return fast
    default:
      return null
  }
}

export function renderModelName(model: ModelName): string {
  const publicName = getPublicModelDisplayName(model)
  if (publicName) {
    return publicName
  }
  return model
}

/**
 * Returns a safe author name for public display (e.g., in git commit trailers).
 * Returns "AtlasHarness {ModelName}" for publicly known models, or
 * "AtlasHarness ({model})" for unknown/internal models so the exact model name is preserved.
 *
 * @param model The full model name
 * @returns "AtlasHarness {ModelName}" for public models, or "AtlasHarness ({model})" for non-public models
 */
export function getPublicModelName(model: ModelName): string {
  const publicName = getPublicModelDisplayName(model)
  if (publicName) {
    return `AtlasHarness ${publicName}`
  }
  return `AtlasHarness (${model})`
}

/**
 * Returns a full model name for use in this session, possibly after resolving
 * a model alias.
 *
 * This function intentionally does not support version numbers to align with
 * the model switcher.
 *
 * @param modelInput The model alias or name provided by the user.
 */
export function parseUserSpecifiedModel(
  modelInput: any,
): ModelName {
  const modelInputTrimmed = (typeof modelInput === 'string' ? modelInput : String(modelInput || '')).trim()
  const normalizedModel = modelInputTrimmed.toLowerCase()

  if (isModelAlias(normalizedModel)) {
    switch (normalizedModel) {
      // P3 role aliases: premium (was opus), fast (was haiku), small (was sonnet).
      // （premiumPlan 特例已随 P6-3 B-8 删除，现走原样回退）
      case 'premium':
        return getDefaultPremiumModel()
      case 'fast':
        return getDefaultFastModel()
      case 'small':
        return getDefaultSmallModel()
      default:
    }
  }

  // Preserve original case for custom model names (e.g., Azure Foundry deployment IDs)
  return modelInputTrimmed
}

/**
 * Resolves a skill's `model:` frontmatter against the current model.
 *
 * P6-2 B-4：原实现会在目标角色支持 1M 时把 `[1m]` 后缀从当前模型带过去（防止
 * 1M 会话调用 skill 后上下文窗口从 1M 掉到默认值触发 autocompact）。1M 变体已随
 * P6 删除、contextWindow 现由 provider 元数据承载，不再有 `[1m]` 携带语义，
 * 故直接原样返回 skill 声明的模型。
 */
export function resolveSkillModelOverride(
  skillModel: string,
  _currentModel: string,
): string {
  return skillModel
}

export function modelDisplayString(model: ModelSetting): string {
  if (model === null) {
    return `Default (${getDefaultMainLoopModel()})`
  }
  const resolvedModel = parseUserSpecifiedModel(model)
  return model === resolvedModel ? resolvedModel : `${model} (${resolvedModel})`
}

/**
 * Format a token count as a human-readable context-window label.
 * e.g. 256000 → "256K", 1048576 → "1.0M".
 */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`
  return `${tokens}`
}

// P6-3 B-12: 营销名一律由 provider 元数据（ResolvedModel.name）承载。
//（Anthropic 时代的 claude 家族营销名回退表已删；现网模型名由 3-role + provider
// 元数据驱动，provider 未声明 name 时返回 undefined。）
export function getMarketingNameForModel(modelId: string): string | undefined {
  return resolveModel(modelId)?.name
}

// B3: normalizeModelStringForAPI 已随 modelToRole 迁 roles.js（上方 re-export 块）
