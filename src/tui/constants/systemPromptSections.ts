import {
  clearBetaHeaderLatches,
  clearSystemPromptSectionState,
  getSystemPromptSectionCache,
  setSystemPromptSectionCacheEntry,
} from 'src/tui/bootstrapState.js'
import { logForDebugging } from '../utils/debug.js'

type ComputeFn = () => string | null | Promise<string | null>

type SystemPromptSection = {
  name: string
  compute: ComputeFn
  cacheBreak: boolean
}

/**
 * Create a memoized system prompt section.
 * Computed once, cached until /clear or /compact.
 */
export function systemPromptSection(
  name: string,
  compute: ComputeFn,
): SystemPromptSection {
  return { name, compute, cacheBreak: false }
}

/**
 * Create a volatile system prompt section that recomputes every turn.
 * This WILL break the prompt cache when the value changes.
 * Requires a reason explaining why cache-breaking is necessary.
 */
export function DANGEROUS_uncachedSystemPromptSection(
  name: string,
  compute: ComputeFn,
  _reason: string,
): SystemPromptSection {
  return { name, compute, cacheBreak: true }
}

/**
 * Resolve all system prompt sections, returning prompt strings.
 */
export async function resolveSystemPromptSections(
  sections: SystemPromptSection[],
): Promise<(string | null)[]> {
  const cache = getSystemPromptSectionCache()
  const started = new Set<string>()
  const finished = new Set<string>()
  const watchdog = setTimeout(() => {
    const pending = sections.filter(s => started.has(s.name) && !finished.has(s.name)).map(s => s.name)
    logForDebugging('[SP-WATCHDOG] still pending after 10s: ' + JSON.stringify(pending))
  }, 10000)
  watchdog.unref?.()

  return Promise.all(
    sections.map(async s => {
      logForDebugging('[SP-SECTION] computing ' + s.name);
      started.add(s.name)
      if (!s.cacheBreak && cache.has(s.name)) {
        logForDebugging('[SP-SECTION] cache hit: ' + s.name);
        finished.add(s.name)
        return cache.get(s.name) ?? null
      }
      logForDebugging('[SP-SECTION] calling compute: ' + s.name);
      const value = await new Promise<unknown>(resolve => {
        const t = setTimeout(() => {
          logForDebugging('[SP-SECTION] TIMEOUT(3s): ' + s.name + ' — falling back to null')
          resolve(null)
        }, 3000)
        Promise.resolve(s.compute()).then(
          v => {
            clearTimeout(t)
            resolve(v)
          },
          e => {
            clearTimeout(t)
            logForDebugging('[SP-SECTION] compute threw for ' + s.name + ': ' + String(e))
            resolve(null)
          }
        )
      }) as string | null
      finished.add(s.name)
      logForDebugging('[SP-SECTION] computed ' + s.name + (value ? ' (len=' + String(value.length) + ')' : ' (null)'))
      setSystemPromptSectionCacheEntry(s.name, value)
      return value
    }),
  )
}

/**
 * Clear all system prompt section state. Called on /clear and /compact.
 * Also resets beta header latches so a fresh conversation gets fresh
 * evaluation of AFK/fast-mode/cache-editing headers.
 */
export function clearSystemPromptSections(): void {
  clearSystemPromptSectionState()
  clearBetaHeaderLatches()
}
