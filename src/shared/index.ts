/**
 * shared 模块唯一公共出口（STR-1 门面规则）。
 *
 * 外部模块只许 `import { ... } from "../shared"`（或 "src/shared"）,
 * 不许 reach 内部文件（entry-point lint 拦截）。
 *
 * re-export: feature（A 波已实现）/ types / types-session /
 *            identity / sanitizeToolName / tokenEstimation（随各文件 B/C 波落地）
 */

// A 波：feature flag
export { feature, FEATURE_ON_BY_DEFAULT } from "./feature"

// B 波 S1 + C1：env 解析纯函数（四域 config.ts 共用）
// C1 统一裁定：isEnvTruthy/isEnvDefinedFalsy = 布尔 env 单一事实源
// （B 波 parseBoolEnv 窄集合已被取代，C1b 删除）
export { parseBoundedIntEnv, isEnvTruthy, isEnvDefinedFalsy } from "./env"

// C1 叶子下沉：零依赖纯工具（旧仓 utils 叶子，跨 ≥2 域或为 C-Deep 地基）
export {
  escapeRegExp,
  capitalize,
  plural,
  firstLineOf,
  countCharInString,
  normalizeFullWidthDigits,
  normalizeFullWidthSpace,
  safeJoinLines,
  EndTruncatingAccumulator,
  truncateToLines,
} from "./stringUtils"
export { CircularBuffer } from "./circular-buffer"
export {
  hasExactErrorMessage,
  toError,
  errorMessage,
  getErrnoCode,
  isENOENT,
  getErrnoPath,
  shortErrorStack,
  isFsInaccessible,
} from "./errors"
export { formatFileSize } from "./format"

// B 波契约冻结：纯类型骨架（atlas/message/SystemPrompt/ThinkingConfig/Effort/Tool）
export type * from "./types"

// B 波合并：值导出（export type * 不带值，S2 域消费 EFFORT_LEVELS + asSystemPrompt）
export { EFFORT_LEVELS, asSystemPrompt } from "./types"

// B 波契约冻结：会话级类型（Permission/MCP/Task）
export type * from "./types-session"
