import type { Message } from '../../../types/message.js'

/**
 * Snip-boundary predicate.
 *
 * A snip boundary is a system message with subtype 'snip_boundary' — it
 * marks where a snip compaction split the conversation history (older
 * turns were replaced with a compact summary).  Called by QueryEngine's
 * snipReplay to detect when a yielded message requires replaying a snip on
 * the mutable store.
 */
export function isSnipBoundaryMessage(
  message: Message | any,
): boolean {
  return (
    message?.type === 'system' &&
    message.subtype === 'snip_boundary'
  )
}

/**
 * Project the message list to the **model-facing** snipped view.
 *
 * Models should never see turns that existed before the most recent snip —
 * those were already replaced by a compact summary.  The REPL keeps full
 * history for UI scrollback, so model-facing paths (e.g.
 * {@link getMessagesAfterCompactBoundary}) apply this projection to strip
 * snipped history before sending to the API.
 *
 * Returns only messages *after* the most recent `snip_boundary` (the
 * boundary itself is excluded — it is a system message filtered
 * downstream by `normalizeMessagesForAPI`).  When no snip boundary exists
 * in the input, the original array is returned unchanged.
 */
export function projectSnippedView<T extends Message = Message>(
  messages: T[],
): T[] {
  let boundaryIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isSnipBoundaryMessage(messages[i]!)) {
      boundaryIdx = i
      break
    }
  }
  if (boundaryIdx === -1) return messages
  // Exclude the boundary itself (normalizeMessagesForAPI handles it downstream).
  return messages.slice(boundaryIdx + 1)
}

/**
 * Convenience alias: project to the model-facing snipped view.
 * Equivalent to {@link projectSnippedView}.
 */
export function snipProjection<T extends Message = Message>(
  messages: T[],
): T[] {
  return projectSnippedView(messages)
}