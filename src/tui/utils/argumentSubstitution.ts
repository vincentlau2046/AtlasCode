/**
 * Utility for substituting $ARGUMENTS placeholders in skill/command prompts.
 *
 * Supports:
 * - $ARGUMENTS - replaced with the full arguments string
 * - $ARGUMENTS[0], $ARGUMENTS[1], etc. - replaced with individual indexed arguments
 * - $0, $1, etc. - shorthand for $ARGUMENTS[0], $ARGUMENTS[1]
 * - Named arguments (e.g., $foo, $bar) - when argument names are defined in frontmatter
 *
 * Arguments are parsed using shell-quote for proper shell argument handling.
 */

import { tryParseShellCommand } from './bash/shellQuote.js'

/**
 * Parse an arguments string into an array of individual arguments.
 * Uses shell-quote for proper shell argument parsing including quoted strings.
 *
 * Examples:
 * - "foo bar baz" => ["foo", "bar", "baz"]
 * - 'foo "hello world" baz' => ["foo", "hello world", "baz"]
 * - "foo 'hello world' baz" => ["foo", "hello world", "baz"]
 */
export function parseArguments(args: string): string[] {
  if (!args || !args.trim()) {
    return []
  }

  // Return $KEY to preserve variable syntax literally (don't expand variables)
  const result = tryParseShellCommand(args, key => `$${key}`)
  if (!result.success) {
    // Fall back to simple whitespace split if parsing fails
    return args.split(/\s+/).filter(Boolean)
  }

  // Filter to only string tokens (ignore shell operators, etc.)
  return result.tokens.filter(
    (token): token is string => typeof token === 'string',
  )
}

// 0.1.82 K3-C1 (upstream 301 tightening): argument-name dual caps — more than
// 64 frontmatter argument names are truncated to the first 64, names longer
// than 64 chars are truncated to 64. The 64×64 bound constrains both the
// named substitution and generateProgressiveArgumentHint.
// Sync twin: src/engine/skill/argumentSubstitution.ts (判别 =
// wave0182-skill-param-caps.test.ts runs both copies with the same cases).
export const MAX_ARGUMENT_NAMES = 64
export const MAX_ARGUMENT_NAME_CHARS = 64

/**
 * Parse argument names from the frontmatter 'arguments' field.
 * Accepts either a space-separated string or an array of strings.
 *
 * Examples:
 * - "foo bar baz" => ["foo", "bar", "baz"]
 * - ["foo", "bar", "baz"] => ["foo", "bar", "baz"]
 */
export function parseArgumentNames(
  argumentNames: string | string[] | undefined,
): string[] {
  if (!argumentNames) {
    return []
  }

  // Filter out empty strings and numeric-only names (which conflict with $0, $1 shorthand)
  const isValidName = (name: string): boolean =>
    typeof name === 'string' && name.trim() !== '' && !/^\d+$/.test(name)

  // K3-C1: truncate each name to 64 chars, keep the first 64 names;
  // ≤64 names ≤64 chars pass through unchanged
  const cap = (names: string[]): string[] =>
    names.map(name => name.slice(0, MAX_ARGUMENT_NAME_CHARS)).slice(0, MAX_ARGUMENT_NAMES)

  if (Array.isArray(argumentNames)) {
    return cap(argumentNames.filter(isValidName))
  }
  if (typeof argumentNames === 'string') {
    return cap(argumentNames.split(/\s+/).filter(isValidName))
  }
  return []
}

/**
 * Generate argument hint showing remaining unfilled args.
 * @param argNames - Array of argument names from frontmatter
 * @param typedArgs - Arguments the user has typed so far
 * @returns Hint string like "[arg2] [arg3]" or undefined if all filled
 */
export function generateProgressiveArgumentHint(
  argNames: string[],
  typedArgs: string[],
): string | undefined {
  const remaining = argNames.slice(typedArgs.length)
  if (remaining.length === 0) return undefined
  return remaining.map(name => `[${name}]`).join(' ')
}

// 0.1.82 K3-C2 (upstream 301 tightening): substitution output budget —
// placeholder density × args length expands unboundedly (2000 × $ARGUMENTS ×
// 5000-char args ≈ 10MB); malicious/corrupt skill frontmatter can blow up
// memory through it. Over budget, clamp the replacement value per position
// (budgetPerReplacement = floor((cap - content.length) / count)).
// Sync twin: src/engine/skill/argumentSubstitution.ts.
export const MAX_SUBSTITUTION_OUTPUT_CHARS = 1_000_000

