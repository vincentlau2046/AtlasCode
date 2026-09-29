/**
 * License inference for Ascend official marketplace plugins.
 *
 * The official `agent-skills` marketplace.json does not populate the `license`
 * field on any of its 33 plugin entries (verified against
 * gitcode.com/Ascend/agent-skills). The license is instead determined by
 * *where* the plugin lives within the repo:
 *
 *   - cannbot submodule (`official/CANNBot/*`, author.url gitcode.com/cann/
 *     cannbot-skills) → CANN OSL v2.0 — field-limited 华为 AI 处理器用途,
 *     non-sublicensable. Reference + provenance only; NOT vendored.
 *   - parent repo (everything else)                     → Apache-2.0 (+ docs
 *     under CC-BY-SA-4.0).
 *
 * This module infers the license from author.url / source path, with an
 * explicit `license` field winning if upstream ever populates it.
 */

import type { PluginLicenseInfo } from '../../../commands/plugin/pluginLicenseResolver.js'
import type { PluginMarketplaceEntry } from '../../../utils/plugins/schemas.js'
import { AGENT_SKILLS_MARKETPLACE_NAME } from './ascendMarketplace.js'

/** SPDX-style identifier used for the cannbot CANN OSL v2.0 license. */
export const CANN_OSL_LICENSE_ID = 'CANN-OSL-2.0'

/** SPDX-style identifier used for the parent-repo Apache-2.0 license. */
export const APACHE_LICENSE_ID = 'Apache-2.0'

/**
 * Short human-facing notice shown alongside CANN-OSL-2.0 plugins, so users
 * understand the field-of-use restriction before installing cannbot content.
 */
export const CANN_OSL_NOTICE =
  'CANN OSL v2.0 — field-limited 华为 AI 处理器用途，non-sublicensable（引用+溯源，不 vendor）'

/**
 * Infer the SPDX license identifier for an Ascend marketplace plugin entry.
 *
 * Priority:
 *   1. Explicit `license` field (future-proof: if upstream populates SPDX).
 *   2. cannbot submodule → CANN-OSL-2.0 (author.url or source path signals it).
 *   3. Parent-repo default → Apache-2.0.
 *
 * @returns a license identifier string (always defined for ascend entries).
 */
export function inferPluginLicense(entry: PluginMarketplaceEntry): string {
  // 1. Explicit license field wins.
  if (entry.license) {
    return entry.license
  }

  // 2. cannbot submodule: author.url points at cann/cannbot-skills, or the
  //    relative source path lives under ./official/CANNBot/.
  const authorUrl = entry.author?.url ?? ''
  const source =
    typeof entry.source === 'string' ? entry.source : ''
  if (authorUrl.includes('cann/cannbot-skills') || source.includes('CANNBot')) {
    return CANN_OSL_LICENSE_ID
  }

  // 3. Parent-repo default.
  return APACHE_LICENSE_ID
}

/**
 * Whether a license identifier denotes the cannbot CANN OSL v2.0 license
 * (and therefore warrants the field-of-use notice on the details page).
 */
export function isCannOslLicense(license: string | undefined): boolean {
  return license === CANN_OSL_LICENSE_ID
}

/**
 * Marketplace-name-gated license resolver for injection into the base-layer
 * plugin details view (see `setPluginLicenseResolver`).
 *
 * Returns `undefined` for non-ascend marketplaces so the base layer falls back
 * to its default (no license row) for official Anthropic / third-party plugins
 * — preventing the ascend default from mislabeling foreign entries.
 *
 * For ascend entries, cannbot plugins additionally carry the CANN OSL
 * field-of-use `notice` so users see the restriction before installing.
 */
export function ascendLicenseResolver(
  entry: PluginMarketplaceEntry,
  marketplaceName: string,
): PluginLicenseInfo | undefined {
  if (marketplaceName !== AGENT_SKILLS_MARKETPLACE_NAME) {
    return undefined
  }
  const id = inferPluginLicense(entry)
  return isCannOslLicense(id) ? { id, notice: CANN_OSL_NOTICE } : { id }
}
