import { feature } from 'src/shared'
import { randomUUID } from 'crypto'
import type { Message } from '../../../types/message.js'

/**
 * HISTORY_SNIP ("snip compaction").
 *
 * Snipping is a light-weight, reversible form of compaction: instead of
 * summarizing the whole conversation, it keeps the most recent turns
 * verbatim and replaces the older turns with a compact summary, freeing
 * context tokens without losing the tail of the conversation.
 *
 * This module is only loaded (lazy `require`) when the HISTORY_SNIP feature
 * flag is on, so its strings stay out of external builds (DCE).
 */

/** Options that shape a snip compaction. */
export interface SnipCompactOptions {
  /** How many recent turns to keep verbatim. Default 4. */
  keepLastN?: number
  /** Optional pre-written summary used in place of the snipped history. */
  summary?: string
  /** Force the snip even when the context is below the threshold. */
  force?: boolean
}

/**
 * Result shape consumed by the two production call sites:
 * - query.ts: `snipResult.messages` (replaces `messagesForQuery`),
 *   `snipResult.tokensFreed` (plumbed into autocompact), `snipResult.boundaryMessage` (yielded).
 * - QueryEngine.ts (snipReplay): uses `executed` + `messages`.
 */
export interface SnipCompactResult {
  executed: boolean
  messages: Message[]
  tokensFreed: number
  boundaryMessage?: Message
}

/** How many recent turns to keep verbatim before snipping. */
const DEFAULT_KEEP_LAST_N = 4

/**
 * Context size (tokens) at which a proactive snip should fire. Roughly 60%
 * of the default 200k context window. Overridable at call time so tests
 * and ops can tune it.
 */
function getSnipThreshold(): number {
  const raw = process.env.ATLAS_SNIP_COMPACT_THRESHOLD
  const parsed = raw ? parseInt(raw, 10) : 120_000
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000
}

/** Token-growth interval (tokens) between context-efficiency nudges. */
const SNIP_NUDGE_TOKEN_INTERVAL = 10_000

// --- Lazy imports (avoid a top-level circular import with utils/messages.js,
// which itself lazy-requires this module). ---

function tokenEstimator() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const m = require('../../../utils/tokens.js') as typeof import('../../../utils/tokens.js')
  return m
}

function estimation() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const m = require('../../../services/tokenEstimation.js') as typeof import('../../../services/tokenEstimation.js')
  return m
}

function messagesModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const m = require('../../../utils/messages.js') as typeof import('../../../utils/messages.js')
  return m
}

/** Rough per-message token estimate (chars/4 style) for freed-token math. */
function roughTokens(messages: readonly Message[]): number {
  try {
    return estimation().roughTokenCountEstimationForMessages(messages as any)
  } catch {
    return 0
  }
}

/** Accurate-ish current context size from the last API usage + estimates. */
function currentTokenCount(messages: readonly Message[]): number {
  try {
    return tokenEstimator().tokenCountWithEstimation(messages)
  } catch {
    return roughTokens(messages)
  }
}

/**
 * Index that splits "older" (snipped) from "recent" (kept verbatim).
 * Walks backward keeping the last `keepLastN` *assistant* messages; the
 * split point is the index of the oldest of those kept turns.
 */
function findSnipSplitIndex(messages: readonly Message[], keepLastN: number): number {
  let counted = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg && msg.type === 'assistant') {
      counted += 1
      if (counted === keepLastN) {
        return i
      }
    }
  }
  return 0
}

/**
 * Build the summary message that replaces the snipped (older) turns.
 * Returns a UserMessage flagged `isCompactSummary`.
 */
export function buildSnipCompact(
  messages: Message[],
  options: SnipCompactOptions = {},
): Message {
  const m = messagesModule()
  const keepLastN = options.keepLastN ?? DEFAULT_KEEP_LAST_N
  const splitIdx = findSnipSplitIndex(messages, keepLastN)
  const older = messages.slice(0, splitIdx)

  const summary =
    options.summary ??
    (older.length > 0
      ? `Earlier conversation (≈${older.length} messages, ~${roughTokens(older)} tokens) was snipped to keep context efficient. The recent ${keepLastN} turns are preserved verbatim.`
      : 'Earlier conversation turns were snipped.')

  return m.createUserMessage({
    content: summary,
    isMeta: true,
    isCompactSummary: true,
  })
}

