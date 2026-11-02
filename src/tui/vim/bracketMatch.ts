/**
 * Vim `%` bracket matching (K6-1, wave 0.1.86 task A).
 *
 * Pure function: given text and a cursor offset, find the offset of the
 * matching bracket per vim `%` semantics (`:help %`):
 *   - If the cursor is on `()[]{}`, jump to its pair (forward for openers,
 *     backward for closers), honoring nesting.
 *   - Otherwise, find the next bracket character **on the current line** to
 *     the right and jump to its pair (the pair itself may be on another line).
 *   - No bracket found on the line, or no matching pair anywhere → null
 *     (caller keeps the cursor in place, no error).
 */

const PAIR: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  ')': '(',
  ']': '[',
  '}': '{',
}

export function findMatchingBracket(
  text: string,
  offset: number,
): number | null {
  const at = text[offset]
  let bracketOffset: number

  if (at && PAIR[at]) {
    bracketOffset = offset
  } else {
    // Cursor is not on a bracket: search the current line to the right.
    const lineStart = offset > 0 ? text.lastIndexOf('\n', offset - 1) + 1 : 0
    const newline = text.indexOf('\n', offset)
    const lineEnd = newline === -1 ? text.length : newline
    let found = -1
    for (let i = Math.max(offset, lineStart); i < lineEnd; i++) {
      if (PAIR[text[i]]) {
        found = i
        break
      }
    }
    if (found === -1) return null
    bracketOffset = found
  }

  const bracket = text[bracketOffset]
  const match = PAIR[bracket]

  if (bracket === '(' || bracket === '[' || bracket === '{') {
    // Forward scan with nesting depth.
    let depth = 0
    for (let i = bracketOffset + 1; i < text.length; i++) {
      const ch = text[i]
      if (ch === match) {
        if (depth === 0) return i
        depth--
      } else if (ch === bracket) {
        depth++
      }
    }
    return null
  }

  // Backward scan from a closer.
  let depth = 0
  for (let i = bracketOffset - 1; i >= 0; i--) {
    const ch = text[i]
    if (ch === match) {
      if (depth === 0) return i
      depth--
    } else if (ch === bracket) {
      depth++
    }
  }
  return null
}
