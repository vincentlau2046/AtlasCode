import type { Message } from '../types/message.js'
import type { QuerySource } from '../constants/querySource.js'
import type { ToolUseContext } from '../Tool.js'
import type { CacheSafeParams } from '../utils/forkedAgent.js'

/**
 * Reactive compact — a compaction strategy that fires *reactively* when the
 * API returns a prompt-too-long (413) or media-size error, rather than
 * *proactively* at a token threshold (autoCompact).
 *
 * In reactive-only mode the proactive auto-compact is suppressed entirely;
 * only reactive handling of actual API errors remains.
 *
 * This module is only loaded when the REACTIVE_COMPACT feature flag is on.
 */

// ── predicates (stream-level withholding) ────────────────────────────

/**
 * Whether the reactive-compact subsystem is enabled at runtime.
 * Can be overridden with `ATLAS_DISABLE_REACTIVE_COMPACT=true`.
 */
export function isReactiveCompactEnabled(): boolean {
  return process.env.ATLAS_DISABLE_REACTIVE_COMPACT !== 'true'
}

/**
 * Check whether a stream event (typically an assistant message with
 * `isApiErrorMessage`) represents a prompt-too-long error that reactive
 * compact should withhold (suppress yielding) so it can compact and retry
 * instead of surfacing the error to the user.
 */
export function isWithheldPromptTooLong(message: any): boolean {
  if (message?.type !== 'assistant') return false
  if (!message.isApiErrorMessage) return false
  const content = message?.message?.content
  if (!Array.isArray(content)) return false
  return content.some(
    (block: any) =>
      block?.type === 'text' &&
      typeof block?.text === 'string' &&
      block.text.startsWith('Prompt is too long'),
  )
}

/**
 * Check whether a stream event is a media-size error (image/resize
 * validation failure before the API call) that should be withheld.
 */
export function isWithheldMediaSizeError(message: any): boolean {
  if (message?.type !== 'assistant') return false
  if (!message.isApiErrorMessage) return false
  const content = message?.message?.content
  if (!Array.isArray(content)) return false
  return content.some(
    (block: any) =>
      block?.type === 'text' &&
      typeof block?.text === 'string' &&
      block.text.startsWith('Image was too large'),
  )
}

/**
 * Whether the system is in "reactive-only" mode: proactive auto-compact is
 * suppressed and only reactive handling of actual 413 / media errors
 * triggers compaction.
 */
export function isReactiveOnlyMode(): boolean {
  return process.env.ATLAS_REACTIVE_ONLY === 'true'
}

// ── compaction entry points ──────────────────────────────────────────

interface TryReactiveCompactParams {
  /** Has reactive compact already been attempted in this turn? */
  hasAttempted: boolean
  /** Query source (prevent recursion from compact / session_memory). */
  querySource: QuerySource | string
  /** Is the request aborted? */
  aborted: boolean
  /** Current message array (pre-error). */
  messages: Message[]
  /** Cache-safe params for forked-agent compaction. */
  cacheSafeParams: Pick<
    CacheSafeParams,
    'systemPrompt' | 'userContext' | 'systemContext' | 'toolUseContext' | 'forkContextMessages'
  >
}

/**
 * Attempt a reactive compaction AFTER a 413 / media error was withheld.
 * Delegates to the existing {@link compactConversation} infrastructure.
 *
 * Returns a CompactionResult (consumable by `buildPostCompactMessages`)
 * on success, or `null` when compaction is not applicable.
 */
export async function tryReactiveCompact(
  params: TryReactiveCompactParams,
): Promise<any> {
  // Guards — mirror the conditions in query.ts's reactive-compact block.
  if (params.hasAttempted || params.aborted) return null
  if (
    params.querySource === 'compact' ||
    params.querySource === 'session_memory'
  ) {
    return null
  }

  // Build a lightweight ToolUseContext from cacheSafeParams (the fork
  // already provides minimal context).
  const context = params.cacheSafeParams.toolUseContext as ToolUseContext

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const compact = require('./compact.js') as typeof import('./compact.js')

  // Fall back to full compaction.
  try {
    const result = await compact.compactConversation(
      params.messages,
      context,
      {
        systemPrompt: params.cacheSafeParams.systemPrompt,
        userContext: params.cacheSafeParams.userContext ?? {},
        systemContext: params.cacheSafeParams.systemContext,
        forkContextMessages: params.cacheSafeParams.forkContextMessages,
      } as CacheSafeParams,
      true, // suppressFollowUpQuestions
      undefined, // customInstructions
      false, // isAutoCompact — reactive is not "auto"
    )
    return result
  } catch (err: any) {
    // If compaction fails (e.g., not enough messages), return null so
    // the caller can surface the original 413/media error instead.
    return null
  }
}

/**
 * Manual / reactive-compact path triggered by the `/compact` slash command
 * or when the API returns a prompt-too-long with reactively-strippable
 * content. Called from `src/commands/compact/compact.ts`.
 *
 * Returns `{ ok: false, reason }` on failure or `{ ok: true, messages,
 * postCompactMessages, ... }` on success.
 */
type ReactiveCompactResult =
  | {
      ok: true
      messages: any[]
      postCompactMessages: any[]
      compactionResult: any
    }
  | {
      ok: false
      reason?: 'too_few_groups' | 'aborted' | 'exhausted' | 'error' | 'media_unstrippable'
    }

export async function reactiveCompactOnPromptTooLong(
  messages: any[],
  cacheSafeParams: any,
  options: { customInstructions?: string; trigger: 'manual' | 'auto' },
): Promise<ReactiveCompactResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const compact = require('./compact.js') as typeof import('./compact.js')

  // Build a context from the provided cache-safe params.
  const context: ToolUseContext = (cacheSafeParams as any)?.toolUseContext
  if (!context) {
    return { ok: false, reason: 'error' }
  }

  try {
    const result = await compact.compactConversation(
      messages,
      context,
      cacheSafeParams,
      true, // suppressFollowUpQuestions
      options.customInstructions,
      false, // isAutoCompact
    )

    const postCompact = compact.buildPostCompactMessages(result)

    return {
      ok: true,
      messages: postCompact,
      postCompactMessages: postCompact,
      compactionResult: result,
    }
  } catch (err: any) {
    const msg = typeof err?.message === 'string' ? err.message : ''
    if (msg.includes('Not enough messages')) {
      return { ok: false, reason: 'too_few_groups' }
    }
    if (msg.includes('abort')) {
      return { ok: false, reason: 'aborted' }
    }
    return { ok: false, reason: 'error' }
  }
}