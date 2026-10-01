import type {
  BetaToolUnion,
  MessageParam as AMessageParam,
  TextBlockParam as ATextBlockParam,
  ToolChoice as AToolChoice,
  BetaMessage as ABetaMessage,
  BetaJSONOutputFormat as ABetaJSONOutputFormat,
  BetaThinkingConfigParam as ABetaThinkingConfigParam,
} from '../types/atlas.js'
import {
  getLastApiCompletionTimestamp,
  setLastApiCompletionTimestamp,
} from 'src/tui/bootstrapState.js'
import { STRUCTURED_OUTPUTS_BETA_HEADER } from '../constants/betas.js'
import type { QuerySource } from '../constants/querySource.js'
import {
  getAttributionHeader,
  getCLISyspromptPrefix,
} from '../constants/system.js'
import { getAPIMetadata } from '../services/api/metadata.js'
import { modelProvider, buildOpenAIParams } from 'src/modelprovider'
import { asSystemPrompt } from './systemPromptType.js'
import { getModelBetas, modelSupportsStructuredOutputs } from './betas.js'
import { computeFingerprint } from './fingerprint.js'
import { errorMessage } from './errors.js'
import { normalizeModelStringForAPI, modelToRole } from 'src/modelprovider'
import { logError } from './log.js'

type MessageParam = AMessageParam
type TextBlockParam = ATextBlockParam
type Tool = any
type ToolChoice = AToolChoice
type BetaMessage = ABetaMessage
type BetaJSONOutputFormat = ABetaJSONOutputFormat
type BetaThinkingConfigParam = ABetaThinkingConfigParam

export type SideQueryOptions = {
  /** Model to use for the query */
  model: string
  /**
   * System prompt - string or array of text blocks (will be prefixed with CLI attribution).
   *
   * The attribution header is always placed in its own TextBlockParam block to ensure
   * server-side parsing correctly extracts the cc_entrypoint value without including
   * system prompt content.
   */
  system?: string | TextBlockParam[]
  /** Messages to send (supports cache_control on content blocks) */
  messages: MessageParam[]
  /** Optional tools (supports both standard Tool[] and BetaToolUnion[] for custom tool types) */
  tools?: Tool[] | BetaToolUnion[]
  /** Optional tool choice (use { type: 'tool', name: 'x' } for forced output) */
  tool_choice?: ToolChoice
  /** Optional JSON output format for structured responses */
  output_format?: BetaJSONOutputFormat
  /** Max tokens (default: 1024) */
  max_tokens?: number
  /** Max retries (default: 2) */
  maxRetries?: number
  /** Abort signal */
  signal?: AbortSignal
  /** Skip CLI system prompt prefix (keeps attribution header for OAuth). For internal classifiers that provide their own prompt. */
  skipSystemPromptPrefix?: boolean
  /** Temperature override */
  temperature?: number
  /** Thinking budget (enables thinking), or `false` to send `{ type: 'disabled' }`. */
  thinking?: number | false
  /** Stop sequences — generation stops when any of these strings is emitted */
  stop_sequences?: string[]
  /** Attributes this call in atlas_api_success for COGS joining against reporting.sampling_calls. */
  querySource: QuerySource
}

/**
 * Extract text from first user message for fingerprint computation.
 */
