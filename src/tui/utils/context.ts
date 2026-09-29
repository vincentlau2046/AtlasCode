// M2 (docs/06): 角色注册表已迁入 core/modelprovider/roles.js
// P4 (docs/06): getProviderContextWindow 收口至 core/modelprovider/capabilities.js
import { getProviderContextWindow, resolveModel } from 'src/modelprovider'

// Model context window size (200k tokens for all models right now)
// FIXME: temporary override for qwen38-27b-abliterated (model actual limit is 163840)
export const MODEL_CONTEXT_WINDOW_DEFAULT = 150_000

// Maximum output tokens for compact operations
export const COMPACT_MAX_OUTPUT_TOKENS = 20_000

// Default max output tokens
const MAX_OUTPUT_TOKENS_DEFAULT = 32_000
const MAX_OUTPUT_TOKENS_UPPER_LIMIT = 64_000

// Capped default for slot-reservation optimization. BQ p99 output = 4,911
// tokens, so 32k/64k defaults over-reserve 8-16× slot capacity. With the cap
// enabled, <1% of requests hit the limit; those get one clean retry at 64k
// (see query.ts max_output_tokens_escalate). Cap is applied in
// claude.ts:getMaxOutputTokensForModel to avoid the growthbook→betas→context
// import cycle.
export const CAPPED_DEFAULT_MAX_TOKENS = 8_000
export const ESCALATED_MAX_TOKENS = 64_000

// P6-2 B-4：1M 上下文体系已删。原 is1mContextDisabled / has1mContext /
// modelSupports1M 及 getContextWindowForModel 的 [1m] / CONTEXT_1M beta 分支
// 全部移除——contextWindow 现统一由 provider 元数据（getProviderContextWindow）承载。

export function getContextWindowForModel(
  model: string,
  betas?: string[],
): number {
  void betas // 1M 分支已删，betas 不再用于上下文窗口判定（保留签名兼容调用方）
  // P4: the provider owns model capabilities — look up the declared
  // contextWindow in the settings provider registry (entry → provider
  // default). This takes precedence over the hardcoded 150_000 default so
  // autocompact uses the real window the provider declared.
  const providerCtx = getProviderContextWindow(model)
  if (providerCtx !== undefined) {
    return providerCtx
  }
  return MODEL_CONTEXT_WINDOW_DEFAULT
}

/**
 * Calculate context window usage percentage from token usage data.
 * Returns used and remaining percentages, or null values if no usage data.
 */
export function calculateContextPercentages(
  currentUsage: {
    input_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  } | null,
  contextWindowSize: number,
): { used: number | null; remaining: number | null } {
  if (!currentUsage) {
    return { used: null, remaining: null }
  }

  const totalInputTokens =
    currentUsage.input_tokens +
    currentUsage.cache_creation_input_tokens +
    currentUsage.cache_read_input_tokens

  const usedPercentage = Math.round(
    (totalInputTokens / contextWindowSize) * 100,
  )
  const clampedUsed = Math.min(100, Math.max(0, usedPercentage))

  return {
    used: clampedUsed,
    remaining: 100 - clampedUsed,
  }
}

/**
 * Returns the model's default and upper limit for max output tokens.
 */
export function getModelMaxOutputTokens(model: string): {
  default: number
  upperLimit: number
} {
  // P4 (C3): 能力元数据收口 — maxTokens 由 provider 元数据承载
  //（entry → provider default → 硬编码兜底）。
  const resolved = resolveModel(model)
  if (resolved?.maxTokens) {
    return { default: resolved.maxTokens, upperLimit: resolved.maxTokens }
  }

  // P6-3 B-14：claude 模型名 token 级联（opus/sonnet/haiku/claude-3 各档）已删——
  // 现网模型 maxTokens 由 provider 元数据承载（上方 resolveModel 命中即返回），
  // 未声明者统一落硬编码兜底。
  return {
    default: MAX_OUTPUT_TOKENS_DEFAULT,
    upperLimit: MAX_OUTPUT_TOKENS_UPPER_LIMIT,
  }
}

/**
 * Returns the max thinking budget tokens for a given model. The max
 * thinking tokens should be strictly less than the max output tokens.
 *
 * Deprecated since newer models use adaptive thinking rather than a
 * strict thinking token budget.
 */
export function getMaxThinkingTokensForModel(model: string): number {
  return getModelMaxOutputTokens(model).upperLimit - 1
}
