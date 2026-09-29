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
export {
  ask,
  autoCompactIfNeeded,
  buildPostCompactMessages,
  classifyToolError,
  compactConversation,
  type CompactionResult, // 接口=纯类型：内联 type 修饰。Bun 运行时对值导出清单逐名核销，
                         // 未标 type 的纯类型名 → 加载期 FATAL "export not found in './core/orchestrator'"
                         // （tsc 无 isolatedModules 不报此误标，唯运行时暴露；其余 13 名均函数/常量值导出）
  estimateMessageTokens,
  evaluateTimeBasedTrigger,
  microcompactMessages,
  resetMicrocompactState,
  shouldAutoCompact,
  AUTOCOMPACT_BUFFER_TOKENS,
  ERROR_MESSAGE_USER_ABORT,
  TIME_BASED_MC_CLEARED_MESSAGE,
} from './core/orchestrator'

// orchestrator index 未 re-export 的深层 context 缺面（旧仓 index 同面）：
export {
  mergeHookInstructions,
  ERROR_MESSAGE_INCOMPLETE_RESPONSE,
  ERROR_MESSAGE_NOT_ENOUGH_MESSAGES,
} from './core/orchestrator/context/compact'
export { getCachedMCConfig } from './core/orchestrator/context/cachedMCConfig'
export {
  isSnipBoundaryMessage,
  projectSnippedView,
} from './core/orchestrator/context/snipProjection'
// autoCompact 深层缺面 3（calculateTokenWarningState /
// getEffectiveContextWindowSize / isAutoCompactEnabled：仅 orchestrator 导出、
// engine 门面 0 = 真缺面）+ 第 15 枚星号冲突 getAutoCompactThreshold（engine
// 门面 :329 + orchestrator index :57 双导 → TS2308，本行显式 re-export 消解）。
// F-B4（S-4）订正：冲突消解全集 = 主块 14 名 + 此 1 = 15（原「14-name 冲突块」
// 漏计此枚，其非深缺面）。
export {
  calculateTokenWarningState,
  getEffectiveContextWindowSize,
  isAutoCompactEnabled,
  getAutoCompactThreshold,
} from './core/orchestrator/context/autoCompact'
