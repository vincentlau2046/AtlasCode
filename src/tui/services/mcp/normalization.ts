/**
 * Pure utility functions for MCP name normalization.
 * This file has no dependencies to avoid circular imports.
 */

/**
 * Normalize server names to be compatible with the API pattern ^[a-zA-Z0-9_-]{1,64}$
 * Replaces any invalid characters (including dots and spaces) with underscores,
 * then collapses consecutive underscores and strips leading/trailing underscores
 * (for ALL server names — 0.1.78 W-A F-2 de-ANT generalized guard, preventing
 * interference with the __ delimiter used in MCP tool names).
 */
export function normalizeNameForMCP(name: string): string {
  // 0.1.79 W-C (#20): empty-after-fold guard — names of all-invalid chars
  // ('...') would fold to '' (introduced 0.1.78 A3-2); fall back to the
  // pre-fold value ('___', verbatim pre-0.1.78 behavior).
  const folded = name.replace(/[^a-zA-Z0-9_-]/g, '_')
  const normalized = folded.replace(/_+/g, '_').replace(/^_|_$/g, '')
  return normalized === '' ? folded : normalized
}
