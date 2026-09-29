/* eslint-disable custom-rules/no-process-env-top-level -- W4 全量 lint 复原（§8.74.21）：模块加载期捕获常量（含刻意捕获语义站点），惰性读改写违行为零改动纪律（W-opt 波再议） */
// Critical system constants extracted to break circular dependencies

import { feature } from 'src/shared'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { logForDebugging } from '../utils/debug.js'
import { isEnvDefinedFalsy } from '../utils/envUtils.js'
import { getWorkload } from '../utils/workloadContext.js'

// NPU specialization clause in the identity sentence. Gated on the same switch
// as the ascend_agent section (ATLAS_ASCEND_PROMPT=0 disables it), so
// `=0` yields a plain 'professional coding agent' identity.
const ascendClause = !isEnvDefinedFalsy(
  process.env.ATLAS_ASCEND_PROMPT,
)
  ? ' with deep specialization in domestic computing power, especially model adaptation and operator development on the Ascend NPU'
  : ''
const DEFAULT_PREFIX = `You are Atlas, a professional coding agent${ascendClause}.`
const AGENT_SDK_ATLAS_PRESET_PREFIX = `You are Atlas, a professional coding agent${ascendClause}, running within the Atlas Agent SDK.`
const AGENT_SDK_PREFIX = `You are an Atlas agent, built on the Atlas Agent SDK.`

const CLI_SYSPROMPT_PREFIX_VALUES = [
  DEFAULT_PREFIX,
  AGENT_SDK_ATLAS_PRESET_PREFIX,
  AGENT_SDK_PREFIX,
] as const

export type CLISyspromptPrefix = (typeof CLI_SYSPROMPT_PREFIX_VALUES)[number]

/**
 * All possible CLI sysprompt prefix values, used by splitSysPromptPrefix
 * to identify prefix blocks by content rather than position.
 */
export const CLI_SYSPROMPT_PREFIXES: ReadonlySet<string> = new Set(
  CLI_SYSPROMPT_PREFIX_VALUES,
)

export function getCLISyspromptPrefix(options?: {
  isNonInteractive: boolean
  hasAppendSystemPrompt: boolean
}): CLISyspromptPrefix {
  if (options?.isNonInteractive) {
    if (options.hasAppendSystemPrompt) {
      return AGENT_SDK_ATLAS_PRESET_PREFIX
    }
    return AGENT_SDK_PREFIX
  }
  return DEFAULT_PREFIX
}

/**
 * Check if attribution header is enabled.
 * Enabled by default, can be disabled via env var or GrowthBook killswitch.
 */
function isAttributionHeaderEnabled(): boolean {
  if (isEnvDefinedFalsy((process.env.ATLAS_ATTRIBUTION_HEADER))) {
    return false
  }
  return getFeatureValue_CACHED_MAY_BE_STALE('atlas_attribution_header', true)
}

/**
 * Get attribution header for API requests.
 * Returns a header string with cc_version (including fingerprint) and cc_entrypoint.
 * Enabled by default, can be disabled via env var or GrowthBook killswitch.
 *
 * When NATIVE_CLIENT_ATTESTATION is enabled, includes a `cch=00000` placeholder.
 * Before the request is sent, Bun's native HTTP stack finds this placeholder
 * in the request body and overwrites the zeros with a computed hash. The
 * server verifies this token to confirm the request came from a real Claude
 * Code client. See bun-anthropic/src/http/Attestation.zig for implementation.
 *
 * We use a placeholder (instead of injecting from Zig) because same-length
 * replacement avoids Content-Length changes and buffer reallocation.
 */
export function getAttributionHeader(fingerprint: string): string {
  if (!isAttributionHeaderEnabled()) {
    return ''
  }

  const version = `${MACRO.VERSION}.${fingerprint}`
  const entrypoint = (process.env.ATLAS_ENTRYPOINT) ?? 'unknown'

  // cch=00000 placeholder is overwritten by Bun's HTTP stack with attestation token
  const cch = feature('NATIVE_CLIENT_ATTESTATION') ? ' cch=00000;' : ''
  // cc_workload: turn-scoped hint so the API can route e.g. cron-initiated
  // requests to a lower QoS pool. Absent = interactive default. Safe re:
  // fingerprint (computed from msg chars + version only, line 78 above) and
  // cch attestation (placeholder overwritten in serialized body bytes after
  // this string is built). Server _parse_cc_header tolerates unknown extra
  // fields so old API deploys silently ignore this.
  const workload = getWorkload()
  const workloadPair = workload ? ` cc_workload=${workload};` : ''
  const header = `x-atlas-billing-header: cc_version=${version}; cc_entrypoint=${entrypoint};${cch}${workloadPair}`

  logForDebugging(`attribution header ${header}`)
  return header
}
