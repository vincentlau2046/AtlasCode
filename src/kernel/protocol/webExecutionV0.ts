/**
 * Web execution contract v0 —— B0 执行出口波 S2 单源公共契约。
 * 呈批书 docs/2026-11-21-execution-outlet-wave-lockface-brief.md §2 S2
 * （f4 批复六条件 @a62925c0，条件①②随本源落格）；
 * 合同 docs/superpowers/specs/2026-11-20-first-wave-execution-contract.md §2。
 *
 * 本文件为执行出口协议唯一源（沿 kernel/protocol/webSessionV0.ts 同法）：
 *  - import 面 = zod/v4 唯一（格 C 闭包）；零仓库内 / Node 内建 / UI 反向导入。
 *  - strictObject 全覆盖（未知字段拒 = fail-closed）；ID = 非空 ≤128 opaque 串。
 *  - 协议版本分域：schemaVersion=0（消息形）/ protocolVersion='v0'（配对域）。
 *  - 信任级（合同 §2 审计登记 a）：ts 仅信息性，绝不参与结算/排序/授权——
 *    排序以 cursor 为唯一权威，身份以 bind 三元组为准，时钟一律服务端。
 *  - 事件 payload 取 S2 最小 strict 形（turn 域事件以 bind.turnId 绑定，同
 *    「全部携带与命令相同的 bind」）；schema 演进经 schemaVersion 分域升级，
 *    不在本源内静默扩字段。
 *  - 幂等键 (workspaceId, sessionId, submitId) 与 §4/§5/§8 状态机/上限执法
 *    归 kernel 侧（S3），本源只锁 wire 形。
 */
import { z } from 'zod/v4'

export const EXECUTION_SCHEMA_VERSION = 0
export const EXECUTION_PROTOCOL_VERSION = 'v0'

/** 非空 ≤128 的 opaque 标识（同 webSessionV0 词汇）。 */
export const ExecutionOpaqueIdSchema = z.string().min(1).max(128)

/** Opaque 游标 token；cursor 是事件唯一排序权威（合同 §2/§6）。 */
export const ExecutionCursorSchema = z.string().min(1).max(512)

/** bind 三元组：身份以 bind 为准（审计登记 a）；turnId 域命令必填面见各命令。 */
export const ExecutionBindSchema = z.strictObject({
  workspaceId: ExecutionOpaqueIdSchema,
  sessionId: ExecutionOpaqueIdSchema,
  turnId: ExecutionOpaqueIdSchema.optional(),
})

const EnvelopeFields = {
  v: z.literal(EXECUTION_SCHEMA_VERSION),
  id: z.uuid(),
  ts: z.number(),
  bind: ExecutionBindSchema,
} as const

const EventEnvelopeFields = {
  ...EnvelopeFields,
  cursor: ExecutionCursorSchema,
} as const

// ── 命令（6 types，判别于 type；payload 关键字段 = 合同 §2 表）──────────────

export const CapabilityProbeCommandSchema = z.strictObject({
  ...EnvelopeFields,
  type: z.literal('capability.probe'),
  payload: z.strictObject({}),
})

export const TurnSubmitCommandSchema = z.strictObject({
  ...EnvelopeFields,
  type: z.literal('turn.submit'),
  payload: z.strictObject({
    /** 客户端 UUID；幂等键 (workspaceId, sessionId, submitId)（§3，kernel 侧执法）。 */
    submitId: z.uuid(),
    text: z.string().min(1),
  }),
})

const TargetTurnPayload = { targetTurnId: ExecutionOpaqueIdSchema } as const

export const TurnCancelCommandSchema = z.strictObject({
  ...EnvelopeFields,
  type: z.literal('turn.cancel'),
  payload: z.strictObject(TargetTurnPayload),
})

/** queue.remove 语义 ≡ turn.cancel(queued)：落 cancelled 终态，不静默移除（审计必改 1）。 */
export const QueueRemoveCommandSchema = z.strictObject({
  ...EnvelopeFields,
  type: z.literal('queue.remove'),
  payload: z.strictObject(TargetTurnPayload),
})

/** decide 归属绑定：bind 须含 turnId 且 ≡ approval.requested 归属 turn（审计必改 2）。 */
export const ApprovalDecideCommandSchema = z.strictObject({
  ...EnvelopeFields,
  bind: ExecutionBindSchema.required({ turnId: true }),
  type: z.literal('approval.decide'),
  payload: z.strictObject({
    approvalId: ExecutionOpaqueIdSchema,
    decision: z.enum(['approved', 'denied']),
  }),
})

export const FollowResumeCommandSchema = z.strictObject({
  ...EnvelopeFields,
  type: z.literal('follow.resume'),
  payload: z.strictObject({
    cursor: ExecutionCursorSchema.optional(),
  }),
})

export const WebExecutionCommandSchema = z.discriminatedUnion('type', [
  CapabilityProbeCommandSchema,
  TurnSubmitCommandSchema,
  TurnCancelCommandSchema,
  QueueRemoveCommandSchema,
  ApprovalDecideCommandSchema,
  FollowResumeCommandSchema,
])

