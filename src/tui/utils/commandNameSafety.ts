/**
 * TUI — command/skill name sanitization predicate (0.1.82 K3-C, upstream
 * 296).
 *
 * Skill/command file·directory names containing hidden, directional, or
 * whitespace characters, or `<>`, make the skill **not offered** (silent
 * filter ruling, ticket §101: never breaks the interactive flow):
 *   - Directional overrides (U+202A-202E / U+2066-2069 LRI…PDI): visual
 *     spoofing ('bad<U+202E>' can masquerade as another name in the
 *     terminal/listing);
 *   - `<>`: names render into the skill list and prompts — angle brackets
 *     are a prompt/tag injection surface;
 *   - Hidden whitespace (zero-width U+200B-200F, NBSP, narrow NBSP, BOM,
 *     soft hyphen): invisible characters enable name collisions and
 *     bypass visual inspection;
 *   - C0/C1 control characters and line/paragraph separators likewise.
 *
 * ASCII space stays allowed (existing skill names with spaces keep working;
 * the red cases are the directional/angle/hidden-whitespace families).
 * Sync twin: engine domain src/engine/skill/commandNameSafety.ts
 * (discrimination = wave0182-l20-name-sanitization.test.ts runs both
 * copies with the same cases).
 */

// C0 controls (DEL included via the C1 range start), C1 controls + NBSP,
// soft hyphen, default-ignorable family (CGJ U+034F / ALM U+061C / Syriac
// abbreviation mark U+070F / Mongolian vowel separator U+180E / variation
// selectors U+FE00-FE0F + astral supplement U+E0100-E01EF), Unicode space
// separators (U+1680 / U+2000-200A / U+3000) + zero-width family
// (U+200B-200F), line/paragraph separators, directional overrides
// (U+202A-202E), narrow NBSP, medium mathematical space, word joiner +
// isolates (U+2060-2069), BOM. The u flag makes the astral range match by
// code point (2026-10-30 review hardening: default-ignorable + bidi).
import { logForDebugging } from './debug.js'

const UNSAFE_NAME_CHARS_RE =
  /[\u0000-\u001F\u007F-\u00A0\u00AD\u034F\u061C\u070F\u1680\u180E\u2000-\u200F\u2028\u2029\u202A-\u202E\u202F\u205F\u2060-\u2069\u3000\uFE00-\uFE0F\uFEFF\u{E0100}-\u{E01EF}]/u

/**
 * Whether a command/skill name contains unsafe characters (the filter gate
 * on the loader name→registration chain). Empty names are unsafe too.
 */
export function isUnsafeCommandName(name: string): boolean {
  if (name === '') return true
  if (name.includes('<') || name.includes('>')) return true
  return UNSAFE_NAME_CHARS_RE.test(name)
}

/**
 * Sanitize a frontmatter `name` display-name override (2026-10-30 review
 * hardening): the loader gate only validates the directory/file-derived
 * canonical name — an unsanitized frontmatter override reaches the skill
 * list and prompts verbatim through userFacingName() (the SkillTool
 * unknown-skill suggestion list consumes the same surface), bypassing name
 * sanitization. Unsafe overrides are discarded, falling back to the
 * canonical name (same silent-filter ruling as §101) + debug log.
 */
export function sanitizeDisplayName(
  displayName: string | undefined,
  canonicalName: string,
): string | undefined {
  if (displayName === undefined || !isUnsafeCommandName(displayName)) {
    return displayName
  }
  logForDebugging(
    `Discarding unsafe frontmatter display name ${JSON.stringify(displayName)} for ${canonicalName}; falling back to canonical name`,
  )
  return undefined
}
