import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaImageBlockParam,
  BetaJSONOutputFormat,
  BetaMessage,
  BetaMessageStreamParams,
  BetaOutputConfig,
  BetaRawMessageStreamEvent,
  BetaRequestDocumentBlock,
  BetaStopReason,
  BetaToolChoiceAuto,
  BetaToolChoiceTool,
  BetaToolResultBlockParam,
  BetaToolUnion,
  BetaMessageParam as MessageParam,
} from '../../../types/atlas.js'
import type { TextBlockParam } from '../../../types/atlas.js'
import type { Stream } from '../../../types/atlas.js'
import { randomUUID } from 'crypto'
import {
  isFirstPartyGatewayUrl,
} from 'src/tui/utils/model/providers.js'
import {
  getAttributionHeader,
  getCLISyspromptPrefix,
} from '../../../constants/system.js'
import {
  type QueryChainTracking,
  type Tool,
  type ToolPermissionContext,
  type Tools,
  toolMatchesName,
} from '../../../Tool.js'
import type { AgentDefinition } from '../../../tools/AgentTool/loadAgentsDir.js'
import {
  type ConnectorTextBlock,
  type ConnectorTextDelta,
  isConnectorTextBlock,
} from '../../../types/connectorText.js'
import type {
  AssistantMessage,
  Message,
  StreamEvent,
  SystemAPIErrorMessage,
  UserMessage,
} from '../../../types/message.js'
import { splitSysPromptPrefix } from '../../../utils/api.js'
import {
  CAPPED_DEFAULT_MAX_TOKENS,
  getModelMaxOutputTokens,
} from '../../../utils/context.js'
import { resolveAppliedEffort } from '../../../utils/effort.js'
import { computeFingerprintFromMessages } from '../../../utils/fingerprint.js'
import {
  createAssistantAPIErrorMessage,
  createUserMessage,
  ensureToolResultPairing,
  normalizeContentFromAPI,
  normalizeMessagesForAPI,
  stripAdvisorBlocks,
  stripCallerFieldFromAssistantMessage,
  stripToolReferenceBlocksFromUserMessage,
} from '../../../utils/messages.js'
import {
  asSystemPrompt,
  type SystemPrompt,
} from '../../../utils/systemPromptType.js'
import { tokenCountFromLastAPIResponse } from '../../../utils/tokens.js'
import { getDynamicConfig_BLOCKS_ON_INIT } from '../../../services/analytics/growthbook.js'
import { getAPIContextManagement } from '../context/apiMicrocompact.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const autoModeStateModule = feature('TRANSCRIPT_CLASSIFIER')
  ? (require('../../../utils/permissions/autoModeState.js') as typeof import('../../../utils/permissions/autoModeState.js'))
  : null

