/**
 * autoMode 子域 — 分类器族共享类型（§8.65，C 桶 ② auto-mode 纵切波）。
 *
 * 旧仓来源（a8af45b）：
 * - AutoModeRules ← src/utils/permissions/yoloClassifier.ts:76-80（settings.autoMode 三节形状）。
 * - TranscriptBlock / TranscriptEntry ← yoloClassifier.ts:241-248（分类器 transcript 投影）。
 * - ClassifierUsage / YoloClassifierResult ← src/types/permissions.ts:339-397（逐字）。
 *
 * 类型映射（旧 Anthropic Beta 型 → 新仓 shared）：分类器 transcript 块为纯本地
 * 判别联合（text / tool_use），不依赖 Anthropic 类型；LLM 调用面（AMessageParam /
 * ABetaMessage 等）随 LLM 闭包前向接缝（§8.65.1.2），不在本子域类型面。
 *
 * 复审勿当遗漏：YoloClassifierResult 各 stage / usage 字段为 LLM 闭包（provider 波）
 * 消费，本波仅冻结形状（纯类型，零运行时代码）。
 */

/** settings.autoMode 三节形状（用户可定制的三分类器提示词节，空数组 = 缺省）。 */
export type AutoModeRules = {
  allow: string[]
  soft_deny: string[]
  environment: string[]
}

/** 分类器 transcript 块（text / tool_use 判别联合，本地定义不依赖 Beta 型）。 */
export type TranscriptBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }

/** 分类器 transcript 条目（user 文本 / assistant tool_use 块）。 */
export type TranscriptEntry = {
  role: 'user' | 'assistant'
  content: TranscriptBlock[]
}

/** 分类器 API 调用 token 用量（overhead 遥测）。 */
export type ClassifierUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
}

/**
 * auto-mode 分类器判定结果（旧 permissions.ts YoloClassifierResult 逐字）。
 * shouldBlock=true = 拦下（需用户确认）；unavailable = 分类器不可用（安全方向 fail-closed）。
 */
export type YoloClassifierResult = {
  thinking?: string
  shouldBlock: boolean
  reason: string
  unavailable?: boolean
  /**
   * API returned "prompt is too long" — the classifier transcript exceeded
   * the context window. Deterministic (same transcript → same error), so
   * callers should fall back to normal prompting rather than retry/fail-closed.
   */
  transcriptTooLong?: boolean
  /** The model used for this classifier call */
  model: string
  /** Token usage from the classifier API call (for overhead telemetry) */
  usage?: ClassifierUsage
  /** Duration of the classifier API call in ms */
  durationMs?: number
  /** Character lengths of the prompt components sent to the classifier */
  promptLengths?: {
    systemPrompt: number
    toolCalls: number
    userPrompts: number
  }
  /** Path where error prompts were dumped (only set when unavailable due to API error) */
  errorDumpPath?: string
  /** Which classifier stage produced the final decision (2-stage XML only) */
  stage?: 'fast' | 'thinking'
  /** Token usage from stage 1 (fast) when stage 2 was also run */
  stage1Usage?: ClassifierUsage
  /** Duration of stage 1 in ms when stage 2 was also run */
  stage1DurationMs?: number
  /**
   * API request_id (req_xxx) for stage 1. Enables joining to server-side
   * api_usage logs for cache-miss / routing attribution. Also used for the
   * legacy 1-stage (tool_use) classifier — the single request goes here.
   */
  stage1RequestId?: string
  /**
   * API message id (msg_xxx) for stage 1. Enables joining the
   * atlas_auto_mode_decision analytics event to the classifier's actual
   * prompt/completion in post-analysis.
   */
  stage1MsgId?: string
  /** Token usage from stage 2 (thinking) when stage 2 was run */
  stage2Usage?: ClassifierUsage
  /** Duration of stage 2 in ms when stage 2 was run */
  stage2DurationMs?: number
  /** API request_id for stage 2 (set whenever stage 2 ran) */
  stage2RequestId?: string
  /** API message id for stage 2 (set whenever stage 2 ran) */
  stage2MsgId?: string
}
