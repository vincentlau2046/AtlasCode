/**
 * Constants for the Ascend official plugins marketplace.
 *
 * The official Ascend marketplace is hosted on gitcode.com/Ascend/agent-skills
 * and provides 33 first-party Ascend plugins (10 from the cannbot submodule
 * under CANN OSL v2.0, 23 in the parent repo under Apache-2.0+CC-BY-SA-4.0).
 * This file defines the constants needed to install and identify this
 * marketplace — mirroring {@link OFFICIAL_MARKETPLACE_SOURCE} for the
 * Anthropic marketplace.
 *
 * License bifurcation (see vault 22-Ascend域知识层框架设计):
 *   - agent-skills parent repo          → Apache-2.0 (code) + CC-BY-SA-4.0 (docs)
 *   - cannbot-skills submodule          → CANN OSL v2.0 (field-limited 华为 AI
 *                                         处理器, non-sublicensable) — reference
 *                                         + provenance only, NOT vendored.
 * The license of an individual plugin is inferred at display time from its
 * author.url / source path (see ./licenseInference.ts).
 */

import type { MarketplaceSource } from '../../../utils/plugins/schemas.js'
import { registerMarketplaceDisplayLabel } from '../../../utils/plugins/marketplaceDisplayName.js'

/**
 * Source configuration for the Ascend official plugins marketplace.
 *
 * Uses `source: 'git'` (gitcode.com is not GitHub), cloning the full repo
 * with `--recurse-submodules --shallow-submodules` so the cannbot submodule
 * (`official/CANNBot`) is pulled alongside the parent plugins. Used when
 * auto-installing the marketplace on startup.
 */
export const ASCEND_MARKETPLACE_SOURCE = {
  source: 'git',
  url: 'https://gitcode.com/Ascend/agent-skills.git',
} as const satisfies MarketplaceSource

/**
 * Registry key for the Ascend official marketplace.
 *
 * Equals the marketplace manifest's `name` field (`agent-skills`) — the key
 * `addMarketplaceSource` writes into known_marketplaces.json is the manifest
 * name, so every internal lookup (startup check, World B verification,
 * orphan scanner) must use this manifest name. The older `ascend-official`
 * alias is retired: lookups against it never matched the registry key,
 * which is why World B reported "not installed" while the clone existed.
 */
export const AGENT_SKILLS_MARKETPLACE_NAME = 'agent-skills'

/**
 * Customer-facing display label for this marketplace (brand, not the
 * registry key). Used in TUI notifications, CLI output, skill prompts, and
 * the `/plugin` list (via {@link registerMarketplaceDisplayLabel}) — the
 * customer-facing surfaces we control.
 */
export const ASCEND_OFFICIAL_DISPLAY_LABEL = 'Ascend official'

// Register the customer-facing display label so branded TUI surfaces (the
// /plugin list, details header, plugin-browse list) show "Ascend official"
// instead of the registry key `agent-skills`. The registry key remains the
// internal identifier used by every lookup / install / remove.
registerMarketplaceDisplayLabel(
  AGENT_SKILLS_MARKETPLACE_NAME,
  ASCEND_OFFICIAL_DISPLAY_LABEL,
)
