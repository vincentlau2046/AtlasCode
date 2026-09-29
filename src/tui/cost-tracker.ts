import type { BetaUsage as Usage } from './types/atlas.js'
import chalk from 'chalk'
import { addToTotalCostState, addToTotalLinesChanged, getModelUsage, getSessionId, getTotalAPIDuration, getTotalAPIDurationWithoutRetries, getTotalCacheCreationInputTokens, getTotalCacheReadInputTokens, getTotalDuration, getTotalInputTokens, getTotalLinesAdded, getTotalLinesRemoved, getTotalOutputTokens, getTotalToolDuration, getTotalWebSearchRequests, getUsageForModel, resetCostState, resetStateForTests, setCostStateForRestore } from 'src/bootstrap'
import { getSdkBetas, getTokenCounter } from 'src/tui/bootstrapState.js'
import type { ModelUsage } from './entrypoints/agentSdkTypes.js'
import { getAdvisorUsage } from './utils/advisor.js'
import {
  getCurrentProjectConfig,
  saveCurrentProjectConfig,
} from './utils/config.js'
import {
  getContextWindowForModel,
  getModelMaxOutputTokens,
} from './utils/context.js'
import { formatDuration, formatNumber } from './utils/format.js'
import type { FpsMetrics } from './utils/fpsTracker.js'
import { getCanonicalName } from './utils/model/model.js'
export {
  getTotalDuration,
  getTotalAPIDuration,
  getTotalAPIDurationWithoutRetries,
  addToTotalLinesChanged,
  getTotalLinesAdded,
  getTotalLinesRemoved,
  getTotalInputTokens,
  getTotalOutputTokens,
  getTotalCacheReadInputTokens,
  getTotalCacheCreationInputTokens,
  getTotalWebSearchRequests,
  resetStateForTests,
  resetCostState,
  getModelUsage,
  getUsageForModel,
}

type StoredCostState = {
  totalAPIDuration: number
  totalAPIDurationWithoutRetries: number
  totalToolDuration: number
  totalLinesAdded: number
  totalLinesRemoved: number
  lastDuration: number | undefined
  modelUsage: { [modelName: string]: ModelUsage } | undefined
}

/**
 * Gets stored cost state from project config for a specific session.
 * Returns the cost data if the session ID matches, or undefined otherwise.
 * Use this to read costs BEFORE overwriting the config with saveCurrentSessionCosts().
 */
export function getStoredSessionCosts(
  sessionId: string,
): StoredCostState | undefined {
  const projectConfig = getCurrentProjectConfig()

  // Only return costs if this is the same session that was last saved
  if (projectConfig.lastSessionId !== sessionId) {
    return undefined
  }

  // Build model usage with context windows
  let modelUsage: { [modelName: string]: ModelUsage } | undefined
  if (projectConfig.lastModelUsage) {
    modelUsage = Object.fromEntries(
      Object.entries(projectConfig.lastModelUsage).map(([model, usage]) => [
        model,
        {
          ...usage,
          contextWindow: getContextWindowForModel(model, getSdkBetas()),
          maxOutputTokens: getModelMaxOutputTokens(model).default,
        },
      ]),
    )
  }

  return {
    totalAPIDuration: projectConfig.lastAPIDuration ?? 0,
    totalAPIDurationWithoutRetries:
      projectConfig.lastAPIDurationWithoutRetries ?? 0,
    totalToolDuration: projectConfig.lastToolDuration ?? 0,
    totalLinesAdded: projectConfig.lastLinesAdded ?? 0,
    totalLinesRemoved: projectConfig.lastLinesRemoved ?? 0,
    lastDuration: projectConfig.lastDuration,
    modelUsage,
  }
}

/**
 * Restores cost state from project config when resuming a session.
 * Only restores if the session ID matches the last saved session.
 * @returns true if cost state was restored, false otherwise
 */
export function restoreCostStateForSession(sessionId: string): boolean {
  const data = getStoredSessionCosts(sessionId)
  if (!data) {
    return false
  }
  setCostStateForRestore(data)
  return true
}

/**
 * Saves the current session's costs to project config.
 * Call this before switching sessions to avoid losing accumulated costs.
 */
