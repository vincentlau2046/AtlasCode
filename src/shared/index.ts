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

// B 波 S1：env 解析纯函数（四域 config.ts 共用）
export { parseBoolEnv, parseBoundedIntEnv } from "./env"

// B 波契约冻结：纯类型骨架（atlas/message/SystemPrompt/ThinkingConfig/Effort/Tool）
export type * from "./types"

// B 波合并：值导出（export type * 不带值，S2 域消费 EFFORT_LEVELS + asSystemPrompt）
export { EFFORT_LEVELS, asSystemPrompt } from "./types"

// B 波契约冻结：会话级类型（Permission/MCP/Task）
export type * from "./types-session"
