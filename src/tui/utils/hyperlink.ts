import chalk from 'chalk'
import { supportsHyperlinks } from '../ink/supports-hyperlinks.js'

// OSC 8 hyperlink escape sequences
// Format: \e]8;;URL\e\\TEXT\e]8;;\e\\
// Using \x07 (BEL) as terminator which is more widely supported
export const OSC8_START = '\x1b]8;;'
export const OSC8_END = '\x07'

type HyperlinkOptions = {
  supportsHyperlinks?: boolean
}

/**
 * Create a clickable hyperlink using OSC 8 escape sequences.
 * Falls back to plain text if the terminal doesn't support hyperlinks.
 *
 * @param url - The URL to link to
 * @param content - Optional content to display as the link text (only when hyperlinks are supported).
 *                  If provided and hyperlinks are supported, this text is shown as a clickable link.
 *                  If hyperlinks are not supported, content is ignored and only the URL is shown.
 * @param options - Optional overrides for testing (supportsHyperlinks)
 */
export function createHyperlink(
  url: string,
  content?: string,
  options?: HyperlinkOptions,
): string {
  const hasSupport = options?.supportsHyperlinks ?? supportsHyperlinks()
  if (!hasSupport) {
    return url
  }

  // Apply basic ANSI blue color - wrap-ansi preserves this across line breaks
  // RGB colors (like theme colors) are NOT preserved by wrap-ansi with OSC 8
  const displayText = content ?? url
  const coloredText = chalk.blue(displayText)
  return `${OSC8_START}${url}${OSC8_END}${coloredText}${OSC8_START}${OSC8_END}`
}

/**
 * K6-5 (wave 0.1.86): hover affordance — underline the link text of every
 * OSC 8 block in a formatted markdown string.
 *
 * Item-level approximation (registered): ALL links in the hovered item
 * underline, not just the one under the cursor — per-span hover would need
 * the link text split into separate ink nodes, which breaks the string
 * rendering pipeline (block layout). Plain-text URLs (findPlainTextUrlAt
 * click fallback) are clickable but NOT underlined: they carry no OSC 8
 * marker to key on (markdown.ts deliberately avoids linkifying them to
 * prevent nested OSC 8).
 *
 * SGR 4 wraps the styled text OUTSIDE the chalk color codes so existing
 * color spans are untouched, and inside the OSC 8 region so the underline
 * cells keep the hyperlink attribution.
 */
export function underlineOsc8Links(formatted: string): string {
  // OSC 8 block: open (\x1b]8;params;URI\x07 — params may be empty for the bare
  // form emitted by createHyperlink, or `id=…` once ink's screen layer rewrites
  // the open) + inner text + close (\x1b]8;;\x07). URI must be non-empty so the
  // close sequence itself never matches as an open.
  const OSC8_BLOCK_RE = /\x1b\]8;([^;\x07]*);([^\x07]+)\x07([\s\S]+?)\x1b\]8;;\x07/g
  return formatted.replace(
    OSC8_BLOCK_RE,
    (_match, _params: string, uri: string, inner: string) =>
      `${OSC8_START}${uri}${OSC8_END}\x1b[4m${inner}\x1b[24m${OSC8_START}${OSC8_END}`,
  )
}
