/**
 * errorMessaging 端口族 — 从旧仓 modelprovider/errorMessaging.ts 端口定义部分迁入
 *
 * 宿主（atlascode/compose.ts）注册端口族；modelprovider 域只面向端口编程。
 * 核心错误分类逻辑在域内 errorMessaging.ts；环境文案决策点走端口注入。
 */

import type { APIError } from '../types'
import type { AssistantMessage } from '../../shared'
import type { SDKAssistantMessageError } from '../types'

/** AssistantMessage 错误工厂端口。 */
export type CreateApiErrorMessagePort = (input: {
  content: string
  error?: SDKAssistantMessageError
  errorDetails?: string
}) => AssistantMessage

/** image/document 错误类端口。 */
export type ResolveImageErrorPort = (
  error: unknown,
) => { content: string; errorDetails?: string } | undefined

/** 429 限流文案端口。 */
export type ResolveRateLimitMessagePort = (
  error: APIError,
  model: string,
) => AssistantMessage | undefined

/** auth/CCR/org-disabled 分支族端口。 */
export type ResolveAuthErrorMessagingPort = (
  error: APIError | Error,
  model: string,
) => AssistantMessage | undefined

/** refusal 文案端口。 */
export type ResolveRefusalMessagePort = (model: string) => string

/** ANT-ONLY / invalid-model 文案端口。 */
export type ResolveAntOnlyMessagePort = (
  error: unknown,
  model: string,
) => string | undefined

/** 交互/SDK 文案变体开关端口。 */
export type IsNonInteractivePort = () => boolean

/** 错误消息端口族总览（宿主一次性注册）。 */
export type ErrorMessagingPorts = {
  createApiErrorMessage: CreateApiErrorMessagePort
  resolveImageError?: ResolveImageErrorPort
  resolveRateLimitMessage?: ResolveRateLimitMessagePort
  resolveAuthErrorMessaging?: ResolveAuthErrorMessagingPort
  resolveRefusalMessage?: ResolveRefusalMessagePort
  resolveAntOnlyMessage?: ResolveAntOnlyMessagePort
  isNonInteractive?: IsNonInteractivePort
}
