/**
 * hooks 域 — STR-1 门面（C-Deep 切片 3 T6 薄骨架）
 *
 * L3 四域自治：外部消费方只 import 本门面（域根 index.ts），不深入域内文件。
 * 组合根（B6-func compose.ts）按 §8.14 注入序 permissions→task→hooks 接线：
 *   setHooksBootstrapEnv → setHookConfigProvider → setHookShellPort →
 *   setHookOutputCaptureFactory / setCreateHookOutput（task 边）→ 运行期 runHooks。
 */
// 事件面
export { HOOK_EVENTS } from './hookEvents'
export type { HookEvent } from './hookEvents'
// 类型面
export type {
  BaseHookInput,
  HookInput,
  HookCommand,
  HookPayload,
  HookMatcher,
  MatchedHook,
  HookJSONOutput,
  HookBlockingError,
  HookResult,
  AggregatedHookResult,
} from './types'
// bootstrap 状态注入窗口（§8.14 注入序末步）
export {
  setHooksBootstrapEnv,
  getHooksBootstrapEnv,
  resetHooksBootstrapEnv,
} from './bootstrap-env'
export type { HooksBootstrapEnv } from './bootstrap-env'
// 钩子配置源注入端口
export {
  setHookConfigProvider,
  getHookConfigProvider,
  resetHookConfigProvider,
} from './config-provider'
export type { HookConfigProvider } from './config-provider'
// task 边斩断（2 条）
export {
  setHookOutputCaptureFactory,
  getHookOutputCapture,
  setCreateHookOutput,
  createHookOutput,
  resetTaskEdges,
} from './task-edges'
export type { HookOutputCapture, CreateHookOutput } from './task-edges'
// 命令钩子执行跨域端口（§8.16 D17）
export { setHookShellPort, getHookShellPort, resetHookShellPort } from './shell-port'
export type { HookShellPort, HookShellExecution } from './shell-port'
// fileChangedWatcher no-op 起步（hooks↔executor 第二边，engine 波真 chokidar）
export {
  setEnvHookNotifier,
  initializeFileChangedWatcher,
  updateWatchPaths,
  onCwdChangedForHooks,
  resetFileChangedWatcherForTesting,
} from './fileChangedWatcher'
// 输入构造 + 信任门
export { createBaseHookInput } from './createBaseHookInput'
export { shouldSkipHookDueToTrust } from './shouldSkipHookDueToTrust'
// 匹配核心
export { getMatchingHooks } from './getMatchingHooks'
// 参数化分发核心 + 5 高频执行器
export {
  runHooks,
  runPreToolUseHooks,
  runPostToolUseHooks,
  runSessionStartHooks,
  runStopHooks,
  runSessionEndHooks,
  // ATLAS_SIMPLE 执行期钩子守卫（§8.42 MINOR-2，旧仓 hooks.ts:1983/2984 移植）
  isSimpleModeHooksSkipped,
} from './runHooks'
export type { HookRunOptions } from './runHooks'
// 流式执行核心（E-5 S-5b §8.40：旧仓 executeHooks 执行循环移植，解耦 message/attachment；
// L3 re-export 面 = engine/hooks，消费面 = loop 流式 chatStream（E-1b-full 前向接缝））
export { runHooksStream } from './streaming'
export type { HookStreamYield } from './streaming'
// Task 族钩子执行器（§8.56 S-D2：旧仓 executeTaskCreated/CompletedHooks
// AsyncGenerator → run* Promise 适配 delta 登记见 taskHooks.ts 头注）
export {
  runTaskCreatedHooks,
  runTaskCompletedHooks,
  getTaskCreatedHookMessage,
  getTaskCompletedHookMessage,
} from './taskHooks'