import { feature } from 'src/shared' // F5: stub import — dev source-direct can flip TRANSCRIPT_CLASSIFIER (see src/native-ts/bunBundle.ts)
import type { ClientOptions } from '../../../types/atlas.js'
import {
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from '../../../types/atlas.js'
import { getSessionId } from 'src/bootstrap'
import { getAfkModeHeaderLatched, getCacheEditingHeaderLatched, getLastApiCompletionTimestamp, getPromptCache1hAllowlist, getPromptCache1hEligible, getThinkingClearLatched, setAfkModeHeaderLatched, setCacheEditingHeaderLatched, setLastMainRequestId, setPromptCache1hAllowlist, setPromptCache1hEligible, setThinkingClearLatched } from 'src/tui/bootstrapState.js'
import {
  AFK_MODE_BETA_HEADER,
  CONTEXT_MANAGEMENT_BETA_HEADER,
  EFFORT_BETA_HEADER,
  PROMPT_CACHING_SCOPE_BETA_HEADER,
  REDACT_THINKING_BETA_HEADER,
  STRUCTURED_OUTPUTS_BETA_HEADER,
  TASK_BUDGETS_BETA_HEADER,
} from 'src/tui/constants/betas.js'
import type { QuerySource } from 'src/tui/constants/querySource.js'
import type { Notification } from 'src/tui/context/notifications.js'
import { addToTotalSessionCost } from 'src/tui/cost-tracker.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/tui/services/analytics/growthbook.js'
import type { AgentId } from 'src/tui/types/ids.js'
import {
  ADVISOR_TOOL_INSTRUCTIONS,
  getExperimentAdvisorModels,
  isAdvisorEnabled,
  isValidAdvisorModel,
  modelSupportsAdvisor,
} from 'src/tui/utils/advisor.js'
import { getAgentContext } from 'src/tui/utils/agentContext.js'
import { shouldIncludeFirstPartyOnlyBetas } from 'src/tui/utils/betas.js'
import { getMaxThinkingTokensForModel } from 'src/tui/utils/context.js'
import { logForDebugging } from 'src/tui/utils/debug.js'
import { logForDiagnosticsNoPII } from 'src/tui/utils/diagLogs.js'
import { type EffortValue, modelSupportsEffort } from 'src/tui/utils/effort.js'
import { headlessProfilerCheckpoint } from 'src/tui/utils/headlessProfiler.js'
import { isMcpInstructionsDeltaEnabled } from 'src/tui/utils/mcpInstructionsDelta.js'
import { endQueryProfile, queryCheckpoint } from 'src/tui/utils/queryProfiler.js'
import {
  modelSupportsAdaptiveThinking,
  modelSupportsThinking,
  type ThinkingConfig,
} from 'src/tui/utils/thinking.js'
import {
  extractDiscoveredToolNames,
  isDeferredToolsDeltaEnabled,
  isToolSearchEnabled,
} from 'src/tui/utils/toolSearch.js'
import { API_MAX_MEDIA_PER_REQUEST } from '../../../constants/apiLimits.js'
import { ADVISOR_BETA_HEADER } from '../../../constants/betas.js'
import {
  formatDeferredToolLine,
  isDeferredTool,
  TOOL_SEARCH_TOOL_NAME,
} from '../../../tools/ToolSearchTool/prompt.js'
import { count } from '../../../utils/array.js'
import { insertBlockAfterToolResults } from '../../../utils/contentArray.js'
import { validateBoundedIntEnvVar } from '../../../utils/envValidation.js'
import { parseUserSpecifiedModel } from '../../../utils/model/model.js'
import { normalizeModelStringForAPI } from 'src/modelprovider'
import {
  startSessionActivity,
  stopSessionActivity,
} from '../../../utils/sessionActivity.js'
import {
  isBetaTracingEnabled,
  type LLMRequestNewContext,
  startLLMRequestSpan,
} from '../../../utils/telemetry/sessionTracing.js'
/* eslint-enable @typescript-eslint/no-require-imports */
import {
  consumePendingCacheEdits,
  getPinnedCacheEdits,
  markToolsSentToAPIState,
  pinCacheEdits,
} from '../context/microCompact.js'
import { getInitializationStatus } from '../../../services/lsp/manager.js'
import { isToolFromMcpServer } from '../../../services/mcp/utils.js'
import { CLIENT_REQUEST_ID_HEADER } from '../../../services/api/client.js'
import {
  API_ERROR_MESSAGE_PREFIX,
  getAssistantMessageFromError,
  getErrorMessageIfRefusal,
} from 'src/modelprovider'
import {
  EMPTY_USAGE,
  type GlobalCacheStrategy,
  type NonNullableUsage,
} from '../../../services/api/logging.js'
import {
  CACHE_TTL_1HOUR_MS,
  checkResponseForCacheBreak,
  recordPromptState,
} from '../../../services/api/promptCacheBreakDetection.js'
import { getCacheControl } from '../../../services/api/metadata.js'

// Define a type that represents valid JSON values
type JsonValue = string | number | boolean | null | JsonObject | JsonArray
type JsonObject = { [key: string]: JsonValue }
type JsonArray = JsonValue[]


export function userMessageToMessageParam(
  message: UserMessage,
  addCache = false,
  enablePromptCaching: boolean,
  querySource?: QuerySource,
): MessageParam {
  if (addCache) {
    if (typeof message.message.content === 'string') {
      return {
        role: 'user',
        content: [
          {
            type: 'text',
            text: message.message.content,
            ...(enablePromptCaching && {
              cache_control: getCacheControl({ querySource }),
            }),
          },
        ],
      }
    } else {
      return {
        role: 'user',
        content: message.message.content.map((_, i) => ({
          ..._,
          ...(i === message.message.content.length - 1
            ? enablePromptCaching
              ? { cache_control: getCacheControl({ querySource }) }
              : {}
            : {}),
        })),
      }
    }
  }
  // Clone array content to prevent in-place mutations (e.g., insertCacheEditsBlock's
  // splice) from contaminating the original message. Without cloning, multiple calls
  // to addCacheBreakpoints share the same array and each splices in duplicate cache_edits.
  return {
    role: 'user',
    content: Array.isArray(message.message.content)
      ? [...message.message.content]
      : message.message.content,
  }
}

export function assistantMessageToMessageParam(
  message: AssistantMessage,
  addCache = false,
  enablePromptCaching: boolean,
  querySource?: QuerySource,
): MessageParam {
  if (addCache) {
    if (typeof message.message.content === 'string') {
      return {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: message.message.content,
            ...(enablePromptCaching && {
              cache_control: getCacheControl({ querySource }),
            }),
          },
        ],
      }
    } else {
      return {
        role: 'assistant',
        content: message.message.content.map((_, i) => ({
          ..._,
          ...(i === message.message.content.length - 1 &&
          _.type !== 'thinking' &&
          _.type !== 'redacted_thinking' &&
          (feature('CONNECTOR_TEXT') ? !isConnectorTextBlock(_) : true)
            ? enablePromptCaching
              ? { cache_control: getCacheControl({ querySource }) }
              : {}
            : {}),
        })),
      }
    }
  }
  return {
    role: 'assistant',
    content: message.message.content,
  }
}

