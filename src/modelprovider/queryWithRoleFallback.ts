/**
 * 非流式 role 调用 helper — 从旧仓 modelprovider/queryWithRoleFallback.ts 迁入
 *
 * buildOpenAIParams → modelProvider.chat，首选 role 失败时按 fallbackRole 重建 params 重试。
 */

import { modelProvider } from './index'
import { buildOpenAIParams, toResponseFormat } from './params'
import type { Message, SystemPrompt, ThinkingConfig } from '../shared'
import type { ModelRole } from './roles'

export type RoleQueryOptions = {
  messages: Message[]
  systemPrompt: SystemPrompt
  thinkingConfig?: ThinkingConfig
  role: ModelRole
  fallbackRole?: ModelRole
  sessionModel?: string
  signal?: AbortSignal
  outputFormat?: any
  options?: Record<string, any>
  onPrimaryError?: (error: unknown) => void
  onFallbackError?: (error: unknown) => void
}

export async function queryWithRoleFallback(
  opts: RoleQueryOptions,
): Promise<Awaited<ReturnType<typeof modelProvider.chat>>> {
  const buildParams = async (role: ModelRole) => {
    const params = await buildOpenAIParams(
      {
        messages: opts.messages,
        systemPrompt: opts.systemPrompt,
        thinkingConfig: opts.thinkingConfig,
        tools: [],
        options: { ...opts.options, model: opts.sessionModel },
        role,
      },
      role,
    )
    const responseFormat = opts.outputFormat ? toResponseFormat(opts.outputFormat) : undefined
    return responseFormat ? { ...params, response_format: responseFormat } : params
  }

  try {
    return await modelProvider.chat({
      role: opts.role,
      sessionModel: opts.sessionModel,
      signal: opts.signal,
      openaiParams: await buildParams(opts.role),
      options: opts.options,
    })
  } catch (error) {
    if (!opts.fallbackRole) {
      throw error
    }
    opts.onPrimaryError?.(error)
  }

  const fallbackRole = opts.fallbackRole!
  try {
    return await modelProvider.chat({
      role: fallbackRole,
      signal: opts.signal,
      openaiParams: await buildParams(fallbackRole),
      options: opts.options,
    })
  } catch (error) {
    opts.onFallbackError?.(error)
    throw error
  }
}
