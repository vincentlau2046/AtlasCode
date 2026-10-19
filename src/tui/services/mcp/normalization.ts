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
  return name
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}
