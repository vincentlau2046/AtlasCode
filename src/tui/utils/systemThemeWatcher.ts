/**
 * System theme watcher — OSC 11 terminal background query with a one-shot
 * OS appearance fallback (lock-face 0.1.102 P0 切片 1, f4 批复 @master).
 *
 * Priority chain: explicit user setting (handled by ThemeProvider, never
 * reaches here) > OSC 11 measured > COLORFGBG > OS appearance > dark.
 *
 * Lifecycle (lock-face 触发点枚举恰二, 禁轮询):
 *  1. One OSC 11 query at watcher activation (ThemeProvider effect fires
 *     this on mount and on every switch to 'auto'). The TerminalQuerier's
 *     DA1-sentinel design resolves the query with `undefined` when the
 *     terminal doesn't answer; an overall timer bounds degenerate terminals
 *     that never flush at all.
 *  2. If OSC 11 fails (no response or unparseable color), ONE OS appearance
 *     read (`osAppearance.ts`) fires as the fallback. Linux has no source →
 *     the chain degrades to COLORFGBG ?? dark.
 *
 * Failure semantics (lock-face 钉2): every failure mode degrades silently —
 * nothing is surfaced, nothing blocks startup. All work is async and the
 * returned cleanup disposes pending applications.
 */

import type { TerminalQuerier } from '../ink/terminal-querier.js'
import { oscColor } from '../ink/terminal-querier.js'
import { readOsAppearance } from './osAppearance.js'
import {
  setCachedOsAppearance,
  setCachedSystemTheme,
  themeFromOscColor,
  type SystemTheme,
} from './systemTheme.js'

/** Overall budget for the OSC 11 round trip (DA1 sentinel normally bounds
 *  this; the timer covers terminals that never answer DA1 either). */
export const OSC_QUERY_TIMEOUT_MS = 2000

/**
 * Watch the terminal background and apply the detected theme.
 *
 * @param querier stdin response querier (from useStdin().internal_querier)
 * @param setSystemTheme theme state setter (ThemeProvider state — the async
 *   flip rides the existing theme-switch path, no UI rebuild)
 * @returns cleanup that stops pending applications
 */
export function watchSystemTheme(
  querier: TerminalQuerier,
  setSystemTheme: (theme: SystemTheme) => void,
): () => void {
  let disposed = false

  const applyTheme = (theme: SystemTheme): void => {
    if (disposed) return
    setCachedSystemTheme(theme)
    setSystemTheme(theme)
  }

  const fallbackToOsAppearance = (): void => {
    void readOsAppearance()
      .then(theme => {
        if (theme) {
          setCachedOsAppearance(theme)
          applyTheme(theme)
        }
        // No OS source (Linux) or read failed: silent degrade — the chain
        // rests on COLORFGBG ?? dark. Never surfaced, never blocks.
      })
      .catch(() => {})
  }

  void (async () => {
    // Queue order matters: the OSC query must precede the DA1 sentinel so
    // the sentinel's barrier covers it (unsupported → resolved undefined).
    // The sentinel is fire-and-forget — the theme applies the moment the
    // OSC response arrives, without waiting for the round trip.
    const pending = querier.send(oscColor(11))
    void querier.flush().catch(() => {})
    const response = await Promise.race([
      pending,
      sleep(OSC_QUERY_TIMEOUT_MS).then(() => undefined),
    ])
    if (disposed) return
    if (response?.type === 'osc') {
      const theme = themeFromOscColor(response.data)
      if (theme) {
        applyTheme(theme)
        return
      }
    }
    // OSC 11 unsupported or unparseable → silent degrade to the OS layer.
    fallbackToOsAppearance()
  })().catch(() => {})

  return () => {
    disposed = true
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms).unref?.())
}
