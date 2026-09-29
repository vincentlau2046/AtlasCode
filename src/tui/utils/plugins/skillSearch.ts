/**
 * Cross-marketplace skill search (WS4) — the query surface for skill
 * marketplaces (which parasitize the plugin marketplace: a skill-pack is a
 * plugin whose skills/ dir ships SKILL.md files). Iterates every
 * materialized marketplace's local-source plugins, parses each SKILL.md
 * frontmatter with the standard skill parser, and returns a skill-level view.
 *
 * Uninstalled skills are visible (that's the point — discovery before
 * install); installing a skill means installing its parent plugin (installId
 * is the plugin@marketplace id).
 *
 * Cache-only by design: search must not trigger network fetches. Marketplaces
 * whose source is `url` (no checkout, installLocation is a .json cache file)
 * have no on-disk plugin content and contribute nothing — same rule as the
 * cache-only plugin loader (marketplaceManager's stat/join('..') dance).
 */

import { readdir, readFile, stat } from 'fs/promises'
import type { Dirent } from 'fs'
import { join } from 'path'
import { parseFrontmatter } from '../frontmatterParser.js'
import { parseSkillFrontmatterFields } from '../../skills/loadSkillsDir.js'
import { createPluginId } from './marketplaceHelpers.js'
import {
  getMarketplaceCacheOnly,
  loadKnownMarketplacesConfig,
} from './marketplaceManager.js'
import { isPluginInstalled } from './installedPluginsManager.js'

export type MarketSkill = {
  /** Skill name (frontmatter `name`, falling back to the SKILL.md dir name) */
  skill: string
  description: string
  whenToUse?: string
  /** Parent plugin (marketplace entry) name */
  plugin: string
  /** Marketplace name */
  marketplace: string
  /**
   * Parent plugin entry's local source (a relative `./…` path). Only local
   * (string-source) plugins are surfaced — url/git-source marketplaces have
   * no on-disk content — so this is always a string. Carried so a UI can
   * reconstruct a minimal `PluginMarketplaceEntry` to install the parent.
   */
  source: string
  /** Parent plugin entry version (optional metadata) */
  version?: string
  /** Install target — installing the skill installs its parent plugin */
  installId: string
  /** Whether the parent plugin is currently installed */
  isInstalled: boolean
}

/**
 * Search skills across all configured marketplaces.
 *
 * @param query - Optional case-insensitive substring filter over
 *   skill name / description / when-to-use. Omit for the full catalog.
 */
export async function searchSkillsAcrossMarketplaces(
  query?: string,
): Promise<MarketSkill[]> {
  const config = await loadKnownMarketplacesConfig()
  const q = query?.trim().toLowerCase()
  const results: MarketSkill[] = []

  for (const [marketplaceName, marketplaceConfig] of Object.entries(config)) {
    // Cache-only: url sources / missing checkouts yield null → skipped
    const data = await getMarketplaceCacheOnly(marketplaceName)
    if (!data) continue

    // Local (string) plugin sources resolve against the marketplace dir,
    // mirroring the cache-only loader: a file installLocation (url-source
    // .json cache) resolves to its parent, where no plugins/ tree exists.
    let marketplaceDir: string
    try {
      const locStat = await stat(marketplaceConfig.installLocation)
      marketplaceDir = locStat.isDirectory()
        ? marketplaceConfig.installLocation
        : join(marketplaceConfig.installLocation, '..')
    } catch {
      continue
    }

    for (const entry of data.plugins) {
      if (typeof entry.source !== 'string') continue
      const pluginPath = join(marketplaceDir, entry.source)

      // Default skills/ dir plus any extra dirs the entry declares
      const skillDirCandidates: string[] = [join(pluginPath, 'skills')]
      if (typeof entry.skills === 'string') {
        skillDirCandidates.push(join(pluginPath, entry.skills))
      } else if (Array.isArray(entry.skills)) {
        for (const extra of entry.skills) {
          skillDirCandidates.push(join(pluginPath, extra))
        }
      }

      const seen = new Set<string>()
      for (const skillDir of skillDirCandidates) {
        let dirEntries: Dirent[]
        try {
          dirEntries = await readdir(skillDir, { withFileTypes: true })
        } catch {
          continue
        }
        for (const d of dirEntries) {
          if (!d.isDirectory()) continue
          const skillFile = join(skillDir, d.name, 'SKILL.md')
          if (seen.has(skillFile)) continue
          seen.add(skillFile)

          let content: string
          try {
            content = await readFile(skillFile, { encoding: 'utf-8' })
          } catch {
            continue
          }
          const { frontmatter, content: markdown } = parseFrontmatter(content)
          const resolvedName =
            typeof frontmatter.name === 'string'
              ? frontmatter.name
              : d.name
          const parsed = parseSkillFrontmatterFields(
            frontmatter,
            markdown,
            resolvedName,
          )
          const installId = createPluginId(entry.name, marketplaceName)
          const skill: MarketSkill = {
            skill: parsed.displayName ?? resolvedName,
            description: parsed.description,
            whenToUse: parsed.whenToUse,
            plugin: entry.name,
            marketplace: marketplaceName,
            source: entry.source,
            version: entry.version,
            installId,
            isInstalled: isPluginInstalled(installId),
          }
          if (
            q &&
            !`${skill.skill} ${skill.description} ${skill.whenToUse ?? ''}`
              .toLowerCase()
              .includes(q)
          ) {
            continue
          }
          results.push(skill)
        }
      }
    }
  }

  return results
}
