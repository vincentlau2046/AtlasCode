import { afterEach, describe, expect, test } from 'bun:test'
import { dirname, join } from 'node:path'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  test('allows kernel and external imports', async () => {
    const root = fixture({
      'src/kernel/allowed.ts': 'export const allowed = true\n',
      'web/entry.ts': "import '../src/kernel/allowed'\nimport 'zod'\n",
    })

    const result = await scanAtlasWebKernelBoundary({
      repositoryRoot: root,
      sourceRoots: ['web'],
    })

    expect(result).toEqual({ allowed: true, violations: [] })
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
    expect(JSON.parse(output)).toEqual({ allowed: true, violations: [] })
  })
})
