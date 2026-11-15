/**
 * AtlasWeb S0-R（0.1.116 候）web 域错误单源。
 *
 * 工单 docs/2026-11-15-atlasweb-s0-upstream-delivery-ticket.md §4.1 /
 * 呈批书 docs/2026-11-15-s0-ur-lockface-brief.md §7.3-§7.5（f4 批复
 * @f1f1099d）。code 域 = contract 错误联合 10 codes
 * （src/kernel/protocol/webSessionV0.ts WebSessionErrorSchema）。
 * ioUnavailable 独占 retryable（契约钉死，其余 code 不携该字段）。
 */

export type WebSessionErrorCode =
  | 'unsupportedSchema'
  | 'invalidRequest'
  | 'scopeDenied'
  | 'notFound'
  | 'corruptData'
  | 'ioUnavailable'
  | 'cursorExpired'
  | 'resourceLimit'
  | 'cancelled'
  | 'closed'

export class WebSessionError extends Error {
  readonly code: WebSessionErrorCode
  /** 仅 ioUnavailable 语义位（契约：其余 code 不投影该字段）。 */
  readonly retryable?: boolean

  constructor(code: WebSessionErrorCode, message: string, retryable?: boolean) {
    super(message)
    this.name = 'WebSessionError'
    this.code = code
    if (retryable !== undefined) this.retryable = retryable
  }
}
