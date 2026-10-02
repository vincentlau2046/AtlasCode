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
  // D-2a S5（重裁范围 = 原 S7，M5 切端）：autoCompact 4 活消费名 model-string
  // 便捷形重载落 autoCompact.ts；settings 读侧注入面（宿主 settings.json）
  setAutoCompactSettingsSource,
  // #250 concern 2（/autocompact 命令）：settings.autoCompactWindow 档位读侧
  // 注入缝（宿主 contextHostWiring 接线；env 胜 settings 合并纪律见
  // autoCompact.ts getMergedAutoCompactOverrides）
  setAutoCompactWindowSettingsSource,
  type AutoCompactTrackingState,
  type AutoCompactDeps,
  type AutoCompactOutcome,
  type TokenWarningState,
  type TokenWarningParams,
} from './autoCompact'
// #250 concern 2：autoCompact 窗口档位纯面（resolver + 自定义档解析 + 预设档位）
export {
  resolveAutoCompactWindow,
  parseAutoCompactTierInput,
  parseAutoCompactTierArg,
  AUTOCOMPACT_PRESET_WINDOW_TIERS,
  type AutoCompactWindowSetting,
  type AutoCompactWindowResolution,
} from './autoCompactWindow'
// #250 concern 2：env ⊕ settings 档位合并纯函数（agentLoopDeps DI 注入单点）
export { mergeAutoCompactOverrides } from './autoCompact'
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
  // D-2a S2（M5 切端）：富面字段复原的类型面（CompactionResult 加字段随出）
  type AttachmentMessage,
  type HookResultMessage,
  type CompactionResult,
  type CompactDeps,
} from './compact'
// D-2a S3（M5 切端）：PTL 重试族 + 消息分组/文本提取纯逻辑移植
export {
  MAX_PTL_RETRIES,
  PTL_RETRY_MARKER,
  ERROR_MESSAGE_PROMPT_TOO_LONG,
  groupMessagesByApiRound,
  isPromptTooLongMessage,
  parsePromptTooLongTokenCounts,
  getPromptTooLongTokenGap,
  getAssistantMessageText,
  truncateHeadForPTLRetry,
  extractDiscoveredToolNames,
} from './compactPtl'
// D-2a S3（M5 切端）：压缩路径 token 工具族（旧 tokens.ts 逐字移植）
export {
  getTokenUsage,
  getTokenCountFromUsage,
  tokenCountFromLastAPIResponse,
  roughTokenCountEstimation,
  roughTokenCountEstimationForContent,
  roughTokenCountEstimationForMessages,
  tokenCountWithEstimation,
} from './compactTokens'
// D-2a S3（M5 切端）：compact 富路径 DI 端口（宿主 setCompactPorts 注入）
export {
  setCompactPorts,
  getCompactPorts,
  type CompactPorts,
  type CompactContext,
  type CompactOptions,
  type CompactProgressEvent,
  type CacheSafeParams,
  type RecompactionInfo,
  type PreCompactHookResult,
  type PostCompactHookResult,
} from './compactPorts'
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
  // D-2a S4（M5 切端）：富面回填（旧仓 orchestrator 507L）——主线程 source 门 +
  // cached-MC env kill-switch + 富 Result 类型 + CachedMCModulePort DI 缝 +
  // time-based 配置源注入（宿主 GB 读面）
  isMainThreadSource,
  isCachedMicrocompactEnabled,
  setCachedMCModulePort,
  getCachedMCModulePort,
  setTimeBasedMCConfigSource,
  type CachedMCModulePort,
  type PendingCacheEdits,
  type MicrocompactResult,
  type TimeBasedMCConfig,
  type MicrocompactDeps,
  type MicrocompactOutcome,
} from './microCompact'
// D-2a S6（M5 切端）：post-compact 清理注册表（重置体宿主侧注册，主线程门控
// 语义旧仓逐字）+ HIGH GAP 重体端口缝（4 名 engine 名+契约落位，本体宿主侧
// S8 接线注入；未注册门面 THROW）
export {
  registerPostCompactReset,
  clearPostCompactResetsForTesting,
  runPostCompactCleanup,
  type PostCompactReset,
} from './postCompactCleanup'
export {
  setSessionMemoryCompactPort,
  setReactiveCompactPort,
  setPartialCompactPort,
  trySessionMemoryCompaction,
  tryReactiveCompact,
  reactiveCompactOnPromptTooLong,
  partialCompactConversation,
  type PartialCompactDirection,
  type TryReactiveCompactParams,
  type ReactiveCompactOutcome,
  type SessionMemoryCompactPort,
  type ReactiveCompactPort,
  type PartialCompactPort,
} from './highGapPorts'
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
