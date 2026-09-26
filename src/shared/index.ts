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
// C-Deep 切片 3 T3：task 输出磁盘上限（task diskOutput cap + executor
// ShellCommand size watchdog 跨域共线，单一事实源）
export { MAX_TASK_OUTPUT_BYTES } from "./constants"
// C-Deep 切片 3 T5：permissions 薄骨架跨域纯叶子（permissions + sandbox +
// shell 共线，L3 四域互不 import → shared 唯一跨域叶子汇）
export { getConfigDirName } from "./configDir"
// C-Deep 切片 3 T5：用户专属 Atlas 临时目录名（跨域纯叶子，permissions +
// executor Shell 共线；§8.16 偏差：由 permissions 最小面提升 shared）
export { getAtlasTempDirName } from "./tempDir"
export {
  getPlatform,
  SUPPORTED_PLATFORMS,
  type Platform,
} from "./platform"
export {
  expandPath,
  containsPathTraversal,
  sanitizePath,
  MAX_SANITIZED_LENGTH,
} from "./path"
export { containsVulnerableUncPath } from "./unc"
export { djb2Hash } from "./hash"
export { lazySchema } from "./lazySchema"
export { logForDebugging, type DebugLogLevel } from "./debug"
// §8.55 S-C1：logError 跨域叶子（自 engine/tools/bash 域内 shim 提升，
// shared = 唯一跨域叶子汇，C-Deep T5 提升先例）
export { logError } from "./log"
export {
  NodeFsOperations,
  setFsImplementation,
  getFsImplementation,
  setOriginalFsImplementation,
  safeResolvePath,
  type FsOperations,
} from "./fs-operations"

// C 波（§8.55 S-C1）：rough token 估计族（占位填充，旧 services/tokenEstimation 纯函数子集）
export {
  roughTokenCountEstimation,
  bytesPerTokenForFileType,
  roughTokenCountEstimationForFileType,
} from "./tokenEstimation"

// B 波契约冻结：纯类型骨架（atlas/message/SystemPrompt/ThinkingConfig/Effort/Tool）
export type * from "./types"

// B 波合并：值导出（export type * 不带值，S2 域消费 EFFORT_LEVELS + asSystemPrompt）
export { EFFORT_LEVELS, asSystemPrompt } from "./types"

// B 波契约冻结：会话级类型（Permission/MCP/Task）
export type * from "./types-session"