/**
 * Placeholder match at a position in the template (single source of shape
 * truth for BOTH the budget pre-count and the substitution pass — the two can
 * never drift apart).
 *  - named:     $foo   (boundary: next char is neither '[' nor a word char;
 *              declaration order wins for duplicate names, same as the old
 *              sequential passes)
 *  - indexed:   $ARGUMENTS[0]
 *  - bare:      $ARGUMENTS
 *  - shorthand: $0      (boundary: next char is not a word char)
 */
interface PlaceholderMatch {
  length: number
  kind: 'named' | 'indexed' | 'bare' | 'shorthand'
  nameIndex?: number
  argIndex?: number
}

const INDEXED_PLACEHOLDER_RE = /\$ARGUMENTS\[(\d+)\]/y
const SHORTHAND_PLACEHOLDER_RE = /\$(\d+)/y

function isWordChar(c: string | undefined): boolean {
  return c !== undefined && /[A-Za-z0-9_]/.test(c)
}

function matchPlaceholderAt(
  content: string,
  i: number,
  argumentNames: string[],
): PlaceholderMatch | null {
  if (content[i] !== '$') return null
  // 1) named (literal startsWith — names with regex metacharacters are
  //    matched literally instead of throwing in a RegExp constructor)
  for (let n = 0; n < argumentNames.length; n++) {
    const name = argumentNames[n]
    if (!name) continue
    if (content.startsWith(`$${name}`, i)) {
      const after = content[i + 1 + name.length]
      if (after !== '[' && !isWordChar(after)) {
        return { length: 1 + name.length, kind: 'named', nameIndex: n }
      }
    }
  }
  // 2) indexed $ARGUMENTS[n]
  INDEXED_PLACEHOLDER_RE.lastIndex = i
  const indexed = INDEXED_PLACEHOLDER_RE.exec(content)
  if (indexed) {
    return {
      length: indexed[0].length,
      kind: 'indexed',
      argIndex: parseInt(indexed[1], 10),
    }
  }
  // 3) bare $ARGUMENTS
  if (content.startsWith('$ARGUMENTS', i)) {
    return { length: '$ARGUMENTS'.length, kind: 'bare' }
  }
  // 4) shorthand $n
  SHORTHAND_PLACEHOLDER_RE.lastIndex = i
  const shorthand = SHORTHAND_PLACEHOLDER_RE.exec(content)
  if (shorthand && !isWordChar(content[i + shorthand[0].length])) {
    return {
      length: shorthand[0].length,
      kind: 'shorthand',
      argIndex: parseInt(shorthand[1], 10),
    }
  }
  return null
}

/**
 * Count placeholder occurrences in content (single scanner over the same
 * matcher the substitution pass uses) for the budget upper-bound estimate.
 */
function countPlaceholderOccurrences(
  content: string,
  argumentNames: string[],
): number {
  let count = 0
  let i = 0
  while (i < content.length) {
    const m = matchPlaceholderAt(content, i, argumentNames)
    if (m) {
      count++
      i += m.length
    } else {
      i++
    }
  }
  return count
}

/**
 * Substitute $ARGUMENTS placeholders in content with actual argument values.
 *
 * K3-C2 round-5 (security review): substitution runs as a SINGLE pass over
 * the original template, emitting argument values literally. The previous
 * multi-pass regex implementation had two amplification paths that bypassed
 * the budget: (a) string replacements interpret `$&`/`` $' ``/`` $` ``/`$$`
 * — a `$'` value spliced in the entire text following the match, so a dense
 * template with a 2-char arg expanded to ~content²/12; (b) passes ran over
 * already-substituted text, so values containing further placeholders were
 * re-expanded by later passes. With single-pass literal emission the
 * projection below is a true upper bound, and the clamp is exact.
 *
 * @param content - The content containing placeholders
 * @param args - The raw arguments string (may be undefined/null)
 * @param appendIfNoPlaceholder - If true and no placeholders are found, appends "ARGUMENTS: {args}" to content
 * @param argumentNames - Optional array of named arguments (e.g., ["foo", "bar"]) that map to indexed positions
 * @returns The content with placeholders substituted
 */
