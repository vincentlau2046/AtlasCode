/**
 * CLI-facing `plugin marketplace list` text (WS3).
 *
 * Lists the configured marketplaces, then — when the orphan scanner finds
 * unregistered checkout directories under marketplaces/ — a trailing
 * "Unregistered marketplace directories" section with an adopt hint per
 * directory. Detection only: nothing is registered as a side effect.
 */
import { errorMessage } from '../../utils/errors.js'
import { loadKnownMarketplacesConfig } from '../../utils/plugins/marketplaceManager.js'
import { scanOrphanedMarketplaces } from '../../utils/plugins/orphanScanner.js'

export async function buildMarketplaceListText(): Promise<string> {
  let lines: string[]
  try {
    const config = await loadKnownMarketplacesConfig()
    const names = Object.keys(config)
    lines =
      names.length === 0
        ? ['No marketplaces configured']
        : ['Configured marketplaces:', ...names.map(n => `  • ${n}`)]
  } catch (err) {
    return `Error loading marketplaces: ${errorMessage(err)}`
  }

  // The scan degrades to "no orphans" on any error — a list is still
  // useful (and cheaper than failing the whole command on a half-broken
  // cache dir).
  const orphans = await scanOrphanedMarketplaces().catch(() => [])
  if (orphans.length > 0) {
    lines.push(
      '',
      'Unregistered marketplace directories (not in known_marketplaces.json):',
    )
    for (const o of orphans) {
      const suggested =
        o.suggestedName && o.suggestedName !== o.dirName
          ? ` (suggested name: ${o.suggestedName})`
          : ''
      const detail = o.remoteUrl
        ? ` [remote: ${o.remoteUrl}]`
        : o.manifestName
          ? ` [manifest name: ${o.manifestName}]`
          : ''
      lines.push(`  • ${o.dirName}${suggested}${detail}`)
      const adoptName =
        o.suggestedName && o.suggestedName !== o.dirName
          ? ` --name ${o.suggestedName}`
          : ''
      lines.push(
        `      adopt: plugin marketplace adopt ${o.dirName}${adoptName}`,
      )
    }
  }
  return lines.join('\n')
}
