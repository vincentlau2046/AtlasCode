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
  getAutoCompactThreshold,
  shouldAutoCompact,
  autoCompactIfNeeded,
  type AutoCompactTrackingState,
  type AutoCompactDeps,
  type AutoCompactOutcome,
} from './autoCompact'
export {
  ERROR_MESSAGE_NOT_ENOUGH_MESSAGES,
  ERROR_MESSAGE_USER_ABORT,
  COMPACT_MAX_OUTPUT_TOKENS,
  getCompactPrompt,
  formatCompactSummary,
  getCompactUserSummaryMessage,
  createCompactBoundaryMessage,
  buildPostCompactMessages,
  compactConversation,
  type CompactionResult,
  type CompactDeps,
} from './compact'
export {
  TIME_BASED_MC_CLEARED_MESSAGE,
  TIME_BASED_MC_CONFIG_DEFAULTS,
  estimateMessageTokens,
  evaluateTimeBasedTrigger,
  microcompactMessages,
  resetMicrocompactState,
  type TimeBasedMCConfig,
  type MicrocompactDeps,
  type MicrocompactOutcome,
} from './microCompact'
