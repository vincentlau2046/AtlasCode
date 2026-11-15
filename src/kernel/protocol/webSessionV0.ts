/**
 * Web session contract v0 —— S0-U 单源公共契约（0.1.115 候 U-1）。
 * 呈批书 docs/2026-11-15-s0-ur-lockface-brief.md §7.2（f4 批复 2026-11-15 @f1f1099d）；
 * 工单 docs/2026-11-15-atlasweb-s0-upstream-delivery-ticket.md §3.2。
 *
 * 本文件为公开库出口（./web-contract）的唯一源：
 *  - import 面 = zod/v4 唯一（格 C 闭包；与内核 schema 主域同版）；零仓库内 /
 *    Node 内建 / UI 反向导入——浏览器 ESM 与 d.ts 闭包均由该单文件构成。
 *  - Code-neutral 词汇审计格锁定本源（tests/unit/web-session-v0-contract.test.ts
 *    格 C）：禁品牌串与宿主产品专有词汇；中立活动块 = {kind:'activity',label,status?}。
 *  - strict 形：所有对象 schema 用 strictObject（未知字段拒）；ID 非空 ≤128 的
 *    opaque 串，不作盘路径；requestId 每操作 UUID；generation 为运行方生成的不
 *    透明 UUID epoch。
 *  - 协议版本分域：schemaVersion=0（消息形）/ protocolVersion='v0'（配对清单
 *    域，S0-P manifest 绑定面），两者数值不混用。
 *  - 时间与计数未知须显式 null（禁止捏造）；updatedAt 必填（列表排序键，无时间
 *    戳的会话不可列出）。
 *  - 投影 = 完整有效会话语义（truncated 恒 false）；超预算走 resourceLimit 错误，
 *    首车零隐式截断（工单 §3.2）。
 */
import { z } from 'zod/v4'

export const WEB_SESSION_SCHEMA_VERSION = 0
export const WEB_SESSION_PROTOCOL_VERSION = 'v0'

/** 非空 ≤128 的 opaque 标识；不作盘路径（工单 §3.2）。 */
export const OpaqueIdSchema = z.string().min(1).max(128)

/** Opaque 游标/分页 token；运行方账本持有，消费者不可解析。上界 512 为锁面卫生值。 */
export const OpaqueTokenSchema = z.string().min(1).max(512)

const IsoDateTimeSchema = z.iso.datetime()

const RevisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

const EnvelopeFields = {
  schemaVersion: z.literal(WEB_SESSION_SCHEMA_VERSION),
  requestId: z.uuid(),
  productId: OpaqueIdSchema,
  scopeId: OpaqueIdSchema,
} as const

/** 事件（订阅推送）信封：subscriptionId 逐件必填；requestId 可缺（订阅首推）。 */
const EventEnvelopeFields = {
  schemaVersion: z.literal(WEB_SESSION_SCHEMA_VERSION),
  productId: OpaqueIdSchema,
  scopeId: OpaqueIdSchema,
  subscriptionId: OpaqueIdSchema,
  requestId: OpaqueIdSchema.optional(),
} as const

const PageFields = {
  pageSize: z.number().int().min(1).max(200).optional(),
  pageToken: OpaqueTokenSchema.optional(),
} as const

/** Unicode code points 计数（禁按 UTF-16 单元误判）。 */
const codePoints = (s: string) => [...s].length

// ── 请求（6 kinds，判别于 kind）───────────────────────────────────────────────

export const ListSessionsRequestSchema = z.strictObject({
  ...EnvelopeFields,
  kind: z.literal('listSessions'),
  ...PageFields,
})

export const SearchSessionsRequestSchema = z.strictObject({
  ...EnvelopeFields,
  kind: z.literal('searchSessions'),
  query: z
    .string()
    .refine((s) => codePoints(s) >= 1 && codePoints(s) <= 256),
  ...PageFields,
})

export const ReplaySessionRequestSchema = z.strictObject({
  ...EnvelopeFields,
  kind: z.literal('replaySession'),
  sessionId: OpaqueIdSchema,
})

export const FollowSessionRequestSchema = z.strictObject({
  ...EnvelopeFields,
  kind: z.literal('followSession'),
  sessionId: OpaqueIdSchema,
  resumeCursor: OpaqueTokenSchema.optional(),
})

