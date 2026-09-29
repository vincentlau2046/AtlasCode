/**
 * W3-3c-2（§8.74.19）：getMaxOutputTokensForModel 从 orchestrator llm/query.ts
 *（(a) 类删集）迁出——唯一活消费方 = (b) 留集 context/compact.ts。落
 * utils/model/（getModelMaxOutputTokens / CAPPED_DEFAULT_MAX_TOKENS 的
 * 定义域 utils/context.ts 的下游；单点导入 context 无环——growthbook 侧
 * 读面经函数内 lazy require 保持 context.ts 原「避免 growthbook→context
 * 环」裁定不变）。
 */
import {
  CAPPED_DEFAULT_MAX_TOKENS,
  getModelMaxOutputTokens,
} from '../context.js'
import { validateBoundedIntEnvVar } from '../envValidation.js'

import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'

function isMaxTokensCapEnabled(): boolean {
  // 3P default: false (not validated on Bedrock/Vertex)
  return getFeatureValue_CACHED_MAY_BE_STALE('atlas_otk_slot_v1', false)
}

/**
 * 模型 maxOutputTokens（slot-reservation cap + ATLAS_MAX_OUTPUT_TOKENS 覆写）。
 * 旧仓 llm/query.ts 逐字（含 BQ p99 注释 + cap 语义）。
 */
export function getMaxOutputTokensForModel(model: string): number {
  const maxOutputTokens = getModelMaxOutputTokens(model)

  // Slot-reservation cap: drop default to 8k for all models. BQ p99 output
  // = 4,911 tokens; 32k/64k defaults over-reserve 8-16× slot capacity.
  // Requests hitting the cap get one clean retry at 64k (query.ts
  // max_output_tokens_escalate). Math.min keeps models with lower native
  // defaults (e.g. claude-3-opus at 4k) at their native value. Applied
  // before the env-var override so ATLAS_MAX_OUTPUT_TOKENS still wins.
  const defaultTokens = isMaxTokensCapEnabled()
    ? Math.min(maxOutputTokens.default, CAPPED_DEFAULT_MAX_TOKENS)
    : maxOutputTokens.default

  const result = validateBoundedIntEnvVar(
    'ATLAS_MAX_OUTPUT_TOKENS',
    (process.env.ATLAS_MAX_OUTPUT_TOKENS),
    defaultTokens,
    maxOutputTokens.upperLimit,
  )
  return result.effective
}