// 12号§11.5.2：泛名 Options 改名 LlmQueryOptions（pi chord 原则：泛名不应污染根 API）；
// 域内定义 + 唯一消费方（services/api/metadata.ts）随迁。
export type LlmQueryOptions = {
  getToolPermissionContext: () => Promise<ToolPermissionContext>
  model: string
  toolChoice?: BetaToolChoiceTool | BetaToolChoiceAuto | undefined
  isNonInteractiveSession: boolean
  extraToolSchemas?: BetaToolUnion[]
  maxOutputTokensOverride?: number
  fallbackModel?: string
  onStreamingFallback?: () => void
  querySource: QuerySource
  agents: AgentDefinition[]
  allowedAgentTypes?: string[]
  hasAppendSystemPrompt: boolean
  fetchOverride?: ClientOptions['fetch']
  enablePromptCaching?: boolean
  skipCacheWrite?: boolean
  temperatureOverride?: number
  effortValue?: EffortValue
  mcpTools: Tools
  hasPendingMcpServers?: boolean
  queryTracking?: QueryChainTracking
  agentId?: AgentId // Only set for subagents
  outputFormat?: BetaJSONOutputFormat
  advisorModel?: string
  addNotification?: (notif: Notification) => void
  // API-side task budget (output_config.task_budget). Distinct from the
  // tokenBudget.ts +500k auto-continue feature — this one is sent to the API
  // so the model can pace itself. `remaining` is computed by the caller
  // (query.ts decrements across the agentic loop).
  taskBudget?: { total: number; remaining?: number }
}

/**
 * Cleans up stream resources to prevent memory leaks.
 * @internal Exported for testing
 */
export function cleanupStream(
  stream: Stream<BetaRawMessageStreamEvent> | undefined,
): void {
  if (!stream) {
    return
  }
  try {
    // Abort the stream via its controller if not already aborted
    if (!stream.controller.signal.aborted) {
      stream.controller.abort()
    }
  } catch {
    // Ignore - stream may already be closed
  }
}


function isToolResultBlock(
  block: unknown,
): block is { type: 'tool_result'; tool_use_id: string } {
  return (
    block !== null &&
    typeof block === 'object' &&
    'type' in block &&
    (block as { type: string }).type === 'tool_result' &&
    'tool_use_id' in block
  )
}

type CachedMCEditsBlock = {
  type: 'cache_edits'
  edits: { type: 'delete'; cache_reference: string }[]
}

type CachedMCPinnedEdits = {
  userMessageIndex: number
  block: CachedMCEditsBlock
}

