// core/orchestrator/index.ts — Orchestrator 域门面
// Phase A 升级：在 Phase O 导出基础上，新增三接口 + 默认实现导出。
// D4: src/ 外部代码应从此门面导入，不直接深引子路径。

// ── Phase A: 公共接口定义 ──
export type {
  OrchestrationRequest,
  OrchestrationEvent,
  OrchestrationResult,
  Orchestrator,
  OrchestratorDependencies,
} from './api.js'

// ── Phase A: 状态机类型 ──
export type { LoopPhase, LoopTransition, LoopState } from './query/transitions.js'
export { validateTransition } from './query/transitions.js'

// ── Phase A: ToolPipeline ──
export type { ToolMiddleware, ToolPipeline, ToolExecutionContext, ToolExecutionResult } from './tools/pipeline.js'
export { compose } from './tools/pipeline.js'
export { DefaultToolPipeline } from './tools/defaultPipeline.js'
export type { DefaultPipelineDeps } from './tools/defaultPipeline.js'

// ── Phase A: ContextManager ──
export type { CompactionDirective, ContextManager, LoopStateSnapshot } from './context/manager.js'
export { DefaultContextManager } from './context/defaultManager.js'
export type { DefaultContextManagerDeps, PreCompactFn, PostCompactFn, RecoverFromErrorFn } from './context/defaultManager.js'

// ── Phase A: continue 站点审计文档 ──
export { CONTINUE_SITE_AUDIT } from './query/continue-site-audit.js'

// ── Phase O: 查询循环（保持兼容） ──
export { query, yieldMissingToolResultBlocks } from './query/loop.js'
export type { QueryParams } from './query/loop.js'
export { productionDeps } from './query/deps.js'
export type { QueryDeps } from './query/deps.js'
export type { Terminal, Continue } from './query/transitions.js'

// ── Phase O: 引擎 ──
export { QueryEngine, ask } from './QueryEngine.js'
export type { QueryEngineConfig } from './QueryEngine.js'

// ── Phase O: 工具执行 ──
export { runTools } from './tools/toolOrchestration.js'
// checkPermissionsAndCallTool：R-orch 门禁核销——tests/unit/golden-toolExecution
// 经门面导入（tests 无豁免，必须落门面）；窄面原则：只提外域实际 import 的符号。
export { checkPermissionsAndCallTool, runToolUse, classifyToolError } from './tools/toolExecution.js'
export type { MessageUpdateLazy, McpServerType } from './tools/toolExecution.js'
export { StreamingToolExecutor } from './tools/StreamingToolExecutor.js'
export { generateToolUseSummary } from './tools/toolUseSummaryGenerator.js'

// ── 三性收尾 ④-lite（12号§11.5.7 步3）：外部域深路径改走门面后新增导出面 ──
// context/compact 域 17 符号 + query/deps 薄转发的 callModel（+1）；窄面原则——
// 只提被外部域实际 import 的符号；泛名 Options 已改名 LlmQueryOptions 防污染根 API。
export {
  AUTOCOMPACT_BUFFER_TOKENS,
  getAutoCompactThreshold,
  getEffectiveContextWindowSize,
  MANUAL_COMPACT_BUFFER_TOKENS,
} from './context/autoCompact.js'
export { resetMicrocompactState } from './context/microCompact.js'
export {
  compactConversation,
  ERROR_MESSAGE_INCOMPLETE_RESPONSE,
  ERROR_MESSAGE_NOT_ENOUGH_MESSAGES,
  ERROR_MESSAGE_USER_ABORT,
  mergeHookInstructions,
  partialCompactConversation,
  type CompactionResult,
} from './context/compact.js'
export { useCompactWarningSuppression } from './context/compactWarningHook.js'
export { suppressCompactWarning } from './context/compactWarningState.js'
export { runPostCompactCleanup } from './context/postCompactCleanup.js'
export { trySessionMemoryCompaction } from './context/sessionMemoryCompact.js'
export type { LlmQueryOptions } from './llm/query.js'
export { callModel } from './query/deps.js'

// ── Phase O: 上下文压缩 ──
export { buildPostCompactMessages } from './context/compact.js'
export {
  autoCompactIfNeeded,
  calculateTokenWarningState,
  isAutoCompactEnabled,
} from './context/autoCompact.js'
export { microcompactMessages } from './context/microCompact.js'
export { reactiveCompactOnPromptTooLong } from './context/reactiveCompact.js'
export { snipCompactIfNeeded, buildSnipCompact } from './context/snipCompact.js'

// ── P1-④：compact 域纯函数/谓词导出（testability + 外域 require 消费者统一入口）──
// 这些函数此前仅由外域通过 CJS require() 惰性加载（attachments.ts / messages.ts /
// Message.tsx / commands/compact），现提升为门面 ES 导出，供单元测试与未来 require→
// import 迁移使用。与 modelprovider 门面导出内部工具函数（errorUtils/schema 等）
// 同范式。窄面原则：每个符号均有外域消费者（require 或 test）。
export {
  shouldAutoCompact,
  WARNING_THRESHOLD_BUFFER_TOKENS,
} from './context/autoCompact.js'
export {
  stripImagesFromMessages,
  stripReinjectedAttachments,
  truncateHeadForPTLRetry,
} from './context/compact.js'
export {
  isReactiveCompactEnabled,
  isWithheldPromptTooLong,
  isWithheldMediaSizeError,
  isReactiveOnlyMode,
} from './context/reactiveCompact.js'
export {
  isSnipMarkerMessage,
  snipCompact,
  isSnipRuntimeEnabled,
  shouldNudgeForSnips,
  SNIP_NUDGE_TEXT,
} from './context/snipCompact.js'
export {
  estimateMessageTokens,
  evaluateTimeBasedTrigger,
  consumePendingCacheEdits,
  TIME_BASED_MC_CLEARED_MESSAGE,
} from './context/microCompact.js'
