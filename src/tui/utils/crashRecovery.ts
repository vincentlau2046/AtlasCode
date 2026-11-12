/**
 * Crash visibility bridge (0.1.102 P0 切片 2-A, lock-face ③).
 *
 * The TUI lane's uncaughtException / unhandledRejection handlers (registered
 * by setupGracefulShutdown) used to be log-only — an escaped rejection left
 * the process alive but the UI frozen with zero explanation (fail-silent
 * death ② in the P0 analysis). This module is the upgrade: the handlers
 * dispatch here, and registered hooks (the REPL) surface an aggregated
 * error line and force-reset the query state so the loop is re-enterable.
 *
 * Aggregation (恰一次格): the FIRST error in a window is the report subject
 * (DSH installFailLoud latch form); further errors within the window are
 * folded into its additionalCount. Hooks are called exactly once per window
 * — one error line per window, never a flood.
 *
 * React-free (registry only) so gracefulShutdown can import it without
 * pulling the component tree. The headless lane does NOT use this module
 * (cli 域不引 tui 域边界纪律) — its lane is crashBackstop.ts stderr + abort.
 */

import { logForDebugging } from './debug.js'

export type CrashKind = 'uncaughtException' | 'unhandledRejection'

export type CrashReport = {
  kind: CrashKind
  errorName: string
  message: string
  /** Errors folded into this window beyond the subject (report shows +N). */
  additionalCount: number
}

/** Window during which additional escaped errors fold into one report. */
export const CRASH_AGGREGATION_WINDOW_MS = 1000

type CrashHook = (report: CrashReport) => void

const hooks = new Set<CrashHook>()

/** Subscribe to aggregated crash reports. Returns an unregister function. */
export function onCrashReport(hook: CrashHook): () => void {
  hooks.add(hook)
  return () => {
    hooks.delete(hook)
  }
}

let windowSubject: { kind: CrashKind; errorName: string; message: string; extra: number } | null = null
let windowTimer: ReturnType<typeof setTimeout> | undefined

function errorName(value: unknown): string {
  if (value instanceof Error) return value.name
  if (typeof value === 'string') return 'string'
  return 'unknown'
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message.slice(0, 2000)
  return String(value).slice(0, 2000)
}

/**
 * Entry point for the process-level handlers. Folds errors into the
 * aggregation window and dispatches one report per window to all hooks.
 * Hook failures are contained — a throwing hook must not kill the process.
 */
export function reportCrash(kind: CrashKind, value: unknown): void {
  if (windowSubject) {
    windowSubject.extra++
    return
  }
  windowSubject = {
    kind,
    errorName: errorName(value),
    message: errorMessage(value),
    extra: 0,
  }
  windowTimer = setTimeout(() => {
    const subject = windowSubject
    windowSubject = null
    windowTimer = undefined
    if (!subject) return
    const report: CrashReport = {
      kind: subject.kind,
      errorName: subject.errorName,
      message: subject.message,
      additionalCount: subject.extra,
    }
    logForDebugging(
      `[crash-recovery] dispatch ${report.kind} ${report.errorName}` +
        (report.additionalCount > 0 ? ` (+${report.additionalCount} folded)` : ''),
    )
    for (const hook of hooks) {
      try {
        hook(report)
      } catch (hookError) {
        // Contained: a hook failure must not escalate into another crash.
        logForDebugging(`[crash-recovery] hook failed: ${String(hookError)}`)
      }
    }
  }, CRASH_AGGREGATION_WINDOW_MS)
  windowTimer.unref?.()
}

/** Test-only: clear window state and all hooks (module-level state defeats isolation). */
export function __resetCrashRecoveryForTests(): void {
  if (windowTimer) clearTimeout(windowTimer)
  windowSubject = null
  windowTimer = undefined
  hooks.clear()
}
