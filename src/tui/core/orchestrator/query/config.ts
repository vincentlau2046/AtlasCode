import { getSessionId } from 'src/bootstrap'
import { checkStatsigFeatureGate_CACHED_MAY_BE_STALE } from '../../../services/analytics/growthbook.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'

// -- config

// Immutable values snapshotted once at query() entry. Separating these from
// the per-iteration State struct and the mutable ToolUseContext makes future
// step() extraction tractable — a pure reducer can take (state, event, config)
// where config is plain data.
//
// Intentionally excludes feature() gates — those are tree-shaking boundaries
// and must stay inline at the guarded blocks for dead-code elimination.
export type QueryConfig = {
  sessionId: string

  // Runtime gates (env/statsig). NOT feature() gates — see above.
  gates: {
    // Statsig — CACHED_MAY_BE_STALE already admits staleness, so snapshotting
    // once per query() call stays within the existing contract.
    streamingToolExecution: boolean
    emitToolUseSummaries: boolean
    isAnt: boolean
  }
}

export function buildQueryConfig(): QueryConfig {
  return {
    sessionId: getSessionId(),
    gates: {
      streamingToolExecution: checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
        'atlas_streaming_tool_execution2',
      ),
      emitToolUseSummaries: isEnvTruthy(
        (process.env.ATLAS_EMIT_TOOL_USE_SUMMARIES),
      ),
      isAnt: false,
    },
  }
}
