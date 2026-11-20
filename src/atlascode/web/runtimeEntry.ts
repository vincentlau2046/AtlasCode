/**
 * `./web-session-runtime` pack 构建入口（S0-R 工单 §4.5 面）。
 *
 * B0 执行出口波 S4 落地细化附注（lock-face 呈批书 @196ee806 范围内细化，
 * 不改切片边界）：S0-R pack 合同锚定「零 zod/contract 依赖，纯 runtime 面」
 * （tests/func/web-session-runtime-pack.test.ts），而 S2 将执行出口具名导出
 * 扩入 entry.ts（§1 定名）引入 zod/v4 闭包——两锚定形冲突，
 * 消解 = pack 构建入口与公开出口分离：
 * 漂移守卫：本文件导出名 ⊆ entry.ts 导出名（web-execution-v0 格 C 机器判）。
 */

// runtime factory + 生命周期面
export {
  createReadonlySessionRuntime,
  type ReadonlySessionRuntime,
  type ReadonlySessionRuntimeOptions,
  type ReadonlySessionEngine,
  type ReadonlySessionScopes,
  type ReadonlySessionLimits,
  type ResolvedLimits,
  type ListSessionsRequest,
  type ListSessionsResult,
  type ReplaySessionRequest,
  type ReplaySessionResult,
  type FollowSessionRequest,
  type FollowSubscription,
  // S0-R4 件 A（呈批书 L5 公开类型面：searchSessions 新增型逐型随契约）
  type SearchSessionsRequest,
  type SearchSessionsResult,
} from './readonlyRuntime'

// S0-R2 形 A 默认装配（engine 真体随 bundle）
export {
  createDefaultReadonlySessionRuntime,
  type AtlasWebSessionRuntimeOptions,
} from './runtimeDefault'

// follow 订阅机句柄
export type { FollowHandle } from './follow'

// 只读 storage adapter 注入缝（host 可注入 fake / 自定义只读源）
export type {
  SessionStoreAdapter,
  SessionStoreScopes,
  SessionFileEntry,
  TranscriptStat,
  TranscriptTail,
} from './sessionStoreAdapter'

// 中立投影类型（Code→中立，persisted-effective-conversation）
export type {
  NeutralProjection,
  NeutralProjectionMessage,
  NeutralBlock,
  ProjectionSourceMessage,
  ProjectionEngineDeps,
  ProjectionLoad,
} from './projection'

// 错误面（10 code + retryable 语义位）
export { WebSessionError, type WebSessionErrorCode } from './errors'
