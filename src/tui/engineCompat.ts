/**
 * tui/engineCompat — UI 闭包 engine 兼容面（§8.72 TUI 壳波 Slice B 起）
 *
 * W3-3c-2（§8.74.19）形态 = 双星号 + 消费方驱动窄冲突块：
 *   - engine 门面（单一事实源：queryAgentLoop/queryOneRound 窄 spine +
 *     2-pre 缺面填平的 compact/autoCompact/microCompact/context 扩面 +
 *     coordinator/tasks 域）
 *   - orchestrator (b) 留集窄面（index.ts 收窄 = LLM-bound 体 / 跨域 cache
 *     编排 / tui 类型面 / 残留守 stub，逐名 engine 无重名核验）
 *
 * 冲突块（显式 re-export 压过双星号）= (b) 富体 vs engine 裁剪 twin 的
 * 双导名，以 (b) 富体为准（旧 23 名块按「仅活消费方」再收窄）：
 *   - 2-pre engine twin = 裁剪版 DI 面（compactConversation 无 PreCompact
 *     hooks/附件重建/userDisplayMessage；microcompactMessages 同步裁剪体无
 *     GB config/warning 抑制/cached-MC 缝）——/compact 命令 + context 命令
 *     活消费 (b) 富签名（6 参 context 面），块内显式 (b) 胜 = 零行为。
 *   - W-opt 波 engine 富面回填后本块随删（owner 登记各 (b) 文件头注）。
 */

export * from 'src/engine'
export * from './core/orchestrator'

// 冲突消解块（(b) 富体胜）：compact 富主链（hooks + 附件重建 + 展示面）
// 7 名 = /compact 命令 + processSlashCommand + types/command 活消费面
export {
  compactConversation,
  buildPostCompactMessages,
  mergeHookInstructions,
  stripImagesFromMessages,
  ERROR_MESSAGE_USER_ABORT,
  ERROR_MESSAGE_NOT_ENOUGH_MESSAGES,
  type CompactionResult, // 接口=纯类型：内联 type 修饰（Bun 运行时值导出清单逐名核销）
} from './core/orchestrator/context/compact.js'

// microCompact 富体 2 名（GB config 注入 + warning 抑制 + cached-MC 缝；
// engine 同步裁剪体非 drop-in——签名/语义差见上头注）
export {
  microcompactMessages,
  resetMicrocompactState,
} from './core/orchestrator/context/microCompact.js'

// autoCompact 富面 9 名（model-string 签名族 = 旧 TUI 活链路口径；engine
// TokenWarningParams DI 面仅 engine 内部/判别单测消费）
export {
  calculateTokenWarningState,
  getEffectiveContextWindowSize,
  isAutoCompactEnabled,
  getAutoCompactThreshold,
  shouldAutoCompact,
  autoCompactIfNeeded,
  AUTOCOMPACT_BUFFER_TOKENS,
  MANUAL_COMPACT_BUFFER_TOKENS,
  WARNING_THRESHOLD_BUFFER_TOKENS,
} from './core/orchestrator/context/autoCompact.js'

// D-2a S1（M5 切端）：engine context 低/中风险面已回填 engine（D-2a 回填波
// engine/context/{compact,snipProjection,microCompact,snipRuntime,compactWarningState}）
// → 7 名从 orchestrator 切 engine 单源（engine 与 orchestrator 星号同名冲突
// 时显式 re-export 胜——engine 侧显式块压过两侧星号；(b) 富体簇 18 名仍走上方
// orchestrator 冲突块，待 S2-S6 富体回填后逐簇切）。useCompactWarningSuppression
// （React hook）= 引擎 React-free 红线，留 tui 壳（store 已切 engine，hook 经
// tui compactWarningState.ts re-export 壳订阅 engine store）。
export {
  ERROR_MESSAGE_INCOMPLETE_RESPONSE,
  isSnipMarkerMessage,
  isSnipRuntimeEnabled,
  shouldNudgeForSnips,
  SNIP_NUDGE_TEXT,
  getCachedMCConfig,
  suppressCompactWarning,
} from 'src/engine'

// D-2a S6（M5 切端）：HIGH GAP 簇 5 名——engine 持名 + 契约
// （postCompactCleanup 注册表骨架 / highGapPorts 端口缝），orchestrator 持
// LLM-bound 富体：S8 切端前 TUI 仍路由 orchestrator 富体（显式块压过双星号）；
// S8 删 orchestrator 星号导出 + tui 接线 setSessionMemoryCompactPort /
// setReactiveCompactPort / setPartialCompactPort / registerPostCompactReset 后
// 本块随删，同名解到 engine 门面（注端口本体 / 注册表跑宿主注册 reset）。
export { runPostCompactCleanup } from './core/orchestrator/context/postCompactCleanup.js'
export { trySessionMemoryCompaction } from './core/orchestrator/context/sessionMemoryCompact.js'
export {
  tryReactiveCompact,
  reactiveCompactOnPromptTooLong,
} from './core/orchestrator/context/reactiveCompact.js'
export { partialCompactConversation } from './core/orchestrator/context/compact.js'