// Exported for testing cache_reference placement constraints
export function addCacheBreakpoints(
  messages: (UserMessage | AssistantMessage)[],
  enablePromptCaching: boolean,
  querySource?: QuerySource,
  useCachedMC = false,
  newCacheEdits?: CachedMCEditsBlock | null,
  pinnedEdits?: CachedMCPinnedEdits[],
  skipCacheWrite = false,
): MessageParam[] {

  // Exactly one message-level cache_control marker per request. Mycro's
  // turn-to-turn eviction (page_manager/index.rs: Index::insert) frees
  // local-attention KV pages at any cached prefix position NOT in
  // cache_store_int_token_boundaries. With two markers the second-to-last
  // position is protected and its locals survive an extra turn even though
  // nothing will ever resume from there — with one marker they're freed
  // immediately. For fire-and-forget forks (skipCacheWrite) we shift the
  // marker to the second-to-last message: that's the last shared-prefix
  // point, so the write is a no-op merge on mycro (entry already exists)
  // and the fork doesn't leave its own tail in the KVCC. Dense pages are
  // refcounted and survive via the new hash either way.
  const markerIndex = skipCacheWrite ? messages.length - 2 : messages.length - 1
  const result = messages.map((msg, index) => {
    const addCache = index === markerIndex
    if (msg.type === 'user') {
      return userMessageToMessageParam(
        msg as any,
        addCache,
        enablePromptCaching,
        querySource,
      )
    }
    return assistantMessageToMessageParam(
      msg as any,
      addCache,
      enablePromptCaching,
      querySource,
    )
  })

  if (!useCachedMC) {
    return result
  }

  // Track all cache_references being deleted to prevent duplicates across blocks.
  const seenDeleteRefs = new Set<string>()

  // Helper to deduplicate a cache_edits block against already-seen deletions
  const deduplicateEdits = (block: CachedMCEditsBlock): CachedMCEditsBlock => {
    const uniqueEdits = block.edits.filter(edit => {
      if (seenDeleteRefs.has(edit.cache_reference)) {
        return false
      }
      seenDeleteRefs.add(edit.cache_reference)
      return true
    })
    return { ...block, edits: uniqueEdits }
  }

  // Re-insert all previously-pinned cache_edits at their original positions
  for (const pinned of pinnedEdits ?? []) {
    const msg = result[pinned.userMessageIndex]
    if (msg && msg.role === 'user') {
      if (!Array.isArray(msg.content)) {
        msg.content = [{ type: 'text', text: msg.content as string }]
      }
      const dedupedBlock = deduplicateEdits(pinned.block)
      if (dedupedBlock.edits.length > 0) {
        insertBlockAfterToolResults(msg.content, dedupedBlock)
      }
    }
  }

  // Insert new cache_edits into the last user message and pin them
  if (newCacheEdits && result.length > 0) {
    const dedupedNewEdits = deduplicateEdits(newCacheEdits)
    if (dedupedNewEdits.edits.length > 0) {
      for (let i = result.length - 1; i >= 0; i--) {
        const msg = result[i]
        if (msg && msg.role === 'user') {
          if (!Array.isArray(msg.content)) {
            msg.content = [{ type: 'text', text: msg.content as string }]
          }
          insertBlockAfterToolResults(msg.content, dedupedNewEdits)
          // Pin so this block is re-sent at the same position in future calls
          pinCacheEdits(i, newCacheEdits)

          logForDebugging(
            `Added cache_edits block with ${dedupedNewEdits.edits.length} deletion(s) to message[${i}]: ${dedupedNewEdits.edits.map(e => e.cache_reference).join(', ')}`,
          )
          break
        }
      }
    }
  }

  // Add cache_reference to tool_result blocks that are within the cached prefix.
  // Must be done AFTER cache_edits insertion since that modifies content arrays.
  if (enablePromptCaching) {
    // Find the last message containing a cache_control marker
    let lastCCMsg = -1
    for (let i = 0; i < result.length; i++) {
      const msg = result[i]!
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block && typeof block === 'object' && 'cache_control' in block) {
            lastCCMsg = i
          }
        }
      }
    }

    // Add cache_reference to tool_result blocks that are strictly before
    // the last cache_control marker. The API requires cache_reference to
    // appear "before or on" the last cache_control — we use strict "before"
    // to avoid edge cases where cache_edits splicing shifts block indices.
    //
    // Create new objects instead of mutating in-place to avoid contaminating
    // blocks reused by secondary queries that use models without cache_editing support.
    if (lastCCMsg >= 0) {
      for (let i = 0; i < lastCCMsg; i++) {
        const msg = result[i]!
        if (msg.role !== 'user' || !Array.isArray(msg.content)) {
          continue
        }
        let cloned = false
        for (let j = 0; j < msg.content.length; j++) {
          const block = msg.content[j]
          if (block && isToolResultBlock(block)) {
            if (!cloned) {
              msg.content = [...msg.content]
              cloned = true
            }
            msg.content[j] = Object.assign({}, block, {
              cache_reference: block.tool_use_id,
            })
          }
        }
      }
    }
  }

  return result
}

