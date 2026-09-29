/**
 * tui/engineCompat — UI 闭包 engine 兼容面（§8.72 TUI 壳波 Slice B）
 *
 * = 新 engine 域门面全量 re-export + tui 本地旧仓 orchestrator 运行体的
 * 缺面补齐（C-7 逐字搬）：
 *   - 新仓 engine 门面为 E-1 窄 spine（queryAgentLoop/queryOneRound +
 *     microcompact + autoCompact 残留守），旧仓 orchestrator 全量 API
 *     （query/runTools/QueryParams/压缩警告栈/compact 常量）未入门面
 *   - 闭包消费方（REPL/queryHelpers/processSlashCommand/compact 命令/
 *     TokenWarning 组件…）按旧 orchestrator 名取件 → 经本模块统一
 * 去重（engine spine vs tui orchestrator 运行体）归 E-wave-end 审计。
 */

export * from 'src/engine'
export * from './core/orchestrator'

// 星号冲突消解（TS2308）：重名成员以 orchestrator（旧仓 UI 消费面）为准
// —— 显式 re-export 优先于星号导出；engine 侧同名实现（E-1 窄 spine
// 移植件）在闭包内不消费，去重归 E-wave-end 审计。
// 冲突全集 23 名 = 主块 22（原 14 + W2-2-pre 缺面填平后新增冲突 8：
// ① 2 buffer 常量 MANUAL/WARNING_THRESHOLD_BUFFER_TOKENS（填平前 engine
// 门面无 3 buffer 常量 = 无冲突，填平后 orchestrator index 双导者入主块，
// orchestrator 面为 TUI 活链路消费方故仍胜）② 6 纯函数 mergeHookInstructions
// / stripImagesFromMessages / isReactiveCompactEnabled / isWithheldPromptTooLong
// / isWithheldMediaSizeError / isReactiveOnlyMode（W2-2-pre 缺面先迁②④ 入
// engine 门面后与 orchestrator index 双导））+ 深层块 getAutoCompactThreshold
// 1。ERROR 常量 / getTimeBasedMCConfig / snip 投影 3 函数 orchestrator index
// 未导 = 无星号冲突不入本块（engine 侧经星号面透出；isSnipBoundaryMessage /
// projectSnippedView 另有深层块显式 re-export 优先）。
export {
  ask,
  autoCompactIfNeeded,
  buildPostCompactMessages,
  classifyToolError,
  compactConversation,
  type CompactionResult, // 接口=纯类型：内联 type 修饰。Bun 运行时对值导出清单逐名核销，
                         // 未标 type 的纯类型名 → 加载期 FATAL "export not found in './core/orchestrator'"
                         // （tsc 无 isolatedModules 不报此误标，唯运行时暴露；其余名均函数/常量值导出）
  estimateMessageTokens,
  evaluateTimeBasedTrigger,
  microcompactMessages,
  resetMicrocompactState,
  shouldAutoCompact,
  AUTOCOMPACT_BUFFER_TOKENS,
  ERROR_MESSAGE_USER_ABORT,
  TIME_BASED_MC_CLEARED_MESSAGE,
  MANUAL_COMPACT_BUFFER_TOKENS,
  WARNING_THRESHOLD_BUFFER_TOKENS,
  mergeHookInstructions,
  stripImagesFromMessages,
  isReactiveCompactEnabled,
  isWithheldPromptTooLong,
  isWithheldMediaSizeError,
  isReactiveOnlyMode,
} from './core/orchestrator'

// orchestrator index 未 re-export 的深层 context 缺面（旧仓 index 同面；
// mergeHookInstructions 已入主冲突块（W2-2-pre 后 orchestrator index 双导）
// 故本块不再列）：
export {
  ERROR_MESSAGE_INCOMPLETE_RESPONSE,
  ERROR_MESSAGE_NOT_ENOUGH_MESSAGES,
} from './core/orchestrator/context/compact'
export { getCachedMCConfig } from './core/orchestrator/context/cachedMCConfig'
export {
  isSnipBoundaryMessage,
  projectSnippedView,
} from './core/orchestrator/context/snipProjection'
// autoCompact 深层缺面 3（calculateTokenWarningState /
// getEffectiveContextWindowSize / isAutoCompactEnabled：W2-2-pre 前仅
// orchestrator 导出、engine 门面 0 = 真缺面；2-pre 填平后 engine 门面亦有
// （context/index.ts re-export），本行显式 re-export 保留 = 冲突消解
// （orchestrator 胜，零行为；W3 删 orchestrator 后此块随删））
// + 第 17 枚星号冲突 getAutoCompactThreshold（engine 门面 :329 +
// orchestrator index :57 双导 → TS2308，本行显式 re-export 消解）。
// F-B4（S-4）订正：冲突消解全集 = 主块 14 名 + 此 1 = 15（原「14-name 冲突块」
// 漏计此枚，其非深缺面）；W2-2-pre 后主块扩至 16（+2 buffer 常量），全集 17。
export {
  calculateTokenWarningState,
  getEffectiveContextWindowSize,
  isAutoCompactEnabled,
  getAutoCompactThreshold,
} from './core/orchestrator/context/autoCompact'
