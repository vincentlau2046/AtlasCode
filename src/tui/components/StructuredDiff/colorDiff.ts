import {
  ColorDiff,
  ColorFile,
  getSyntaxTheme as nativeGetSyntaxTheme,
  type SyntaxTheme,
} from '../../native-ts/color-diff/index.js'
// In-repo TS port (src/native-ts/color-diff/index.ts) — the node_modules
// 'color-diff-napi' is a reserved-name stub whose ColorFile lacks
// .render(), which crashed HighlightedCode. The port's API matches the
// native d.ts exactly, so this import drop-in preserves all callers.
import { isEnvDefinedFalsy } from '../../utils/envUtils.js'

export type ColorModuleUnavailableReason = 'env'

/**
 * Returns a static reason why the color-diff module is unavailable, or null if available.
 * 'env' = disabled via ATLAS_SYNTAX_HIGHLIGHT (legacy ATLAS_SYNTAX_HIGHLIGHT)
 *
 * The TS port of color-diff works in all build modes, so the only way to
 * disable it is via the env var.
 */
export function getColorModuleUnavailableReason(): ColorModuleUnavailableReason | null {
  if (isEnvDefinedFalsy((process.env.ATLAS_SYNTAX_HIGHLIGHT))) {
    return 'env'
  }
  return null
}

export function expectColorDiff(): typeof ColorDiff | null {
  return getColorModuleUnavailableReason() === null ? ColorDiff : null
}

export function expectColorFile(): typeof ColorFile | null {
  return getColorModuleUnavailableReason() === null ? ColorFile : null
}

export function getSyntaxTheme(themeName: string): SyntaxTheme | null {
  return getColorModuleUnavailableReason() === null
    ? nativeGetSyntaxTheme(themeName)
    : null
}