export function buildSystemPromptBlocks(
  systemPrompt: SystemPrompt,
  enablePromptCaching: boolean,
  options?: {
    skipGlobalCacheForSystemPrompt?: boolean
    querySource?: QuerySource
  },
): TextBlockParam[] {
  // IMPORTANT: Do not add any more blocks for caching or you will get a 400
  return splitSysPromptPrefix(systemPrompt, {
    skipGlobalCacheForSystemPrompt: options?.skipGlobalCacheForSystemPrompt,
  }).map(block => {
    return {
      type: 'text' as const,
      text: block.text,
      ...(enablePromptCaching &&
        block.cacheScope !== null && {
          cache_control: getCacheControl({
            scope: block.cacheScope,
            querySource: options?.querySource,
          }),
        }),
    }
  })
}


// Non-streaming requests have a 10min max per the docs:
// https://platform.claude.com/docs/en/api/errors#long-requests
// The SDK's 21333-token cap is derived from 10min × 128k tokens/hour, but we
// bypass it by setting a client-level timeout, so we can cap higher.
export const MAX_NON_STREAMING_TOKENS = 64_000

/**
 * Adjusts thinking budget when max_tokens is capped for non-streaming fallback.
 * Ensures the API constraint: max_tokens > thinking.budget_tokens
 *
 * @param params - The parameters that will be sent to the API
 * @param maxTokensCap - The maximum allowed tokens (MAX_NON_STREAMING_TOKENS)
 * @returns Adjusted parameters with thinking budget capped if needed
 */
export function adjustParamsForNonStreaming<
  T extends {
    max_tokens: number
    thinking?: BetaMessageStreamParams['thinking']
  },
>(params: T, maxTokensCap: number): T {
  const cappedMaxTokens = Math.min(params.max_tokens, maxTokensCap)

  // Adjust thinking budget if it would exceed capped max_tokens
  // to maintain the constraint: max_tokens > thinking.budget_tokens
  const adjustedParams = { ...params }
  if (
    adjustedParams.thinking?.type === 'enabled' &&
    adjustedParams.thinking.budget_tokens
  ) {
    adjustedParams.thinking = {
      ...adjustedParams.thinking,
      budget_tokens: Math.min(
        adjustedParams.thinking.budget_tokens,
        cappedMaxTokens - 1, // Must be at least 1 less than max_tokens
      ),
    }
  }

  return {
    ...adjustedParams,
    max_tokens: cappedMaxTokens,
  }
}

function isMaxTokensCapEnabled(): boolean {
  // 3P default: false (not validated on Bedrock/Vertex)
  return getFeatureValue_CACHED_MAY_BE_STALE('atlas_otk_slot_v1', false)
}

export function getMaxOutputTokensForModel(model: string): number {
  const maxOutputTokens = getModelMaxOutputTokens(model)

  // Slot-reservation cap: drop default to 8k for all models. BQ p99 output
  // = 4,911 tokens; 32k/64k defaults over-reserve 8-16× slot capacity.
  // Requests hitting the cap get one clean retry at 64k (query.ts
  // max_output_tokens_escalate). Math.min keeps models with lower native
  // defaults (e.g. claude-3-opus at 4k) at their native value. Applied
  // before the env-var override so ATLAS_MAX_OUTPUT_TOKENS still wins.
  const defaultTokens = isMaxTokensCapEnabled()
    ? Math.min(maxOutputTokens.default, CAPPED_DEFAULT_MAX_TOKENS)
    : maxOutputTokens.default

  const result = validateBoundedIntEnvVar(
    'ATLAS_MAX_OUTPUT_TOKENS',
    (process.env.ATLAS_MAX_OUTPUT_TOKENS),
    defaultTokens,
    maxOutputTokens.upperLimit,
  )
  return result.effective
}
