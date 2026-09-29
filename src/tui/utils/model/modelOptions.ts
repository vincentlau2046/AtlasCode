import { getInitialMainLoopModel } from 'src/tui/bootstrapState.js'
import { getSettings_DEPRECATED } from '../settings/settings.js'
// M2 (docs/06): 角色注册表已迁入 core/modelprovider/roles.js
import { getRoleConfig, getRoleModels, resolveModel, type ModelRole } from 'src/modelprovider'
import { isModelAllowed } from './modelAllowlist.js'
import {
  getAiUserDefaultModelDescription,
  getDefaultMainLoopModelSetting,
  getUserSpecifiedModelSetting,
  renderDefaultModelSetting,
  formatContextWindow,
  type ModelSetting,
} from './model.js'
import { getGlobalConfig } from '../config.js'

// @[MODEL LAUNCH]: Update all the available and default model option strings below.

export type ModelOption = {
  value: ModelSetting
  label: string
  description: string
  descriptionForModel?: string
}

export function getDefaultOptionForUser(): ModelOption {
  // de-ANT: subscriber default-model branch removed (isAtlasAISubscriber always false).
  // PAYG — provider 恒为 'firstParty'（IFF 网关），3P pricing 后缀恒显示。
  return {
    value: null,
    label: 'Default (recommended)',
    description: `Use the default model (currently ${renderDefaultModelSetting(getDefaultMainLoopModelSetting())})`,
  }
}

// @[MODEL LAUNCH]: Update or add model option functions (getSmallOption, getPremiumOption, etc.)
// with the new model's label and description. These appear in the /model picker.
function getSmallOption(): ModelOption {
  // 3P branch removed — provider is always firstParty.
  return {
    value: 'small',
    label: 'Small',
    description: `Small · Best for everyday tasks`,
    descriptionForModel:
      'Small - best for everyday tasks. Generally recommended for most coding tasks',
  }
}


function getPremiumOption(): ModelOption {
  // 3P branch removed — provider is always firstParty.
  return {
    value: 'premium',
    label: 'Premium',
    description: `Premium · Most capable for complex work`,
    descriptionForModel: 'Premium - most capable for complex work',
  }
}

function getFastOption(): ModelOption {
  // 3P branch removed — provider is always firstParty.
  return {
    value: 'fast',
    label: 'Fast',
    description: `Fast · Fastest for quick answers`,
    descriptionForModel:
      'Fast - fastest for quick answers. Lower cost but less capable.',
  }
}


function getPremiumMaxOption(): ModelOption {
  return {
    value: 'premium',
    label: 'Premium',
    description: `Premium · Most capable for complex work`,
  }
}

// @[MODEL LAUNCH]: Update the model picker lists below to include/reorder options for the new model.
// Each user tier (ant, Max/Team Premium, Pro/Team Standard/Enterprise, PAYG 1P, PAYG 3P) has its own list.
function getModelOptionsBase(): ModelOption[] {
  // P3: when modelRoles is configured, the model picker shows role-based
  // options (Default + Small + Premium + Fast) regardless of provider —
  // this keeps the role options reachable in the default IFF deployment
  //（provider 恒为 'firstParty'）。
  const settings = getSettings_DEPRECATED() || {}
  const hasModelRoles = !!(settings as any).modelRoles
  if (hasModelRoles) {
    const roleOptionsList: ModelOption[] = [getDefaultOptionForUser()]

    // Role label / description mappings (no hardcoded model names — resolved from config).
    const ROLE_LABEL_MAP: Record<ModelRole, string> = { small: 'Small', premium: 'Premium', fast: 'Fast' }
    const ROLE_DESC_CN: Record<ModelRole, string> = { small: '日常主力', premium: '最强', fast: '快速' }
    // Row ordering (highest capability first) + a stable numeric rank per role.
    const ROLE_PRIORITY: ModelRole[] = ['premium', 'small', 'fast']
    const ROLE_RANK: Record<ModelRole, number> = { premium: 0, small: 1, fast: 2 }

    // Merge role pools by model: a model shared by several pools (e.g. fast's
    // model also in small's pool) becomes ONE row with a combined role label
    // ("Small/Fast · …"). The value stays the bare modelId (unique), so the
    // Select's value-keyed checkmark / React key / OptionMap never collide.
    // Order: by the model's highest-priority role, then its position within
    // that role's pool.
    type MergedEntry = {
      modelId: string
      name: string | undefined
      contextWindow: number
      provider: string
      roles: ModelRole[] // in ROLE_PRIORITY order
      firstPoolIndex: number // position within the highest-priority role's pool
    }
    const entries = new Map<string, MergedEntry>()
    for (const role of ROLE_PRIORITY) {
      const config = getRoleConfig(role)
      const refs = getRoleModels(role)
      if (refs.length === 0) continue
      const seenInPool = new Set<string>()
      refs.forEach((ref, poolIndex) => {
        const resolved = resolveModel(ref)
        if (!resolved) return
        const { modelId, name, contextWindow } = resolved
        if (seenInPool.has(modelId)) return // within-pool dedup
        seenInPool.add(modelId)
        const existing = entries.get(modelId)
        if (existing) {
          existing.roles.push(role) // shared across roles (priority order)
        } else {
          entries.set(modelId, {
            modelId,
            name,
            contextWindow,
            provider: config.provider,
            roles: [role],
            firstPoolIndex: poolIndex,
          })
        }
      })
    }
    const ordered = [...entries.values()].sort((a, b) => {
      const ra = ROLE_RANK[a.roles[0]]
      const rb = ROLE_RANK[b.roles[0]]
      return ra !== rb ? ra - rb : a.firstPoolIndex - b.firstPoolIndex
    })

    for (const e of ordered) {
      const roleLabels = e.roles.map(r => ROLE_LABEL_MAP[r]).join('/')
      const roleDesc = e.roles.map(r => ROLE_DESC_CN[r]).join('/')
      const displayName = e.name ?? e.modelId
      const ctxLabel = formatContextWindow(e.contextWindow)
      roleOptionsList.push({
        value: e.modelId,
        label: `${roleLabels} · ${displayName}`,
        description: `${roleDesc} (${e.provider}) · ${ctxLabel}`,
        descriptionForModel: `${roleDesc}角色模型（${e.provider}）`,
      })
    }
    return roleOptionsList
  }

  // PAYG 1P API: Default + Premium + Fast（[1m] 变体随 P6-2 B-4 删除）。
  // provider 恒为 'firstParty'（IFF 网关），legacy 3P fallback
  //（default-only list）不可达，已删。
  const payg1POptions = [getDefaultOptionForUser()]
  payg1POptions.push(getPremiumOption())
  payg1POptions.push(getFastOption())
  return payg1POptions
}

