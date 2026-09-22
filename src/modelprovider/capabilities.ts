// Atlas — P4 能力收口（docs/06 Phase 4）。
//
// 本模块是模型能力/计费/路由的**唯一入口**：
//   - 上下文窗口：getProviderContextWindow（自 roles.ts 迁入，原定义移到这里）
//   - 模型路由：getRoleModel / getRoleModels / resolveModel（自 roles 收口再导出）
//
// 与 M2 依赖倒置一致：core/modelprovider 只通过 EndpointConfigSource 端口读配置，
// 运行期不依赖 services/api。计费子系统（utils/modelCost）已在 Phase 4 整体删除，
// 能力元数据（contextWindow/maxTokens/marketing name）由 provider 元数据承载。

// 模型路由（模型池解析）——收口再导出自 roles
export {
  getRoleModel,
  getRoleModels,
  resolveModel,
} from './roles'
export type { ModelRole, ResolvedModel } from './roles'
export { MODEL_ROLES } from './roles'

// 上下文窗口查询（自 roles.ts 迁入）。
import { getEndpointConfigSource } from './roles'

/**
 * Model capability metadata, populated from provider config.
 * All fields are optional — absent values fall back to the
 * consumer's own heuristic defaults (typically the hardcoded
 * values from getKnowledgeCutoff / betas / effort.ts).
 */
export type ModelMeta = {
  /** Knowledge cutoff date string e.g. "May 2025". */
  knowledgeCutoff?: string
  /** Whether the model supports thinking/scratchpad. */
  supportsThinking?: boolean
  /** Whether the model supports effort levels. */
  supportsEffort?: boolean
  /** Whether the model supports structured outputs (JSON mode). */
  supportsStructuredOutputs?: boolean
  /** Whether to skip cyber mitigation (dangerous-code filter). */
  skipCyberMitigation?: boolean
}

/**
 * P4: look up model capability metadata by scanning every
 * provider's `models[]`. Returns the merged entry fields if
 * the model is found; undefined otherwise (caller falls back
 * to defaults).
 */
export function getModelMeta(modelId: string): ModelMeta | undefined {
  if (!modelId) return undefined
  const providers: any = getEndpointConfigSource().getProviders()
  for (const pCfg of Object.values(providers)) {
    const models: any[] = (pCfg as any).models || []
    const entry = models.find((m: any) => m?.id === modelId)
    if (entry) {
      return {
        knowledgeCutoff: entry.knowledgeCutoff,
        supportsThinking: entry.supportsThinking,
        supportsEffort: entry.supportsEffort,
        supportsStructuredOutputs: entry.supportsStructuredOutputs,
        skipCyberMitigation: entry.skipCyberMitigation,
      }
    }
  }
  return undefined
}

/**
 * P4: look up the declared context window for a bare model id by scanning
 * every provider's `models[]`. Returns the entry's contextWindow if the
 * model is in a provider pool; undefined otherwise (caller falls back to
 * the hardcoded default). Used by utils/context so autocompact uses the
 * provider-declared window instead of the hardcoded 150_000.
 */
export function getProviderContextWindow(modelId: string): number | undefined {
  if (!modelId) return undefined
  const providers: any = getEndpointConfigSource().getProviders()
  for (const pCfg of Object.values(providers)) {
    const models: any[] = (pCfg as any).models || []
    const entry = models.find((m: any) => m?.id === modelId)
    if (entry?.contextWindow) return entry.contextWindow
  }
  return undefined
}
