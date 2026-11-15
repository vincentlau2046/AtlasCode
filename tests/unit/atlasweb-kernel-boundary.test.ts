import { afterEach, describe, expect, test } from 'bun:test'
import { dirname, join } from 'node:path'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { scanAtlasWebKernelBoundary } from '../../scripts/atlasweb-kernel-boundary-scan'

const sandboxes: string[] = []

afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) rmSync(sandbox, { recursive: true, force: true })
})

function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'atlasweb-boundary-'))
  sandboxes.push(root)
  for (const [relative, contents] of Object.entries(files)) {
    const path = join(root, relative)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, contents)
  }
  return root
}

describe('AtlasWeb kernel boundary scanner', () => {
  test('allows kernel imports and declared external imports', async () => {
    const root = fixture({
      'src/kernel/allowed.ts': 'export const allowed = true\n',
      'web/entry.ts': "import '../src/kernel/allowed'\nimport 'zod'\n",
    })

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
      externalDependencies: ['zod'],
    })

    expect(result.allowed).toBe(true)
    expect(result.violations).toEqual([])
    expect(result.externalImports).toEqual(['zod'])
  })

  test('rejects forbidden direct and nested local imports', async () => {
    const root = fixture({
      'src/tui/private.ts': 'export const tui = true\n',
      'src/engine/private.ts': 'export const engine = true\n',
      'web/entry.ts': "import '../src/tui/private'\nimport './nested/engine'\n",
      'web/nested/engine.ts': "import '../../src/engine/private'\n",
    })

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
    })

    expect(result.allowed).toBe(false)
    expect(result.violations.map(violation => violation.reason)).toEqual([
      'forbidden-ui-boundary',
      'forbidden-ui-boundary',
    ])
  })

  test('rejects forbidden private UI aliases', async () => {
    const root = fixture({
      'web/entry.ts': "import '@atlas/private-ui/button'\n",
    })

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
    })

    expect(result.allowed).toBe(false)
    expect(result.violations[0]?.reason).toBe('forbidden-private-ui-import')
  })

  test('fails closed on unresolved local imports', async () => {
    const root = fixture({
      'web/entry.ts': "import '../src/kernel/missing'\n",
    })

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
    })

    expect(result.allowed).toBe(false)
    expect(result.violations[0]?.reason).toBe('unresolved-local-import')
  })

  test('resolves .js specifiers to their .ts/.tsx sources (node16-style edge)', async () => {
    const root = fixture({
      'src/kernel/allowed.ts': 'export const allowed = true\n',
      'web/entry.ts': "import '../src/kernel/allowed.js'\n",
    })

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
    })

    expect(result.allowed).toBe(true)
    expect(result.violations).toEqual([])
  })

  test('an unresolved .js specifier still fails closed', async () => {
    const root = fixture({
      'web/entry.ts': "import '../src/kernel/missing.js'\n",
    })

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
    })

    expect(result.allowed).toBe(false)
    expect(result.violations[0]?.reason).toBe('unresolved-local-import')
  })

  test('bare external imports without declared dependency closure evidence fail closed', async () => {
    const root = fixture({
      'web/entry.ts': "import 'left-pad'\n",
    })

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
    })

    expect(result.allowed).toBe(false)
    expect(result.violations).toContainEqual({
      importer: 'web/entry.ts',
      specifier: 'left-pad',
      reason: 'external-import-unverified',
    })
  })

  test('bare external imports outside the declared dependency set fail closed', async () => {
    const root = fixture({
      'web/entry.ts': "import 'zod'\nimport 'left-pad'\n",
    })

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
      externalDependencies: ['zod'],
    })

    expect(result.allowed).toBe(false)
    expect(result.violations.map(violation => violation.reason)).toEqual([
      'undeclared-external-import',
    ])
    expect(result.externalImports).toEqual(['zod'])
  })

  test('scoped bare imports are checked against the declared package name', async () => {
    const root = fixture({
      'web/entry.ts': "import '@scope/pkg/sub'\n",
    })

    const declared = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
      externalDependencies: ['@scope/pkg'],
    })
    expect(declared.allowed).toBe(true)
    expect(declared.externalImports).toEqual(['@scope/pkg/sub'])

    const undeclared = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
      externalDependencies: ['@scope/other'],
    })
    expect(undeclared.allowed).toBe(false)
    expect(undeclared.violations[0]?.reason).toBe('undeclared-external-import')
  })

  test('non-private @atlas aliases are resolved as repository edges, not skipped', async () => {
    const root = fixture({
      'src/kernel/allowed.ts': 'export const allowed = true\n',
      'web/entry.ts': "import '@atlas/kernel/allowed'\n",
    })

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
    })

    expect(result.allowed).toBe(true)
    expect(result.violations).toEqual([])
  })

  test('non-private @atlas aliases that resolve into forbidden roots fail closed', async () => {
    const root = fixture({
      'src/tui/private.ts': 'export const tui = true\n',
      'web/entry.ts': "import '@atlas/tui/private'\n",
    })

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
    })

    expect(result.allowed).toBe(false)
    expect(result.violations[0]?.reason).toBe('forbidden-ui-boundary')
  })

  test('re-export edges are scanned (export ... from)', async () => {
    const root = fixture({
      'src/tui/private.ts': 'export const tui = true\n',
      'web/entry.ts': "export { tui } from '../src/tui/private'\n",
    })

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
    })

    expect(result.allowed).toBe(false)
    expect(result.violations[0]?.reason).toBe('forbidden-ui-boundary')
  })

  test('literal dynamic import() edges are scanned', async () => {
    const root = fixture({
      'src/engine/private.ts': 'export const engine = true\n',
      'web/entry.ts': "const mod = import('../src/engine/private')\n",
    })

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
    })

    expect(result.allowed).toBe(false)
    expect(result.violations[0]?.reason).toBe('forbidden-ui-boundary')
  })

  test('symlinked import targets are canonicalized before the boundary check', async () => {
    const root = fixture({
      'src/tui/private.ts': 'export const tui = true\n',
      'src/kernel/escape.ts': 'export const escape = true\n',
      'web/entry.ts': "import '../src/kernel/escape'\n",
    })
    // src/kernel/escape.ts is a symlink whose target is the forbidden TUI file.
    rmSync(join(root, 'src/kernel/escape.ts'))
    symlinkSync(join(root, 'src/tui/private.ts'), join(root, 'src/kernel/escape.ts'))

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
    })

    expect(result.allowed).toBe(false)
    expect(result.violations[0]?.reason).toBe('forbidden-ui-boundary')
  })

  test('symlinked source files are scanned (not silently skipped)', async () => {
    const root = fixture({
      'src/tui/private.ts': 'export const tui = true\n',
      'web/real-entry.ts': "import '../src/tui/private'\n",
    })
    // web/entry.ts is a symlink to a source file that violates the boundary.
    symlinkSync(join(root, 'web/real-entry.ts'), join(root, 'web/entry.ts'))

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
    })

    expect(result.allowed).toBe(false)
    expect(result.violations.length).toBeGreaterThan(0)
  })

  test('CLI emits a JSON result for a valid candidate root', async () => {
    const root = fixture({
      'src/kernel/allowed.ts': 'export const allowed = true\n',
      'web/entry.ts': "import '../src/kernel/allowed'\n",
    })
    const process = Bun.spawn([
      'bun',
      'scripts/atlasweb-kernel-boundary-scan.ts',
      '--root',
      root,
      '--source',
      'web',
    ], { stdout: 'pipe', stderr: 'pipe' })
    const output = await new Response(process.stdout).text()
    const exitCode = await process.exited

    expect(exitCode).toBe(0)
    const parsed = JSON.parse(output)
    expect(parsed.allowed).toBe(true)
    expect(parsed.violations).toEqual([])
    expect(parsed.externalImports).toEqual([])
  })

  // S0-R2（lock-face @25cb7454 §3-5，f4 批复工单 §7 @351c74c4 补充钉 2）：
  // allowedTargetSubroots 目标侧豁免子域——web-session-runtime 形传
  // ['src/engine/session']；豁免外 src/engine 其余子域 / src/tui 仍禁（负腿必含）。
  test('allowedTargetSubroots：engine/session 豁免内目标过（形 A 重形）', async () => {
    const root = fixture({
      'src/engine/session/readonly.ts': 'export const readonlyFace = true\n',
      'web/entry.ts': "import '../src/engine/session/readonly'\n",
    })

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
      allowedTargetSubroots: ['src/engine/session'],
    })

    expect(result.allowed).toBe(true)
    expect(result.violations).toEqual([])
  })

  test('allowedTargetSubroots 负腿：engine 其余子域（query）仍禁', async () => {
    const root = fixture({
      'src/engine/session/readonly.ts': 'export const readonlyFace = true\n',
      'src/engine/query/loop.ts': 'export const loop = true\n',
      'web/entry.ts': "import '../src/engine/session/readonly'\nimport '../src/engine/query/loop'\n",
    })

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
      allowedTargetSubroots: ['src/engine/session'],
    })

    expect(result.allowed).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.reason).toBe('forbidden-ui-boundary')
    expect(result.violations[0]?.resolved).toBe('src/engine/query/loop.ts')
  })

  test('allowedTargetSubroots 负腿：src/tui 仍禁（豁免不外溢）', async () => {
    const root = fixture({
      'src/tui/private.ts': 'export const tui = true\n',
      'web/entry.ts': "import '../src/tui/private'\n",
    })

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
      allowedTargetSubroots: ['src/engine/session'],
    })

    expect(result.allowed).toBe(false)
    expect(result.violations[0]?.reason).toBe('forbidden-ui-boundary')
  })

  test('allowedTargetSubroots 负腿：子域外逃逸（src/foo）仍 outside-approved', async () => {
    const root = fixture({
      'src/foo/bar.ts': 'export const bar = true\n',
      'web/entry.ts': "import '../src/foo/bar'\n",
    })

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
      allowedTargetSubroots: ['src/engine/session'],
    })

    expect(result.allowed).toBe(false)
    expect(result.violations[0]?.reason).toBe('outside-approved-kernel-boundary')
  })
})
