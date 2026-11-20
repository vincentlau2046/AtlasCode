/**
 * AtlasWeb S0-R web 出口（工单 §4.5）+ B0 执行出口面（S2）。
 *
 * 纯 re-export 面：零副作用（禁入口导入就跑 CLI）、零 TUI/private TSX
 * 泄漏（加载图审计）；声明只依赖 contract 公开类型（经 ./contract 相对
 * shim）。
 * S4 落地细化附注：`./web-session-runtime` pack 构建入口已分离至
 * runtimeEntry.ts（pack 合同「零 zod 依赖」× 本文件执行出口面 zod 闭包，
 * 两锚定形消解 = pack entry 分离；本文件面 = runtime 面 + 执行出口面）。
 * S0-R2 形 A（lock-face @25cb7454 §1/§2，f4 批复工单 §7 @351c74c4）：本出口
 * 扩具名导出 `createDefaultReadonlySessionRuntime`（engine 真体随 bundle，
 * pack 格重形 = engine/session 只读闭包允许）；注入缝
 * （createReadonlySessionRuntime options.engine）保留不动（预答不变量）。
 * 内部面不入出口：atlasWebSessionEngine / buildConversationChain /
 * TranscriptMessage（d.ts 泄漏面钉②）。
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

// 执行出口（B0 执行出口合同 §2；S2，呈批书 @196ee806 + f4 批复 @a62925c0）：
// 懒触达 factory + 型面；协议 schema/常量自 kernel/protocol/webExecutionV0
// （zod/v4 唯一闭包，加载图审计格沿用）。
export {
  createExecutionOutlet,
  type ExecutionOutlet,
  type ExecutionOutletOptions,
  type ExecutionDispatchResult,
  type WebExecutionProbeResult,
} from '../../kernel/execution/executionOutlet'
export {
  EXECUTION_SCHEMA_VERSION,
  EXECUTION_PROTOCOL_VERSION,
  EXECUTION_CAPABILITY_DISABLED_CODE,
  WebExecutionCommandSchema,
  WebExecutionEventSchema,
  WebExecutionErrorSchema,
  ExecutionBindSchema,
  type ExecutionBind,
  type ExecutionReplay,
  type WebExecutionCommand,
  type WebExecutionEvent,
  type WebExecutionError,
} from '../../kernel/protocol/webExecutionV0'
