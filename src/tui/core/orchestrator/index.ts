// core/orchestrator/index.ts — W3-3c-2（§8.74.19）：(a) 类 22 文件删净后
// 域门面收窄 = (b) 留集 glue 的窄消费面（engine 单源符号不再双导，engineCompat
// 星号冲突块随之全死）。窄面原则：只提被外域实际 import 的符号（逐名 grep
// 核验留痕 §8.74.19）；engine 侧同名实现（2-pre 缺面填平）不经本门面透出
// （engineCompat 直接星号 'src/engine'）。
//
// (b) 留集（LLM-bound 体 / 跨域 cache 编排 / tui 类型面 / 残留守 stub，
// owner = W-opt 优化波，2-pre 头注登记同型，复审勿重提）：
//   context/{compact, sessionMemoryCompact, snipCompact, reactiveCompact,
//   postCompactCleanup, cachedMCConfig, prompt, grouping, apiMicrocompact,
//   compactWarningState, compactWarningHook} + tools/toolUseSummaryGenerator
//   + query/continue-site-audit + core/executor（Ascend 六件套，D-3）+
//   core/memory/MemoryConfig

// ── (b) context/compact（LLM-bound partialCompact + PTL 面；engine 覆盖的
// compact 主链符号不经本面双导）──
export {
  partialCompactConversation,
  ERROR_MESSAGE_INCOMPLETE_RESPONSE,
} from './context/compact.js'

// ── (b) context/snipCompact（snip 运行时 4 面 = HISTORY_SNIP 门控活消费；
// snip 投影 3 函数 = engine 单源不经本面）──
export {
  isSnipMarkerMessage,
  isSnipRuntimeEnabled,
  shouldNudgeForSnips,
  SNIP_NUDGE_TEXT,
} from './context/snipCompact.js'

// ── (b) context/reactiveCompact（LLM 2 入口 = REACTIVE_COMPACT 门控活消费；
// 4 谓词 = engine 单源不经本面）──
export {
  tryReactiveCompact,
  reactiveCompactOnPromptTooLong,
} from './context/reactiveCompact.js'

// ── (b) 跨域 cache / 会话记忆 / cachedMC stub ──
export { runPostCompactCleanup } from './context/postCompactCleanup.js'
export { trySessionMemoryCompaction } from './context/sessionMemoryCompact.js'
export { getCachedMCConfig } from './context/cachedMCConfig.js'

// ── (b) 压缩警告栈（engine 无 twin，(b) 独有）──
export { useCompactWarningSuppression } from './context/compactWarningHook.js'
export { suppressCompactWarning } from './context/compactWarningState.js'

// ── (b) 工具摘要生成 + continue 站点审计文档 ──
export { generateToolUseSummary } from './tools/toolUseSummaryGenerator.js'
export { CONTINUE_SITE_AUDIT } from './query/continue-site-audit.js'
