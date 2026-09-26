/**
 * engine/tools/files — Read tool 输出限额（§8.55 S-C5，高频族纵切子波 3）。
 *
 * 旧仓来源（a8af45b）：src/tools/FileReadTool/limits.ts 92L 逐字随迁
 * （Read tool output limits。  Two caps apply to text reads:
 *   | limit         | default | checks                    | cost          | on overflow     |
 *   |---------------|---------|---------------------------|---------------|-----------------|
 *   | maxSizeBytes  | 256 KB  | TOTAL FILE SIZE (not out) | 1 stat        | throws pre-read |
 *   | maxTokens     | 25000   | actual output tokens      | API roundtrip | throws post-read|
 * Known mismatch: maxSizeBytes gates on total file size, not the slice.
 * Tested truncating instead of throwing for explicit-limit reads that
 * exceed the byte cap (#21841, Mar 2026).  Reverted: tool error rate
 * dropped but mean tokens rose — the throw path yields a ~100-byte error
 * tool-result while truncation yields ~25K tokens of content at the cap.）
 *
 * delta 登记（复审勿当遗漏重提）：
 *  ① 旧 lodash-es/memoize → 本地 memoizeNoArg 闭包（新仓无 lodash-es；
 *    shared/platform.ts L20-29 先例：无参 memoize 最小形）。
 *  ② 旧 GrowthBook 'atlas_amber_wren' override（per-field maxSizeBytes /
 *    maxTokens / includeMaxSizeInPrompt / targetedRangeNudge）整砍（新仓
 *    无 GrowthBook 基础设施，cronJitterConfig 整砍先例 §8.47）：
 *    maxSizeBytes = MAX_OUTPUT_SIZE（同域 S-C1 fileUtils），maxTokens =
 *    env ?? DEFAULT_MAX_OUTPUT_TOKENS，includeMaxSizeInPrompt /
 *    targetedRangeNudge = undefined（prompt 面 nudge 支 = config 波前向
 *    接缝，登记）；旧 per-field 防御校验对象（GB 运行时值）随之不存在，
 *    整支裁（两常量 = 编译期 number 型，无 cap=0 路径，语义保真）。
 *  ③ ATLAS_FILE_READ_MAX_OUTPUT_TOKENS env override（getEnvMaxTokens）
 *    逐字保留（用户态 override 优先级 = env > 默认；memoize 语义 = 首次
 *    调用固化，旧 GB 头注「fixed at first call」同源）。
 */
import { MAX_OUTPUT_SIZE } from './fileUtils'

export const DEFAULT_MAX_OUTPUT_TOKENS = 25000

/** 无参 memoize（旧 lodash-es/memoize，delta ①）。 */
function memoizeNoArg<T>(fn: () => T): () => T {
  let cached: { value: T } | undefined
  return () => {
    if (cached === undefined) cached = { value: fn() }
    return cached.value
  }
}

/**
 * Env var override for max output tokens. Returns undefined when unset/invalid
 * so the caller can fall through to the next precedence tier.
 */
function getEnvMaxTokens(): number | undefined {
  const override = process.env.ATLAS_FILE_READ_MAX_OUTPUT_TOKENS
  if (override) {
    const parsed = parseInt(override, 10)
    if (!isNaN(parsed) && parsed > 0) {
      return parsed
    }
  }
  return undefined
}

export type FileReadingLimits = {
  maxTokens: number
  maxSizeBytes: number
  includeMaxSizeInPrompt?: boolean
  targetedRangeNudge?: boolean
}

/**
 * Default limits for Read tool when the ToolUseContext doesn't supply an
 * override. Memoized so the limits are fixed at first call.
 *
 * Precedence for maxTokens: env var > DEFAULT_MAX_OUTPUT_TOKENS.
 * (Env var is a user-set override, should beat experiment infrastructure —
 * the GB experiment tier is cut, delta ②.)
 */
export const getDefaultFileReadingLimits = memoizeNoArg((): FileReadingLimits => {
  const envMaxTokens = getEnvMaxTokens()
  const maxTokens = envMaxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS

  return {
    maxSizeBytes: MAX_OUTPUT_SIZE,
    maxTokens,
    includeMaxSizeInPrompt: undefined,
    targetedRangeNudge: undefined,
  }
})
