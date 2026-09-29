// P1（Phase 4）：旧家族名（sonnet/opus/haiku/opusplan）已删除，
// 模型配置完全由 3-role + provider 元数据驱动。别名表只保留角色名
// （premium/fast/small）。'premiumPlan' 特例随 P6-3 B-8 删除（plan-mode 本就
// 优先 premium，特例冗余；旧配置里的 premiumPlan 走原样回退）。
// 角色的 [1m] 变体随 P6-2 B-4 删除（contextWindow 由 provider 元数据承载）。
export const MODEL_ALIASES = [
  'premium',
  'fast',
  'small',
] as const
export type ModelAlias = (typeof MODEL_ALIASES)[number]

export function isModelAlias(modelInput: string): modelInput is ModelAlias {
  return (MODEL_ALIASES as readonly string[]).includes(modelInput)
}

/**
 * Role-based family aliases that act as wildcards in the availableModels
 * allowlist. When "premium" is in the allowlist, ANY premium-pool model is
 * allowed; a specific model ID entry allows only that exact version.
 */
export const MODEL_FAMILY_ALIASES = ['premium', 'fast', 'small'] as const

export function isModelFamilyAlias(model: string): boolean {
  return (MODEL_FAMILY_ALIASES as readonly string[]).includes(model)
}
