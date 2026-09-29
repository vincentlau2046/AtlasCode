import { useEffect, useState } from 'react'
import { scanOrphanedMarketplaces } from '../../utils/plugins/orphanScanner.js'

/**
 * Read-only hint for the interactive Manage view (WS3): surfaces
 * unregistered marketplace directories without an interactive adopt flow —
 * adoption itself is command-driven (`plugin marketplace adopt <dir>`),
 * which keeps the compiled ManageMarketplaces component free of new
 * keybinding/list-model machinery.
 *
 * Returns a one-line hint string, or null when there is nothing to show
 * (including scan errors — a hint must never break the manage view).
 */
export function useOrphanMarketplaceHint(): string | null {
  const [hint, setHint] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void scanOrphanedMarketplaces()
      .then(orphans => {
        if (cancelled || orphans.length === 0) return
        const names = orphans.map(o =>
          o.suggestedName && o.suggestedName !== o.dirName
            ? `${o.dirName} (→ ${o.suggestedName})`
            : o.dirName,
        )
        setHint(
          `${orphans.length} unregistered marketplace director${orphans.length === 1 ? 'y' : 'ies'}: ${names.join(', ')} — run \`plugin marketplace list\` for details, adopt with \`plugin marketplace adopt <dir>\``,
        )
      })
      .catch(() => {
        // Scan errors are non-fatal for the hint
      })
    return () => {
      cancelled = true
    }
  }, [])
  return hint
}
