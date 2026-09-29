/**
 * Resolves a marketplace's registry key (the manifest `name`) to the
 * customer-facing display label used on branded TUI surfaces (the `/plugin`
 * list, details header, delete-confirm, and the plugin-browse list).
 *
 * The registry key stays the internal single source of truth — every lookup,
 * install, and remove uses it. This module is a pure display layer: when a
 * label is registered for a key (e.g. `agent-skills` → "Ascend official") the
 * TUI shows the brand; otherwise it falls back to the registry key. The
 * customer can still reach the raw key via the CLI `plugin marketplace list`.
 *
 * The base layer owns the mechanism; a marketplace's domain module registers
 * its label at module load — the same setter-registration pattern as
 * `setPluginLicenseResolver` (base exposes the setter, the overlay provides
 * the value, so the base never imports the overlay).
 */
const displayLabels = new Map<string, string>()

/**
 * Register a customer-facing display label for a marketplace registry key.
 * Idempotent: re-registering the same key overwrites the label.
 */
export function registerMarketplaceDisplayLabel(
  name: string,
  label: string,
): void {
  displayLabels.set(name, label)
}

/**
 * Resolve a marketplace registry key to its display label.
 * Falls back to the registry key when no label is registered.
 */
export function getMarketplaceDisplayName(name: string): string {
  return displayLabels.get(name) ?? name
}
