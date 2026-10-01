/**
 * context 模块唯一公共出口（STR-1 门面规则）。
 *
 * E-1b T-4b（§8.23）：上下文压缩最小链（autoCompact 触发 + compact 体 + microCompact
 * 时间触发）落地后 re-export。各件裁剪版真核心，残留守头注释防「以为已全」。
 * 后续纵切回填：partialCompact（direction）/ PTL 重试 / 压缩后重建面（attachments/hooks）。
 */
export {
  AUTOCOMPACT_BUFFER_TOKENS,
  MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES,
  WARNING_THRESHOLD_BUFFER_TOKENS,
  ERROR_THRESHOLD_BUFFER_TOKENS,
  MANUAL_COMPACT_BUFFER_TOKENS,
  getAutoCompactThreshold,
  getEffectiveContextWindowSize,
  calculateTokenWarningState,
  isAutoCompactEnabled,
  shouldAutoCompact,
  autoCompactIfNeeded,
  type AutoCompactTrackingState,
  type AutoCompactDeps,
  type AutoCompactOutcome,
  type TokenWarningState,
  type TokenWarningParams,
} from './autoCompact'
export {
  ERROR_MESSAGE_NOT_ENOUGH_MESSAGES,
  ERROR_MESSAGE_USER_ABORT,
  // D-2a S1（M5 切端）：旧仓 compact.ts:283 中断错误常量
  //（isCompactBoundaryMessage 谓词单源 = session/predicates.ts，session 门面已出）
  ERROR_MESSAGE_INCOMPLETE_RESPONSE,
  COMPACT_MAX_OUTPUT_TOKENS,
  getCompactPrompt,
  formatCompactSummary,
  getCompactUserSummaryMessage,
  createCompactBoundaryMessage,
  buildPostCompactMessages,
  compactConversation,
  // W2-2-pre 缺面先迁②（§8.74.2 compact 4 extras 之纯函数面；
  // createCompactCanUseTool / createPlanAttachmentIfNeeded 前向接缝，见
  // compact.ts 头注裁断）
  stripImagesFromMessages,
  mergeHookInstructions,
  type CompactionResult,
  type CompactDeps,
} from './compact'
export {
  TIME_BASED_MC_CLEARED_MESSAGE,
  TIME_BASED_MC_CONFIG_DEFAULTS,
  getTimeBasedMCConfig,
  estimateMessageTokens,
  evaluateTimeBasedTrigger,
  microcompactMessages,
  resetMicrocompactState,
  // D-2a S1（M5 切端）：CACHED_MICROCOMPACT 残留守 stub（旧仓 cachedMCConfig 逐字）
  getCachedMCConfig,
  type TimeBasedMCConfig,
  type MicrocompactDeps,
  type MicrocompactOutcome,
} from './microCompact'
// W2-2-pre 缺面先迁④（§8.74.2 context 扩面族纯谓词/投影面；LLM-bound 体
// 前向接缝登记见各文件头注 + §8.74.9）
export {
  isSnipBoundaryMessage,
  projectSnippedView,
  snipProjection,
  // D-2a S1（M5 切端）：旧仓名 dedup 别名 + nudge 文案常量
  isSnipMarkerMessage,
  SNIP_NUDGE_TEXT,
} from './snipProjection'
// D-2a S1（M5 切端）：snip 运行时门控 + nudge 节奏（env kill-switch 化）
export {
  isSnipRuntimeEnabled,
  shouldNudgeForSnips,
} from './snipRuntime'
// D-2a S1（M5 切端）：压缩警告抑制 store（React-free；hook 留 tui 壳）
export {
  compactWarningStore,
  suppressCompactWarning,
  clearCompactWarningSuppression,
} from './compactWarningState'
export {
  isReactiveCompactEnabled,
  isWithheldPromptTooLong,
  isWithheldMediaSizeError,
  isReactiveOnlyMode,
} from './reactiveCompact'