/** 控制面取消：只取消读取/订阅操作本身，不触及宿主产品任何执行面。 */
export const CancelRequestSchema = z.strictObject({
  ...EnvelopeFields,
  kind: z.literal('cancel'),
  targetRequestId: OpaqueIdSchema,
})

export const UnsubscribeRequestSchema = z.strictObject({
  ...EnvelopeFields,
  kind: z.literal('unsubscribe'),
  subscriptionId: OpaqueIdSchema,
})

export const WebSessionRequestSchema = z.discriminatedUnion('kind', [
  ListSessionsRequestSchema,
  SearchSessionsRequestSchema,
  ReplaySessionRequestSchema,
  FollowSessionRequestSchema,
  CancelRequestSchema,
  UnsubscribeRequestSchema,
])

// ── 数据形状 ──────────────────────────────────────────────────────────────────

export const TextBlockSchema = z.strictObject({
  kind: z.literal('text'),
  text: z.string(),
})

/** 中立活动块：宿主产品专有结构经适配层映射至此；未知内容 label='unsupported'。 */
export const ActivityBlockSchema = z.strictObject({
  kind: z.literal('activity'),
  label: z.string().min(1).max(256),
  status: z.string().max(64).optional(),
})

export const BlockSchema = z.discriminatedUnion('kind', [TextBlockSchema, ActivityBlockSchema])

export const ProjectionMessageSchema = z.strictObject({
  id: OpaqueIdSchema,
  role: z.enum(['user', 'assistant', 'system']),
  createdAt: IsoDateTimeSchema.nullable(),
  blocks: z.array(BlockSchema),
})

export const ProjectionSchema = z.strictObject({
  sessionId: OpaqueIdSchema,
  productId: OpaqueIdSchema,
  scopeId: OpaqueIdSchema,
  semantics: z.literal('persisted-effective-conversation'),
  messages: z.array(ProjectionMessageSchema),
  /** 完整投影恒 false；部分内容走 resourceLimit 错误而非静默截断。 */
  truncated: z.literal(false),
})

export const SessionSummarySchema = z.strictObject({
  sessionId: OpaqueIdSchema,
  title: z.string().max(512).nullable(),
  createdAt: IsoDateTimeSchema.nullable(),
  updatedAt: IsoDateTimeSchema,
  messageCount: z.number().int().min(0).nullable(),
  productId: OpaqueIdSchema,
  scopeId: OpaqueIdSchema,
})

export const SearchResultSchema = z.strictObject({
  sessionId: OpaqueIdSchema,
  messageId: OpaqueIdSchema,
  snippet: z.string().refine((s) => codePoints(s) <= 512),
})

// ── 错误联合（判别于 code；ioUnavailable 独占 retryable）────────────────────

const ErrorBodyFields = { message: z.string().max(1024) } as const

const errorCode = <C extends string>(c: C) => z.strictObject({ code: z.literal(c), ...ErrorBodyFields })

export const UnsupportedSchemaErrorSchema = errorCode('unsupportedSchema')
export const InvalidRequestErrorSchema = errorCode('invalidRequest')
export const ScopeDeniedErrorSchema = errorCode('scopeDenied')
export const NotFoundErrorSchema = errorCode('notFound')
export const CorruptDataErrorSchema = errorCode('corruptData')
export const IoUnavailableErrorSchema = z.strictObject({
  code: z.literal('ioUnavailable'),
  ...ErrorBodyFields,
  retryable: z.boolean(),
})
export const CursorExpiredErrorSchema = errorCode('cursorExpired')
export const ResourceLimitErrorSchema = errorCode('resourceLimit')
export const CancelledErrorSchema = errorCode('cancelled')
export const ClosedErrorSchema = errorCode('closed')

export const WebSessionErrorSchema = z.discriminatedUnion('code', [
  UnsupportedSchemaErrorSchema,
  InvalidRequestErrorSchema,
  ScopeDeniedErrorSchema,
  NotFoundErrorSchema,
  CorruptDataErrorSchema,
  IoUnavailableErrorSchema,
  CursorExpiredErrorSchema,
  ResourceLimitErrorSchema,
  CancelledErrorSchema,
  ClosedErrorSchema,
])

// ── 响应（success 判别于 of；error 为独立顶层 kind）─────────────────────────

