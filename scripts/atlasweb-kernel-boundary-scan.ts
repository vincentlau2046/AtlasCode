import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

export interface AtlasWebKernelBoundaryInput {
  repositoryRoot: string
  sourceRoots: readonly string[]
  /**
   * Declared external dependency names (e.g. from package.json). Bare
   * imports are only accepted against this closure evidence: a bare import
   * with no declared-dependency list supplied is `external-import-unverified`
   * (fail closed — an unexamined external edge must not silently pass as
   * closure), and one outside the declared set is `undeclared-external-import`.
   */
  externalDependencies?: readonly string[]
  /**
   * S0-R2（lock-face @25cb7454 §3-5，f4 批复工单 §7 @351c74c4 补充钉 2）：
   * 目标侧豁免子域（pack 格重形）——形 A 下 web-session-runtime 出口允许
   * `src/engine/session` 只读闭包目标；豁免外 src/engine 其余子域 /
   * src/tui / private-ui 目标仍禁（负腿必含，单测锁定）。辅助信号定位
   * （头注钉）：真正判据在 e2e gate 判据件。
   */
  allowedTargetSubroots?: readonly string[]
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
  /** Bare external edges that passed the declared-dependency check (auditable surface, not closure proof). */
  externalImports: string[]
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
    // statSync follows symlinks: linked source files/directories are scanned
    // like real ones instead of being silently skipped; dangling links are
    // skipped (they cannot contain scannable source).
    let stat
    try {
      stat = statSync(path)
    } catch {
      continue
    }
    if (stat.isDirectory()) {
      files.push(...walkSourceFiles(path))
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(path)
    }
  }
  return files.sort()
}

function existingFile(candidate: string): string | null {
  return existsSync(candidate) && statSync(candidate).isFile() ? candidate : null
}

function resolveLocalImport(repositoryRoot: string, importer: string, specifier: string): string | null {
  let base: string | null = null
  if (specifier.startsWith('.')) {
    base = resolve(importer, '..', specifier)
  } else if (specifier.startsWith('src/')) {
    base = resolve(repositoryRoot, specifier)
  } else if (specifier.startsWith('@atlas/')) {
    // Repository-internal alias edge: @atlas/<path> resolves into src/<path>
    // and is boundary-checked like any local edge (private aliases are
    // rejected earlier; the rest must resolve or fail closed).
    base = resolve(repositoryRoot, 'src', specifier.slice('@atlas/'.length))
  }
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
  // node16-style edge: an explicit `.js` specifier may map onto a `.ts`/`.tsx` source.
  if (base.endsWith('.js')) {
    candidates.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`)
  }
  for (const candidate of candidates) {
    const found = existingFile(candidate)
    if (found !== null) return found
  }
  return null
}

function barePackageName(specifier: string): string {
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/')
    return scope !== undefined && name !== undefined ? `${scope}/${name}` : specifier
  }
  return specifier.split('/')[0] ?? specifier
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
 * Local (and @atlas alias) imports fail closed when they cannot be resolved,
 * leave the approved candidate/kernel/shared boundary, or escape through a
 * symlink — targets are canonicalized before the boundary check. Bare
 * external imports require declared-dependency closure evidence; they are
 * never silently skipped, and recording them is an audit surface, not proof
 * that the upstream runtime bundle is free of UI code.
 */
export function scanAtlasWebKernelBoundary(
  input: AtlasWebKernelBoundaryInput,
): AtlasWebKernelBoundaryResult {
  const repositoryRoot = resolve(input.repositoryRoot)
  const sourceRoots = input.sourceRoots.map(root => resolve(repositoryRoot, root))
  const externalDependencies = input.externalDependencies
  const allowedTargetSubroots = (input.allowedTargetSubroots ?? []).map(root =>
    relative(repositoryRoot, resolve(repositoryRoot, root)).split('/').join('/'),
  )
  const violations: AtlasWebKernelBoundaryViolation[] = []
  const externalImports: string[] = []

  /** 目标是否落在豁免子域内（S0-R2 形 A 重形：engine/session 只读闭包）。 */
  const isAllowedTargetSubroot = (target: string): boolean => {
    const targetRelative = relative(repositoryRoot, target).split('/').join('/')
    return allowedTargetSubroots.some(
      sub => targetRelative === sub || targetRelative.startsWith(`${sub}/`),
    )
  }

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
        // T6-A Task 10: bundler query suffixes (?inline 等) belong to the
        // bundler, not the module path — strip before every check below.
        const rawSpecifier = match[1] ?? ''
        const queryAt = rawSpecifier.indexOf('?')
        const specifier = queryAt === -1 ? rawSpecifier : rawSpecifier.slice(0, queryAt)
        // String-data charset gate: a capture that cannot be a module
        // specifier (template interpolation `${…}`, punctuation-only runs —
        // shadows of from/require inside string literals) is not a static
        // import edge and must not be judged.
        if (!/^[\w@./:-]+$/u.test(specifier)) continue
        if (specifier.length === 0) continue
        if (isForbiddenPrivateAlias(specifier)) {
          violations.push({
            importer: relative(repositoryRoot, importerPath),
            specifier,
            reason: 'forbidden-private-ui-import',
          })
          continue
        }

        const isLocal = specifier.startsWith('.') || specifier.startsWith('src/') || specifier.startsWith('@atlas/')
        if (!isLocal) {
          // Bare external edge: accepted only against declared-dependency
          // closure evidence, and always recorded.
          if (externalDependencies === undefined) {
            violations.push({
              importer: relative(repositoryRoot, importerPath),
              specifier,
              reason: 'external-import-unverified',
            })
          } else if (!externalDependencies.includes(barePackageName(specifier))) {
            violations.push({
              importer: relative(repositoryRoot, importerPath),
              specifier,
              reason: 'undeclared-external-import',
            })
          } else {
            externalImports.push(specifier)
          }
          continue
        }

        const resolved = resolveLocalImport(repositoryRoot, importerPath, specifier)
        if (resolved === null) {
          violations.push({
            importer: relative(repositoryRoot, importerPath),
            specifier,
            reason: 'unresolved-local-import',
          })
          continue
        }

        // Canonicalize before the boundary check so a symlink cannot wash a
        // forbidden target into an approved path.
        let canonical = resolved
        try {
          canonical = realpathSync(resolved)
        } catch {
          // keep the resolved path if it cannot be canonicalized
        }

        const violation = {
          importer: relative(repositoryRoot, importerPath),
          specifier,
          resolved: relative(repositoryRoot, resolved),
        }
        if (isAllowedTargetSubroot(canonical)) {
          // S0-R2 形 A 豁免子域（engine/session 只读闭包）：禁面与 approved
          // 面双豁免；子域外目标照常判（负腿单测锁定不外溢）。
        } else if (isForbiddenResolvedPath(repositoryRoot, canonical)) {
          violations.push({ ...violation, reason: 'forbidden-ui-boundary' })
        } else if (!isAllowedResolvedPath(repositoryRoot, sourceRoots, canonical)) {
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
  externalImports.sort()
  return { allowed: violations.length === 0, violations, externalImports }
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
