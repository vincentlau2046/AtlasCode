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
 * Count placeholder occurrences in content (named / $ARGUMENTS[n] / $n /
 * bare $ARGUMENTS — same shapes as the substitution passes) for the budget
 * upper-bound estimate.
 */
function countPlaceholderOccurrences(
  content: string,
  argumentNames: string[],
): number {
  let count = 0
  for (const name of argumentNames) {
    if (!name) continue
    count += (content.match(new RegExp(`\\$${name}(?![\\[\\w])`, 'g')) ?? [])
      .length
  }
  count += (content.match(/\$ARGUMENTS\[\d+\]/g) ?? []).length
  count += (content.match(/\$\d+(?!\w)/g) ?? []).length
  // Bare $ARGUMENTS: count after stripping $ARGUMENTS[n] forms (no double count)
  count += (
    content.replace(/\$ARGUMENTS\[\d+\]/g, '').match(/\$ARGUMENTS/g) ?? []
  ).length
  return count
}

/**
 * Substitute $ARGUMENTS placeholders in content with actual argument values.
 *
 * @param content - The content containing placeholders
 * @param args - The raw arguments string (may be undefined/null)
 * @param appendIfNoPlaceholder - If true and no placeholders are found, appends "ARGUMENTS: {args}" to content
 * @param argumentNames - Optional array of named arguments (e.g., ["foo", "bar"]) that map to indexed positions
 * @returns The content with placeholders substituted
 */
export function substituteArguments(
  content: string,
  args: string | undefined,
  appendIfNoPlaceholder = true,
  argumentNames: string[] = [],
): string {
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
    const budgetPerReplacement = Math.max(
      0,
      Math.floor(
        (MAX_SUBSTITUTION_OUTPUT_CHARS - content.length) / placeholderCount,
      ),
    )
    effectiveArgs = args.slice(0, budgetPerReplacement)
  }

  const parsedArgs = parseArguments(effectiveArgs)
  const originalContent = content

  // Replace named arguments (e.g., $foo, $bar) with their values
  // Named arguments map to positions: argumentNames[0] -> parsedArgs[0], etc.
  for (let i = 0; i < argumentNames.length; i++) {
    const name = argumentNames[i]
    if (!name) continue

    // Match $name but not $name[...] or $nameXxx (word chars)
    // Also ensure we match word boundaries to avoid partial matches
    content = content.replace(
      new RegExp(`\\$${name}(?![\\[\\w])`, 'g'),
      parsedArgs[i] ?? '',
    )
  }

  // Replace indexed arguments ($ARGUMENTS[0], $ARGUMENTS[1], etc.)
  content = content.replace(/\$ARGUMENTS\[(\d+)\]/g, (_, indexStr: string) => {
    const index = parseInt(indexStr, 10)
    return parsedArgs[index] ?? ''
  })

  // Replace shorthand indexed arguments ($0, $1, etc.)
  content = content.replace(/\$(\d+)(?!\w)/g, (_, indexStr: string) => {
    const index = parseInt(indexStr, 10)
    return parsedArgs[index] ?? ''
  })

  // Replace $ARGUMENTS with the full arguments string (K3-C2: clamped effectiveArgs)
  content = content.replaceAll('$ARGUMENTS', effectiveArgs)

  // If no placeholders were found and appendIfNoPlaceholder is true, append
  // But only if args is non-empty (empty string means command invoked with no args)
  if (content === originalContent && appendIfNoPlaceholder && args) {
    content = content + `\n\nARGUMENTS: ${args}`
  }

  return content
}
