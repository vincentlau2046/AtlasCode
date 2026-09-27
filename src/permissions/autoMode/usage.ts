/**
 * autoMode 子域 — 分类器用量 / 思考配置 / 响应 schema / 工具常量（§8.65，
 * 旧仓 yoloClassifier.ts:559-637, 206-239 逐字）。
 *
 * 纯数据 + 纯算术 + 纯 zod schema，零 LLM 依赖，可单测：
 * - extractUsage / combineUsage（token 用量合并）。
 * - getClassifierThinkingConfig（分类器 thinking 配置，恒 [false, 0]）。
 * - yoloClassifierResponseSchema（zod 响应 schema）。
 * - YOLO_CLASSIFIER_TOOL_NAME / YOLO_CLASSIFIER_TOOL_SCHEMA（分类器自报工具）。
 *
 * 类型映射 delta（复审勿当遗漏重提）：
 * ① 旧 extractUsage(result: ABetaMessage) 直接取 result.usage.* → 新仓以窄视图
 *    { usage?: Usage } 承载（LLM 结果型随 LLM 闭包前向接缝），缺省字段 ?? 0 兜底。
 * ② YOLO_CLASSIFIER_TOOL_SCHEMA 旧型 BetaToolUnion（Anthropic 工具 schema）→ 新仓
 *    以本地结构化 const 承载（LLM 调用面消费，provider 波换 OpenAI 协议工具 schema 时单点收编）。
 */
import { z } from 'zod'
import { lazySchema } from '../../shared'
import type { Usage } from '../../shared'
import type { ClassifierUsage } from './types'

/**
 * Extract usage stats from an API response.
 */
export function extractUsage(result: { usage?: Usage }): ClassifierUsage {
  const usage = result.usage ?? {}
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
  }
}

/**
 * Combine usage from two classifier stages into a single total.
 */
export function combineUsage(
  a: ClassifierUsage,
  b: ClassifierUsage,
): ClassifierUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
    cacheCreationInputTokens:
      a.cacheCreationInputTokens + b.cacheCreationInputTokens,
  }
}

/**
 * Thinking config for classifier calls. The classifier wants short text-only
 * responses — API thinking blocks are ignored by extractTextContent() and waste tokens.
 * Returns [disableThinking, headroom] — tuple instead of named object so
 * property-name strings don't survive minification into external builds.
 */
export function getClassifierThinkingConfig(
  _model: string,
): [false, number] {
  return [false, 0]
}

/** 分类器响应 schema（thinking + shouldBlock + reason 三必填）。 */
export const yoloClassifierResponseSchema = lazySchema(() =>
  z.object({
    thinking: z.string(),
    shouldBlock: z.boolean(),
    reason: z.string(),
  }),
)

/** 分类器自报工具名（LLM 以 tool_use 回报判定）。 */
export const YOLO_CLASSIFIER_TOOL_NAME = 'classify_result'

/**
 * 分类器自报工具 schema（delta ② 本地结构化 const；LLM 调用面消费，
 * provider 波换 OpenAI 协议工具 schema 时单点收编）。
 */
export const YOLO_CLASSIFIER_TOOL_SCHEMA = {
  type: 'custom',
  name: YOLO_CLASSIFIER_TOOL_NAME,
  description: 'Report the security classification result for the agent action',
  input_schema: {
    type: 'object',
    properties: {
      thinking: {
        type: 'string',
        description: 'Brief step-by-step reasoning.',
      },
      shouldBlock: {
        type: 'boolean',
        description:
          'Whether the action should be blocked (true) or allowed (false)',
      },
      reason: {
        type: 'string',
        description: 'Brief explanation of the classification decision',
      },
    },
    required: ['thinking', 'shouldBlock', 'reason'],
  },
} as const