export function saveCurrentSessionCosts(fpsMetrics?: FpsMetrics): void {
  saveCurrentProjectConfig(current => ({
    ...current,
    lastAPIDuration: getTotalAPIDuration(),
    lastAPIDurationWithoutRetries: getTotalAPIDurationWithoutRetries(),
    lastToolDuration: getTotalToolDuration(),
    lastDuration: getTotalDuration(),
    lastLinesAdded: getTotalLinesAdded(),
    lastLinesRemoved: getTotalLinesRemoved(),
    lastTotalInputTokens: getTotalInputTokens(),
    lastTotalOutputTokens: getTotalOutputTokens(),
    lastTotalCacheCreationInputTokens: getTotalCacheCreationInputTokens(),
    lastTotalCacheReadInputTokens: getTotalCacheReadInputTokens(),
    lastTotalWebSearchRequests: getTotalWebSearchRequests(),
    lastFpsAverage: fpsMetrics?.averageFps,
    lastFpsLow1Pct: fpsMetrics?.low1PctFps,
    lastModelUsage: Object.fromEntries(
      Object.entries(getModelUsage()).map(([model, usage]: [string, any]) => [
        model,
        {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadInputTokens: usage.cacheReadInputTokens,
          cacheCreationInputTokens: usage.cacheCreationInputTokens,
          webSearchRequests: usage.webSearchRequests,
        },
      ]),
    ),
    lastSessionId: getSessionId(),
  }))
}

function formatModelUsage(): string {
  const modelUsageMap = getModelUsage()
  if (Object.keys(modelUsageMap).length === 0) {
    return 'Usage:                 0 input, 0 output, 0 cache read, 0 cache write'
  }

  // Accumulate usage by short name
  const usageByShortName: { [shortName: string]: ModelUsage } = {}
  for (const [model, usage] of Object.entries(modelUsageMap) as [string, any][]) {
    const shortName = getCanonicalName(model)
    if (!usageByShortName[shortName]) {
      usageByShortName[shortName] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        webSearchRequests: 0,
        contextWindow: 0,
        maxOutputTokens: 0,
      }
    }
    const accumulated = usageByShortName[shortName]
    accumulated.inputTokens += usage.inputTokens
    accumulated.outputTokens += usage.outputTokens
    accumulated.cacheReadInputTokens += usage.cacheReadInputTokens
    accumulated.cacheCreationInputTokens += usage.cacheCreationInputTokens
    accumulated.webSearchRequests += usage.webSearchRequests
  }

  let result = 'Usage by model:'
  for (const [shortName, usage] of Object.entries(usageByShortName)) {
    const usageString =
      `  ${formatNumber(usage.inputTokens)} input, ` +
      `${formatNumber(usage.outputTokens)} output, ` +
      `${formatNumber(usage.cacheReadInputTokens)} cache read, ` +
      `${formatNumber(usage.cacheCreationInputTokens)} cache write` +
      (usage.webSearchRequests > 0
        ? `, ${formatNumber(usage.webSearchRequests)} web search`
        : '')
    result += `\n` + `${shortName}:`.padStart(21) + usageString
  }
  return result
}

export function formatTotalCost(): string {
  const modelUsageDisplay = formatModelUsage()

  return chalk.dim(
    `Total duration (API):  ${formatDuration(getTotalAPIDuration())}
Total duration (wall): ${formatDuration(getTotalDuration())}
Total code changes:    ${getTotalLinesAdded()} ${getTotalLinesAdded() === 1 ? 'line' : 'lines'} added, ${getTotalLinesRemoved()} ${getTotalLinesRemoved() === 1 ? 'line' : 'lines'} removed
${modelUsageDisplay}`,
  )
}

function addToTotalModelUsage(
  usage: Usage,
  model: string,
): ModelUsage {
  const modelUsage = getUsageForModel(model) ?? {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    contextWindow: 0,
    maxOutputTokens: 0,
  }

  modelUsage.inputTokens += usage.input_tokens
  modelUsage.outputTokens += usage.output_tokens
  modelUsage.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0
  modelUsage.cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0
  modelUsage.webSearchRequests +=
    usage.server_tool_use?.web_search_requests ?? 0
  modelUsage.contextWindow = getContextWindowForModel(model, getSdkBetas())
  modelUsage.maxOutputTokens = getModelMaxOutputTokens(model).default
  return modelUsage
}

export function addToTotalSessionCost(
  usage: Usage,
  model: string,
): void {
  const modelUsage = addToTotalModelUsage(usage, model)
  addToTotalCostState(modelUsage, model)

  // fastMode removed (D2) — no "fast" speed attribute; always plain { model }
  const attrs = { model }

  getTokenCounter()?.add(usage.input_tokens, { ...attrs, type: 'input' })
  getTokenCounter()?.add(usage.output_tokens, { ...attrs, type: 'output' })
  getTokenCounter()?.add(usage.cache_read_input_tokens ?? 0, {
    ...attrs,
    type: 'cacheRead',
  })
  getTokenCounter()?.add(usage.cache_creation_input_tokens ?? 0, {
    ...attrs,
    type: 'cacheCreation',
  })

  for (const advisorUsage of getAdvisorUsage(usage)) {
    addToTotalSessionCost(advisorUsage, advisorUsage.model)
  }
}
