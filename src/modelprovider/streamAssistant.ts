/**
 * 主循环流式编排 — 从旧仓 modelprovider/streamAssistant.ts 迁入
 *
 * callModel 编排体：role 解析 → buildOpenAIParams → modelProvider.chatStream
 * → 过滤产出最终 AssistantMessage（D4 usage 已在 provider 内汇总）。
 *
 * import 适配：Message/AssistantMessage/SystemAPIErrorMessage/SystemPrompt/
 * ThinkingConfig/Tools/StreamEvent → shared + 域内
 */

import { modelProvider } from './index'
import { buildOpenAIParams } from './params'
import { modelToRole } from './roles'
import type { AssistantMessage, Message, SystemPrompt, ThinkingConfig, Tools } from '../shared'
import type { SystemAPIErrorMessage } from '../shared'
import type { StreamEvent } from './types'

export type CallModelOptions = {
  getToolPermissionContext: () => Promise<any>
  model?: string
  toolChoice?: any
  isNonInteractiveSession: boolean
  extraToolSchemas?: any[]
  maxOutputTokensOverride?: number
  temperatureOverride?: number
  fallbackModel?: string
  querySource?: string
  /** role 由调用方显式指定（缺省时从 model 推导或 small）。 */
  role?: string
  [key: string]: any
}

export async function* streamAssistant({
  messages,
  systemPrompt,
  thinkingConfig,
  tools,
  signal,
  options,
}: {
  messages: Message[]
  systemPrompt: SystemPrompt
  thinkingConfig: ThinkingConfig
  tools: Tools
  signal: AbortSignal
  options: CallModelOptions
}): AsyncGenerator<StreamEvent | AssistantMessage | SystemAPIErrorMessage, void> {
  const r = options.role ?? (options.model ? modelToRole(options.model) : 'small')
  const params = await buildOpenAIParams(
    { messages, systemPrompt, thinkingConfig, tools, options, role: r as any },
    r as any,
  )
  for await (const ev of modelProvider.chatStream({
    role: r as any,
    sessionModel: options.model,
    messages: params.messages,
    tools: params.tools,
    maxTokens: params.max_tokens,
    temperature: params.temperature,
    signal,
    toolChoice: params.tool_choice,
    reasoningEffort: params.reasoning_effort,
  })) {
    if (ev.type === 'assistant') {
      yield ev as unknown as AssistantMessage
    } else if (ev.type === 'error') {
      throw new Error(
        `Provider API error: ${(ev as any).message} (code: ${(ev as any).code}, retryable: ${(ev as any).retryable})`,
      )
    }
  }
}