/**
 * Perform the snip: keep the last N turns verbatim, replace the older turns
 * with a compact summary, and emit a snip-boundary marker so downstream
 * (autocompact / replay) can recognize the snip point.
 */
export function snipCompact(
  messages: Message[],
  options: SnipCompactOptions = {},
): SnipCompactResult {
  const m = messagesModule()
  const keepLastN = options.keepLastN ?? DEFAULT_KEEP_LAST_N
  const splitIdx = findSnipSplitIndex(messages, keepLastN)
  const older = messages.slice(0, splitIdx)
  const kept = messages.slice(splitIdx)

  if (older.length === 0) {
    // Not enough older turns to snip; return unchanged.
    return { executed: false, messages, tokensFreed: 0 }
  }

  const summaryMessage = buildSnipCompact(messages, options)

  const boundary: Message = {
    type: 'system',
    subtype: 'snip_boundary',
    content: 'Conversation snipped',
    isMeta: false,
    level: 'info',
    timestamp: new Date().toISOString() as unknown as number,
    uuid: randomUUID(),
  } as unknown as Message

  const freed = Math.max(0, roughTokens(older) - roughTokens([summaryMessage]))

  return {
    executed: true,
    messages: [boundary, summaryMessage, ...kept],
    tokensFreed: freed,
    boundaryMessage: boundary,
  }
}

/**
 * Snip only when the context is large enough (or when forced). This is the
 * entry point used by query.ts (proactive) and QueryEngine's snipReplay.
 */
export function snipCompactIfNeeded(
  messages: Message[],
  options: SnipCompactOptions = {},
): SnipCompactResult {
  if (options.force) {
    return snipCompact(messages, options)
  }
  const threshold = getSnipThreshold()
  const current = currentTokenCount(messages)
  if (current < threshold) {
    return { executed: false, messages, tokensFreed: 0 }
  }
  return snipCompact(messages, options)
}

/**
 * Is the snip runtime enabled? Must match SnipTool.isEnabled(): the runtime
 * is live when the HISTORY_SNIP feature is on and not disabled via env.
 * `ATLAS_DISABLE_SNIP=true` forces OFF; `FEATURE_HISTORY_SNIP=true`
 * forces ON (this mirrors the `bun:bundle` test stub and lets tests/ops
 * flip the flag at call-time without a rebuild).
 */
export function isSnipRuntimeEnabled(): boolean {
  if (process.env.ATLAS_DISABLE_SNIP === 'true') {
    return false
  }
  // Env override (mirrors the bun:bundle stub used by the unit tests).
  if (process.env.FEATURE_HISTORY_SNIP === 'true') {
    return true
  }
  if (!feature('HISTORY_SNIP')) {
    return false
  }
  return true
}

/**
 * Is this message a snip boundary marker? (a system message with
 * subtype === 'snip_boundary').
 */
export function isSnipMarkerMessage(message: Message | any): boolean {
  return message?.type === 'system' && message.subtype === 'snip_boundary'
}

/**
 * Context-efficiency nudge pacing. Nudge once the context has grown by at
 * least SNIP_NUDGE_TOKEN_INTERVAL tokens since the last pacing anchor — a
 * prior nudge, a snip marker, a snip boundary, or a compact boundary.
 */
export function shouldNudgeForSnips(messages: Message[]): boolean {
  const m = messagesModule()
  // Find the most recent pacing anchor.
  let anchorIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg) continue
    const isAnchor =
      isSnipMarkerMessage(msg) ||
      (typeof m.isCompactBoundaryMessage === 'function' && m.isCompactBoundaryMessage(msg)) ||
      (msg.type === 'user' && (msg as any).isMeta && typeof (msg as any).content === 'string' && (msg as any).content.includes(SNIP_NUDGE_TEXT))
    if (isAnchor) {
      anchorIdx = i
      break
    }
  }
  const slice = anchorIdx >= 0 ? messages.slice(anchorIdx + 1) : messages
  const grown = roughTokens(slice)
  return grown >= SNIP_NUDGE_TOKEN_INTERVAL
}

/**
 * The human-readable nudge injected as a meta user message (context_efficiency
 * attachment). Must be a plain string — it is used verbatim as message content
 * in normalizeAttachmentForAPI.
 */
export const SNIP_NUDGE_TEXT: string =
  'Your context is getting inefficient. If you have low-value, redundant, or ' +
  'superseded history, use the Snip tool to summarize and remove it, keeping ' +
  'only the most recent turns verbatim so the context window stays efficient.'
