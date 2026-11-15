import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

export interface AtlasWebKernelBoundaryInput {
  repositoryRoot: string
  sourceRoots: readonly string[]
}

export interface AtlasWebKernelBoundaryViolation {
  importer: string
  specifier: string
  resolved?: string
  reason: string
}

export interface AtlasWebKernelBoundaryResult {
  allowed: boolean
  violations: AtlasWebKernelBoundaryViolation[]
}

const IMPORT_RE = /(?:from\s*|import\s*\(\s*|import\s+|require\s*\(\s*)['"]([^'"]+)['"]/g
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const FORBIDDEN_SOURCE_ROOTS = [
  'src/tui',
  'src/engine',
  'src/private-ui',
  'src/ui-private',
]

function walkSourceFiles(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(path))
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(path)
    }
  }
  return files.sort()
}

function resolveLocalImport(repositoryRoot: string, importer: string, specifier: string): string | null {
  const base = specifier.startsWith('.')
    ? resolve(importer, '..', specifier)
    : specifier.startsWith('src/')
      ? resolve(repositoryRoot, specifier)
      : null
  if (base === null) return null

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
    join(base, 'index.js'),
  ]
  return candidates.find(candidate => existsSync(candidate) && statSync(candidate).isFile()) ?? null
}

function isForbiddenPrivateAlias(specifier: string): boolean {
  return /^@atlas\/(?:private-ui|ui-private)(?:\/|$)/u.test(specifier)
}

function isForbiddenResolvedPath(repositoryRoot: string, target: string): boolean {
  const targetRelative = relative(repositoryRoot, target).split('/').join('/')
  return FORBIDDEN_SOURCE_ROOTS.some(root =>
    targetRelative === root || targetRelative.startsWith(`${root}/`),
  )
}

function isAllowedResolvedPath(repositoryRoot: string, sourceRoots: readonly string[], target: string): boolean {
  const targetRelative = relative(repositoryRoot, target).split('/').join('/')
  const candidateRoots = [
    ...sourceRoots.map(root => relative(repositoryRoot, resolve(repositoryRoot, root)).split('/').join('/')),
    'src/kernel',
    'src/shared',
  ]
  return candidateRoots.some(root =>
    targetRelative === root || targetRelative.startsWith(`${root}/`),
  )
}

/**
 * Scan candidate Web sources without writing to the checkout.
 * Local imports fail closed when they cannot be resolved or leave the approved
 * candidate/kernel/shared boundary. External packages are not resolved here.
 */
export function scanAtlasWebKernelBoundary(
  input: AtlasWebKernelBoundaryInput,
): AtlasWebKernelBoundaryResult {
  const repositoryRoot = resolve(input.repositoryRoot)
  const sourceRoots = input.sourceRoots.map(root => resolve(repositoryRoot, root))
  const violations: AtlasWebKernelBoundaryViolation[] = []

  for (const sourceRoot of sourceRoots) {
    if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) {
      violations.push({
        importer: relative(repositoryRoot, sourceRoot),
        specifier: sourceRoot,
        reason: 'missing-source-root',
      })
      continue
    }

    for (const importerPath of walkSourceFiles(sourceRoot)) {
      const source = readFileSync(importerPath, 'utf8')
      for (const match of source.matchAll(IMPORT_RE)) {
        const specifier = match[1]
        if (isForbiddenPrivateAlias(specifier)) {
          violations.push({
            importer: relative(repositoryRoot, importerPath),
            specifier,
            reason: 'forbidden-private-ui-import',
          })
          continue
        }

        const isLocal = specifier.startsWith('.') || specifier.startsWith('src/')
        if (!isLocal) continue

        const resolved = resolveLocalImport(repositoryRoot, importerPath, specifier)
        if (resolved === null) {
          violations.push({
            importer: relative(repositoryRoot, importerPath),
            specifier,
            reason: 'unresolved-local-import',
          })
          continue
        }

        const violation = {
          importer: relative(repositoryRoot, importerPath),
          specifier,
          resolved: relative(repositoryRoot, resolved),
        }
        if (isForbiddenResolvedPath(repositoryRoot, resolved)) {
          violations.push({ ...violation, reason: 'forbidden-ui-boundary' })
        } else if (!isAllowedResolvedPath(repositoryRoot, sourceRoots, resolved)) {
          violations.push({ ...violation, reason: 'outside-approved-kernel-boundary' })
        }
      }
    }
  }

  violations.sort((left, right) =>
    `${left.importer}\0${left.specifier}\0${left.reason}`.localeCompare(
      `${right.importer}\0${right.specifier}\0${right.reason}`,
    ),
  )
  return { allowed: violations.length === 0, violations }
}

function cliArgs(args: readonly string[]): { root: string; sourceRoots: string[] } {
  let root: string | undefined
  const sourceRoots: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--root') root = args[++index]
    else if (arg === '--source') sourceRoots.push(args[++index] ?? '')
    else throw new Error(`unknown argument: ${arg}`)
  }
  if (root === undefined || sourceRoots.some(source => source.length === 0)) {
    throw new Error('usage: --root <repository> --source <directory> [--source <directory> ...]')
  }
  return { root, sourceRoots }
}

if (import.meta.main) {
  try {
    const input = cliArgs(process.argv.slice(2))
    const result = scanAtlasWebKernelBoundary({
      repositoryRoot: input.root,
      sourceRoots: input.sourceRoots,
    })
    console.log(JSON.stringify(result))
    process.exitCode = result.allowed ? 0 : 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 2
  }
}