// ── 错误形（合同 §2：{code, message, retryable}；code 为 wire 开集）─────────

export const WebExecutionErrorSchema = z.strictObject({
  code: z.string().min(1).max(128),
  message: z.string().max(1024),
  retryable: z.boolean(),
})

/** 出口面默认拒（能力开关 off）专用 code —— E1 增格落点（f4 批复条件②）。 */
export const EXECUTION_CAPABILITY_DISABLED_CODE = 'capabilityDisabled'

// ── 事件（10 types，判别于 type；全部携 bind + 单调 cursor）─────────────────

export const TurnAcceptedEventSchema = z.strictObject({
  ...EventEnvelopeFields,
  type: z.literal('turn.accepted'),
  payload: z.strictObject({ submitId: z.uuid() }),
})

export const TurnStartedEventSchema = z.strictObject({
  ...EventEnvelopeFields,
  type: z.literal('turn.started'),
  payload: z.strictObject({}),
})

export const TurnDeltaEventSchema = z.strictObject({
  ...EventEnvelopeFields,
  type: z.literal('turn.delta'),
  payload: z.strictObject({ text: z.string() }),
})

export const TurnCompletedEventSchema = z.strictObject({
  ...EventEnvelopeFields,
  type: z.literal('turn.completed'),
  payload: z.strictObject({}),
})

export const TurnFailedEventSchema = z.strictObject({
  ...EventEnvelopeFields,
  type: z.literal('turn.failed'),
  payload: z.strictObject({ message: z.string().max(1024) }),
})

export const TurnCancelledEventSchema = z.strictObject({
  ...EventEnvelopeFields,
  type: z.literal('turn.cancelled'),
  payload: z.strictObject({}),
})

export const ApprovalRequestedEventSchema = z.strictObject({
  ...EventEnvelopeFields,
  type: z.literal('approval.requested'),
  payload: z.strictObject({ approvalId: ExecutionOpaqueIdSchema }),
})

/**
 * 有效决定恰一个（§4）：approved | denied | expired | voidedByCancel。
 * settled payload 携 actorId + timestamp（f4 S2 抽验裁定 @2026-11-21）：
 * §5 证据记录七字段中服务端产两字段经本事件上抛（B 附表 §3 actorId 展示值
 * 取自 approval.settled，不本地推断）；actorId = 服务端解析的连接身份，
 * timestamp = 服务端时钟（与信封 ts 同信任级：仅展示/互证，不参与结算）。
 */
export const ApprovalSettledEventSchema = z.strictObject({
  ...EventEnvelopeFields,
  type: z.literal('approval.settled'),
  payload: z.strictObject({
    approvalId: ExecutionOpaqueIdSchema,
    decision: z.enum(['approved', 'denied', 'expired', 'voidedByCancel']),
    actorId: ExecutionOpaqueIdSchema,
    timestamp: z.number(),
  }),
})

export const QueueUpdatedEventSchema = z.strictObject({
  ...EventEnvelopeFields,
  type: z.literal('queue.updated'),
  payload: z.strictObject({ depth: z.number().int().min(0) }),
})

export const ErrorEventSchema = z.strictObject({
  ...EventEnvelopeFields,
  type: z.literal('error'),
  payload: z.strictObject({ error: WebExecutionErrorSchema }),
})

export const WebExecutionEventSchema = z.discriminatedUnion('type', [
  TurnAcceptedEventSchema,
  TurnStartedEventSchema,
  TurnDeltaEventSchema,
  TurnCompletedEventSchema,
  TurnFailedEventSchema,
  TurnCancelledEventSchema,
  ApprovalRequestedEventSchema,
  ApprovalSettledEventSchema,
  QueueUpdatedEventSchema,
  ErrorEventSchema,
])

/**
 * §6 follow 恢复原语结果（S4）：按当前订阅代采信、增量恰一次、过期 → 基线
 * 替换信号（不合并旧事件）。baseline = 初始跟随（投影走持久化回读，SSE 仅
 * 视图）；delta = cursor 后增量（不重不漏）；expired = cursor 不在缓冲/
 * 溢出丢弃/外来未来 cursor（fail-closed）。型归协议文件以保出口 import 闭包。
 *
 * f4 S4 修正裁定（wire 形）：follow.resume 命令响应与本原语同形归一（完整
 * 三态，不并存两形）。baseline 语义明示：**执行流基线为空**（events=[] +
 * headCursor）——内容基线经只读 replay 面重读；基线替换 = 重读持久态 +
 * 自 headCursor 收增量（B1 adapter 按此消费）。
 */
export type ExecutionReplay =
  | { kind: 'baseline'; events: []; headCursor: string }
  | { kind: 'delta'; events: WebExecutionEvent[]; headCursor: string }
  | { kind: 'expired'; events: []; headCursor: string }

// ── 推断类型（公开消费面）─────────────────────────────────────────────────────

export type ExecutionBind = z.infer<typeof ExecutionBindSchema>
export type WebExecutionCommand = z.infer<typeof WebExecutionCommandSchema>
export type WebExecutionEvent = z.infer<typeof WebExecutionEventSchema>
export type WebExecutionError = z.infer<typeof WebExecutionErrorSchema>