// P6-3 B-3★/B-15: 「新版可用」家族升级提示子系统（Sonnet/Opus/Haiku 营销表，
// 依赖已删的 MODEL_VERSION_PREFIXES）已删除。现网模型名/上下文窗口由 provider
// 元数据承载，未收录的模型在 /model 选择器中直接显示为自定义模型。

export function getModelOptions(): ModelOption[] {
  const options = getModelOptionsBase()

  // Add the custom model from the ATLAS_CUSTOM_MODEL_OPTION env var
  const envCustomModel = process.env.ATLAS_CUSTOM_MODEL_OPTION
  if (
    envCustomModel &&
    !options.some(existing => existing.value === envCustomModel)
  ) {
    options.push({
      value: envCustomModel,
      label: process.env.ATLAS_CUSTOM_MODEL_OPTION_NAME ?? envCustomModel,
      description:
        process.env.ATLAS_CUSTOM_MODEL_OPTION_DESCRIPTION ??
        `Custom model (${envCustomModel})`,
    })
  }

  // Append additional model options fetched during bootstrap
  for (const opt of getGlobalConfig().additionalModelOptionsCache ?? []) {
    if (!options.some(existing => existing.value === opt.value)) {
      options.push(opt)
    }
  }

  // Add custom model from either the current model value or the initial one
  // if it is not already in the options.
  let customModel: ModelSetting = null
  const currentMainLoopModel = getUserSpecifiedModelSetting()
  const initialMainLoopModel = getInitialMainLoopModel()
  if (currentMainLoopModel !== undefined && currentMainLoopModel !== null) {
    customModel = currentMainLoopModel
  } else if (initialMainLoopModel !== null) {
    customModel = initialMainLoopModel
  }
  if (customModel === null || options.some(opt => opt.value === customModel)) {
    return filterModelOptionsByAllowlist(options)
  } else if (customModel === 'premium') {
    // （premiumPlan 分支已随 P6-3 B-8 删除；旧配置 premiumPlan 走下方自定义模型回退）
    return filterModelOptionsByAllowlist([
      ...options,
      getPremiumMaxOption(),
    ])
  } else {
    // P6-3 B-3★: 未知模型（非 role 别名 / 非已收录 provider 模型）直接显示为自定义模型。
    options.push({
      value: customModel,
      label: customModel,
      description: 'Custom model',
    })
    return filterModelOptionsByAllowlist(options)
  }
}

/**
 * Filter model options by the availableModels allowlist.
 * Always preserves the "Default" option (value: null).
 */
function filterModelOptionsByAllowlist(options: ModelOption[]): ModelOption[] {
  const settings = getSettings_DEPRECATED() || {}
  if (!settings.availableModels) {
    return options // No restrictions
  }
  return options.filter(
    opt =>
      opt.value === null || (opt.value !== null && isModelAllowed(opt.value)),
  )
}
