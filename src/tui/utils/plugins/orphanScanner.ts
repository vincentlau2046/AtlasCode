/* eslint-disable custom-rules/no-sync-fs -- W4 全量 lint 复原（§8.74.21）：legacy-debt 豁免（sync→async 改写违行为零改动纪律，W-opt 波再议） */
/**
 * Orphaned marketplace scanner (WS3).
 *
 * Detects marketplace checkout directories that exist under
 * `~/.atlas/plugins/marketplaces/` but are NOT registered in
 * known_marketplaces.json. This happens when a clone succeeds but the
 * registry write never ran (e.g. a preset auto-install whose session died
 * mid-flight, or a manual clone the user forgot to register).
 *
 * Detection only — the scanner surfaces candidates and never auto-registers.
 * Adoption (writing the registry entry without re-cloning) lives in
 * `adoptOrphanMarketplace` (marketplaceManager.ts).
 */

import { join, resolve, sep } from 'path'
import { parseGitConfigValue } from '../git/gitConfigParser.js'
import { getFsImplementation } from '../fsOperations.js'
import { getPluginManifestDirs } from '../configDir.js'
import { getPluginSeedDirs } from './pluginDirectories.js'
import {
  getMarketplacesCacheDir,
  loadKnownMarketplacesConfigSafe,
} from './marketplaceManager.js'
import { DEFAULT_GIT_HOST } from './marketplaceHelpers.js'
import {
  OFFICIAL_MARKETPLACE_NAME,
  OFFICIAL_MARKETPLACE_SOURCE,
} from './officialMarketplace.js'
import {
  AGENT_SKILLS_MARKETPLACE_NAME,
  ASCEND_MARKETPLACE_SOURCE,
} from '../../plugins/ascend/marketplace/ascendMarketplace.js'

export type OrphanedMarketplace = {
  /** Directory name under marketplaces/ (the adoption key) */
  dirName: string
  /** Absolute path of the checkout directory */
  dirPath: string
  /** `name` field of the in-dir marketplace.json, or null if unreadable */
  manifestName: string | null
  /** git remote.origin.url of the checkout, or null (not a git dir) */
  remoteUrl: string | null
  /**
   * Preset marketplace name when the remote matches a built-in preset source
   * (dedup key is the normalized repo ref, not the directory name). The
   * suggested name is the registry key — the manifest name the preset
   * registers under (a gitcode agent-skills clone is suggested as
   * "agent-skills", matching its dir/manifest name).
   */
  suggestedName: string | null
}

/**
 * Normalize a git remote URL or a host/repo ref to a comparable lowercase
 * `host/owner/repo` form (no scheme, no `.git` suffix, no trailing slash).
 * SSH `git@host:owner/repo.git` and HTTPS `https://host/owner/repo` compare
 * equal, so protocol differences don't hide a preset match.
 */
export function normalizeRepoRef(ref: string): string {
  let u = ref.trim()
  const ssh = u.match(/^git@([^:]+):(.+)$/)
  if (ssh) {
    u = `https://${ssh[1]}/${ssh[2]}`
  }
  u = u.replace(/^https?:\/\//, '')
  u = u.replace(/\.git$/, '')
  u = u.replace(/\/+$/, '')
  return u.toLowerCase()
}

/**
 * Built-in preset marketplaces and their normalized repo refs — the match
 * table for `suggestedName`.
 *
 * Built lazily (not at module scope): this module sits on a
 * marketplaceManager → orphanScanner → marketplaceHelpers import cycle, and
 * marketplaceHelpers' `DEFAULT_GIT_HOST` is in its TDZ while the cycle
 * initializes. The preset constants modules (ascendMarketplace /
 * officialMarketplace) are type-import-only, so only the helper binding
 * needs the deferral.
 */
function presetRefs(): Array<{ name: string; ref: string }> {
  return [
    {
      name: AGENT_SKILLS_MARKETPLACE_NAME,
      ref: normalizeRepoRef(ASCEND_MARKETPLACE_SOURCE.url),
    },
    {
      name: OFFICIAL_MARKETPLACE_NAME,
      ref: normalizeRepoRef(
        `${DEFAULT_GIT_HOST}/${OFFICIAL_MARKETPLACE_SOURCE.repo}`,
      ),
    },
  ]
}

/**
 * Read `remote.origin.url` from a checkout's .git/config (pure file parse —
 * no git binary, so unit tests run without a git install).
 */
export async function readMarketplaceRemoteUrl(
  dirPath: string,
): Promise<string | null> {
  return parseGitConfigValue(join(dirPath, '.git'), 'remote', 'origin', 'url')
}

/**
 * Read the `name` field from a checkout's marketplace.json (same multi-location
 * probe as the loader: atlas-plugin/ → .atlas-plugin/ → .claude-plugin/ → root).
 * Returns null for any read/parse failure — an orphan whose manifest is
 * broken is still worth surfacing (the remote is enough to adopt).
 */
async function readOrphanManifestName(dirPath: string): Promise<string | null> {
  const fs = getFsImplementation()
  const candidates = getPluginManifestDirs()
    .map(d => join(dirPath, d, 'marketplace.json'))
    .concat(join(dirPath, 'marketplace.json'))
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue
    try {
      const raw = await fs.readFile(p, { encoding: 'utf-8' })
      const data = JSON.parse(raw)
      if (typeof data?.name === 'string') return data.name
    } catch {
      // Fall through to the next probe / null
    }
  }
  return null
}

/**
 * Scan the marketplaces cache dir for unregistered checkout directories.
 *
 * Skips: files (url-source `.json` caches), directories whose resolved path
 * matches a registered installLocation, and directories under a read-only
 * seed dir (those register themselves at startup via
 * registerSeedMarketplaces — flagging them would be noise).
 */
export async function scanOrphanedMarketplaces(): Promise<
  OrphanedMarketplace[]
> {
  const fs = getFsImplementation()
  const cacheDir = resolve(getMarketplacesCacheDir())

  let entries: Awaited<ReturnType<typeof fs.readdir>>
  try {
    entries = await fs.readdir(cacheDir)
  } catch {
    return []
  }

  const config = await loadKnownMarketplacesConfigSafe()
  const registered = new Set(
    Object.values(config).map(e => resolve(e.installLocation)),
  )
  const seedDirs = getPluginSeedDirs().map(d => resolve(d))

  const orphans: OrphanedMarketplace[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.endsWith('.json')) continue
    const dirPath = join(cacheDir, entry.name)
    if (registered.has(dirPath)) continue
    if (seedDirs.some(sd => dirPath === sd || dirPath.startsWith(sd + sep))) {
      continue
    }

    const remoteUrl = await readMarketplaceRemoteUrl(dirPath)
    const preset = remoteUrl
      ? presetRefs().find(p => p.ref === normalizeRepoRef(remoteUrl))
      : undefined

    orphans.push({
      dirName: entry.name,
      dirPath,
      manifestName: await readOrphanManifestName(dirPath),
      remoteUrl,
      suggestedName: preset?.name ?? null,
    })
  }
  return orphans
}
