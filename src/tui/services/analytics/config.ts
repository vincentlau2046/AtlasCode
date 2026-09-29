/**
 * Shared analytics configuration
 *
 * Common logic for determining when analytics should be disabled
 * across all analytics systems (Datadog, 1P)
 */

import { isTelemetryDisabled } from '../../utils/privacyLevel.js'

/**
 * Check if analytics operations should be disabled
 *
 * Analytics is disabled in the following cases:
 * - Test environment (NODE_ENV === 'test')
 * - Privacy level is no-telemetry or essential-traffic
 *
 * (3P providers removed — the USE_BEDROCK/USE_VERTEX/USE_FOUNDRY
 * env checks were dead code; provider is always firstParty)
 */
export function isAnalyticsDisabled(): boolean {
  return process.env.NODE_ENV === 'test' || isTelemetryDisabled()
}
