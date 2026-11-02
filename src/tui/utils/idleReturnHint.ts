/**
 * K6-8 (wave 0.1.86) · idle-return-hint fire gate.
 *
 * Bug: after interrupting a turn (esc), the idle-return-hint timer in
 * REPL.tsx fired immediately — the interrupted turn never updates
 * lastQueryCompletionTime (only normal completions do), so when isLoading
 * flips the effect re-runs with elapsed time covering the whole interrupted
 * turn plus the idle gap, `Math.max(0, remaining)` schedules a ~0ms fire,
 * and the callback only checked `messages.length === 0`.
 *
 * Fix: evaluate the interaction guard at TIMER-FIRE time (not schedule
 * time), mirroring the sibling idle_notification path's strict `>`
 * comparison. Interrupts (esc) and any input during the idle window bump
 * lastInteractionTime via the App.tsx central input handler (key events),
 * so "user interacted since the last completed turn" reliably means the
 * user is present and the hint must not fire.
 */
export type IdleReturnHintGate = {
  /** Completion time of the last normally-completed turn (REPL lastQueryCompletionTime). */
  lastQueryCompletionTime: number
  /** Last user interaction time (bootstrapState), read at timer-fire time. */
  lastInteractionTime: number
  /** Current transcript message count (messagesRef.current.length). */
  messageCount: number
}

export function shouldShowIdleReturnHint(gate: IdleReturnHintGate): boolean {
  if (gate.messageCount === 0) return false
  if (gate.lastInteractionTime > gate.lastQueryCompletionTime) return false
  return true
}
