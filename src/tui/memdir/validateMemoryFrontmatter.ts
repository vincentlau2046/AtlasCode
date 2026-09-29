/**
 * Memory-file frontmatter validation.
 *
 * FileWriteTool calls validateMemoryFrontmatter before writing to a memory
 * directory so the agent gets immediate feedback if it writes bad frontmatter,
 * rather than the file silently appearing with no description/type in the
 * memory scan manifest.
 *
 * Split from memoryScan.ts so FileWriteTool can import the validator without
 * pulling in the scan primitives.
 */

import { basename } from 'path'
import { parseFrontmatter } from '../utils/frontmatterParser.js'
import { type MemoryType, MEMORY_TYPES } from './memoryTypes.js'

/**
 * Validate that a memory file has correct frontmatter.
 *
 * Returns null if valid, or an error message (suitable for showing the agent
 * *why* it failed) if invalid. MEMORY.md is always skipped — it's an index
 * with no frontmatter.
 */
export function validateMemoryFrontmatter(
  content: string,
  filePath: string,
): string | null {
  const name = basename(filePath)

  // MEMORY.md is an index, not a memory — no frontmatter required.
  if (name === 'MEMORY.md') return null

  const { frontmatter } = parseFrontmatter(content, filePath)

  // name field
  const rawName = frontmatter.name
  if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
    return [
      `Memory file "${name}" is missing required frontmatter field 'name'.`,
      'Memory files must have a `name` field (a short kebab-case slug) in their frontmatter.',
      '',
      'Expected frontmatter format:',
      '---',
      'name: my-memory-name',
      'description: One-line summary',
      'type: user | feedback | project | reference',
      '---',
    ].join('\n')
  }

  // description field
  const rawDesc = frontmatter.description
  if (!rawDesc || typeof rawDesc !== 'string' || !rawDesc.trim()) {
    return [
      `Memory file "${name}" is missing required frontmatter field 'description'.`,
      "Memory files must have a `description` field (a one-line summary used to decide relevance in future conversations).",
    ].join('\n')
  }

  // type field
  const rawType = frontmatter.type
  if (!rawType || typeof rawType !== 'string') {
    return [
      `Memory file "${name}" is missing required frontmatter field 'type'.`,
      `Must be one of: ${MEMORY_TYPES.join(', ')}.`,
    ].join('\n')
  }

  if (!(MEMORY_TYPES as readonly string[]).includes(rawType)) {
    return [
      `Memory file "${name}" has invalid type '${rawType}'.`,
      `Must be one of: ${MEMORY_TYPES.join(', ')}.`,
    ].join('\n')
  }

  return null
}

/**
 * Check if a file path is within a memory directory.
 *
 * Uses a lightweight heuristic: the path contains a "/memory/" directory
 * segment and the file extension is ".md". This covers the standard
 * auto-memory layout (~/.atlas/projects/<slug>/memory/*.md) and
 * team memory directories without importing the full paths module.
 */
export function isUnderMemoryDir(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  return normalized.includes('/memory/') && normalized.endsWith('.md')
}