const ResponseEnvelopeFields = {
  schemaVersion: z.literal(WEB_SESSION_SCHEMA_VERSION),
  requestId: z.uuid(),
  productId: OpaqueIdSchema,
  scopeId: OpaqueIdSchema,
  kind: z.literal('response'),
} as const

export const ListSessionsSuccessSchema = z.strictObject({
  ...ResponseEnvelopeFields,
  of: z.literal('listSessions'),
  sessions: z.array(SessionSummarySchema),
  nextPageToken: OpaqueTokenSchema.optional(),
})

export const SearchSessionsSuccessSchema = z.strictObject({
  ...ResponseEnvelopeFields,
  of: z.literal('searchSessions'),
  results: z.array(SearchResultSchema),
  nextPageToken: OpaqueTokenSchema.optional(),
})

export const ReplaySessionSuccessSchema = z.strictObject({
  ...ResponseEnvelopeFields,
  of: z.literal('replaySession'),
  projection: ProjectionSchema,
})

export const FollowSessionSuccessSchema = z.strictObject({
  ...ResponseEnvelopeFields,
  of: z.literal('followSession'),
  subscriptionId: OpaqueIdSchema,
  cursor: OpaqueTokenSchema.optional(),
})

export const WebSessionSuccessSchema = z.discriminatedUnion('of', [
  ListSessionsSuccessSchema,
  SearchSessionsSuccessSchema,
  ReplaySessionSuccessSchema,
  FollowSessionSuccessSchema,
])

export const WebSessionErrorResponseSchema = z.strictObject({
  schemaVersion: z.literal(WEB_SESSION_SCHEMA_VERSION),
  requestId: z.uuid(),
  productId: OpaqueIdSchema,
  scopeId: OpaqueIdSchema,
  kind: z.literal('error'),
  error: WebSessionErrorSchema,
})

// ── 事件（5 kinds，判别于 kind；resetRequired 不携投影）──────────────────────

export const BaselineEventSchema = z.strictObject({
  ...EventEnvelopeFields,
  kind: z.literal('baseline'),
  generation: z.uuid(),
  baselineId: z.uuid(),
  revision: RevisionSchema,
  cursor: OpaqueTokenSchema,
  projection: ProjectionSchema,
})

export const ReplacementEventSchema = z.strictObject({
  ...EventEnvelopeFields,
  kind: z.literal('replacement'),
  generation: z.uuid(),
  baselineId: z.uuid(),
  revision: RevisionSchema,
  cursor: OpaqueTokenSchema,
  projection: ProjectionSchema,
})

export const ResetRequiredEventSchema = z.strictObject({
  ...EventEnvelopeFields,
  kind: z.literal('resetRequired'),
  generation: z.uuid(),
  reason: z.string().max(256),
})

export const ErrorEventSchema = z.strictObject({
  ...EventEnvelopeFields,
  kind: z.literal('error'),
  error: WebSessionErrorSchema,
})

export const ClosedEventSchema = z.strictObject({
  ...EventEnvelopeFields,
  kind: z.literal('closed'),
  reason: z.string().max(256).optional(),
})

export const WebSessionEventSchema = z.discriminatedUnion('kind', [
  BaselineEventSchema,
  ReplacementEventSchema,
  ResetRequiredEventSchema,
  ErrorEventSchema,
  ClosedEventSchema,
])

// ── 推断类型（公开消费面）─────────────────────────────────────────────────────

export type WebSessionOpaqueId = z.infer<typeof OpaqueIdSchema>
export type WebSessionOpaqueToken = z.infer<typeof OpaqueTokenSchema>
export type WebSessionRequest = z.infer<typeof WebSessionRequestSchema>
export type WebSessionSuccess = z.infer<typeof WebSessionSuccessSchema>
export type WebSessionErrorResponse = z.infer<typeof WebSessionErrorResponseSchema>
export type WebSessionError = z.infer<typeof WebSessionErrorSchema>
export type WebSessionEvent = z.infer<typeof WebSessionEventSchema>
export type WebSessionProjection = z.infer<typeof ProjectionSchema>
export type WebSessionProjectionMessage = z.infer<typeof ProjectionMessageSchema>
export type WebSessionBlock = z.infer<typeof BlockSchema>
export type WebSessionSessionSummary = z.infer<typeof SessionSummarySchema>
export type WebSessionSearchResult = z.infer<typeof SearchResultSchema>
