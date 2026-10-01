import { getSettings_DEPRECATED } from '../settings/settings.js'
import { isModelAlias, isModelFamilyAlias } from './aliases.js'
import {
  getDefaultMainLoopModel,
  getCanonicalName,
  parseUserSpecifiedModel,
} from './model.js'
// M2 (docs/06): 角色注册表已迁入 core/modelprovider/roles.js
import { getRoleModels, resolveModel, type ModelRole } from 'src/modelprovider'

/**
 * Collect the resolved modelIds (lowercased) in a role's configured pool.
 * A role alias in the availableModels allowlist ("premium"/"small"/"fast")
 * allows any model in that role's pool — pool-membership, not name-containment.
 */
function rolePoolModelIds(role: ModelRole): Set<string> {
  const ids = new Set<string>()
  for (const ref of getRoleModels(role)) {
    const resolved = resolveModel(ref)
    if (resolved) ids.add(resolved.modelId.toLowerCase())
  }
  return ids
}

function rolePoolContains(role: ModelRole, model: string): boolean {
  return rolePoolModelIds(role).has(model.toLowerCase())
}

/**
 * Check if a model is allowed by the availableModels allowlist in settings.
 * If availableModels is not set, all models are allowed.
 *
 * P6-3 B-2（provider 元数据化，无 claude 兼容）:
 * 1. Direct match — modelId / role-alias / custom-alias present in the list.
 * 2. Role-alias wildcard — "premium"/"small"/"fast" allows any model in that
 *    role's configured pool (provider 池成员判定，非 claude 名 contains)。
 * 3. Alias resolution — a role/custom alias resolves to its concrete model.
 *
 * 版本前缀 / claude-* 名匹配（getClaudePrefix / prefixMatchesModel /
 * modelMatchesVersionPrefix / familyHasSpecificEntries）已随 B-2 删除：现网模型名
 * 由 3-role + provider 元数据驱动，`availableModels` 现配为角色别名模板。
 */
export function isModelAllowed(model: string): boolean {
  const settings = getSettings_DEPRECATED() || {}
  const { availableModels } = settings
  if (!availableModels) {
    return true // No restrictions
  }
  if (availableModels.length === 0) {
    return false // Empty allowlist blocks all user-specified models
  }

  const normalizedModel = model.trim().toLowerCase()
  const normalizedAllowlist = availableModels.map(m => m.trim().toLowerCase())

  // 1. Direct match (modelId-to-modelId or alias-to-alias)
  if (normalizedAllowlist.includes(normalizedModel)) {
    return true
  }

  // 2. Role-alias wildcard: "premium"/"small"/"fast" allows any model in that role's pool
  for (const entry of normalizedAllowlist) {
    if (isModelFamilyAlias(entry) && rolePoolContains(entry as ModelRole, normalizedModel)) {
      return true
    }
  }

  // 3. Alias resolution: if the input is an alias, resolve it and check the list
  if (isModelAlias(normalizedModel)) {
    const resolved = parseUserSpecifiedModel(normalizedModel).toLowerCase()
    if (normalizedAllowlist.includes(resolved)) {
      return true
    }
  }

  // 3b. Reverse alias resolution: an alias entry in the list resolves to the input model
  for (const entry of normalizedAllowlist) {
    if (isModelAlias(entry) && !isModelFamilyAlias(entry)) {
      const resolved = parseUserSpecifiedModel(entry).toLowerCase()
      if (resolved === normalizedModel) {
        return true
      }
    }
  }

  return false
}

/**
 * 本地模型配置池成员判定（跟随本地模型配置，无硬编码模型名）:
 * 模型是否出现在默认放行角色池（**small + premium**）的
 * env ATLAS_<ROLE>_MODEL > settings modelRoles 池 > provider/默认
 * 并集里，或等于默认主循环模型。**fast 不进默认放行清单**——快速/轻量
 * 模型不预信任跑安全分类器；确需放行某模型，把它配进 small/premium
 * 角色池即可（单一规则，无独立 allow 配置层——原
 * atlas_auto_mode_config.allowModels 覆盖层 2026-09-19 整删）。
 *
 * 供 auto-mode 模型门（betas.ts modelSupportsAutoMode）使用：
 * 本地配置里默认放行角色池能选到的模型即用户可用来跑分类器的模型——
 * 替代旧的 ^claude-(opus|sonnet)-4-6 / qwen38 硬编码白名单（不再参考
 * claude 模型名，仅参考其"按家族放行"的语义落到角色池上）。
 *
 * 每个池引用同时按三种形态收录（小写）：原始引用、去 provider 前缀、
 * resolveModel 解析后的 modelId（provider 未知时 resolveModel 返回
 * undefined，前两种形态兜底，判定不因 provider 未注册而误 fail-closed）。
 */
const AUTO_MODE_ROLES: ModelRole[] = ['premium', 'small']

function localPoolRefs(): Set<string> {
  const refs = new Set<string>()
  for (const role of AUTO_MODE_ROLES) {
    for (const ref of getRoleModels(role)) {
      const low = ref.toLowerCase()
      refs.add(low)
      refs.add(low.split('/').pop() ?? low)
      const resolved = resolveModel(ref)
      if (resolved) refs.add(resolved.modelId.toLowerCase())
    }
  }
  return refs
}

export function isModelInLocalModelPools(model: string): boolean {
  const m = model.trim().toLowerCase()
  if (m.length === 0) return false
  const refs = localPoolRefs()
  if (refs.has(m) || refs.has(m.split('/').pop() ?? m)) return true
  // 默认主循环模型（role 驱动的 small 默认，经 parseUserSpecifiedModel 解析）
  const def = getCanonicalName(getDefaultMainLoopModel()).toLowerCase()
  return m === def || m === def.split('/').pop()
}