function extractFirstUserMessageText(messages: MessageParam[]): string {
  const firstUserMessage = messages.find(m => m.role === 'user')
  if (!firstUserMessage) return ''

  const content = firstUserMessage.content
  if (typeof content === 'string') return content

  // Array of content blocks - find first text block
  const textBlock = content.find(block => block.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text : ''
}

/**
 * Lightweight API wrapper for "side queries" outside the main conversation loop.
 *
 * Use this instead of direct client.beta.messages.create() calls to ensure
 * proper OAuth token validation with fingerprint attribution headers.
 *
 * This handles:
 * - Fingerprint computation for OAuth validation
 * - Attribution header injection
 * - CLI system prompt prefix
 * - Proper betas for the model
 * - API metadata
 * - Model string normalization
 *
 * @example
 * // Permission explainer
 * await sideQuery({ querySource: 'permission_explainer', model, system: SYSTEM_PROMPT, messages, tools, tool_choice })
 *
 * @example
 * // Session search
 * await sideQuery({ querySource: 'session_search', model, system: SEARCH_PROMPT, messages })
 *
 * @example
 * // Model validation
 * await sideQuery({ querySource: 'model_validation', model, max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] })
 */
export async function sideQuery(opts: SideQueryOptions): Promise<BetaMessage> {
  const {
    model,
    system,
    messages,
    tools,
    tool_choice,
    output_format,
    max_tokens = 1024,
    maxRetries = 2,
    signal,
    skipSystemPromptPrefix,
    temperature,
    thinking,
    stop_sequences,
  } = opts

  const betas = [...getModelBetas(model)]
  // Add structured-outputs beta if using output_format and provider supports it
  if (
    output_format &&
    modelSupportsStructuredOutputs(model) &&
    !betas.includes(STRUCTURED_OUTPUTS_BETA_HEADER)
  ) {
    betas.push(STRUCTURED_OUTPUTS_BETA_HEADER)
  }

  // Extract first user message text for fingerprint
  const messageText = extractFirstUserMessageText(messages)

  // Compute fingerprint for OAuth attribution
  const fingerprint = computeFingerprint(messageText, MACRO.VERSION)
  const attributionHeader = getAttributionHeader(fingerprint)

  let thinkingConfig: BetaThinkingConfigParam | undefined
  if (thinking === false) {
    thinkingConfig = { type: 'disabled' }
  } else if (thinking !== undefined) {
    thinkingConfig = {
      type: 'enabled',
      budget_tokens: Math.min(thinking, max_tokens - 1),
    }
  }

  const normalizedModel = normalizeModelStringForAPI(model)
  const start = Date.now()

  // P5 Step C（06 文档 §1.3-4 遗留）：参数组装统一收敛到共享 builder
  // buildOpenAIParams。system 仍按 Bug A 的约束拼成单条 {role:'system'} 消息
  // （网关无顶层 system 字段），attribution header 保持独立块以防服务端解析
  // 把 system 内容并入 cc_entrypoint。
  const systemStrings: string[] = []
  if (attributionHeader) systemStrings.push(attributionHeader)
  if (!skipSystemPromptPrefix) {
    systemStrings.push(
      getCLISyspromptPrefix({
        isNonInteractive: false,
        hasAppendSystemPrompt: false,
      }),
    )
  }
  if (Array.isArray(system)) {
    for (const block of system) systemStrings.push(block.text)
  } else if (system) {
    systemStrings.push(system)
  }
  const openaiParams = await buildOpenAIParams(
    {
      messages,
      systemPrompt: asSystemPrompt(systemStrings),
      thinkingConfig,
      tools: (tools ?? []) as any,
      options: {
        model: normalizedModel,
        maxOutputTokensOverride: max_tokens,
        temperatureOverride: temperature,
        toolChoice: tool_choice,
      },
      betas,
      thinking: thinkingConfig,
      outputFormat: output_format,
      stopSequences: stop_sequences,
    },
    modelToRole(model),
  )
  const role = modelToRole(model)
  // biome-ignore lint/plugin: this IS the wrapper that handles OAuth attribution
  let response: any
  try {
    response = (await modelProvider.chat({
      role,
      sessionModel: normalizedModel,
      signal,
      openaiParams,
      options: { maxOutputTokensOverride: max_tokens, temperatureOverride: temperature },
    })).message
  } catch (error) {
    logError(error)
    // Re-throw with context so callers can tell which role/model failed.
    throw new Error(`Side query failed (${role}/${normalizedModel}): ${errorMessage(error)}`)
  }
  const requestId = (response as { _request_id?: string | null })._request_id ?? undefined
  const now = Date.now()
  const lastCompletion = getLastApiCompletionTimestamp()
  setLastApiCompletionTimestamp(now)

  return response
}
