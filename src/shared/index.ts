/**
 * shared 模块唯一公共出口（STR-1 门面规则）。
 *
 * 外部模块只许 `import { ... } from "../shared"`（或 "src/shared"）,
 * 不许 reach 内部文件（entry-point lint 拦截）。
 *
 * re-export: feature（A 波已实现）/ types / types-session / identity /
 *            sanitizeToolName / tokenEstimation（随各文件 B/C 波落地）
 */
export { feature, FEATURE_ON_BY_DEFAULT } from "./feature"
