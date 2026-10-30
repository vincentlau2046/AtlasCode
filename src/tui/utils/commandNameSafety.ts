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
// soft hyphen, Unicode space separators (U+2000-200A) + zero-width family
// (U+200B-200F), line/paragraph separators, directional overrides
// (U+202A-202E), narrow NBSP, medium mathematical space, word joiner +
// isolates (U+2060-2069), BOM.
const UNSAFE_NAME_CHARS_RE =
  /[\u0000-\u001F\u007F-\u00A0\u00AD\u2000-\u200F\u2028\u2029\u202A-\u202E\u202F\u205F\u2060-\u2069\uFEFF]/

/**
 * Whether a command/skill name contains unsafe characters (the filter gate
 * on the loader name→registration chain). Empty names are unsafe too.
 */
export function isUnsafeCommandName(name: string): boolean {
  if (name === '') return true
  if (name.includes('<') || name.includes('>')) return true
  return UNSAFE_NAME_CHARS_RE.test(name)
}
