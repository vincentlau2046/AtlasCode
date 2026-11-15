/**
 * AtlasWeb S0-R `./web-session-runtime` pack 出口（工单 §4.5）。
 *
 * 纯 re-export 面：零副作用（禁入口导入就跑 CLI）、零 'src/engine'/TUI/
 * private TSX 泄漏（§4.5 加载图审计）；声明只依赖 contract 公开类型
 * （经 ./contract 相对 shim）。engine 注入缝（ReadonlySessionEngine）由
 * 消费方提供——CLI 真体装配在本仓 src/atlascode/web/runtimeDefault.ts
 * （不进 pack 图）。
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
} from './readonlyRuntime'

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