function substituteArgumentsImpl(
  content: string,
  args: string | undefined,
  appendIfNoPlaceholder: boolean,
  argumentNames: string[],
  strict: boolean,
): string | null {
  // undefined/null means no args provided - return content unchanged
  // empty string is a valid input that should replace placeholders with empty
  if (args === undefined || args === null) {
    return content
  }

  // K3-C2: budget pre-count — if the projection exceeds the budget, clamp
  // args per position (all replacement values derive from effectiveArgs:
  // parsedArgs re-parsed + bare $ARGUMENTS uses it directly). Per-placeholder
  // cost uses args.length as upper bound (parsedArgs[i] ⊆ args); zero
  // placeholders (count=0) never clamps (append path bypasses the budget,
  // preserving the original semantics).
  const placeholderCount = countPlaceholderOccurrences(content, argumentNames)
  let effectiveArgs = args
  if (
    placeholderCount > 0 &&
    content.length + placeholderCount * args.length >
      MAX_SUBSTITUTION_OUTPUT_CHARS
  ) {
    // K3-C2 round-5 #2: strict mode refuses instead of clamping — hook
    // prompts gate tool use / stop conditions, so a silently truncated input
    // must never reach the deciding model (callers block the gated action)
    if (strict) return null
    const budgetPerReplacement = Math.max(
      0,
      Math.floor(
        (MAX_SUBSTITUTION_OUTPUT_CHARS - content.length) / placeholderCount,
      ),
    )
    effectiveArgs = args.slice(0, budgetPerReplacement)
  } else if (strict) {
    // K3-C2 round-6: strict preflight covers every output-producing branch.
    // With no placeholders the output is either the bare template or the
    // append branch (template + "ARGUMENTS: " + args) — both linear, nothing
    // is ever truncated, but an over-budget prompt must still be refused
    // rather than fed to the deciding model.
    const appendLen =
      appendIfNoPlaceholder && args
        ? '\n\nARGUMENTS: '.length + args.length
        : 0
    if (content.length + appendLen > MAX_SUBSTITUTION_OUTPUT_CHARS) {
      return null
    }
  }

  const parsedArgs = parseArguments(effectiveArgs)

  // Single pass: template chars pass through untouched; replacement values
  // are appended literally and never rescanned. appendValue enforces the
  // cumulative budget as a defensive bound (the pre-count clamp above already
  // guarantees it mathematically; template literals are never truncated —
  // placeholder-free content keeps its original pass-through semantics).
  let out = ''
  const appendValue = (value: string): void => {
    if (out.length + value.length > MAX_SUBSTITUTION_OUTPUT_CHARS) {
      value = value.slice(
        0,
        Math.max(0, MAX_SUBSTITUTION_OUTPUT_CHARS - out.length),
      )
    }
    out += value
  }
  let matched = false
  let i = 0
  while (i < content.length) {
    const m = matchPlaceholderAt(content, i, argumentNames)
    if (m) {
      matched = true
      if (m.kind === 'bare') appendValue(effectiveArgs)
      else if (m.kind === 'named') appendValue(parsedArgs[m.nameIndex!] ?? '')
      else appendValue(parsedArgs[m.argIndex!] ?? '')
      i += m.length
    } else {
      out += content[i]
      i++
    }
  }

  // If no placeholder was found and appendIfNoPlaceholder is true, append.
  // (tracked by the match flag rather than textual equality — an argument
  // value that happens to reproduce its placeholder text was still a match;
  // the old equality proxy double-appended in that pathological case)
  // But only if args is non-empty (empty string means command invoked with no args)
  if (!matched && appendIfNoPlaceholder && args) {
    out = out + `\n\nARGUMENTS: ${args}`
  }

  return out
}

export function substituteArguments(
  content: string,
  args: string | undefined,
  appendIfNoPlaceholder = true,
  argumentNames: string[] = [],
): string {
  return (
    substituteArgumentsImpl(
      content,
      args,
      appendIfNoPlaceholder,
      argumentNames,
      false,
    ) ?? content
  )
}

/**
 * Strict variant for inputs that feed gating decisions (hook prompts):
 * returns null instead of clamping when the expansion would exceed the
 * budget, so callers can refuse the gated action (fail-closed) rather than
 * let a decision be made on an unmarked prefix of the input.
 */
export function substituteArgumentsStrict(
  content: string,
  args: string | undefined,
  appendIfNoPlaceholder = true,
  argumentNames: string[] = [],
): string | null {
  return substituteArgumentsImpl(
    content,
    args,
    appendIfNoPlaceholder,
    argumentNames,
    true,
  )
}
