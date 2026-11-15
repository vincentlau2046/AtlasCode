import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

export interface AtlasHostStateAccessInput {
  candidateRoots: readonly string[]
}

export interface AtlasHostStateAccessViolation {
  file: string
  match: string
  reason: 'direct-product-state-access'
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

/** Scan host/controller sources for direct product state-directory access. */
export function scanAtlasHostStateAccess(
  input: AtlasHostStateAccessInput,
): AtlasHostStateAccessResult {
  const violations: AtlasHostStateAccessViolation[] = []
  for (const root of input.candidateRoots.map(candidateRoot => resolve(candidateRoot))) {
    if (!existsSync(root) || !statSync(root).isDirectory()) continue
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
