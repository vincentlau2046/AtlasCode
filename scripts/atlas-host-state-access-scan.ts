import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

export interface AtlasHostStateAccessInput {
  candidateRoots: readonly string[]
}

export interface AtlasHostStateAccessViolation {
  file: string
  match: string
  reason: 'direct-product-state-access' | 'candidate-root-missing'
}

export interface AtlasHostStateAccessResult {
  allowed: boolean
  violations: AtlasHostStateAccessViolation[]
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const DIRECT_PRODUCT_PATH_RE = /(?:~\/\.atlas(?:-office|-comic)?|(?:process\.env\.HOME|homedir\(\))[^\n;]{0,100}\/\.atlas(?:-office|-comic)?)/gu

function walk(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(path))
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(path)
  }
  return files.sort()
}

/**
 * Scan host/controller sources for direct product state-directory access.
 *
 * This is an auxiliary static signal only: a regex hit proves a suspicious
 * source pattern, and a clean result never proves runtime isolation or
 * authorized read/write behavior. Runtime isolation evidence must come from
 * real authorization/read-write probes (G2), not from this scan going green.
 *
 * Fail closed: a candidate root that does not exist or is not a directory is
 * reported as `candidate-root-missing` (never silently skipped — a missing
 * scan target must not count as a pass).
 */
export function scanAtlasHostStateAccess(
  input: AtlasHostStateAccessInput,
): AtlasHostStateAccessResult {
  const violations: AtlasHostStateAccessViolation[] = []
  for (const root of input.candidateRoots.map(candidateRoot => resolve(candidateRoot))) {
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      violations.push({ file: root, match: '', reason: 'candidate-root-missing' })
      continue
    }
    for (const file of walk(root)) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(DIRECT_PRODUCT_PATH_RE)) {
        violations.push({
          file,
          match: match[0],
          reason: 'direct-product-state-access',
        })
      }
    }
  }
  violations.sort((left, right) => `${left.file}\0${left.match}`.localeCompare(`${right.file}\0${right.match}`))
  return { allowed: violations.length === 0, violations }
}
