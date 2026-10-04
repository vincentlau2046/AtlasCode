/**
 * 非流式 role 调用 helper — 从旧仓 modelprovider/queryWithRoleFallback.ts 迁入
 *
 * buildOpenAIParams → modelProvider.chat，首选 role 失败时按 fallbackRole 重建 params 重试。
 */

import { modelProvider } from './index'
import { buildOpenAIParams, toResponseFormat } from './params'
import type { Message, SystemPrompt, ThinkingConfig } from '../shared'
import type { ModelRole } from './roles'
import { clearRoleFallback, recordRoleFallback } from './roleFallbackStore'

/**
 * P0b 门禁① 成功侧回退信号（spec §1 L29 钉死）：返回值加性扩展
 * servedRole（实际应答 role）/ fallbackUsed（是否走了 fallbackRole）。
 * 消费者零签名变更——原 chat 响应字段经 spread 全保留，加性字段叠在其上；
 * 非 onFallbackSuccess 回调（TUI 展示面在 await 点同步可得，无中途回调时序）。
 * 失败侧 onPrimaryError/onFallbackError 行为不变。
 */
export type QueryWithRoleFallbackResult = Awaited<
  ReturnType<typeof modelProvider.chat>
> & {
  /** 实际应答的 role（primary 成功 = opts.role；fallback 成功 = fallbackRole）。 */
  servedRole: ModelRole
  /** 是否走了 fallbackRole（primary 失败后重建 params 重试）。 */
  fallbackUsed: boolean
}

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
): Promise<QueryWithRoleFallbackResult> {
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
    const primary = await modelProvider.chat({
      role: opts.role,
      sessionModel: opts.sessionModel,
      signal: opts.signal,
      openaiParams: await buildParams(opts.role),
      options: opts.options,
    })
    // primary 成功 → 无活跃回退（信任线清掉上一次回退标记）+ 加性信号
    clearRoleFallback()
    return { ...primary, servedRole: opts.role, fallbackUsed: false }
  } catch (error) {
    if (!opts.fallbackRole) {
      throw error
    }
    opts.onPrimaryError?.(error)
  }

  const fallbackRole = opts.fallbackRole!
  try {
    const fallback = await modelProvider.chat({
      role: fallbackRole,
      signal: opts.signal,
      openaiParams: await buildParams(fallbackRole),
      options: opts.options,
    })
    // fallback 成功 → 记录最近一次水平回退（信任线「已从 X 回退到 Y」）+ 加性信号
    recordRoleFallback(opts.role, fallbackRole)
    return { ...fallback, servedRole: fallbackRole, fallbackUsed: true }
  } catch (error) {
    opts.onFallbackError?.(error)
    throw error
  }
}
