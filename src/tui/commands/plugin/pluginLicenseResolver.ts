/**
 * Injectable plugin-license resolver for the plugin details view.
 *
 * The base layer has no built-in notion of per-plugin licenses — marketplace
 * entries may omit the `license` field (the Ascend official marketplace omits
 * it on all 33 entries). A domain overlay (e.g. the Ascend marketplace) can
 * register a resolver that infers a license from the entry's author/source,
 * and the details view will render it.
 *
 * This is a generic extension point: the base layer stays domain-agnostic.
 * The resolver receives the marketplace name so it can decline to infer for
 * marketplaces it does not own (returning `undefined` → no license row).
 */

import type { PluginMarketplaceEntry } from '../../utils/plugins/schemas.js'

/**
 * Resolved license info for display.
 *   - `id`: SPDX-style identifier (e.g. "Apache-2.0", "CANN-OSL-2.0").
 *   - `notice`: optional human-facing caveat shown beneath the id (e.g. a
 *     field-of-use restriction).
 */
export type PluginLicenseInfo = {
  id: string
  notice?: string
}

/**
 * A function that infers the license of a marketplace plugin entry.
 * Returns `undefined` when no inference applies (the details view then shows
 * no license row).
 */
export type PluginLicenseResolver = (
  entry: PluginMarketplaceEntry,
  marketplaceName: string,
) => PluginLicenseInfo | undefined

let resolver: PluginLicenseResolver | undefined

/**
 * Register (or clear) the plugin-license resolver. Intended to be called once
 * at startup by a domain overlay. Re-registration is idempotent and cheap.
 */
export function setPluginLicenseResolver(
  next: PluginLicenseResolver | undefined,
): void {
  resolver = next
}

/**
 * Resolve the license for a plugin entry, if a resolver is registered and it
 * applies to this marketplace.
 */
export function resolvePluginLicense(
  entry: PluginMarketplaceEntry,
  marketplaceName: string,
): PluginLicenseInfo | undefined {
  return resolver?.(entry, marketplaceName)
}
