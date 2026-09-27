/**
 * autoMode 子域门面（STR-1：显式命名再导出，叶零 `export *`）。
 *
 * 外部消费者只 import permissions 域根 index（permissions/index.ts `export * from
 * './autoMode'`）；本门面是 autoMode 子域对外的唯一命名出口，逐模块显式再导出
 * （不 `export *`，防子模块私有符号 / 命名冲突外泄，同 permissions 域 STR-1 先例）。
 *
 * 子模块（§8.65 C 桶 ② auto-mode 纵切波）：
 * - types：分类器族共享类型（AutoModeRules / TranscriptBlock / TranscriptEntry /
 *   ClassifierUsage / YoloClassifierResult）。
 * - transcript：分类器 transcript 构造（buildTranscriptEntries / toCompact /
 *   buildTranscriptForClassifier / formatActionForClassifier + jsonl 态）。
 * - xml：2 段 XML 分类器解析面（stripThinking / parseXmlBlock·Reason·Thinking /
 *   replaceOutputFormatWithXml / XML_S1·S2_SUFFIX）。
 * - usage：分类器用量 / 思考配置 / 响应 schema / 自报工具常量。
 * - classifierShared：extractToolUseBlock / parseClassifierResponse（bash + yolo 共享）。
 * - state：auto-mode 会话态（active / flagCli / circuitBroken）。
 * - denials：auto-mode 近拒跟踪（recordAutoModeDenial 20 cap 头插 / get）。
 * - approvals：分类器自动放行跟踪（bash + yolo approval + checking 信号）。
 * - allowlist：auto-mode 安全工具白名单（isAutoModeAllowlistedTool）。
 * - prompts：分类器提示词数据（2 .txt 资产）+ 外部模板解析。
 *
 * 前向接缝（§8.65.1.6，LLM 闭包 / CLI / settings / growthbook，复审勿当遗漏重提）：
 * classifyYoloAction 族 / buildYoloSystemPrompt LLM 面 / autoMode CLI handler /
 * settings.autoMode 三函数 / growthbook getFlagDualRead —— 归 provider/settings/CLI 波。
 * 本门面仅落可测纯逻辑面 + 提示词数据 + ② dontAsk 转换（后者在 permissions 域根，
 * 见 ./denialMessages.ts，非本子域）。
 */

// ── types（纯类型，export type）──────────────────────────────────────────
export type {
  AutoModeRules,
  TranscriptBlock,
  TranscriptEntry,
  ClassifierUsage,
  YoloClassifierResult,
} from './types'

// ── transcript ───────────────────────────────────────────────────────────
export {
  jsonStringify,
  setJsonlTranscriptEnabled,
  isJsonlTranscriptEnabled,
  buildTranscriptEntries,
  buildTranscriptForClassifier,
  formatActionForClassifier,
} from './transcript'

// ── xml ──────────────────────────────────────────────────────────────────
export {
  XML_S1_SUFFIX,
  XML_S2_SUFFIX,
  stripThinking,
  parseXmlBlock,
  parseXmlReason,
  parseXmlThinking,
  replaceOutputFormatWithXml,
} from './xml'

// ── usage ────────────────────────────────────────────────────────────────
export {
  extractUsage,
  combineUsage,
  getClassifierThinkingConfig,
  yoloClassifierResponseSchema,
  YOLO_CLASSIFIER_TOOL_NAME,
  YOLO_CLASSIFIER_TOOL_SCHEMA,
} from './usage'

// ── classifierShared ─────────────────────────────────────────────────────
export { extractToolUseBlock, parseClassifierResponse } from './classifierShared'

// ── state ────────────────────────────────────────────────────────────────
export {
  setAutoModeActive,
  isAutoModeActive,
  setAutoModeFlagCli,
  getAutoModeFlagCli,
  setAutoModeCircuitBroken,
  isAutoModeCircuitBroken,
  resetAutoModeStateForTesting,
} from './state'

// ── denials ──────────────────────────────────────────────────────────────
export type { AutoModeDenial } from './denials'
export {
  recordAutoModeDenial,
  getAutoModeDenials,
  resetAutoModeDenialsForTesting,
} from './denials'

// ── approvals ────────────────────────────────────────────────────────────
export {
  setClassifierApproval,
  getClassifierApproval,
  setYoloClassifierApproval,
  getYoloClassifierApproval,
  setClassifierChecking,
  clearClassifierChecking,
  subscribeClassifierChecking,
  isClassifierChecking,
  deleteClassifierApproval,
  clearClassifierApprovals,
} from './approvals'

// ── allowlist ────────────────────────────────────────────────────────────
export { isAutoModeAllowlistedTool } from './allowlist'

// ── prompts ──────────────────────────────────────────────────────────────
export {
  BASE_PROMPT,
  EXTERNAL_PERMISSIONS_TEMPLATE,
  getDefaultExternalAutoModeRules,
  buildDefaultExternalSystemPrompt,
} from './prompts'
